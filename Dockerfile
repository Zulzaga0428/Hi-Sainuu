# Single-service image: builds the translator client + api-server bundle,
# then the api-server serves the client's static files and /api on one port.
FROM node:24-slim

WORKDIR /app
ENV CI=true
RUN corepack enable

# Install workspace deps (Linux x64 — matches pnpm-workspace.yaml platform overrides)
COPY . .
RUN pnpm install --frozen-lockfile

# typecheck + build every package, then fold the built client into the server bundle dir
RUN pnpm run build \
 && mkdir -p artifacts/api-server/dist/public \
 && cp -r artifacts/translator/dist/public/. artifacts/api-server/dist/public/

ENV NODE_ENV=production
# Railway provides PORT at runtime; api-server reads process.env.PORT
CMD ["node", "artifacts/api-server/dist/index.mjs"]
