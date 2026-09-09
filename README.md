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

## Deploy — Railway

Build via the root **`Dockerfile`** (one service for the whole repo).
`railway.json` forces the Dockerfile builder and sets the health check.

1. **Railway → New Project → Deploy from GitHub repo** → pick `Hi-Sainuu`.
2. Railway may auto-create **one service per workspace package** — delete all
   but one. Keep a single service (rename it e.g. `hi-sainuu`).
3. That service → **Settings**:
   - **Root Directory:** empty (repo root)
   - **Build:** Dockerfile (auto-picked from `railway.json`)
4. That service → **Variables**:
   - `OPENAI_API_KEY` — your key (the only required var; `BASE_PATH` defaults
     to `/`, `PORT` is injected by Railway)
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
| `DATABASE_URL`   | api-server       | not yet  | Neon pooled URL, once a table exists   |

## Roadmap

1. ✅ UI/UX polish (conversation persistence, auto-scroll, localized errors,
   safe-area, haptics, brand color)
2. ✅ Railway + Neon deploy wiring
3. ⬜ WebSocket + streaming STT with client-side VAD (cut latency 5–8s → 3–4s)
4. ⬜ Full streaming pipeline: STT → cleanup → streaming translation → streaming TTS
5. ⬜ Premium TTS option (ElevenLabs / Cartesia / Azure `mn-MN`)
