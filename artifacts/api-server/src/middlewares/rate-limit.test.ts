import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import express from "express";
import pinoHttp from "pino-http";
import pino from "pino";
import { createRateLimiter } from "./rate-limit";
import { listenOn } from "../test-support";

function appWithLimiter(max: number, windowMs: number) {
  const app = express();
  app.use(pinoHttp({ logger: pino({ level: "silent" }) }));
  app.post("/costly", createRateLimiter({ max, windowMs }), (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

test("allows requests up to the limit, then answers 429", async () => {
  const server = await listenOn(appWithLimiter(3, 60_000));
  try {
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${server.url}/costly`, { method: "POST" });
      codes.push(res.status);
    }
    assert.deepEqual(codes, [200, 200, 200, 429, 429]);
  } finally {
    await server.close();
  }
});

test("429 carries Retry-After and a generic body", async () => {
  const server = await listenOn(appWithLimiter(1, 60_000));
  try {
    await fetch(`${server.url}/costly`, { method: "POST" });
    const res = await fetch(`${server.url}/costly`, { method: "POST" });

    assert.equal(res.status, 429);
    assert.ok(Number(res.headers.get("retry-after")) > 0);
    assert.deepEqual(await res.json(), { error: "Too many requests" });
  } finally {
    await server.close();
  }
});

test("the budget refills once the window has passed", async () => {
  const server = await listenOn(appWithLimiter(1, 100));
  try {
    assert.equal((await fetch(`${server.url}/costly`, { method: "POST" })).status, 200);
    assert.equal((await fetch(`${server.url}/costly`, { method: "POST" })).status, 429);

    await sleep(150);

    assert.equal((await fetch(`${server.url}/costly`, { method: "POST" })).status, 200);
  } finally {
    await server.close();
  }
});
