import test from "node:test";
import assert from "node:assert/strict";
import { listenOn, startFakeOpenAI } from "./test-support";

// A stand-in upstream: /chat/completions succeeds, anything else fails with a
// verbose error body of the kind we must never forward to the browser.
const upstream = await startFakeOpenAI((path) =>
  path.includes("/chat/completions")
    ? { status: 200, body: { choices: [{ message: { content: "Сайн уу" } }] } }
    : {
        status: 500,
        body: {
          error: {
            message: "internal upstream detail: api.openai.com key sk-live-abc123",
          },
        },
      },
);

process.env["OPENAI_API_KEY"] = "sk-test-not-a-real-key";
process.env["OPENAI_BASE_URL"] = upstream.url;

const { default: app } = await import("./app");

test.after(() => upstream.close());

test("translates through the OpenAI client and returns just the translation", async () => {
  const server = await listenOn(app);
  try {
    const res = await fetch(`${server.url}/api/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "hello", fromLang: "en", toLang: "mn" }),
    });

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { translated: "Сайн уу" });
  } finally {
    await server.close();
  }
});

test("never forwards upstream error detail to the client", async () => {
  const server = await listenOn(app);
  try {
    // /audio/speech is not handled by the fake upstream, so it answers with the
    // verbose error body above.
    const res = await fetch(`${server.url}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "hello", lang: "en" }),
    });

    assert.equal(res.status, 500);

    const body = await res.text();
    assert.deepEqual(JSON.parse(body), { error: "TTS failed" });
    assert.ok(!body.includes("api.openai.com"), "response leaked the upstream host");
    assert.ok(!body.includes("sk-live"), "response leaked a credential");
  } finally {
    await server.close();
  }
});
