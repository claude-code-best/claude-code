/**
 * 启动 Remote Control Server
 *
 * Usage:
 *   bun run scripts/rcs.ts
 *   RCS_API_KEYS=key1,key2 RCS_PORT=4000 bun run scripts/rcs.ts
 */
import { config } from "../packages/remote-control-server/src/config";

console.log(`[RCS] Starting Remote Control Server...`);
console.log(`[RCS] Port: ${config.port}`);
console.log(`[RCS] API Key configuration loaded`);

const server = await import("../packages/remote-control-server/src/index.ts");

Bun.serve(
	server.default
)
