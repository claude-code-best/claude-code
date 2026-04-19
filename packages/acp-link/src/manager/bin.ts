#!/usr/bin/env bun
import { createApp } from "./routes.js";
import { ProcessManager } from "./manager.js";

const PORT = parseInt(process.env.PORT || "3210", 10);

const manager = new ProcessManager();
const app = createApp(manager);

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("Shutting down...");
  await manager.shutdownAll();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

Bun.serve({
  port: PORT,
  fetch: app.fetch,
});

console.log(`acp-manager listening on http://0.0.0.0:${PORT}`);
