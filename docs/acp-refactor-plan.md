# ACP Refactor Plan: Splitting 3 Large Files into Modular Sub-files

This document is the authoritative migration plan for splitting three oversized ACP (Agent Client Protocol) source files into modular sub-files. Each file exceeds the 500-line-per-module budget; the refactor preserves every public export path so that **no test file and no external consumer requires modification**.

**Hard constraints (all three refactors):**

1. All current public API export paths MUST remain working (`from '../server.js'`, `from '../bridge.js'`, `from '../agent.js'`).
2. Every new file MUST be under 500 lines.
3. Test files MUST NOT be modified — including `permissions.test.ts` which does `require('../bridge.ts')` and snapshots the **entire** export surface (so the bridge barrel MUST export exactly the public API, no more, no less).
4. Only the 3 target files and their NEW sub-modules may be modified.
5. `bun run precheck` MUST pass after every step (typecheck + lint fix + test).

---

## Target Files (current state)

| File | Lines | Public API surface |
|------|------:|--------------------|
| `packages/acp-link/src/server.ts` | 1800 | 8 must-preserve symbols |
| `src/services/acp/bridge.ts` | 1516 | 8 must-preserve symbols |
| `src/services/acp/agent.ts` | 1297 | 1 must-preserve symbol (`AcpAgent`) |
| **Total** | **4613** | |

---

## Migration Order (with rationale)

The three files are refactored **in dependency order, leaf-first**, so that each step has a stable foundation and any cross-file regression is caught immediately:

1. **Phase 1 — `src/services/acp/bridge.ts`** (leaf-ish utility module).
   - Rationale: `agent.ts` imports `forwardSessionUpdates`, `replayHistoryMessages`, `ToolUseCache` from `bridge.js`. Splitting bridge first means agent's refactor builds against the new (identical) bridge surface. Bridge has zero imports from agent.ts, so it can be split independently.
   - The barrel `bridge/index.ts` re-exports the exact public API, so the existing `from '../bridge.js'` specifier resolves unchanged under both Bun and tsc (directory + `index.ts`).

2. **Phase 2 — `src/services/acp/agent.ts`** (the cohesive AcpAgent class).
   - Rationale: Depends on the now-stable bridge module. Only pure helpers and types are extracted; the class body stays intact in `AcpAgent.ts`. `bridge.test.ts`, `agent.test.ts`, `permissions.test.ts` continue to work because `from '../agent.js'` and `from '../bridge.js'` resolve to the barrels.

3. **Phase 3 — `packages/acp-link/src/server.ts`** (largest, most interdependent).
   - Rationale: Self-contained inside `acp-link`; does not import from `src/services/acp`. Done last so the most complex module split (12 sub-files, runtime-state container, handler fan-out) can leverage the workflow discipline practiced in Phases 1–2.

Within each phase, the internal creation order is always: **types → leaf pure helpers → mid-level helpers → handlers → dispatch → barrel → delete original**. This keeps the import graph acyclic at every intermediate commit.

---

## Phase 1 — `src/services/acp/bridge.ts`

### Directory structure

```
src/services/acp/
├── bridge.ts                         ← DELETED (replaced by directory)
└── bridge/
    ├── index.ts                      ← barrel (public API)
    ├── types.ts                      ← type definitions
    ├── paths.ts                      ← toAbsolutePath
    ├── contentBlocks.ts              ← low-level block conversion
    ├── toolInfo.ts                   ← toolInfoFromToolUse
    ├── toolResults.ts                ← tool result → ToolCallContent
    ├── modelUsage.ts                 ← context-window prefix helpers
    ├── notifications.ts              ← content-block → SessionUpdate engine
    └── forwarding.ts                 ← stream replay + forwarding loop
```

### Files, responsibilities, line budgets

| File | Responsibility | Exports | Budget |
|------|----------------|---------|-------:|
| `bridge/types.ts` | Shared ACP-bridge type definitions: `ToolUseCache`, `SessionUsage`, `BridgeUsage`, `Bridge*Message` interfaces, `BridgeSDKMessage` discriminated union, `ToolInfo`, `EditToolResponseHunk`, `EditToolResponse`. Re-exports SDK type-only imports (`ContentBlock`, `ToolCallContent`, `ToolCallLocation`, `ToolKind`). | 16 symbols | ~150 |
| `bridge/paths.ts` | Pure path-normalisation helper `toAbsolutePath` used by toolInfo / toolResults / forwarding. Leaf module, no bridge-internal imports. | `toAbsolutePath` | ~20 |
| `bridge/contentBlocks.ts` | Low-level conversion of Claude content block shapes into ACP `ContentBlock` values. `toAcpContentUpdate` wraps arrays/strings into `ToolCallContent[]` via `toAcpContentBlock`. Leaf module. | `toAcpContentUpdate`, `toAcpContentBlock` | ~150 |
| `bridge/toolInfo.ts` | `toolInfoFromToolUse` — large switch mapping each known tool name (Agent/Task, Bash, Read, Write, Edit, Glob, Grep, WebFetch, WebSearch, TodoWrite, ExitPlanMode, default) to ACP `ToolInfo` (title, kind, content, locations). Depends on `paths.toAbsolutePath` and `../utils.js` (`toDisplayPath`). | `toolInfoFromToolUse` | ~250 |
| `bridge/toolResults.ts` | `toolUpdateFromToolResult` (Read markdown escape, Bash console fence, Edit/Write no-op, ExitPlanMode title, default via `toAcpContentUpdate`); `toolUpdateFromEditToolResponse` (parses `structuredPatch` hunks into diff `ToolCallContent` with absolute paths). Depends on `contentBlocks` and `paths`. | `toolUpdateFromToolResult`, `toolUpdateFromEditToolResponse` | ~180 |
| `bridge/modelUsage.ts` | `commonPrefixLength` and `getMatchingModelUsage` — pure helpers used by the forwarding loop to resolve `contextWindow` from `modelUsage` map by prefix match. Leaf module. | `commonPrefixLength`, `getMatchingModelUsage` | ~35 |
| `bridge/notifications.ts` | Core content-block → `SessionUpdate` conversion engine. `toAcpNotifications` handles text/thinking/image/tool_use/tool_result/etc. and writes into `ToolUseCache`. `assistantMessageToAcpNotifications` and `streamEventToAcpNotifications` are thin adapters. `normalizePlanStatus` helper for TodoWrite plan mapping. Depends on `toolInfo.toolInfoFromToolUse`, `toolResults.toolUpdateFromToolResult`, and `types`. **No logger** in original — do NOT add one here. | `toAcpNotifications`, `assistantMessageToAcpNotifications`, `streamEventToAcpNotifications`, `normalizePlanStatus` | ~320 |
| `bridge/forwarding.ts` | `nextSdkMessageOrAbort` (races async generator against `AbortSignal`); `forwardSessionUpdates` (main loop consuming `SDKMessage` stream, dispatching to notification converters, accumulating usage, mapping stop reasons); `replayHistoryMessages` (replays stored user/assistant history through `toAcpNotifications`). The module-level `const logger = console` lives here (only `forwardSessionUpdates` default branch and `replayHistoryMessages` reference `logger.debug`). Depends on `types`, `notifications`, `modelUsage`. | `nextSdkMessageOrAbort`, `forwardSessionUpdates`, `replayHistoryMessages` | ~280 |
| `bridge/index.ts` | Barrel — see content below. | 8 re-exports | ~20 |

### Barrel content — `src/services/acp/bridge/index.ts`

```ts
// Barrel preserving the public API of the former src/services/acp/bridge.ts.
// Do NOT add internal-only exports here: permissions.test.ts snapshots the
// entire module surface via require('../bridge.ts') and would break if the
// exported name set changes.
export type { ToolUseCache, SessionUsage } from './types.js'
export {
  toolInfoFromToolUse,
} from './toolInfo.js'
export {
  toolUpdateFromToolResult,
  toolUpdateFromEditToolResponse,
} from './toolResults.js'
export {
  nextSdkMessageOrAbort,
  forwardSessionUpdates,
  replayHistoryMessages,
} from './forwarding.js'
```

### Phase 1 verification

```bash
# After creating all sub-files and deleting bridge.ts:
bun test src/services/acp/__tests__/bridge.test.ts
bun test src/services/acp/__tests__/permissions.test.ts   # snapshot-sensitive
bun test src/services/acp/__tests__/agent.test.ts         # imports bridge.js + agent.js
bun run precheck                                            # typecheck + lint + test
```

### Phase 1 risk callouts

- **Snapshot sensitivity**: `permissions.test.ts` lines 34–35 do `require('../bridge.ts')` and snapshot every named export. The barrel MUST export exactly `{ ToolUseCache, SessionUsage, toolInfoFromToolUse, toolUpdateFromToolResult, toolUpdateFromEditToolResponse, nextSdkMessageOrAbort, forwardSessionUpdates, replayHistoryMessages }`. Do NOT re-export `ToolInfo`, `BridgeSDKMessage`, or any internal helper.
- **Logger alias**: the original `const logger = console` is a top-level const with no runtime side effect. Keep it ONLY in `forwarding.ts`. Do NOT create a shared `logger.ts` (would risk a cycle) and do NOT give `notifications.ts` its own logger (the original does not reference one).
- **`ToolInfo` stays internal**: it is the return type of `toolInfoFromToolUse` but was never exported from the original `bridge.ts`. Keep it module-internal so the public surface matches the original exactly.

---

## Phase 2 — `src/services/acp/agent.ts`

### Directory structure

```
src/services/acp/
├── agent.ts                          ← DELETED (replaced by directory)
└── agent/
    ├── index.ts                      ← barrel (re-exports AcpAgent)
    ├── sessionTypes.ts               ← AcpSession / PendingPrompt types
    ├── permissionMode.ts             ← permission mode resolution
    ├── configOptions.ts              ← config option list builder
    ├── promptQueue.ts                ← pending-prompt queue helpers
    └── AcpAgent.ts                   ← the AcpAgent class body
```

### Files, responsibilities, line budgets

| File | Responsibility | Exports | Budget |
|------|----------------|---------|-------:|
| `agent/sessionTypes.ts` | Type definitions for in-process ACP session state. `AcpSession` and `PendingPrompt` type aliases shared across agent internals and helpers. | `AcpSession`, `PendingPrompt` | ~35 |
| `agent/permissionMode.ts` | Resolve the effective permission mode from `_meta`, settings, and process env. Determine whether ACP `bypassPermissions` mode is available (process + local opt-in + settings). `PermissionMode`-id validation guard. Imports `PermissionMode` type from `../../types/permissions.js` and `resolvePermissionMode` from `../utils.js` — leaf module, does NOT import AcpAgent. | `permissionModeIds`, `isPermissionMode`, `resolveSessionPermissionMode`, `isAcpBypassPermissionModeAvailable`, `hasOwnField` | ~110 |
| `agent/configOptions.ts` | Build the ACP session config option list (mode + model select options) from session states. `flattenConfigOptionValues` flattens grouped/flat select options into valid value strings for validation. Imports ACP SDK types (`SessionModeState`, `SessionModelState`, `SessionConfigOption`). Leaf module. | `buildConfigOptions`, `flattenConfigOptionValues` | ~70 |
| `agent/promptQueue.ts` | Pending-prompt queue management: `popNextPendingPrompt`, `compactPendingQueue` (compacts queue head to bound memory). Pure helpers operating on `AcpSession.pendingQueue` / `pendingMessages`. Imports `sessionTypes` only. | `popNextPendingPrompt`, `compactPendingQueue` | ~45 |
| `agent/AcpAgent.ts` | The `AcpAgent` class implementing the ACP Agent interface. All protocol method handlers (`initialize`, `authenticate`, `newSession`, `resumeSession`, `loadSession`, `listSessions`, `forkSession`, `closeSession`, `prompt`, `cancel`, `setSessionMode`, `setSessionModel`, `setSessionConfigOption`) and private lifecycle helpers (`createSession`, `getOrCreateSession`, `teardownSession`, `replaySessionHistory`, `applySessionMode`, `updateConfigOption`, `syncSessionConfigState`, `sendAvailableCommandsUpdate`, `scheduleAvailableCommandsUpdate`, `maybeEmitSessionInfoUpdate`, `getSetting`). Imports `sessionTypes`, `permissionMode`, `configOptions`, `promptQueue`. Imports `ToolUseCache`, `forwardSessionUpdates`, `replayHistoryMessages` from `../bridge.js` (the Phase 1 barrel). | `AcpAgent` | ~480 |
| `agent/index.ts` | Barrel — see content below. | `AcpAgent` | ~5 |

### Barrel content — `src/services/acp/agent/index.ts`

```ts
// Barrel preserving the public API of the former src/services/acp/agent.ts.
// Tests import AcpAgent via '../agent.js' (Bun/tsc resolve the directory's
// index.ts). Keep this file to a single re-export.
export { AcpAgent } from './AcpAgent.js'
```

### Why the class body is NOT split further

The `AcpAgent` class is a single cohesive unit bound by `this.sessions` and `this.conn`. Methods like `createSession`, `prompt`, `cancel`, `teardownSession`, `applySessionMode`, `updateConfigOption` all reference `this.*` and shared private helpers. Extracting methods to a separate module would require passing the session map and connection as parameters and would create tight bidirectional coupling with high cycle risk. Therefore the class body stays in one module (~480 lines, under the 500 limit); only pure helpers and types are extracted. This keeps the import graph strictly acyclic: `sessionTypes`/`permissionMode`/`configOptions`/`promptQueue` are pure leaves that never import `AcpAgent`.

### Phase 2 verification

```bash
bun test src/services/acp/__tests__/agent.test.ts          # imports ../agent.js + ../bridge.js
bun test src/services/acp/__tests__/permissions.test.ts    # still green after bridge split
bun run precheck
```

### Phase 2 risk callouts

- **Private method coupling**: keep the class intact in `AcpAgent.ts`; do not be tempted to extract methods even if the file approaches the budget.
- **ToolUseCache shape coupling**: `maybeEmitSessionInfoUpdate` attaches `__sessionInfoTitleSent` to `session.toolUseCache` via a structural cast. Keep that logic inside `AcpAgent.ts` so no cross-module dependency on the extended shape is introduced.
- **Test path stability**: `agent.test.ts` line 195 does `await import('../agent.js')`. With `agent/index.ts` re-exporting `AcpAgent` from `agent/AcpAgent.ts`, the specifier resolves under Bun/TS because directory imports map to `index.ts`. The barrel MUST use the `.js` extension (`export { AcpAgent } from './AcpAgent.js'`) to match the project's ESM convention.

---

## Phase 3 — `packages/acp-link/src/server.ts`

### Directory structure

```
packages/acp-link/src/
├── server.ts                         ← DELETED (replaced by directory)
└── server/
    ├── index.ts                      ← barrel (public API)
    ├── types.ts                      ← protocol/state types + JSON-RPC codes
    ├── runtime-state.ts              ← module-scoped mutable state container
    ├── client-send.ts                ← outbound message framing
    ├── acp-client.ts                 ← createClient + permission helpers
    ├── payload-decode.ts             ← validation/decode utilities
    ├── permission-mode.ts            ← permission mode resolution
    ├── handlers-agent.ts             ← agent lifecycle handlers
    ├── handlers-session.ts           ← session-scoped handlers
    ├── dispatch.ts                   ← dispatch + JSON-RPC wrappers + table
    ├── testing-internals.ts          ← __testing public object
    └── start-server.ts               ← startServer orchestrator
```

### Files, responsibilities, line budgets

| File | Responsibility | Exports | Budget |
|------|----------------|---------|-------:|
| `server/types.ts` | Shared protocol/state type definitions used across all server modules (`ServerConfig`, `PendingPermission`, `PromptCapabilities`, `SessionModelState`, `AgentCapabilities`, `ClientState`, `ContentBlock`, `PermissionResponsePayload`, `ProxyMessage`); `createClientState` factory; `DEFAULT_CLIENT_INFO` / `DEFAULT_CLIENT_CAPABILITIES` constants; JSON-RPC error code constants. | 16 symbols | ~200 |
| `server/runtime-state.ts` | Module-scoped mutable state container for the running server: holds the `clients` Map, server config fields (`AGENT_*`, `SERVER_*`, `AUTH_TOKEN`, `DEFAULT_PERMISSION_MODE`), `rcsUpstream`, loggers, and accessor/mutator helpers. `createRelayWs` virtual `WSContext` factory. `generateRequestId` helper. **MUST NOT import any handler module** to avoid cycles. | `clients`, `getServerConfig`, `setServerConfig`, `getRcsUpstream`, `setRcsUpstream`, `getAgentConfig`, `getDefaultPermissionMode`, `setDefaultPermissionMode`, `logWs`, `logAgent`, `logSession`, `logPrompt`, `logPerm`, `logRelay`, `logServer`, `PERMISSION_TIMEOUT_MS`, `HEARTBEAT_INTERVAL_MS`, `createRelayWs`, `generateRequestId` | ~140 |
| `server/client-send.ts` | Outbound message framing: `send`, `sendJsonRpcRaw`, `sendJsonRpcError`. `LEGACY_NOTIFICATION_TO_JSONRPC` mapping. Depends on `runtime-state` (`clients`, `rcsUpstream`) and `types` (`ClientState`). Reads `rcsUpstream` via runtime-state and the `clients` Map; `sendJsonRpcError` reads/writes `state.pendingJsonRpc`. | `send`, `sendJsonRpcRaw`, `sendJsonRpcError` | ~110 |
| `server/acp-client.ts` | `createClient(ws, clientState)`: builds the `acp.Client` implementation that forwards `requestPermission` / `sessionUpdate` / `readTextFile` / `writeTextFile`. `handlePermissionResponse` and `cancelPendingPermissions`. Depends on `client-send` (`send`) and `runtime-state` (`logPerm`). Import graph: `client-send → runtime-state` (ok), `acp-client → client-send + runtime-state` (ok, no cycle). | `createClient`, `handlePermissionResponse`, `cancelPendingPermissions` | ~110 |
| `server/payload-decode.ts` | Pure validation/decode utilities (`isRecord`, `optionalString`, `optionalStringField`, `payloadRecord`, `optionalPayloadRecord`, `optionalRecord`, `decodeContentBlocks`, `decodePermissionResponsePayload`). `decodeClientMessage` switch turning a raw record into a `ProxyMessage`. Public `decodeClientWsMessage` wrapper. `decodeClientMessage` is also consumed by `start-server.ts` (RCS relay path) — keep it exported here to avoid duplication. | 10 symbols | ~200 |
| `server/permission-mode.ts` | `ACP_LINK_PERMISSION_MODE_ALIASES` + `resolveAcpLinkPermissionMode` + public `resolveNewSessionPermissionMode`. `buildAgentEnv` helper. | `resolveNewSessionPermissionMode`, `resolveAcpLinkPermissionMode`, `ACP_LINK_PERMISSION_MODE_ALIASES`, `buildAgentEnv` | ~90 |
| `server/handlers-agent.ts` | Agent lifecycle + connection handlers: `handleConnect` and `handleDisconnect`. Spawns the agent child process, builds the ACP `ClientSideConnection`, surfaces status. Depends on `runtime-state`, `client-send`, `acp-client`, `types`. | `handleConnect`, `handleDisconnect` | ~160 |
| `server/handlers-session.ts` | Session-scoped handlers: `handleNewSession`, `handleListSessions`, `handleLoadSession`, `handleResumeSession`, `handleCancel`, `handleSetSessionModel`, `handlePrompt`. All operate on `clients.get(ws)` state and forward to `ClientSideConnection`. | 7 symbols | ~360 |
| `server/dispatch.ts` | `dispatchClientMessage` (legacy envelope switch). JSON-RPC wrappers `handleJsonRpcNewSession` / `Prompt` / `ListSessions` / `LoadSession` / `ResumeSession` / `SetSessionModel` / `SetSessionMode` / `CloseSession` / `CancelRequest`. `JSONRPC_METHOD_HANDLERS` table and `dispatchJsonRpcMessage` router. The JSON-RPC wrappers live **alongside** the table in this module (no cross-module forward reference). | `dispatchClientMessage`, `dispatchJsonRpcMessage`, `JSONRPC_METHOD_HANDLERS`, `handleJsonRpcSetSessionMode`, `handleJsonRpcCloseSession`, `handleJsonRpcCancelRequest` | ~290 |
| `server/testing-internals.ts` | `__testing` public object (`dispatchClientMessage` / `dispatchJsonRpcMessage` / `registerClient` / `getClientSessionId` / `setDefaultPermissionMode`). `assertTestingInternalsEnabled` guard gated on `ACP_LINK_TEST_INTERNALS`. Co-locate the guard with the methods that call it. | `__testing`, `assertTestingInternalsEnabled` | ~80 |
| `server/start-server.ts` | `startServer(config)`: configures runtime-state, wires `RcsUpstreamClient` relay, builds the Hono app with `/health` and `/ws` (token validation, `onOpen` / `onMessage` / `onClose`, heartbeat), HTTPS option, startup banner, SIGINT/SIGTERM graceful shutdown. Top-level orchestrator importing from `runtime-state`, `client-send`, `acp-client`, `dispatch`, `payload-decode`. All intervals/sockets MUST be created inside `startServer` (no top-level side effects). | `startServer` | ~280 |
| `server/index.ts` | Barrel — see content below. | 8 re-exports | ~25 |

### Barrel content — `packages/acp-link/src/server/index.ts`

```ts
// Barrel preserving the public API of the former packages/acp-link/src/server.ts.
//
// Re-exports of MAX_CLIENT_WS_PAYLOAD_BYTES / isJsonRpc2Message /
// JsonRpc2ClientMessage MUST come from '../ws-message.js' (single source of
// truth) — do NOT route them through a split module.
export type { ServerConfig } from './types.js'
export {
  MAX_CLIENT_WS_PAYLOAD_BYTES,
  isJsonRpc2Message,
} from '../ws-message.js'
export type { JsonRpc2ClientMessage } from '../ws-message.js'
export { decodeClientWsMessage } from './payload-decode.js'
export { resolveNewSessionPermissionMode } from './permission-mode.js'
export { __testing } from './testing-internals.js'
export { startServer } from './start-server.js'
```

### Phase 3 verification

```bash
bun test packages/acp-link/src/__tests__/server.test.ts
bun test packages/acp-link/src/__tests__/types.test.ts
bun run precheck
bun run build       # confirm chunk count is sane and dist/cli.js builds
```

### Phase 3 risk callouts

- **Module-scoped mutable state**: `AGENT_COMMAND`, `AGENT_ARGS`, `AGENT_CWD`, `SERVER_PORT`, `SERVER_HOST`, `AUTH_TOKEN`, `DEFAULT_PERMISSION_MODE`, the `clients` Map, and `rcsUpstream` all live in `runtime-state.ts`. Every other module accesses them via the accessors/setters. Keep `runtime-state.ts` free of any handler import — it is the shared leaf that everything else depends on; importing handlers back into it creates a cycle.
- **Single-flight invariant**: `sendJsonRpcError` reads/writes `state.pendingJsonRpc`. Do not parallelise handlers — the pendingJsonRpc invariant depends on serial mutation of `ClientState`.
- **JSON-RPC wrappers co-located with the table**: `JSONRPC_METHOD_HANDLERS` references the `handleJsonRpc*` wrappers. To avoid cross-module forward references, the wrappers and the table MUST live in the same `dispatch.ts` module.
- **Re-exports stay at source**: `MAX_CLIENT_WS_PAYLOAD_BYTES`, `isJsonRpc2Message`, `JsonRpc2ClientMessage` are re-exported from `'../ws-message.js'` directly. Do NOT re-export them from a split module.
- **No top-level side effects**: the original file only declares module-scoped vars; loggers are created eagerly via `createLogger` (acceptable — pure construction). Do NOT start intervals or open sockets at module top level; keep them inside `startServer`.
- **assertTestingInternalsEnabled gating**: the guard is gated on `ACP_LINK_TEST_INTERNALS` and is called by every `__testing` method. Co-locate it with `__testing` in `testing-internals.ts` and preserve the gating behavior verbatim.
- **Biome lint surface**: 42 rules are disabled for decompiled code. Moving helpers like `optionalStringField` into their own module may surface `noUnusedVariables` if they are not re-exported. Export every helper that was previously file-local but is now cross-module, and run `bun run precheck` to catch new warnings.

---

## Cross-cutting verification (run after ALL three phases)

```bash
# 1. Full type + lint + test gate (REQUIRED zero errors per CLAUDE.md)
bun run precheck

# 2. Targeted regression runs for the three refactored modules
bun test packages/acp-link/src/__tests__/server.test.ts
bun test src/services/acp/__tests__/bridge.test.ts
bun test src/services/acp/__tests__/agent.test.ts
bun test src/services/acp/__tests__/permissions.test.ts

# 3. Build sanity (new chunks are produced for the new sub-files)
bun run build
ls dist/chunks | wc -l   # expect a modest increase over the previous count

# 4. Unused-export audit (catches accidentally-leaked internal exports)
bun run check:unused
```

## Acceptance criteria

- [ ] `bun run precheck` passes with zero errors.
- [ ] All four target test files pass unmodified.
- [ ] `from '../server.js'`, `from '../bridge.js'`, `from '../agent.js'` all resolve correctly (verified by the passing tests).
- [ ] No new file exceeds 500 lines.
- [ ] `permissions.test.ts` snapshot of `require('../bridge.ts')` still matches the original 8-symbol public surface.
- [ ] `bun run build` succeeds with a sane chunk count.
- [ ] No test file is modified in the diff.
