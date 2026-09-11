import test from "node:test";
import assert from "node:assert/strict";
import { listenOn } from "./test-support";

process.env["ALLOWED_ORIGINS"] = "https://hisainuu.online, http://localhost:5173";

const { default: app } = await import("./app");

test("allows exactly the origins named in ALLOWED_ORIGINS", async () => {
  const server = await listenOn(app);
  try {
    const preflight = (origin: string) =>
      fetch(`${server.url}/api/translate`, {
        method: "OPTIONS",
        headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
      });

    const allowed = await preflight("https://hisainuu.online");
    assert.equal(allowed.headers.get("access-control-allow-origin"), "https://hisainuu.online");

    const alsoAllowed = await preflight("http://localhost:5173");
    assert.equal(alsoAllowed.headers.get("access-control-allow-origin"), "http://localhost:5173");

    const blocked = await preflight("https://evil.example");
    assert.equal(blocked.headers.get("access-control-allow-origin"), null);
  } finally {
    await server.close();
  }
});
