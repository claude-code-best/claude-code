/**
 * API surface definition for @anthropic-ai/claude-agent-sdk/bridge.
 *
 * This file is the source of truth for the /bridge export's public types.
 * It imports ONLY from agentSdkTypes.ts so the compiled .d.ts has exactly
 * one import to rewrite (./agentSdkTypes → ./sdk) for the flat package layout.
 *
 * Compiled by scripts/build-ant-sdk-typings.sh; see build-agent-sdk.sh for the
 * copy into the package. Runtime code is in agentSdkBridge.ts (separate file,
 * bun-built to bridge.mjs).
 *
 * The two type definitions below are copied from src/bridge/sessionHandle.ts.
 * Keep in sync — sessionHandle.ts is the implementation source of truth;
 * this file exists to produce a clean .d.ts without walking the implementation
 * import graph.
 */
import type { PermissionMode, SDKControlRequest, SDKControlResponse, SDKMessage } from './agentSdkTypes.js';
/**
 * Session state reported to the CCR /worker endpoint.
 * @alpha
 */
export type SessionState = 'idle' | 'running' | 'requires_action';
/**
 * Per-session bridge transport handle.
 *
 * Auth is instance-scoped — the JWT lives in this handle's closure, not a
 * process-wide env var, so multiple handles can coexist without stomping
 * each other.
 * @alpha
 */
export type BridgeSessionHandle = {
    readonly sessionId: string;
    /**
     * Live SSE event-stream high-water mark. Updates as the underlying
     * transport receives frames. Persist this and pass back as
     * `initialSequenceNum` on re-attach so the server resumes instead of
     * replaying full history.
     */
    getSequenceNum(): number;
    /** True once the write path (CCRClient initialize) is ready. */
    isConnected(): boolean;
    /** Write a single SDKMessage. `session_id` is injected automatically. */
    write(msg: SDKMessage): void;
    /** Signal turn boundary — claude.ai stops the "working" spinner. */
    sendResult(): void;
    /** Forward a permission request (`can_use_tool`) to claude.ai. */
    sendControlRequest(req: SDKControlRequest): void;
    /** Forward a permission response back through the bridge. */
    sendControlResponse(res: SDKControlResponse): void;
    /**
     * Tell claude.ai to dismiss a pending permission prompt (e.g. caller
     * aborted the turn locally before the user answered).
     */
    sendControlCancelRequest(requestId: string): void;
    /**
     * Swap the underlying transport in place with a fresh JWT (and epoch).
     * Carries the SSE sequence number so the server resumes the stream.
     * Call this when the poll loop re-dispatches work for the same session
     * with a fresh secret (JWT is 4h; backend mints a new one every dispatch).
     *
     * Throws if `createV2ReplTransport` fails (registerWorker error, etc).
     * Caller should treat that as a close and drop this handle.
     */
    reconnectTransport(opts: {
        ingressToken: string;
        apiBaseUrl: string;
        /** Omit to call registerWorker; provide if the server already bumped. */
        epoch?: number;
    }): Promise<void>;
    /**
     * PUT /worker state. Multi-session workers: `running` on turn start,
     * `requires_action` on permission prompt, `idle` on turn end. Daemon
     * callers don't need this — user watches the REPL locally.
     */
    reportState(state: SessionState): void;
    /** PUT /worker external_metadata (branch, dir shown on claude.ai). */
    reportMetadata(metadata: Record<string, unknown>): void;
    /**
     * POST /worker/events/{id}/delivery. Populates CCR's processing_at /
     * processed_at columns. `received` is auto-fired internally; this
     * surfaces `processing` (turn start) and `processed` (turn end).
     */
    reportDelivery(eventId: string, status: 'processing' | 'processed'): void;
    /** Drain the write queue. Call before close() when delivery matters. */
    flush(): Promise<void>;
    close(): void;
};
/** @alpha */
export type AttachBridgeSessionOptions = {
    /**
     * Session ID (`cse_*` form). Comes from `WorkResponse.data.id` in the
     * poll-loop path, or from whatever created the session.
     */
    sessionId: string;
    /** Worker JWT. Comes from `decodeWorkSecret(work.secret).session_ingress_token`. */
    ingressToken: string;
    /** `WorkSecret.api_base_url` or wherever the session ingress lives. */
    apiBaseUrl: string;
    /**
     * Worker epoch if already known (e.g. from a `/bridge` call that bumps
     * epoch server-side). Omit to have `createV2ReplTransport` call
     * `registerWorker` itself — correct for poll-loop callers where the
     * work secret doesn't carry epoch.
     */
    epoch?: number;
    /**
     * SSE sequence-number high-water mark from a prior handle or persisted
     * state. Seeds the first SSE connect's `from_sequence_num` so the server
     * resumes instead of replaying full history. Omit (→ 0) for genuinely
     * fresh attach.
     */
    initialSequenceNum?: number;
    /** CCRClient heartbeat interval. Defaults to 20s (server TTL is 60s). */
    heartbeatIntervalMs?: number;
    /**
     * When true, the bridge only forwards events outbound (local → CCR). The
     * SSE read stream is not opened — no inbound events are received. Control
     * requests that arrive via the write-path ACK channel reply with an error
     * instead of false-success. onInboundMessage is never called. Use for
     * mirror-mode attachments where the remote UI should see the session but
     * not be able to drive it.
     */
    outboundOnly?: boolean;
    /**
     * User message typed on claude.ai. Echoes of outbound writes and
     * re-deliveries of prompts already forwarded are filtered before this
     * fires. May be async (e.g. attachment resolution).
     */
    onInboundMessage?: (msg: SDKMessage) => void | Promise<void>;
    /**
     * `control_response` from claude.ai — the user answered a `can_use_tool`
     * prompt sent via `sendControlRequest`. Caller correlates by `request_id`.
     */
    onPermissionResponse?: (res: SDKControlResponse) => void;
    /** `interrupt` control_request from claude.ai. Already auto-replied-to. */
    onInterrupt?: () => void;
    onSetModel?: (model: string | undefined) => void;
    onSetMaxThinkingTokens?: (tokens: number | null) => void;
    /**
     * `set_permission_mode` from claude.ai. Return an error verdict to send
     * an error control_response (vs silently false-succeeding). Omit if
     * the caller doesn't support permission modes — the shared handler
     * returns a "not supported in this context" error.
     */
    onSetPermissionMode?: (mode: PermissionMode) => {
        ok: true;
    } | {
        ok: false;
        error: string;
    };
    /**
     * Transport died permanently. 401 = JWT expired (re-attach with fresh
     * secret), 4090 = epoch superseded (409, newer worker registered),
     * 4091 = CCRClient init failed. Anything else = SSE reconnect budget
     * exhausted. Transient disconnects are handled transparently inside
     * SSETransport and do NOT fire this.
     */
    onClose?: (code?: number) => void;
};
/**
 * Attach to an existing bridge session. Creates the v2 transport
 * (SSETransport + CCRClient), wires ingress routing and control dispatch,
 * returns a handle scoped to this one session.
 *
 * Throws if `createV2ReplTransport` fails (registerWorker error, etc).
 *
 * ALPHA STABILITY. This is a separate versioning universe from the main
 * `query()` surface: breaking changes here do NOT bump the package major.
 * @alpha
 */
export declare function attachBridgeSession(opts: AttachBridgeSessionOptions): Promise<BridgeSessionHandle>;
/**
 * Worker credentials from `POST /v1/code/sessions/{id}/bridge`.
 * Each call bumps `worker_epoch` server-side — the call IS the worker register.
 * @alpha
 */
export type RemoteCredentials = {
    worker_jwt: string;
    api_base_url: string;
    expires_in: number;
    worker_epoch: number;
};
/**
 * `POST /v1/code/sessions` — create a fresh CCR session. Returns the `cse_*`
 * session id, or null on any failure (HTTP error, malformed response).
 *
 * Callers supply their own OAuth token — this is a thin HTTP wrapper with no
 * implicit auth, so it works from any process (not just the CLI).
 * @alpha
 */
export declare function createCodeSession(baseUrl: string, accessToken: string, title: string, timeoutMs: number, tags?: string[]): Promise<string | null>;
/**
 * `POST /v1/code/sessions/{id}/bridge` — mint a worker JWT for the session.
 * Returns credentials or null on failure. The call IS the worker register
 * (bumps epoch server-side), so pass `epoch: creds.worker_epoch` to
 * `attachBridgeSession` to skip a redundant register.
 *
 * `trustedDeviceToken` sets the `X-Trusted-Device-Token` header. Required
 * when the server's `sessions_elevated_auth_enforcement` flag is on
 * (bridge sessions are SecurityTier=ELEVATED). See anthropics/anthropic#274559.
 * @alpha
 */
export declare function fetchRemoteCredentials(sessionId: string, baseUrl: string, accessToken: string, timeoutMs: number, trustedDeviceToken?: string): Promise<RemoteCredentials | null>;
