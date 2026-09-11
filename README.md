# Hi Сайн уу

Real-time AI translator PWA — voice, text and camera translation across 20
languages, Mongolian-first. Built by [VEIO](https://veio.digital/).

- **Client:** React 19 + Vite + Tailwind + shadcn/ui, installable PWA
- **Server:** Express 5 + OpenAI (Whisper transcription, GPT-4o-mini translation
  & image OCR, TTS)
- **Monorepo:** pnpm workspaces, TypeScript, Node 24

---

## Repository layout

```
artifacts/
  translator/       React PWA client (the app UI)
  api-server/       Express API — /api/transcribe, /translate, /tts, /scan, /healthz
  mockup-sandbox/   design mockup playground
lib/
  db/               Drizzle + pg schema (placeholder — not used yet)
  api-zod/          shared Zod schemas
  api-client-react/ generated React Query hooks
  api-spec/         OpenAPI spec + Orval codegen
scripts/            workspace scripts
```

## Prerequisites

- Node **24** (`nvm use` reads `.nvmrc`)
- pnpm **10+** (`corepack enable`)
- An OpenAI API key

> **Note:** `pnpm-workspace.yaml` strips all non-Linux native binaries
> (esbuild / rollup / lightningcss). Install & build therefore only work on
> **Linux x64** (Railway, Replit, CI, WSL) — not native macOS/Windows.

## Local development

```bash
corepack enable
pnpm install
cp .env.example .env          # then fill in OPENAI_API_KEY

# type-check everything
pnpm run typecheck

# run the tests (node:test, no browser needed)
pnpm run test

# run the API (builds itself, listens on $PORT)
pnpm --filter @workspace/api-server run dev

# in another terminal, run the client dev server
pnpm --filter @workspace/translator run dev
```

The client calls the API at the same origin (`/api/*`). For split dev servers,
proxy `/api` to the API port or run the production single-service build below.

## Production build (single service)

The API server serves the built client as static files, so one process hosts
everything:

```bash
pnpm run build
mkdir -p artifacts/api-server/dist/public
cp -r artifacts/translator/dist/public/. artifacts/api-server/dist/public/
node artifacts/api-server/dist/index.mjs
```

## API contract

`lib/api-spec/openapi.yaml` is the source of truth for every endpoint. Orval
generates the Zod schemas (`lib/api-zod`) and the React Query hooks
(`lib/api-client-react`) from it, and the server validates each request against
those same generated schemas — so the documented shape, the length caps and the
accepted language codes cannot drift from what the API enforces.

After editing the spec:

```bash
pnpm --filter @workspace/api-spec run codegen
```

Note: Orval names an operation's schemas after its `operationId`, so a component
schema must not be called `<OperationId>Response` — the package index would then
re-export two different things under one name.

## CI

`.github/workflows/ci.yml` runs on every push and pull request: install with a
frozen lockfile, `pnpm run typecheck`, `pnpm run test`, `pnpm run build`, and a
`docker build` of the image Railway deploys — which is then started and checked
on `/api/healthz`, so a broken deploy fails here instead of in production.

Tests use Node's built-in runner (`node:test`) via `tsx` — no test framework
dependency. The API tests point the OpenAI SDK at a local fake through
`OPENAI_BASE_URL`, so they never reach the network or spend anything.

## Deploy — Railway

Build via the root **`Dockerfile`** (one service for the whole repo).
`railway.json` forces the Dockerfile builder and sets the health check.

The Dockerfile is multi-stage: the build stage installs the workspace and
compiles both packages, and the runtime stage carries only the api-server
bundle — esbuild inlines its dependencies, so the shipped image has no
`node_modules`, no sources and no build toolchain, and runs as the `node` user.

1. **Railway → New Project → Deploy from GitHub repo** → pick `Hi-Sainuu`.
2. Railway may auto-create **one service per workspace package** — delete all
   but one. Keep a single service (rename it e.g. `hi-sainuu`).
3. That service → **Settings**:
   - **Root Directory:** empty (repo root)
   - **Build:** Dockerfile (auto-picked from `railway.json`)
4. That service → **Variables**:
   - `OPENAI_API_KEY` — your key (the only required var; `BASE_PATH` defaults
     to `/`, `PORT` is injected by Railway)
   - Without the key the server still boots and serves the client; the AI
     routes answer `503` until it is set.
5. **Settings → Networking → Generate Domain** (or add a custom domain).
6. Every push to `main` redeploys. Health check: `GET /api/healthz`.

## Database — Neon (not wired yet)

The server does not touch Postgres today. When the first table is added to
`lib/db/src/schema/index.ts`:

1. Create a project at [neon.tech], copy the **pooled** connection string.
2. Add `DATABASE_URL` to Railway variables (and your local `.env`).
3. Push the schema: `pnpm --filter @workspace/db run push`.

## Environment variables

| Var              | Where            | Required | Notes                                  |
| ---------------- | ---------------- | -------- | -------------------------------------- |
| `OPENAI_API_KEY` | api-server       | yes      | Whisper + GPT-4o-mini + TTS            |
| `PORT`           | api-server       | runtime  | Railway sets it; default 8080 locally  |
| `BASE_PATH`      | translator build | no       | defaults to `/`                        |
| `ALLOWED_ORIGINS`| api-server       | no       | cross-origin allowlist; empty = same-origin only |
| `RATE_LIMIT_MAX` | api-server       | no       | AI calls per IP per window (default 20) |
| `RATE_LIMIT_WINDOW_MS` | api-server | no      | rate-limit window in ms (default 60000) |
| `DATABASE_URL`   | api-server       | not yet  | Neon pooled URL, once a table exists   |

## Roadmap

1. ✅ UI/UX polish (conversation persistence, auto-scroll, localized errors,
   safe-area, haptics, brand color)
2. ✅ Railway + Neon deploy wiring
3. ⬜ WebSocket + streaming STT with client-side VAD (cut latency 5–8s → 3–4s)
4. ⬜ Full streaming pipeline: STT → cleanup → streaming translation → streaming TTS
5. ⬜ Premium TTS option (ElevenLabs / Cartesia / Azure `mn-MN`)
