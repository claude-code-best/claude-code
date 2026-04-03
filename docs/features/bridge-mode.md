# BRIDGE_MODE — Remote Control

> Feature Flag: `FEATURE_BRIDGE_MODE=1`
> Implementation Status: Fully functional (v1 + v2 implementation)
> Reference Count: 28

## 1. Feature Overview

BRIDGE_MODE registers the local CLI as a "bridge environment", which can be remotely driven from claude.ai or other control planes. The local terminal becomes an "executor", receiving remote instructions and executing them.

### Core Features

- **Environment Registration**: Local CLI registers with Anthropic servers as an available bridge environment
- **Work Polling**: Long-poll waiting for remote task assignments
- **Session Management**: Create, resume, and archive remote sessions
- **Permission Pass-Through**: Remote permission requests sent to the control plane, user approves/rejects on claude.ai
- **Heartbeat Keep-Alive**: Periodically sends heartbeat to extend task lease
- **Trusted Device**: v2 supports trusted device tokens for enhanced security

## 2. Implementation Architecture

### 2.1 Version Evolution

| Version | Implementation | Features |
|---------|---------------|----------|
| v1 (env-based) | `src/bridge/replBridge.ts` | Traditional bridge based on environment variables |
| v2 (env-less) | `src/bridge/remoteBridgeCore.ts` | No environment variables needed, more secure bridge |

### 2.2 API Protocol

File: `src/bridge/bridgeApi.ts`

Bridge API Client provides 7 core operations:

| Operation | HTTP | Description |
|-----------|------|-------------|
| `registerBridgeEnvironment` | POST `/v1/environments/bridge` | Register local environment, get `environment_id` + `environment_secret` |
| `pollForWork` | GET `/v1/environments/{id}/work/poll` | Long-poll wait for task (10s timeout) |
| `acknowledgeWork` | POST `/v1/environments/{id}/work/{workId}/ack` | Confirm task receipt |
| `stopWork` | POST `/v1/environments/{id}/work/{workId}/stop` | Stop task |
| `heartbeatWork` | POST `/v1/environments/{id}/work/{workId}/heartbeat` | Renew task lease |
| `deregisterEnvironment` | DELETE `/v1/environments/bridge/{id}` | Deregister environment |
| `archiveSession` | POST `/v1/sessions/{id}/archive` | Archive session (409 = already archived, idempotent) |
| `sendPermissionResponseEvent` | POST `/v1/sessions/{id}/events` | Send permission approval result |
| `reconnectSession` | POST `/v1/environments/{id}/bridge/reconnect` | Reconnect to existing session |

### 2.3 Authentication Flow

```
Registration: OAuth Bearer Token -> get environment_secret
Polling: environment_secret as Authorization
  +-- 401 -> attempt OAuth token refresh (onAuth401)
  +-- Refresh successful -> retry once
```

**OAuth Refresh**: API client has built-in `withOAuthRetry` mechanism. On 401, calls `handleOAuth401Error` (same pattern as withRetry.ts v1/messages), refreshes then retries once.

### 2.4 Security Design

- **Path Traversal Protection**: `validateBridgeId()` uses `/^[a-zA-Z0-9_-]+$/` allowlist validation for all server-side IDs
- **BridgeFatalError**: Non-retryable errors (401/403/404/410) throw immediately, preventing retry loops
- **Trusted Device Token**: v2 enhances security via `X-Trusted-Device-Token` header
- **Idempotent Registration**: Supports `reuseEnvironmentId` for session recovery, avoiding duplicate environment creation

### 2.5 Data Flow

```
claude.ai user selects remote environment
         |
         v
POST /v1/environments/bridge (registration)
         |
         <-- environment_id + environment_secret
         |
         v
GET .../work/poll (long-poll)
         |
         <-- WorkResponse { id, data: { type, sessionId } }
         |
         v
POST .../work/{id}/ack (acknowledge)
         |
         v
sessionRunner creates REPL session
         |
         +-- Permission request -> sendPermissionResponseEvent
         +-- Heartbeat -> heartbeatWork (renew lease)
         +-- Task complete -> auto-archive
```

### 2.6 Module Structure

| Module | File | Responsibility |
|--------|------|----------------|
| API Client | `bridgeApi.ts` | HTTP communication (register/poll/acknowledge/heartbeat/deregister) |
| Session Runner | `sessionRunner.ts` | Create/resume REPL sessions |
| Bridge Config | `bridgeConfig.ts` | Configuration management (machine name, max sessions, etc.) |
| Transport | `replBridgeTransport.ts` | Bridge transport layer |
| Permission Callbacks | `bridgePermissionCallbacks.ts` | Permission request handling |
| Pointer | `bridgePointer.ts` | Current active bridge state pointer |
| Flush Gate | `flushGate.ts` | Flush control |
| JWT Utils | `jwtUtils.ts` | JWT token utilities |
| Trusted Device | `trustedDevice.ts` | Trusted device management |
| Debug Utils | `debugUtils.ts` | Debug logging |
| Types | `types.ts` | Type definitions |

## 3. Key Design Decisions

1. **Long-Poll Instead of WebSocket**: `pollForWork` uses HTTP GET + 10s timeout. Simple, reliable, no WebSocket connection maintenance
2. **OAuth Refresh Built-in**: API client has built-in `withOAuthRetry`, no external retry logic needed
3. **ETag Conditional Request**: Registration supports `reuseEnvironmentId` for idempotent session recovery
4. **v1/v2 Coexistence**: Both implementations exist in code, v2 is the more secure upgrade
5. **Bidirectional Permission Flow**: Local permission requests sent to claude.ai, user approves on web

## 4. Usage

```bash
# Enable bridge mode
FEATURE_BRIDGE_MODE=1 bun run dev

# Connect remotely from claude.ai/code
# Select registered environment in web interface

# Combined with DAEMON (background daemon)
FEATURE_BRIDGE_MODE=1 FEATURE_DAEMON=1 bun run dev
```

## 5. External Dependencies

| Dependency | Description |
|------------|-------------|
| Anthropic OAuth | claude.ai subscription login |
| GrowthBook | `tengu_ccr_bridge` gating |
| Bridge API | `/v1/environments/bridge` endpoint series |

## 6. File Index

| File | Lines | Responsibility |
|------|-------|----------------|
| `src/bridge/bridgeApi.ts` | 540 | API Client (core) |
| `src/bridge/sessionRunner.ts` | — | Session runner |
| `src/bridge/bridgeConfig.ts` | — | Configuration management |
| `src/bridge/replBridgeTransport.ts` | — | Transport layer |
| `src/bridge/bridgePermissionCallbacks.ts` | — | Permission callbacks |
| `src/bridge/bridgePointer.ts` | — | State pointer |
| `src/bridge/flushGate.ts` | — | Flush control |
| `src/bridge/jwtUtils.ts` | — | JWT utilities |
| `src/bridge/trustedDevice.ts` | — | Trusted device |
| `src/bridge/remoteBridgeCore.ts` | — | v2 core implementation |
| `src/bridge/types.ts` | — | Type definitions |
| `src/bridge/debugUtils.ts` | — | Debug utilities |
| `src/bridge/pollConfigDefaults.ts` | — | Poll config defaults |
| `src/bridge/bridgeUI.ts` | — | UI components |
| `src/bridge/codeSessionApi.ts` | — | Code session API |
| `src/bridge/peerSessions.ts` | — | Peer session management |
| `src/bridge/sessionIdCompat.ts` | — | Session ID compatibility layer |
| `src/bridge/createSession.ts` | — | Session creation |
| `src/bridge/replBridgeHandle.ts` | — | Bridge handle |
