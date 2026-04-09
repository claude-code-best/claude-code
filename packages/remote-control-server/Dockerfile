# ---- Stage 1: Install deps + build ----
FROM oven/bun:1 AS builder
WORKDIR /app

ARG VERSION=0.1.0

COPY packages/remote-control-server/package.json ./package.json
RUN bun install

COPY packages/remote-control-server/src ./src
RUN bun build src/index.ts --outfile=dist/server.js --target=bun \
    --define "process.env.RCS_VERSION=\"${VERSION}\""

# ---- Stage 2: Runtime ----
FROM oven/bun:1-slim AS runtime

ARG VERSION=0.1.0
ENV RCS_VERSION=${VERSION}

WORKDIR /app

COPY --from=builder /app/dist/server.js ./dist/server.js
COPY packages/remote-control-server/web ./web

VOLUME /app/data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun run -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["bun", "run", "dist/server.js"]
