/**
 * Server module: ACP proxy server that bridges WebSocket/JSON-RPC clients to a
 * spawned ACP agent child process. Implements both the legacy `{type, payload}`
 * envelope and JSON-RPC 2.0 protocol surfaces.
 *
 * This file is the public entrypoint (barrel) re-exporting from the `./server/`
 * sub-modules. The split keeps each sub-file under 500 lines while preserving
 * the exact public API surface — server.test.ts imports every named export
 * from this module, so DO NOT add internal-only exports here.
 */
export type { ServerConfig } from './server/types.js'
export {
  MAX_CLIENT_WS_PAYLOAD_BYTES,
  isJsonRpc2Message,
} from './ws-message.js'
export type { JsonRpc2ClientMessage } from './ws-message.js'
export { decodeClientWsMessage } from './server/payload-decode.js'
export { resolveNewSessionPermissionMode } from './server/permission-mode.js'
export { __testing } from './server/testing-internals.js'
export { startServer } from './server/start-server.js'
