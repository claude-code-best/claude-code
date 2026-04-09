import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { config } from "./config";
import { closeAllConnections } from "./transport/ws-handler";
import { startDisconnectMonitor } from "./services/disconnect-monitor";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Routes
import v1Environments from "./routes/v1/environments";
import v1EnvironmentsWork from "./routes/v1/environments.work";
import v1Sessions from "./routes/v1/sessions";
import v1SessionIngress, { websocket } from "./routes/v1/session-ingress";
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
app.use("/web/*", cors());

// Health check
app.get("/health", (c) => c.json({ status: "ok", version: config.version }));

// Static files — serve web/ directory under /code path
const __dirname = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(__dirname, "../web");

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

const port = config.port;
const host = config.host;

console.log(`[RCS] Remote Control Server starting on ${host}:${port}`);
console.log("[RCS] API key configuration loaded");
console.log(`[RCS] Base URL: ${config.baseUrl || `http://localhost:${port}`}`);
console.log(`[RCS] Disconnect timeout: ${config.disconnectTimeout}s`);

// Start disconnect monitor
startDisconnectMonitor();

export default {
  port,
  hostname: host,
  fetch: app.fetch,
  websocket: {
    ...websocket,
    idleTimeout: 255, // WS idle timeout (seconds) — must be inside websocket object
  },
  idleTimeout: 255, // HTTP server idle timeout (seconds) — needed for long-polling endpoints
};

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  console.log(`\n[RCS] Received ${signal}, shutting down...`);
  closeAllConnections();
  process.exit(0);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
