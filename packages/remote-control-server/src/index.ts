import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { config } from "./config";
import { closeAllConnections } from "./transport/ws-handler";
import { closeAllAcpConnections } from "./transport/acp-ws-handler";
import { closeAllRelayConnections } from "./transport/acp-relay-handler";
import { startDisconnectMonitor } from "./services/disconnect-monitor";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import acpRoutes from "./routes/acp";
import { webCorsOptions } from "./auth/cors";

// Routes
import v1Environments from "./routes/v1/environments";
import v1EnvironmentsWork from "./routes/v1/environments.work";
import v1Sessions from "./routes/v1/sessions";
import v1SessionIngress from "./routes/v1/session-ingress";
import { websocket } from "./transport/ws-shared";
import v2CodeSessions from "./routes/v2/code-sessions";
import v2Worker from "./routes/v2/worker";
import v2WorkerEventsStream from "./routes/v2/worker-events-stream";
import v2WorkerEvents from "./routes/v2/worker-events";
import webAuth from "./routes/web/auth";
import webSessions from "./routes/web/sessions";
import webControl from "./routes/web/control";
import webEnvironments from "./routes/web/environments";

console.log("[RCS] In-memory store ready (no SQLite)");

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", async (c, next) => {
  // Normalize double slashes in path (e.g. //v1/environments/bridge → /v1/environments/bridge)
  const path = new URL(c.req.url).pathname;
  if (path.includes("//")) {
    const normalized = path.replace(/\/+/g, "/");
    const url = new URL(c.req.url);
    url.pathname = normalized;
    return app.fetch(new Request(url.toString(), c.req.raw));
  }
  await next();
});
app.use("/web/*", cors(webCorsOptions));

// Health check
app.get("/health", (c) => c.json({ status: "ok", version: config.version }));

// Static files — serve built web UI under /code path
// Uses web/dist/ if it exists (production), otherwise falls back to web/ (dev/fallback)
const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, "../web/dist");
const webDir = existsSync(resolve(distDir, "index.html")) ? distDir : resolve(__dirname, "../web");

const stripCodePrefix = (p: string) => p.replace(/^\/code/, "");

// Serve all static files under /code/* from web/ directory
app.use("/code/*", serveStatic({ root: webDir, rewriteRequestPath: stripCodePrefix }));
// /code, /code/, and /code/:sessionId — SPA fallback
app.get("/code", serveStatic({ root: webDir, path: "index.html" }));
app.get("/code/", serveStatic({ root: webDir, path: "index.html" }));
app.get("/code/:sessionId", serveStatic({ root: webDir, path: "index.html" }));

// v1 Environment routes
app.route("/v1/environments", v1Environments);
app.route("/v1/environments", v1EnvironmentsWork);

// v1 Session routes
app.route("/v1/sessions", v1Sessions);

// Session Ingress (WebSocket) — mounted at both /v1 and /v2 so the bridge
// client's buildSdkUrl works with or without an Envoy proxy rewriting /v1→/v2.
app.route("/v1/session_ingress", v1SessionIngress);
app.route("/v2/session_ingress", v1SessionIngress);

// v2 Code Sessions routes
app.route("/v1/code/sessions", v2CodeSessions);
app.route("/v1/code/sessions", v2Worker);
app.route("/v1/code/sessions", v2WorkerEventsStream);
app.route("/v1/code/sessions", v2WorkerEvents);

// Web control panel routes
app.route("/web", webAuth);
app.route("/web", webSessions);
app.route("/web", webControl);
app.route("/web", webEnvironments);

// ACP protocol routes
console.log("[RCS] ACP support enabled");
app.route("/acp", acpRoutes);

const port = config.port;
const host = config.host;

console.log(`[RCS] Remote Control Server starting on ${host}:${port}`);
console.log("[RCS] API key configuration loaded");
console.log(`[RCS] Base URL: ${config.baseUrl || `http://localhost:${port}`}`);
console.log(`[RCS] Disconnect timeout: ${config.disconnectTimeout}s`);
console.log(`[RCS] WebSocket idle timeout: ${config.wsIdleTimeout}s (protocol-level pings)`);
console.log(`[RCS] WebSocket keepalive interval: ${config.wsKeepaliveInterval}s (data frames)`);

// Start disconnect monitor
startDisconnectMonitor();

export default {
  port,
  hostname: host,
  fetch: app.fetch,
  websocket: {
    ...websocket,
    idleTimeout: config.wsIdleTimeout, // Bun sends protocol pings after this many seconds of silence
  },
  idleTimeout: config.wsIdleTimeout, // HTTP server idle timeout (seconds)
};

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  console.log(`\n[RCS] Received ${signal}, shutting down...`);
  closeAllConnections();
  closeAllAcpConnections();
  closeAllRelayConnections();
  process.exit(0);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
