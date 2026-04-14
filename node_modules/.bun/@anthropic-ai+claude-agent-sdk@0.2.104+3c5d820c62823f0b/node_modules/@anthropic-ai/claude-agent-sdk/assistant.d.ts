/**
 * API surface definition for @anthropic-ai/claude-agent-sdk/assistant.
 *
 * Source of truth for the /assistant export's public types. Imports ONLY
 * from agentSdkTypes.ts so the compiled .d.ts has exactly one import to
 * rewrite (./agentSdkTypes → ./sdk) for the flat package layout.
 *
 * Compiled by scripts/build-ant-sdk-typings.sh; runtime in
 * agentSdkAssistant.ts (bun-built to assistant.mjs).
 *
 * Type definitions below are copied from src/assistant/worker.ts and
 * src/assistant/daemonBridge.ts. Keep in sync — those are the
 * implementation source of truth.
 */
import type { CanUseTool, ConnectRemoteControlOptions, InboundPrompt, Options, PermissionResult, SDKMessage, SDKUserMessage } from './agentSdkTypes.js';
export type { ConnectRemoteControlOptions, InboundPrompt };
/**
 * Worker-persisted state. Checkpointed on turn boundaries, bridge
 * reconnects, and teardown.
 * @alpha
 */
export type WorkerState = {
    claudeSessionId?: string;
    lastSSESequenceNum?: number;
    bridgeSessionId?: string;
};
/** @alpha */
export type WorkerStateAdapter = {
    load(): Promise<WorkerState | null>;
    save(state: WorkerState): Promise<void>;
};
/**
 * Third argument to the SDK's CanUseTool callback.
 * @alpha
 */
export type CanUseToolContext = Parameters<CanUseTool>[2];
/**
 * Structured failure from `runAssistantWorker`. `kind` lets callers branch
 * on handling — conflict UI, retry with backoff, or bail.
 * @alpha
 */
export type AssistantWorkerError = {
    kind: 'conflict' | 'auth' | 'network' | 'unknown';
    detail: string;
};
/** @alpha */
export type AssistantWorkerResult = {
    ok: true;
    handle: AssistantWorkerHandle;
} | {
    ok: false;
    error: AssistantWorkerError;
};
/** @alpha */
export type AssistantWorkerOptions = {
    /**
     * Bridge connection config — passed through to `connectRemoteControl`.
     * `initialSSESequenceNum` is seeded from `stateAdapter.load()` if unset.
     */
    bridge: ConnectRemoteControlOptions;
    /**
     * Runs in a sandbox (VM, container) where the sandbox boundary IS the
     * trust boundary. Injects `CLAUDE_CODE_SANDBOXED=1` so the CLI's
     * directory trust check passes. Default false.
     */
    sandboxed?: boolean;
    /**
     * Cron-horizon polling. Worker reads `<dir>/.claude/scheduled_tasks.json`
     * every 10s and spawns the child ~5s before a fire is due. Omit to
     * disable cron-driven spawn.
     */
    scheduling?: {
        dir: string;
        horizonMs?: number;
        leadMs?: number;
    };
    /**
     * Called each time the worker spawns query(). `base` carries
     * `assistant:true`, `cwd`, `resume`, `stderr`, and the worker's
     * bridge-wired `canUseTool`. Spread over `base` to add MCP servers,
     * VM spawn, env vars, system prompt, tool lists.
     *
     * May be async — dispatch awaits VM spawn, system prompt build, and
     * OAuth token fetch before each query() spawn.
     */
    buildQueryOptions: (base: Options) => Options | Promise<Options>;
    /**
     * Called BEFORE the bridge permission prompt. Return a PermissionResult
     * to short-circuit; undefined to fall through to the bridge.
     */
    canUseToolPreFilter?: (toolName: string, input: Record<string, unknown>, ctx: CanUseToolContext) => Promise<PermissionResult | undefined>;
    /**
     * Called AFTER the bridge resolves (or pre-filter short-circuits).
     * Lets callers persist "always allow" to their own cache.
     */
    onPermissionResolved?: (toolName: string, result: PermissionResult) => void;
    /**
     * Applied to every SDKMessage after the worker's own filter, before
     * bridge write. Return null to drop. Used for VM→host path translation.
     */
    transformOutbound?: (msg: SDKMessage) => SDKMessage | null;
    /**
     * Where to persist WorkerState. Omit to run stateless — fresh
     * claudeSessionId and SSE seq on every restart.
     */
    stateAdapter?: WorkerStateAdapter;
    /**
     * Pushed into the input queue at worker start. Daemon passes install.md
     * on first-run; dispatch passes seed messages or omits.
     */
    initialPrompt?: string;
    /** Despawn child after this much quiet. Default 5 minutes. */
    userIdleMs?: number;
    signal: AbortSignal;
    log?: (msg: string) => void;
};
/** @alpha */
export type AssistantWorkerHandle = {
    readonly sessionUrl: string;
    readonly bridgeSessionId: string;
    readonly claudeSessionId: string | undefined;
    /** Push a prompt into the input queue without going through the bridge. */
    pushPrompt(content: string | SDKUserMessage['message']['content']): void;
    interrupt(): Promise<void>;
    /** Resolves when the fan-in loop exits and teardown completes. */
    done: Promise<void>;
    teardown(): Promise<void>;
};
/**
 * Run a single-session assistant worker: connect to the claude.ai bridge,
 * spawn query() on demand (inbound prompt or cron due), proxy permissions
 * through the bridge, despawn on idle.
 * @alpha
 */
export declare function runAssistantWorker(opts: AssistantWorkerOptions): Promise<AssistantWorkerResult>;
