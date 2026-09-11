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
    const missing = await fetch(`${server.url}/api/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "hi" }),
    });
    assert.equal(missing.status, 400);

    const tooLong = await fetch(`${server.url}/api/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "a".repeat(5001), fromLang: "en", toLang: "mn" }),
    });
    assert.equal(tooLong.status, 413);

    const tooLongTts = await fetch(`${server.url}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "a".repeat(4097) }),
    });
    assert.equal(tooLongTts.status, 413);
  } finally {
    await server.close();
  }
});
