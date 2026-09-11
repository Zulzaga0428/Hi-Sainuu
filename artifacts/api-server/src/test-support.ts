import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import http from "node:http";
import type { Express } from "express";

type Started = { url: string; close: () => Promise<void> };

/** Starts an app on an ephemeral port so tests never collide. */
export async function listenOn(app: Express): Promise<Started> {
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/**
 * Stands in for api.openai.com. The OpenAI SDK honours OPENAI_BASE_URL, so
 * pointing it here keeps the route tests hermetic — no network, no API key,
 * no cost — while still exercising the real client and route code.
 */
export async function startFakeOpenAI(
  respond: (path: string) => { status: number; body: unknown },
): Promise<Started> {
  const server = http.createServer((req, res) => {
    const { status, body } = respond(req.url ?? "");
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/v1`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
