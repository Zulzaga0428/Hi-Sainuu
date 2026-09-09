import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Built translator client, copied to ./public next to this bundle at deploy time
// (see railway.json buildCommand). Absent in local dev — the Vite dev server
// serves the client separately then.
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "public");
const indexHtml = path.join(publicDir, "index.html");
const hasClient = fs.existsSync(indexHtml);

if (hasClient) {
  app.use(express.static(publicDir, { index: false }));
}

app.use("/api", router);

if (hasClient) {
  // SPA fallback: any GET not under /api and not a real static file → index.html
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(indexHtml);
  });
}

export default app;
