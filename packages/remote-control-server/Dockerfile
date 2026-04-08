# ---- Stage 1: 安装依赖 + 构建 ----
FROM oven/bun:1 AS builder
WORKDIR /app

COPY packages/remote-control-server/package.json ./package.json
RUN bun install

COPY packages/remote-control-server/src ./src
RUN bun build src/index.ts --outfile=dist/server.js --target=bun

# ---- Stage 2: 运行时 ----
FROM oven/bun:1-slim AS runtime

RUN addgroup --system app && adduser --system --ingroup app app

WORKDIR /app

COPY --from=builder /app/dist/server.js ./server.js
COPY packages/remote-control-server/web ./web

VOLUME /app/data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun run -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

USER app

CMD ["bun", "run", "server.js"]
