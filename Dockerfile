# Single-service image: the build stage compiles the translator client and the
# api-server bundle; the runtime stage carries only that bundle, which serves
# both /api and the client's static files on one port.

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
FROM node:24-slim AS build

WORKDIR /app
ENV CI=true

# Node 24's corepack refuses to run without a "packageManager" field, which this
# repo doesn't have. Pin the version the lockfile was generated with so
# --frozen-lockfile stays reproducible.
RUN npm install -g pnpm@10.33.0

# Manifests first: this layer — and the install below — is reused as long as
# dependencies don't change, so a source-only edit skips the whole install.
# A new workspace package needs its manifest added here; --frozen-lockfile
# fails loudly if one is missing.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY artifacts/api-server/package.json artifacts/api-server/
COPY artifacts/translator/package.json artifacts/translator/
COPY artifacts/mockup-sandbox/package.json artifacts/mockup-sandbox/
COPY lib/api-client-react/package.json lib/api-client-react/
COPY lib/api-spec/package.json lib/api-spec/
COPY lib/api-zod/package.json lib/api-zod/
COPY lib/db/package.json lib/db/
COPY scripts/package.json scripts/

# Linux x64 only — see the platform overrides in pnpm-workspace.yaml.
RUN pnpm install --frozen-lockfile

# .dockerignore keeps node_modules out, so this never clobbers the install above.
COPY . .

# Build only what the deploy needs (skips the workspace-wide typecheck gate and
# the mockup-sandbox package); CI runs `pnpm run typecheck` and the tests.
RUN pnpm --filter @workspace/translator run build \
 && pnpm --filter @workspace/api-server run build \
 && mkdir -p artifacts/api-server/dist/public \
 && cp -r artifacts/translator/dist/public/. artifacts/api-server/dist/public/

# ---------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------
FROM node:24-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
# Railway injects PORT; this is the documented local default.
ENV PORT=8080

# esbuild bundles every runtime dependency into dist, so the image needs neither
# node_modules nor the sources — no dev toolchain, no pnpm store, no repo.
COPY --from=build /app/artifacts/api-server/dist ./dist

USER node
EXPOSE 8080

CMD ["node", "dist/index.mjs"]
