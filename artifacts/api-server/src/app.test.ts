import test from "node:test";
import assert from "node:assert/strict";
import { listenOn } from "./test-support";

// app.ts reads its CORS config at import time, so the environment has to be
// shaped before the dynamic import below.
delete process.env["OPENAI_API_KEY"];
delete process.env["ALLOWED_ORIGINS"];

const { default: app } = await import("./app");

test("health check answers even with no OpenAI key configured", async () => {
  const server = await listenOn(app);
  try {
    const res = await fetch(`${server.url}/api/healthz`);

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "ok" });
  } finally {
    await server.close();
  }
});

test("AI routes degrade to 503 instead of crashing the process", async () => {
  const server = await listenOn(app);
  try {
    const res = await fetch(`${server.url}/api/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "hi", fromLang: "en", toLang: "mn" }),
    });

    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "AI service is not configured" });

    // The process is still alive and serving.
    assert.equal((await fetch(`${server.url}/api/healthz`)).status, 200);
  } finally {
    await server.close();
  }
});

test("rejects a cross-origin browser request when no allowlist is set", async () => {
  const server = await listenOn(app);
  try {
    const res = await fetch(`${server.url}/api/translate`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example",
        "Access-Control-Request-Method": "POST",
      },
    });

    assert.equal(res.headers.get("access-control-allow-origin"), null);
  } finally {
    await server.close();
  }
});

test("validates the translate payload before spending anything", async () => {
  const server = await listenOn(app);
  try {
    const post = (path: string, body: unknown) =>
      fetch(`${server.url}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    // Missing field.
    assert.equal((await post("/api/translate", { text: "hi" })).status, 400);

    // Empty text is not worth a call.
    assert.equal(
      (await post("/api/translate", { text: "", fromLang: "en", toLang: "mn" })).status,
      400,
    );

    // A language the app does not offer.
    assert.equal(
      (await post("/api/translate", { text: "hi", fromLang: "en", toLang: "xx" })).status,
      400,
    );

    // Length caps come from the OpenAPI spec: 5000 for translate, 4096 for tts.
    assert.equal(
      (await post("/api/translate", { text: "a".repeat(5001), fromLang: "en", toLang: "mn" }))
        .status,
      400,
    );
    assert.equal((await post("/api/tts", { text: "a".repeat(4097) })).status, 400);

    // Out-of-range playback speed.
    assert.equal((await post("/api/tts", { text: "hi", speed: 9 })).status, 400);

    // A validation failure says which field, without leaking internals.
    const res = await post("/api/translate", { text: "hi", fromLang: "en", toLang: "xx" });
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /^Invalid toLang: /);
  } finally {
    await server.close();
  }
});
