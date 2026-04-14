import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs';
import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs';
import type { BetaUsage } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ElicitResult } from '@modelcontextprotocol/sdk/types.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MessageParam } from '@anthropic-ai/sdk/resources';
import type { Readable } from 'stream';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { UUID } from 'crypto';
import type { Writable } from 'stream';
import { z } from 'zod/v4';
import type { ZodRawShape } from 'zod';
import type { ZodRawShape as ZodRawShape_2 } from 'zod/v4';

export declare class AbortError extends Error {
}

/**
 * Information about the logged in user's account.
 */
export declare type AccountInfo = {
    email?: string;
    organization?: string;
    subscriptionType?: string;
    tokenSource?: string;
    apiKeySource?: string;
    /**
     * Active API backend. Anthropic OAuth login only applies when "firstParty"; for 3P providers the other fields are absent and auth is external (AWS creds, gcloud ADC, etc.).
     */
    apiProvider?: 'firstParty' | 'bedrock' | 'vertex' | 'foundry';
};

/**
 * Definition for a custom subagent that can be invoked via the Agent tool.
 */
export declare type AgentDefinition = {
    /**
     * Natural language description of when to use this agent
     */
    description: string;
    /**
     * Array of allowed tool names. If omitted, inherits all tools from parent
     */
    tools?: string[];
    /**
     * Array of tool names to explicitly disallow for this agent
     */
    disallowedTools?: string[];
    /**
     * The agent's system prompt
     */
    prompt: string;
    /**
     * Model alias (e.g. 'sonnet', 'opus', 'haiku') or full model ID (e.g. 'claude-opus-4-5'). If omitted or 'inherit', uses the main model
     */
    model?: string;
    mcpServers?: AgentMcpServerSpec[];
    /**
     * Experimental: Critical reminder added to system prompt
     */
    criticalSystemReminder_EXPERIMENTAL?: string;
    /**
     * Array of skill names to preload into the agent context
     */
    skills?: string[];
    /**
     * Auto-submitted as the first user turn when this agent is the main thread agent. Slash commands are processed. Prepended to any user-provided prompt.
     */
    initialPrompt?: string;
    /**
     * Maximum number of agentic turns (API round-trips) before stopping
     */
    maxTurns?: number;
};

/**
 * Information about an available subagent that can be invoked via the Task tool.
 */
export declare type AgentInfo = {
    /**
     * Agent type identifier (e.g., "Explore")
     */
    name: string;
    /**
     * Description of when to use this agent
     */
    description: string;
    /**
     * Model alias this agent uses. If omitted, inherits the parent's model
     */
    model?: string;
};

export declare type AgentMcpServerSpec = string | Record<string, McpServerConfigForProcessTransport>;

export declare type AnyZodRawShape = ZodRawShape | ZodRawShape_2;

export declare type ApiKeySource = 'user' | 'project' | 'org' | 'temporary' | 'oauth';

export declare type AsyncHookJSONOutput = {
    async: true;
    asyncTimeout?: number;
};

export declare type BaseHookInput = {
    session_id: string;
    transcript_path: string;
    cwd: string;
    permission_mode?: string;
    /**
     * Subagent identifier. Present only when the hook fires from within a subagent (e.g., a tool called by an AgentTool worker). Absent for the main thread, even in --agent sessions. Use this field (not agent_type) to distinguish subagent calls from main-thread calls.
     */
    agent_id?: string;
    /**
     * Agent type name (e.g., "general-purpose", "code-reviewer"). Present when the hook fires from within a subagent (alongside agent_id), or on the main thread of a session started with --agent (without agent_id).
     */
    agent_type?: string;
};

export declare type BaseOutputFormat = {
    type: OutputFormatType;
};

/**
 * Permission callback function for controlling tool usage.
 * Called before each tool execution to determine if it should be allowed.
 */
export declare type CanUseTool = (toolName: string, input: Record<string, unknown>, options: {
    /** Signaled if the operation should be aborted. */
    signal: AbortSignal;
    /**
     * Suggestions for updating permissions so that the user will not be
     * prompted again for this tool during this session.
     *
     * Typically if presenting the user an option 'always allow' or similar,
     * then this full set of suggestions should be returned as the
     * `updatedPermissions` in the PermissionResult.
     */
    suggestions?: PermissionUpdate[];
    /**
     * The file path that triggered the permission request, if applicable.
     * For example, when a Bash command tries to access a path outside allowed directories.
     */
    blockedPath?: string;
    /** Explains why this permission request was triggered. */
    decisionReason?: string;
    /**
     * Full permission prompt sentence rendered by the bridge (e.g.
     * "Claude wants to read foo.txt"). Use this as the primary prompt
     * text when present instead of reconstructing from toolName+input.
     */
    title?: string;
    /**
     * Short noun phrase for the tool action (e.g. "Read file"), suitable
     * for button labels or compact UI.
     */
    displayName?: string;
    /**
     * Human-readable subtitle from the bridge (e.g. "Claude will have
     * read and write access to files in ~/Downloads").
     */
    description?: string;
    /**
     * Unique identifier for this specific tool call within the assistant message.
     * Multiple tool calls in the same assistant message will have different toolUseIDs.
     */
    toolUseID: string;
    /** If running within the context of a sub-agent, the sub-agent's ID. */
    agentID?: string;
}) => Promise<PermissionResult>;

export declare type ConfigChangeHookInput = BaseHookInput & {
    hook_event_name: 'ConfigChange';
    source: 'user_settings' | 'project_settings' | 'local_settings' | 'policy_settings' | 'skills';
    file_path?: string;
};

/**
 * Config scope for settings.
 */
export declare type ConfigScope = 'local' | 'user' | 'project';

declare type ControlErrorResponse = {
    subtype: 'error';
    request_id: string;
    error: string;
    pending_permission_requests?: SDKControlRequest[];
};

declare type ControlResponse = {
    subtype: 'success';
    request_id: string;
    response?: Record<string, unknown>;
};

declare namespace coreTypes {
    export {
        SandboxFilesystemConfig,
        SandboxIgnoreViolations,
        SandboxNetworkConfig,
        SandboxSettings,
        NonNullableUsage,
        HOOK_EVENTS,
        EXIT_REASONS,
        AccountInfo,
        AgentDefinition,
        AgentInfo,
        AgentMcpServerSpec,
        ApiKeySource,
        AsyncHookJSONOutput,
        BaseHookInput,
        BaseOutputFormat,
        ConfigChangeHookInput,
        ConfigScope,
        CwdChangedHookInput,
        CwdChangedHookSpecificOutput,
        ElicitationHookInput,
        ElicitationHookSpecificOutput,
        ElicitationResultHookInput,
        ElicitationResultHookSpecificOutput,
        ExitReason,
        FastModeState,
        FileChangedHookInput,
        FileChangedHookSpecificOutput,
        HookEvent,
        HookInput,
        HookJSONOutput,
        InstructionsLoadedHookInput,
        JsonSchemaOutputFormat,
        McpClaudeAIProxyServerConfig,
        McpHttpServerConfig,
        McpSSEServerConfig,
        McpSdkServerConfig,
        McpServerConfigForProcessTransport,
        McpServerStatusConfig,
        McpServerStatus,
        McpSetServersResult,
        McpStdioServerConfig,
        ModelInfo,
        ModelUsage,
        NotificationHookInput,
        NotificationHookSpecificOutput,
        OutputFormat,
        OutputFormatType,
        PermissionBehavior,
        PermissionDecisionClassification,
        PermissionMode,
        PermissionRequestHookInput,
        PermissionRequestHookSpecificOutput,
        PermissionResult,
        PermissionRuleValue,
        PermissionUpdateDestination,
        PermissionUpdate,
        PostCompactHookInput,
        PostToolUseFailureHookInput,
        PostToolUseFailureHookSpecificOutput,
        PostToolUseHookInput,
        PostToolUseHookSpecificOutput,
        PreCompactHookInput,
        PreToolUseHookInput,
        PreToolUseHookSpecificOutput,
        PromptRequestOption,
        PromptRequest,
        PromptResponse,
        RewindFilesResult,
        SDKAPIRetryMessage,
        SDKAssistantMessageError,
        SDKAssistantMessage,
        SDKAuthStatusMessage,
        SDKCompactBoundaryMessage,
        SDKElicitationCompleteMessage,
        SDKFilesPersistedEvent,
        SDKHookProgressMessage,
        SDKHookResponseMessage,
        SDKHookStartedMessage,
        SDKLocalCommandOutputMessage,
        SDKMessage,
        SDKPartialAssistantMessage,
        SDKPermissionDenial,
        SDKPromptSuggestionMessage,
        SDKRateLimitEvent,
        SDKRateLimitInfo,
        SDKResultError,
        SDKResultMessage,
        SDKResultSuccess,
        SDKSessionInfo,
        SDKSessionStateChangedMessage,
        SDKStatusMessage,
        SDKStatus,
        SDKSystemMessage,
        SDKTaskNotificationMessage,
        SDKTaskProgressMessage,
        SDKTaskStartedMessage,
        SDKToolProgressMessage,
        SDKToolUseSummaryMessage,
        SDKUserMessageReplay,
        SDKUserMessage,
        SdkBeta,
        SdkPluginConfig,
        SessionEndHookInput,
        SessionStartHookInput,
        SessionStartHookSpecificOutput,
        SettingSource,
        SetupHookInput,
        SetupHookSpecificOutput,
        SlashCommand,
        StopFailureHookInput,
        StopHookInput,
        SubagentStartHookInput,
        SubagentStartHookSpecificOutput,
        SubagentStopHookInput,
        SyncHookJSONOutput,
        TaskCompletedHookInput,
        TaskCreatedHookInput,
        TeammateIdleHookInput,
        ThinkingAdaptive,
        ThinkingConfig,
        ThinkingDisabled,
        ThinkingEnabled,
        UserPromptSubmitHookInput,
        UserPromptSubmitHookSpecificOutput,
        WorktreeCreateHookInput,
        WorktreeCreateHookSpecificOutput,
        WorktreeRemoveHookInput
    }
}

/**
 * Creates an MCP server instance that can be used with the SDK transport.
 * This allows SDK users to define custom tools that run in the same process.
 *
 * If your SDK MCP calls will run longer than 60s, override CLAUDE_CODE_STREAM_CLOSE_TIMEOUT
 */
export declare function createSdkMcpServer(_options: CreateSdkMcpServerOptions): McpSdkServerConfigWithInstance;

declare type CreateSdkMcpServerOptions = {
    name: string;
    version?: string;
    tools?: Array<SdkMcpToolDefinition<any>>;
};

export declare type CwdChangedHookInput = BaseHookInput & {
    hook_event_name: 'CwdChanged';
    old_cwd: string;
    new_cwd: string;
};

export declare type CwdChangedHookSpecificOutput = {
    hookEventName: 'CwdChanged';
    watchPaths?: string[];
};

/**
 * Effort level for controlling how much thinking/reasoning Claude applies.
 *
 * - `'low'` — Minimal thinking, fastest responses
 * - `'medium'` — Moderate thinking
 * - `'high'` — Deep reasoning (default)
 * - `'max'` — Maximum effort (select models only)
 */
export declare type EffortLevel = 'low' | 'medium' | 'high' | 'max';

/**
 * Hook input for the Elicitation event. Fired when an MCP server requests user input. Hooks can auto-respond (accept/decline) instead of showing the dialog.
 */
export declare type ElicitationHookInput = BaseHookInput & {
    hook_event_name: 'Elicitation';
    mcp_server_name: string;
    message: string;
    mode?: 'form' | 'url';
    url?: string;
    elicitation_id?: string;
    requested_schema?: Record<string, unknown>;
};

/**
 * Hook-specific output for the Elicitation event. Return this to programmatically accept or decline an MCP elicitation request.
 */
export declare type ElicitationHookSpecificOutput = {
    hookEventName: 'Elicitation';
    action?: 'accept' | 'decline' | 'cancel';
    content?: Record<string, unknown>;
};

/**
 * Elicitation request from an MCP server, asking the SDK consumer for user input.
 */
export declare type ElicitationRequest = {
    /** Name of the MCP server requesting elicitation */
    serverName: string;
    /** Message to display to the user */
    message: string;
    /** Elicitation mode: 'form' for structured input, 'url' for browser-based auth */
    mode?: 'form' | 'url';
    /** URL to open (only for 'url' mode) */
    url?: string;
    /** Elicitation ID for correlating URL elicitations with completion notifications (URL mode only) */
    elicitationId?: string;
    /** JSON Schema for the requested input (only for 'form' mode) */
    requestedSchema?: Record<string, unknown>;
};

/**
 * Elicitation response from the SDK consumer.
 * Re-exported from the MCP SDK for convenience.
 */
export declare type ElicitationResult = ElicitResult;

/**
 * Hook input for the ElicitationResult event. Fired after the user responds to an MCP elicitation. Hooks can observe or override the response before it is sent to the server.
 */
export declare type ElicitationResultHookInput = BaseHookInput & {
    hook_event_name: 'ElicitationResult';
    mcp_server_name: string;
    elicitation_id?: string;
    mode?: 'form' | 'url';
    action: 'accept' | 'decline' | 'cancel';
    content?: Record<string, unknown>;
};

/**
 * Hook-specific output for the ElicitationResult event. Return this to override the action or content before the response is sent to the MCP server.
 */
export declare type ElicitationResultHookSpecificOutput = {
    hookEventName: 'ElicitationResult';
    action?: 'accept' | 'decline' | 'cancel';
    content?: Record<string, unknown>;
};

export declare const EXIT_REASONS: readonly ["clear", "resume", "logout", "prompt_input_exit", "other", "bypass_permissions_disabled"];

export declare type ExitReason = 'clear' | 'resume' | 'logout' | 'prompt_input_exit' | 'other' | 'bypass_permissions_disabled';

/**
 * Fast mode state: off, in cooldown after rate limit, or actively enabled.
 */
export declare type FastModeState = 'off' | 'cooldown' | 'on';

export declare type FileChangedHookInput = BaseHookInput & {
    hook_event_name: 'FileChanged';
    file_path: string;
    event: 'change' | 'add' | 'unlink';
};

export declare type FileChangedHookSpecificOutput = {
    hookEventName: 'FileChanged';
    watchPaths?: string[];
};

/**
 * Fork a session into a new branch with fresh UUIDs.
 *
 * Copies transcript messages from the source session into a new session file,
 * remapping every message UUID and preserving the parentUuid chain. Supports
 * `upToMessageId` for branching from a specific point in the conversation.
 *
 * Forked sessions start without undo history (file-history snapshots are not
 * copied).
 *
 * @param sessionId - UUID of the source session
 * @param options - `{ dir?, upToMessageId?, title? }`
 * @returns `{ sessionId }` — UUID of the new forked session
 */
export declare function forkSession(_sessionId: string, _options?: ForkSessionOptions): Promise<ForkSessionResult>;

/**
 * Options for forking a session into a new branch.
 */
export declare type ForkSessionOptions = SessionMutationOptions & {
    /** Slice transcript up to this message UUID (inclusive). If omitted, full copy. */
    upToMessageId?: string;
    /** Custom title for the fork. If omitted, derives from original title + " (fork)". */
    title?: string;
};

/**
 * Result of a fork operation.
 */
export declare type ForkSessionResult = {
    /** New session UUID. Resumable via `resumeSession(sessionId)`. */
    sessionId: string;
};

/**
 * Reads metadata for a single session by ID. Unlike `listSessions`, this only
 * reads the single session file rather than every session in the project.
 * Returns undefined if the session file is not found, is a sidechain session,
 * or has no extractable summary.
 *
 * @param sessionId - UUID of the session
 * @param options - `{ dir?: string }` project path; omit to search all project directories
 */
export declare function getSessionInfo(_sessionId: string, _options?: GetSessionInfoOptions): Promise<SDKSessionInfo | undefined>;

/**
 * Options for getSessionInfo.
 */
export declare type GetSessionInfoOptions = {
    /**
     * Project directory path (same semantics as `listSessions({ dir })`).
     * When omitted, all project directories are searched for the session file.
     */
    dir?: string;
};

/**
 * Reads a session's conversation messages from its JSONL transcript file.
 *
 * Parses the transcript, builds the conversation chain via parentUuid links,
 * and returns user/assistant messages in chronological order.
 *
 * @param sessionId - UUID of the session to read
 * @param options - Optional dir, limit, and offset
 * @returns Array of user/assistant messages, or empty array if session not found
 */
export declare function getSessionMessages(_sessionId: string, _options?: GetSessionMessagesOptions): Promise<SessionMessage[]>;

/**
 * Options for retrieving session messages.
 */
export declare type GetSessionMessagesOptions = {
    /** Project directory to find the session in. If omitted, searches all projects. */
    dir?: string;
    /** Maximum number of messages to return. */
    limit?: number;
    /** Number of messages to skip from the start. */
    offset?: number;
};

export declare const HOOK_EVENTS: readonly ["PreToolUse", "PostToolUse", "PostToolUseFailure", "Notification", "UserPromptSubmit", "SessionStart", "SessionEnd", "Stop", "StopFailure", "SubagentStart", "SubagentStop", "PreCompact", "PostCompact", "PermissionRequest", "Setup", "TeammateIdle", "TaskCreated", "TaskCompleted", "Elicitation", "ElicitationResult", "ConfigChange", "WorktreeCreate", "WorktreeRemove", "InstructionsLoaded", "CwdChanged", "FileChanged"];

/**
 * Hook callback function for responding to events during execution.
 */
export declare type HookCallback = (input: HookInput, toolUseID: string | undefined, options: {
    signal: AbortSignal;
}) => Promise<HookJSONOutput>;

/**
 * Hook callback matcher containing hook callbacks and optional pattern matching.
 */
export declare interface HookCallbackMatcher {
    matcher?: string;
    hooks: HookCallback[];
    /** Timeout in seconds for all hooks in this matcher */
    timeout?: number;
}

export declare type HookEvent = 'PreToolUse' | 'PostToolUse' | 'PostToolUseFailure' | 'Notification' | 'UserPromptSubmit' | 'SessionStart' | 'SessionEnd' | 'Stop' | 'StopFailure' | 'SubagentStart' | 'SubagentStop' | 'PreCompact' | 'PostCompact' | 'PermissionRequest' | 'Setup' | 'TeammateIdle' | 'TaskCreated' | 'TaskCompleted' | 'Elicitation' | 'ElicitationResult' | 'ConfigChange' | 'WorktreeCreate' | 'WorktreeRemove' | 'InstructionsLoaded' | 'CwdChanged' | 'FileChanged';

export declare type HookInput = PreToolUseHookInput | PostToolUseHookInput | PostToolUseFailureHookInput | NotificationHookInput | UserPromptSubmitHookInput | SessionStartHookInput | SessionEndHookInput | StopHookInput | StopFailureHookInput | SubagentStartHookInput | SubagentStopHookInput | PreCompactHookInput | PostCompactHookInput | PermissionRequestHookInput | SetupHookInput | TeammateIdleHookInput | TaskCreatedHookInput | TaskCompletedHookInput | ElicitationHookInput | ElicitationResultHookInput | ConfigChangeHookInput | InstructionsLoadedHookInput | WorktreeCreateHookInput | WorktreeRemoveHookInput | CwdChangedHookInput | FileChangedHookInput;

export declare type HookJSONOutput = AsyncHookJSONOutput | SyncHookJSONOutput;

export declare type InferShape<T extends AnyZodRawShape> = {
    [K in keyof T]: T[K] extends {
        _output: infer O;
    } ? O : never;
} & {};

export declare type InstructionsLoadedHookInput = BaseHookInput & {
    hook_event_name: 'InstructionsLoaded';
    file_path: string;
    memory_type: 'User' | 'Project' | 'Local' | 'Managed';
    load_reason: 'session_start' | 'nested_traversal' | 'path_glob_match' | 'include' | 'compact';
    globs?: string[];
    trigger_file_path?: string;
    parent_file_path?: string;
};

export declare type JsonSchemaOutputFormat = {
    type: 'json_schema';
    schema: Record<string, unknown>;
};

/**
 * List sessions with metadata.
 *
 * When `dir` is provided, returns sessions for that project directory
 * and its git worktrees. When omitted, returns sessions across all
 * projects.
 *
 * Use `limit` and `offset` for pagination.
 *
 * @example
 * ```typescript
 * // List sessions for a specific project
 * const sessions = await listSessions({ dir: '/path/to/project' })
 *
 * // Paginate
 * const page1 = await listSessions({ limit: 50 })
 * const page2 = await listSessions({ limit: 50, offset: 50 })
 * ```
 */
export declare function listSessions(_options?: ListSessionsOptions): Promise<SDKSessionInfo[]>;

/**
 * Options for listing sessions.
 */
export declare type ListSessionsOptions = {
    /**
     * Directory to list sessions for. When provided, returns sessions for
     * this project directory (and optionally its git worktrees). When omitted,
     * returns sessions across all projects.
     */
    dir?: string;
    /** Maximum number of sessions to return. */
    limit?: number;
    /**
     * Number of sessions to skip from the start of the sorted result set.
     * Use with `limit` for pagination. Defaults to 0.
     */
    offset?: number;
    /**
     * When `dir` is provided and the directory is inside a git repository,
     * include sessions from all git worktree paths. Defaults to `true`.
     */
    includeWorktrees?: boolean;
};

export declare type McpClaudeAIProxyServerConfig = {
    type: 'claudeai-proxy';
    url: string;
    id: string;
};

export declare type McpHttpServerConfig = {
    type: 'http';
    url: string;
    headers?: Record<string, string>;
};

export declare type McpSdkServerConfig = {
    type: 'sdk';
    name: string;
};

/**
 * MCP SDK server config with an actual McpServer instance.
 * Not serializable - contains a live McpServer object.
 */
export declare type McpSdkServerConfigWithInstance = McpSdkServerConfig & {
    instance: McpServer;
};

/**
 * Union of all MCP server config types, including those with non-serializable instances.
 */
export declare type McpServerConfig = McpStdioServerConfig | McpSSEServerConfig | McpHttpServerConfig | McpSdkServerConfigWithInstance;

export declare type McpServerConfigForProcessTransport = McpStdioServerConfig | McpSSEServerConfig | McpHttpServerConfig | McpSdkServerConfig;

/**
 * Status information for an MCP server connection.
 */
export declare type McpServerStatus = {
    /**
     * Server name as configured
     */
    name: string;
    /**
     * Current connection status
     */
    status: 'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled';
    /**
     * Server information (available when connected)
     */
    serverInfo?: {
        name: string;
        version: string;
    };
    /**
     * Error message (available when status is 'failed')
     */
    error?: string;
    /**
     * Server configuration (includes URL for HTTP/SSE servers)
     */
    config?: McpServerStatusConfig;
    /**
     * Configuration scope (e.g., project, user, local, claudeai, managed)
     */
    scope?: string;
    /**
     * Tools provided by this server (available when connected)
     */
    tools?: {
        name: string;
        description?: string;
        annotations?: {
            readOnly?: boolean;
            destructive?: boolean;
            openWorld?: boolean;
        };
    }[];

};

export declare type McpServerStatusConfig = McpServerConfigForProcessTransport | McpClaudeAIProxyServerConfig;

/**
 * Result of a setMcpServers operation.
 */
export declare type McpSetServersResult = {
    /**
     * Names of servers that were added
     */
    added: string[];
    /**
     * Names of servers that were removed
     */
    removed: string[];
    /**
     * Map of server names to error messages for servers that failed to connect
     */
    errors: Record<string, string>;
};

export declare type McpSSEServerConfig = {
    type: 'sse';
    url: string;
    headers?: Record<string, string>;
};

export declare type McpStdioServerConfig = {
    type?: 'stdio';
    command: string;
    args?: string[];
    env?: Record<string, string>;
};

/**
 * Information about an available model.
 */
export declare type ModelInfo = {
    /**
     * Model identifier to use in API calls
     */
    value: string;
    /**
     * Human-readable display name
     */
    displayName: string;
    /**
     * Description of the model's capabilities
     */
    description: string;
    /**
     * Whether this model supports effort levels
     */
    supportsEffort?: boolean;
    /**
     * Available effort levels for this model
     */
    supportedEffortLevels?: ('low' | 'medium' | 'high' | 'max')[];
    /**
     * Whether this model supports adaptive thinking (Claude decides when and how much to think)
     */
    supportsAdaptiveThinking?: boolean;
    /**
     * Whether this model supports fast mode
     */
    supportsFastMode?: boolean;
    /**
     * Whether this model supports auto mode
     */
    supportsAutoMode?: boolean;
};

export declare type ModelUsage = {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    webSearchRequests: number;
    costUSD: number;
    contextWindow: number;
    maxOutputTokens: number;
};

export declare type NonNullableUsage = {
    [K in keyof BetaUsage]: NonNullable<BetaUsage[K]>;
};

export declare type NotificationHookInput = BaseHookInput & {
    hook_event_name: 'Notification';
    message: string;
    title?: string;
    notification_type: string;
};

export declare type NotificationHookSpecificOutput = {
    hookEventName: 'Notification';
    additionalContext?: string;
};

/**
 * Callback for handling MCP elicitation requests.
 * Called when an MCP server requests user input and no hook handles it.
 */
export declare type OnElicitation = (request: ElicitationRequest, options: {
    signal: AbortSignal;
}) => Promise<ElicitationResult>;

/**
 * Options for the query function.
 * Contains callbacks and other non-serializable fields.
 */
export declare type Options = {
    /**
     * Controller for cancelling the query. When aborted, the query will stop
     * and clean up resources.
     */
    abortController?: AbortController;
    /**
     * Additional directories Claude can access beyond the current working directory.
     * Paths should be absolute.
     */
    additionalDirectories?: string[];
    /**
     * Agent name for the main thread. When specified, the agent's system prompt,
     * tool restrictions, and model will be applied to the main conversation.
     * The agent must be defined either in the `agents` option or in settings.
     *
     * This is equivalent to the `--agent` CLI flag.
     *
     * @example
     * ```typescript
     * agent: 'code-reviewer',
     * agents: {
     *   'code-reviewer': {
     *     description: 'Reviews code for best practices',
     *     prompt: 'You are a code reviewer...'
     *   }
     * }
     * ```
     */
    agent?: string;
    /**
     * Programmatically define custom subagents that can be invoked via the Agent tool.
     * Keys are agent names, values are agent definitions.
     *
     * @example
     * ```typescript
     * agents: {
     *   'test-runner': {
     *     description: 'Runs tests and reports results',
     *     prompt: 'You are a test runner...',
     *     tools: ['Read', 'Grep', 'Glob', 'Bash']
     *   }
     * }
     * ```
     */
    agents?: Record<string, AgentDefinition>;
    /**
     * List of tool names that are auto-allowed without prompting for permission.
     * These tools will execute automatically without asking the user for approval.
     * To restrict which tools are available, use the `tools` option instead.
     */
    allowedTools?: string[];
    /**
     * Custom permission handler for controlling tool usage. Called before each
     * tool execution to determine if it should be allowed, denied, or prompt the user.
     */
    canUseTool?: CanUseTool;
    /**
     * Continue the most recent conversation in the current directory instead of starting a new one.
     * Mutually exclusive with `resume`.
     */
    continue?: boolean;
    /**
     * Current working directory for the session. Defaults to `process.cwd()`.
     */
    cwd?: string;
    /**
     * List of tool names that are disallowed. These tools will be removed
     * from the model's context and cannot be used, even if they would
     * otherwise be allowed.
     */
    disallowedTools?: string[];
    /**
     * Specify the base set of available built-in tools.
     * - `string[]` - Array of specific tool names (e.g., `['Bash', 'Read', 'Edit']`)
     * - `[]` (empty array) - Disable all built-in tools
     * - `{ type: 'preset'; preset: 'claude_code' }` - Use all default Claude Code tools
     */
    tools?: string[] | {
        type: 'preset';
        preset: 'claude_code';
    };
    /**
     * Environment variables to pass to the Claude Code process.
     * Defaults to `process.env`.
     *
     * SDK consumers can identify their app/library to include in the User-Agent header by setting:
     * - `CLAUDE_AGENT_SDK_CLIENT_APP` - Your app/library identifier (e.g., "my-app/1.0.0", "my-library/2.1")
     *
     * @example
     * ```typescript
     * env: { CLAUDE_AGENT_SDK_CLIENT_APP: 'my-app/1.0.0' }
     * ```
     */
    env?: {
        [envVar: string]: string | undefined;
    };
    /**
     * JavaScript runtime to use for executing Claude Code.
     * Auto-detected if not specified.
     */
    executable?: 'bun' | 'deno' | 'node';
    /**
     * Additional arguments to pass to the JavaScript runtime executable.
     */
    executableArgs?: string[];
    /**
     * Additional CLI arguments to pass to Claude Code.
     * Keys are argument names (without --), values are argument values.
     * Use `null` for boolean flags.
     */
    extraArgs?: Record<string, string | null>;
    /**
     * Fallback model to use if the primary model fails or is unavailable.
     */
    fallbackModel?: string;
    /**
     * Enable file checkpointing to track file changes during the session.
     * When enabled, files can be rewound to their state at any user message
     * using `Query.rewindFiles()`.
     *
     * File checkpointing creates backups of files before they are modified,
     * allowing you to restore them to previous states.
     */
    enableFileCheckpointing?: boolean;
    /**
     * Per-tool configuration for built-in tools.
     *
     * @example
     * ```typescript
     * toolConfig: {
     *   askUserQuestion: { previewFormat: 'html' }
     * }
     * ```
     */
    toolConfig?: ToolConfig;
    /**
     * When true, resumed sessions will fork to a new session ID rather than
     * continuing the previous session. Use with `resume`.
     */
    forkSession?: boolean;
    /**
     * Enable beta features. Currently supported:
     * - `'context-1m-2025-08-07'` - Enable 1M token context window (Sonnet 4/4.5 only)
     *
     * @see https://docs.anthropic.com/en/api/beta-headers
     */
    betas?: SdkBeta[];
    /**
     * Hook callbacks for responding to various events during execution.
     * Hooks can modify behavior, add context, or implement custom logic.
     *
     * @example
     * ```typescript
     * hooks: {
     *   PreToolUse: [{
     *     hooks: [async (input) => ({ continue: true })]
     *   }]
     * }
     * ```
     */
    hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;
    /**
     * Callback for handling MCP elicitation requests.
     * Called when an MCP server requests user input (form fields, URL auth, etc.)
     * and no hook handles the request first.
     *
     * If not provided, elicitation requests that aren't handled by hooks will
     * be declined automatically.
     *
     * @example
     * ```typescript
     * onElicitation: async (request) => {
     *   if (request.mode === 'url') {
     *     // Handle URL-based auth
     *     return { action: 'accept' }
     *   }
     *   // Provide form values
     *   return { action: 'accept', content: { name: 'Test' } }
     * }
     * ```
     */
    onElicitation?: OnElicitation;
    /**
     * When false, disables session persistence to disk. Sessions will not be
     * saved to ~/.claude/projects/ and cannot be resumed later. Useful for
     * ephemeral or automated workflows where session history is not needed.
     *
     * @default true
     */
    persistSession?: boolean;
    /**
     * Include partial/streaming message events in the output.
     * When true, `SDKPartialAssistantMessage` events will be emitted during streaming.
     */
    includePartialMessages?: boolean;
    /**
     * Controls Claude's thinking/reasoning behavior.
     *
     * - `{ type: 'adaptive' }` — Claude decides when and how much to think (Opus 4.6+).
     *   This is the default for models that support it.
     * - `{ type: 'enabled', budgetTokens: number }` — Fixed thinking token budget (older models)
     * - `{ type: 'disabled' }` — No extended thinking
     *
     * When set, takes precedence over the deprecated `maxThinkingTokens`.
     *
     * @see https://docs.anthropic.com/en/docs/build-with-claude/adaptive-thinking
     */
    thinking?: ThinkingConfig;
    /**
     * Controls how much effort Claude puts into its response.
     * Works with adaptive thinking to guide thinking depth.
     *
     * - `'low'` — Minimal thinking, fastest responses
     * - `'medium'` — Moderate thinking
     * - `'high'` — Deep reasoning (default)
     * - `'max'` — Maximum effort (Opus 4.6 only)
     *
     * @see https://docs.anthropic.com/en/docs/build-with-claude/effort
     */
    effort?: EffortLevel;
    /**
     * Maximum number of tokens the model can use for its thinking/reasoning process.
     * Helps control cost and latency for complex tasks.
     *
     * @deprecated Use `thinking` instead. On Opus 4.6, this is treated as on/off
     * (0 = disabled, any other value = adaptive). For explicit control, use
     * `thinking: { type: 'adaptive' }` or `thinking: { type: 'enabled', budgetTokens: N }`.
     */
    maxThinkingTokens?: number;
    /**
     * Maximum number of conversation turns before the query stops.
     * A turn consists of a user message and assistant response.
     */
    maxTurns?: number;
    /**
     * Maximum budget in USD for the query. The query will stop if this
     * budget is exceeded, returning an `error_max_budget_usd` result.
     */
    maxBudgetUsd?: number;
    /**
     * API-side task budget in tokens. When set, the model is made aware of
     * its remaining token budget so it can pace tool use and wrap up before
     * the limit. Sent as `output_config.task_budget` with the
     * `task-budgets-2026-03-13` beta header.
     * @alpha
     */
    taskBudget?: {
        total: number;
    };
    /**
     * MCP (Model Context Protocol) server configurations.
     * Keys are server names, values are server configurations.
     *
     * @example
     * ```typescript
     * mcpServers: {
     *   'my-server': {
     *     command: 'node',
     *     args: ['./my-mcp-server.js']
     *   }
     * }
     * ```
     */
    mcpServers?: Record<string, McpServerConfig>;
    /**
     * Claude model to use. Defaults to the CLI default model.
     * Examples: 'claude-sonnet-4-6', 'claude-opus-4-6'
     */
    model?: string;
    /**
     * Output format configuration for structured responses.
     * When specified, the agent will return structured data matching the schema.
     *
     * @example
     * ```typescript
     * outputFormat: {
     *   type: 'json_schema',
     *   schema: { type: 'object', properties: { result: { type: 'string' } } }
     * }
     * ```
     */
    outputFormat?: OutputFormat;
    /**
     * Path to the Claude Code executable. Uses the built-in executable if not specified.
     */
    pathToClaudeCodeExecutable?: string;
    /**
     * Permission mode for the session.
     * - `'default'` - Standard permission behavior, prompts for dangerous operations
     * - `'acceptEdits'` - Auto-accept file edit operations
     * - `'bypassPermissions'` - Bypass all permission checks (requires `allowDangerouslySkipPermissions`)
     * - `'plan'` - Planning mode, no execution of tools
     * - `'dontAsk'` - Don't prompt for permissions, deny if not pre-approved
     */
    permissionMode?: PermissionMode;
    /**
     * Must be set to `true` when using `permissionMode: 'bypassPermissions'`.
     * This is a safety measure to ensure intentional bypassing of permissions.
     */
    allowDangerouslySkipPermissions?: boolean;
    /**
     * MCP tool name to use for permission prompts. When set, permission requests
     * will be routed through this MCP tool instead of the default handler.
     */
    permissionPromptToolName?: string;
    /**
     * Load plugins for this session. Plugins provide custom commands, agents,
     * skills, and hooks that extend Claude Code's capabilities.
     *
     * Currently only local plugins are supported via the 'local' type.
     *
     * @example
     * ```typescript
     * plugins: [
     *   { type: 'local', path: './my-plugin' },
     *   { type: 'local', path: '/absolute/path/to/plugin' }
     * ]
     * ```
     */
    plugins?: SdkPluginConfig[];




    /**
     * Enable prompt suggestions. When true, the agent emits a `prompt_suggestion`
     * message after each turn with a predicted next user prompt.
     *
     * Delivery semantics:
     * - At most one `prompt_suggestion` per turn; arrives after the `result` message.
     * - Consumers must keep iterating the stream after `result` to receive it.
     * - Suppressed on the first turn, after API errors, in plan mode, and by the
     *   `CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION=false` env var.
     * - Suggestions piggyback on the parent's prompt cache, making them nearly free.
     */
    promptSuggestions?: boolean;
    /**
     * Enable periodic AI-generated progress summaries for running subagents. When
     * true, the subagent's conversation is forked every ~30s to produce a short
     * present-tense description (e.g. "Analyzing authentication module"), emitted
     * on `task_progress` events via the `summary` field. The fork reuses the
     * subagent's model and prompt cache, so cost is typically minimal.
     *
     * Applies to both foreground and background subagents. Defaults to false.
     */
    agentProgressSummaries?: boolean;
    /**
     * Session ID to resume. Loads the conversation history from the specified session.
     */
    resume?: string;
    /**
     * Use a specific session ID for the conversation instead of an auto-generated one.
     * Must be a valid UUID. Cannot be used with `continue` or `resume` unless
     * `forkSession` is also set (to specify a custom ID for the forked session).
     */
    sessionId?: string;
    /**
     * When resuming, only resume messages up to and including the message with this UUID.
     * Use with `resume`. This allows you to resume from a specific point in the conversation.
     * The message ID should be from `SDKAssistantMessage.uuid`.
     */
    resumeSessionAt?: string;
    /**
     * Sandbox settings for command execution isolation.
     *
     * When enabled, commands are executed in a sandboxed environment that restricts
     * filesystem and network access. This provides an additional security layer.
     *
     * **Important:** Filesystem and network restrictions are configured via permission
     * rules, not via these sandbox settings:
     * - Filesystem access: Use `Read` and `Edit` permission rules
     * - Network access: Use `WebFetch` permission rules
     *
     * These sandbox settings control sandbox behavior (enabled, auto-allow, etc.),
     * while the actual access restrictions come from your permission configuration.
     *
     * @example Enable sandboxing with auto-allow
     * ```typescript
     * sandbox: {
     *   enabled: true,
     *   autoAllowBashIfSandboxed: true
     * }
     * ```
     *
     * @example Configure network options (not restrictions)
     * ```typescript
     * sandbox: {
     *   enabled: true,
     *   network: {
     *     allowLocalBinding: true,
     *     allowUnixSockets: ['/var/run/docker.sock']
     *   }
     * }
     * ```
     *
     * @see https://docs.anthropic.com/en/docs/claude-code/settings#sandbox-settings
     */
    sandbox?: SandboxSettings;
    /**
     * Additional settings to apply. Accepts either a path to a settings JSON file
     * or a settings object. These are loaded into the "flag settings" layer,
     * which has the highest priority among user-controlled settings.
     *
     * Equivalent to the `--settings` CLI flag.
     *
     * @example Inline settings object
     * ```typescript
     * settings: { model: 'claude-sonnet-4-6', permissions: { allow: ['Bash(*)'] } }
     * ```
     *
     * @example Path to settings file
     * ```typescript
     * settings: '/path/to/settings.json'
     * ```
     */
    settings?: string | Settings;
    /**
     * Control which filesystem settings to load.
     * - `'user'` - Global user settings (`~/.claude/settings.json`)
     * - `'project'` - Project settings (`.claude/settings.json`)
     * - `'local'` - Local settings (`.claude/settings.local.json`)
     *
     * When omitted or empty, no filesystem settings are loaded (SDK isolation mode).
     * Must include `'project'` to load CLAUDE.md files.
     */
    settingSources?: SettingSource[];
    /**
     * Enable debug mode for the Claude Code process.
     * When true, enables verbose debug logging (equivalent to `--debug` CLI flag).
     * Debug logs are written to a file (see `debugFile` option) or to stderr.
     *
     * You can also capture debug output via the `stderr` callback.
     */
    debug?: boolean;
    /**
     * Write debug logs to a specific file path.
     * Implicitly enables debug mode. Equivalent to `--debug-file <path>` CLI flag.
     */
    debugFile?: string;
    /**
     * Callback for stderr output from the Claude Code process.
     * Useful for debugging and logging.
     */
    stderr?: (data: string) => void;
    /**
     * Enforce strict validation of MCP server configurations.
     * When true, invalid configurations will cause errors instead of warnings.
     */
    strictMcpConfig?: boolean;
    /**
     * System prompt configuration.
     * - `string` - Use a custom system prompt
     * - `{ type: 'preset', preset: 'claude_code' }` - Use Claude Code's default system prompt
     * - `{ type: 'preset', preset: 'claude_code', append: '...' }` - Use default prompt with appended instructions
     *
     * @example Custom prompt
     * ```typescript
     * systemPrompt: 'You are a helpful coding assistant.'
     * ```
     *
     * @example Default with additions
     * ```typescript
     * systemPrompt: {
     *   type: 'preset',
     *   preset: 'claude_code',
     *   append: 'Always explain your reasoning.'
     * }
     * ```
     */
    systemPrompt?: string | {
        type: 'preset';
        preset: 'claude_code';
        append?: string;
    };
    /**
     * Custom function to spawn the Claude Code process.
     * Use this to run Claude Code in VMs, containers, or remote environments.
     *
     * When provided, this function is called instead of the default local spawn.
     * The default behavior checks if the executable exists before spawning.
     *
     * @example
     * ```typescript
     * spawnClaudeCodeProcess: (options) => {
     *   // Custom spawn logic for VM execution
     *   // options contains: command, args, cwd, env, signal
     *   return myVMProcess; // Must satisfy SpawnedProcess interface
     * }
     * ```
     */
    spawnClaudeCodeProcess?: (options: SpawnOptions) => SpawnedProcess;
};

export declare type OutputFormat = JsonSchemaOutputFormat;

export declare type OutputFormatType = 'json_schema';

export declare type PermissionBehavior = 'allow' | 'deny' | 'ask';

/**
 * Classification of this permission decision for telemetry. SDK hosts that prompt users (desktop apps, IDEs) should set this to reflect what actually happened: user_temporary for allow-once, user_permanent for always-allow (both the click and later cache hits), user_reject for deny. If unset, the CLI infers conservatively (temporary for allow, reject for deny). The vocabulary matches tool_decision OTel events (monitoring-usage docs).
 */
export declare type PermissionDecisionClassification = 'user_temporary' | 'user_permanent' | 'user_reject';

/**
 * Permission mode for controlling how tool executions are handled. 'default' - Standard behavior, prompts for dangerous operations. 'acceptEdits' - Auto-accept file edit operations. 'bypassPermissions' - Bypass all permission checks (requires allowDangerouslySkipPermissions). 'plan' - Planning mode, no actual tool execution. 'dontAsk' - Don't prompt for permissions, deny if not pre-approved.
 */
export declare type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk';

export declare type PermissionRequestHookInput = BaseHookInput & {
    hook_event_name: 'PermissionRequest';
    tool_name: string;
    tool_input: unknown;
    permission_suggestions?: PermissionUpdate[];
};

export declare type PermissionRequestHookSpecificOutput = {
    hookEventName: 'PermissionRequest';
    decision: {
        behavior: 'allow';
        updatedInput?: Record<string, unknown>;
        updatedPermissions?: PermissionUpdate[];
    } | {
        behavior: 'deny';
        message?: string;
        interrupt?: boolean;
    };
};

export declare type PermissionResult = {
    behavior: 'allow';
    updatedInput?: Record<string, unknown>;
    updatedPermissions?: PermissionUpdate[];
    toolUseID?: string;
    decisionClassification?: PermissionDecisionClassification;
} | {
    behavior: 'deny';
    message: string;
    interrupt?: boolean;
    toolUseID?: string;
    decisionClassification?: PermissionDecisionClassification;
};

export declare type PermissionRuleValue = {
    toolName: string;
    ruleContent?: string;
};

export declare type PermissionUpdate = {
    type: 'addRules';
    rules: PermissionRuleValue[];
    behavior: PermissionBehavior;
    destination: PermissionUpdateDestination;
} | {
    type: 'replaceRules';
    rules: PermissionRuleValue[];
    behavior: PermissionBehavior;
    destination: PermissionUpdateDestination;
} | {
    type: 'removeRules';
    rules: PermissionRuleValue[];
    behavior: PermissionBehavior;
    destination: PermissionUpdateDestination;
} | {
    type: 'setMode';
    mode: PermissionMode;
    destination: PermissionUpdateDestination;
} | {
    type: 'addDirectories';
    directories: string[];
    destination: PermissionUpdateDestination;
} | {
    type: 'removeDirectories';
    directories: string[];
    destination: PermissionUpdateDestination;
};

export declare type PermissionUpdateDestination = 'userSettings' | 'projectSettings' | 'localSettings' | 'session' | 'cliArg';

export declare type PostCompactHookInput = BaseHookInput & {
    hook_event_name: 'PostCompact';
    trigger: 'manual' | 'auto';
    /**
     * The conversation summary produced by compaction
     */
    compact_summary: string;
};

export declare type PostToolUseFailureHookInput = BaseHookInput & {
    hook_event_name: 'PostToolUseFailure';
    tool_name: string;
    tool_input: unknown;
    tool_use_id: string;
    error: string;
    is_interrupt?: boolean;
};

export declare type PostToolUseFailureHookSpecificOutput = {
    hookEventName: 'PostToolUseFailure';
    additionalContext?: string;
};

export declare type PostToolUseHookInput = BaseHookInput & {
    hook_event_name: 'PostToolUse';
    tool_name: string;
    tool_input: unknown;
    tool_response: unknown;
    tool_use_id: string;
};

export declare type PostToolUseHookSpecificOutput = {
    hookEventName: 'PostToolUse';
    additionalContext?: string;
    updatedMCPToolOutput?: unknown;
};

export declare type PreCompactHookInput = BaseHookInput & {
    hook_event_name: 'PreCompact';
    trigger: 'manual' | 'auto';
    custom_instructions: string | null;
};

export declare type PreToolUseHookInput = BaseHookInput & {
    hook_event_name: 'PreToolUse';
    tool_name: string;
    tool_input: unknown;
    tool_use_id: string;
};

export declare type PreToolUseHookSpecificOutput = {
    hookEventName: 'PreToolUse';
    permissionDecision?: PermissionBehavior;
    permissionDecisionReason?: string;
    updatedInput?: Record<string, unknown>;
    additionalContext?: string;
};

export declare type PromptRequest = {
    /**
     * Request ID. Presence of this key marks the line as a prompt request.
     */
    prompt: string;
    /**
     * The prompt message to display to the user
     */
    message: string;
    /**
     * Available options for the user to choose from
     */
    options: PromptRequestOption[];
};

export declare type PromptRequestOption = {
    /**
     * Unique key for this option, returned in the response
     */
    key: string;
    /**
     * Display text for this option
     */
    label: string;
    /**
     * Optional description shown below the label
     */
    description?: string;
};

export declare type PromptResponse = {
    /**
     * The request ID from the corresponding prompt request
     */
    prompt_response: string;
    /**
     * The key of the selected option
     */
    selected: string;
};

/**
 * Query interface with methods for controlling query execution.
 * Extends AsyncGenerator and has methods, so not serializable.
 */
export declare interface Query extends AsyncGenerator<SDKMessage, void> {
    /**
     * Control Requests
     * The following methods are control requests, and are only supported when
     * streaming input/output is used.
     */
    /**
     * Interrupt the current query execution. The query will stop processing
     * and return control to the caller.
     */
    interrupt(): Promise<void>;
    /**
     * Change the permission mode for the current session.
     * Only available in streaming input mode.
     *
     * @param mode - The new permission mode to set
     */
    setPermissionMode(mode: PermissionMode): Promise<void>;
    /**
     * Change the model used for subsequent responses.
     * Only available in streaming input mode.
     *
     * @param model - The model identifier to use, or undefined to use the default
     */
    setModel(model?: string): Promise<void>;
    /**
     * Set the maximum number of thinking tokens the model is allowed to use
     * when generating its response. This can be used to limit the amount of
     * tokens the model uses for its response, which can help control cost and
     * latency.
     *
     * Use `null` to clear any previously set limit and allow the model to
     * use the default maximum thinking tokens.
     *
     * @deprecated Use the `thinking` option in `query()` instead. On Opus 4.6,
     * this is treated as on/off (0 = disabled, any other value = adaptive).
     * For explicit control, use `thinking: { type: 'adaptive' }` or
     * `thinking: { type: 'enabled', budgetTokens: N }`.
     *
     * @param maxThinkingTokens - Maximum tokens for thinking, or null to clear the limit
     */
    setMaxThinkingTokens(maxThinkingTokens: number | null): Promise<void>;
    /**
     * Merge the provided settings into the flag settings layer, dynamically
     * updating the active configuration. Top-level keys are shallow-merged
     * across successive calls — a second call with `{permissions: {...}}`
     * replaces the entire `permissions` object from a prior call. The resulting
     * flag settings are then deep-merged with file-based settings at read time.
     *
     * Equivalent to passing an object to the `settings` option of `query()`,
     * but applies mid-session. Only available in streaming input mode.
     *
     * @param settings - A partial settings object to merge into the flag settings
     */
    applyFlagSettings(settings: Settings): Promise<void>;
    /**
     * Get the full initialization result, including supported commands, models,
     * account info, and output style configuration.
     *
     * @returns The complete initialization response
     */
    initializationResult(): Promise<SDKControlInitializeResponse>;
    /**
     * Get the list of available skills for the current session.
     *
     * @returns Array of available skills with their names and descriptions
     */
    supportedCommands(): Promise<SlashCommand[]>;
    /**
     * Get the list of available models.
     *
     * @returns Array of model information including display names and descriptions
     */
    supportedModels(): Promise<ModelInfo[]>;
    /**
     * Get the list of available subagents for the current session.
     *
     * @returns Array of available agents with their names, descriptions, and configuration
     */
    supportedAgents(): Promise<AgentInfo[]>;
    /**
     * Get the current status of all configured MCP servers.
     *
     * @returns Array of MCP server statuses (connected, failed, needs-auth, pending)
     */
    mcpServerStatus(): Promise<McpServerStatus[]>;
    /**
     * Get a breakdown of current context window usage by category
     * (system prompt, tools, messages, MCP tools, memory files, etc.).
     *
     * @returns Context usage breakdown including token counts per category and total usage
     */
    getContextUsage(): Promise<SDKControlGetContextUsageResponse>;
    /**
     * Reload plugins from disk and return the refreshed commands, agents,
     * plugins, and MCP server status.
     *
     * @returns The refreshed session components after plugin reload
     */
    reloadPlugins(): Promise<SDKControlReloadPluginsResponse>;
    /**
     * Get information about the authenticated account.
     *
     * @returns Account information including email, organization, and subscription type
     */
    accountInfo(): Promise<AccountInfo>;
    /**
     * Rewind tracked files to their state at a specific user message.
     * Requires file checkpointing to be enabled via the `enableFileCheckpointing` option.
     *
     * @param userMessageId - UUID of the user message to rewind to
     * @param options - Options object with optional `dryRun` boolean to preview changes without modifying files
     * @returns Object with canRewind boolean, optional error message, and file change statistics
     */
    rewindFiles(userMessageId: string, options?: {
        dryRun?: boolean;
    }): Promise<RewindFilesResult>;
    /**
     * Seed the CLI's readFileState cache with a path+mtime entry. Use when
     * the client observed a Read that has since been removed from context
     * (e.g. by snip), so a subsequent Edit won't fail "file not read yet".
     * If the file changed on disk since the given mtime, the seed is skipped
     * and Edit will correctly require a fresh Read.
     *
     * @param path - Path to the file that was previously Read
     * @param mtime - File mtime (floored ms) at the time of the observed Read
     */
    seedReadState(path: string, mtime: number): Promise<void>;




    /**
     * Reconnect an MCP server by name.
     * Throws on failure.
     *
     * @param serverName - The name of the MCP server to reconnect
     */
    reconnectMcpServer(serverName: string): Promise<void>;
    /**
     * Enable or disable an MCP server by name.
     * Throws on failure.
     *
     * @param serverName - The name of the MCP server to toggle
     * @param enabled - Whether the server should be enabled
     */
    toggleMcpServer(serverName: string, enabled: boolean): Promise<void>;






    /**
     * Dynamically set the MCP servers for this session.
     * This replaces the current set of dynamically-added MCP servers with the provided set.
     * Servers that are removed will be disconnected, and new servers will be connected.
     *
     * Supports both process-based servers (stdio, sse, http) and SDK servers (in-process).
     * SDK servers are handled locally in the SDK process, while process-based servers
     * are managed by the CLI subprocess.
     *
     * Note: This only affects servers added dynamically via this method or the SDK.
     * Servers configured via settings files are not affected.
     *
     * @param servers - Record of server name to configuration. Pass an empty object to remove all dynamic servers.
     * @returns Information about which servers were added, removed, and any connection errors
     */
    setMcpServers(servers: Record<string, McpServerConfig>): Promise<McpSetServersResult>;
    /**
     * Stream input messages to the query.
     * Used internally for multi-turn conversations.
     *
     * @param stream - Async iterable of user messages to send
     */
    streamInput(stream: AsyncIterable<SDKUserMessage>): Promise<void>;
    /**
     * Stop a running task. A task_notification with status 'stopped' will be emitted.
     * @param taskId - The task ID from task_notification events
     */
    stopTask(taskId: string): Promise<void>;
    /**
     * Close the query and terminate the underlying process.
     * This forcefully ends the query, cleaning up all resources including
     * pending requests, MCP transports, and the CLI subprocess.
     *
     * Use this when you need to abort a query that is still running.
     * After calling close(), no further messages will be received.
     */
    close(): void;
}

export declare function query(_params: {
    prompt: string | AsyncIterable<SDKUserMessage>;
    options?: Options;
}): Query;

/**
 * Rename a session. Appends a custom-title entry to the session's JSONL file.
 * @param sessionId - UUID of the session
 * @param title - New title
 * @param options - `{ dir?: string }` project path; omit to search all projects
 */
export declare function renameSession(_sessionId: string, _title: string, _options?: SessionMutationOptions): Promise<void>;

/**
 * Result of a rewindFiles operation.
 */
export declare type RewindFilesResult = {
    canRewind: boolean;
    error?: string;
    filesChanged?: string[];
    insertions?: number;
    deletions?: number;
};

export declare type SandboxFilesystemConfig = NonNullable<z.infer<ReturnType<typeof SandboxFilesystemConfigSchema>>>;

/**
 * Filesystem configuration schema for sandbox.
 */
declare const SandboxFilesystemConfigSchema: () => z.ZodOptional<z.ZodObject<{
    allowWrite: z.ZodOptional<z.ZodArray<z.ZodString>>;
    denyWrite: z.ZodOptional<z.ZodArray<z.ZodString>>;
    denyRead: z.ZodOptional<z.ZodArray<z.ZodString>>;
    allowRead: z.ZodOptional<z.ZodArray<z.ZodString>>;
    allowManagedReadPathsOnly: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>>;

export declare type SandboxIgnoreViolations = NonNullable<SandboxSettings['ignoreViolations']>;

export declare type SandboxNetworkConfig = NonNullable<z.infer<ReturnType<typeof SandboxNetworkConfigSchema>>>;

/**
 * Network configuration schema for sandbox.
 */
declare const SandboxNetworkConfigSchema: () => z.ZodOptional<z.ZodObject<{
    allowedDomains: z.ZodOptional<z.ZodArray<z.ZodString>>;
    allowManagedDomainsOnly: z.ZodOptional<z.ZodBoolean>;
    allowUnixSockets: z.ZodOptional<z.ZodArray<z.ZodString>>;
    allowAllUnixSockets: z.ZodOptional<z.ZodBoolean>;
    allowLocalBinding: z.ZodOptional<z.ZodBoolean>;
    httpProxyPort: z.ZodOptional<z.ZodNumber>;
    socksProxyPort: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>>;

export declare type SandboxSettings = z.infer<ReturnType<typeof SandboxSettingsSchema>>;

/**
 * Sandbox settings schema.
 */
declare const SandboxSettingsSchema: () => z.ZodObject<{
    enabled: z.ZodOptional<z.ZodBoolean>;
    failIfUnavailable: z.ZodOptional<z.ZodBoolean>;
    autoAllowBashIfSandboxed: z.ZodOptional<z.ZodBoolean>;
    allowUnsandboxedCommands: z.ZodOptional<z.ZodBoolean>;
    network: z.ZodOptional<z.ZodObject<{
        allowedDomains: z.ZodOptional<z.ZodArray<z.ZodString>>;
        allowManagedDomainsOnly: z.ZodOptional<z.ZodBoolean>;
        allowUnixSockets: z.ZodOptional<z.ZodArray<z.ZodString>>;
        allowAllUnixSockets: z.ZodOptional<z.ZodBoolean>;
        allowLocalBinding: z.ZodOptional<z.ZodBoolean>;
        httpProxyPort: z.ZodOptional<z.ZodNumber>;
        socksProxyPort: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    filesystem: z.ZodOptional<z.ZodObject<{
        allowWrite: z.ZodOptional<z.ZodArray<z.ZodString>>;
        denyWrite: z.ZodOptional<z.ZodArray<z.ZodString>>;
        denyRead: z.ZodOptional<z.ZodArray<z.ZodString>>;
        allowRead: z.ZodOptional<z.ZodArray<z.ZodString>>;
        allowManagedReadPathsOnly: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
    ignoreViolations: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString>>>;
    enableWeakerNestedSandbox: z.ZodOptional<z.ZodBoolean>;
    enableWeakerNetworkIsolation: z.ZodOptional<z.ZodBoolean>;
    excludedCommands: z.ZodOptional<z.ZodArray<z.ZodString>>;
    ripgrep: z.ZodOptional<z.ZodObject<{
        command: z.ZodString;
        args: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
}, z.core.$loose>;

/**
 * Emitted when an API request fails with a retryable error and will be retried after a delay. error_status is null for connection errors (e.g. timeouts) that had no HTTP response.
 */
export declare type SDKAPIRetryMessage = {
    type: 'system';
    subtype: 'api_retry';
    attempt: number;
    max_retries: number;
    retry_delay_ms: number;
    error_status: number | null;
    error: SDKAssistantMessageError;
    uuid: UUID;
    session_id: string;
};

export declare type SDKAssistantMessage = {
    type: 'assistant';
    message: BetaMessage;
    parent_tool_use_id: string | null;
    error?: SDKAssistantMessageError;
    uuid: UUID;
    session_id: string;
};

export declare type SDKAssistantMessageError = 'authentication_failed' | 'billing_error' | 'rate_limit' | 'invalid_request' | 'server_error' | 'unknown' | 'max_output_tokens';

export declare type SDKAuthStatusMessage = {
    type: 'auth_status';
    isAuthenticating: boolean;
    output: string[];
    error?: string;
    uuid: UUID;
    session_id: string;
};

export declare type SdkBeta = 'context-1m-2025-08-07';

export declare type SDKCompactBoundaryMessage = {
    type: 'system';
    subtype: 'compact_boundary';
    compact_metadata: {
        trigger: 'manual' | 'auto';
        pre_tokens: number;
        /**
         * Relink info for messagesToKeep. Loaders splice the preserved segment at anchor_uuid (summary for suffix-preserving, boundary for prefix-preserving partial compact) so resume includes preserved content. Unset when compaction summarizes everything (no messagesToKeep).
         */
        preserved_segment?: {
            head_uuid: UUID;
            anchor_uuid: UUID;
            tail_uuid: UUID;
        };
    };
    uuid: UUID;
    session_id: string;
};

/**
 * Merges the provided settings into the flag settings layer, updating the active configuration.
 */
declare type SDKControlApplyFlagSettingsRequest = {
    subtype: 'apply_flag_settings';
    settings: Record<string, unknown>;
};

/**
 * Drops a pending async user message from the command queue by uuid. No-op if already dequeued for execution.
 */
declare type SDKControlCancelAsyncMessageRequest = {
    subtype: 'cancel_async_message';
    message_uuid: string;
};

/**
 * Cancels a currently open control request.
 */
declare type SDKControlCancelRequest = {
    type: 'control_cancel_request';
    request_id: string;
};

/**
 * Requests the SDK consumer to handle an MCP elicitation (user input request).
 */
declare type SDKControlElicitationRequest = {
    subtype: 'elicitation';
    mcp_server_name: string;
    message: string;
    mode?: 'form' | 'url';
    url?: string;
    elicitation_id?: string;
    requested_schema?: Record<string, unknown>;
};

/**
 * Requests a breakdown of current context window usage by category.
 */
declare type SDKControlGetContextUsageRequest = {
    subtype: 'get_context_usage';
};

/**
 * Breakdown of current context window usage by category (system prompt, tools, messages, etc.).
 */
export declare type SDKControlGetContextUsageResponse = {
    categories: {
        name: string;
        tokens: number;
        color: string;
        isDeferred?: boolean;
    }[];
    totalTokens: number;
    maxTokens: number;
    rawMaxTokens: number;
    percentage: number;
    gridRows: {
        color: string;
        isFilled: boolean;
        categoryName: string;
        tokens: number;
        percentage: number;
        squareFullness: number;
    }[][];
    model: string;
    memoryFiles: {
        path: string;
        type: string;
        tokens: number;
    }[];
    mcpTools: {
        name: string;
        serverName: string;
        tokens: number;
        isLoaded?: boolean;
    }[];
    deferredBuiltinTools?: {
        name: string;
        tokens: number;
        isLoaded: boolean;
    }[];
    systemTools?: {
        name: string;
        tokens: number;
    }[];
    systemPromptSections?: {
        name: string;
        tokens: number;
    }[];
    agents: {
        agentType: string;
        source: string;
        tokens: number;
    }[];
    slashCommands?: {
        totalCommands: number;
        includedCommands: number;
        tokens: number;
    };
    skills?: {
        totalSkills: number;
        includedSkills: number;
        tokens: number;
        skillFrontmatter: {
            name: string;
            source: string;
            tokens: number;
        }[];
    };
    autoCompactThreshold?: number;
    isAutoCompactEnabled: boolean;
    messageBreakdown?: {
        toolCallTokens: number;
        toolResultTokens: number;
        attachmentTokens: number;
        assistantMessageTokens: number;
        userMessageTokens: number;
        toolCallsByType: {
            name: string;
            callTokens: number;
            resultTokens: number;
        }[];
        attachmentsByType: {
            name: string;
            tokens: number;
        }[];
    };
    apiUsage: {
        input_tokens: number;
        output_tokens: number;
        cache_creation_input_tokens: number;
        cache_read_input_tokens: number;
    } | null;
};

/**
 * Returns the effective merged settings and the raw per-source settings.
 */
declare type SDKControlGetSettingsRequest = {
    subtype: 'get_settings';
};

/**
 * Initializes the SDK session with hooks, MCP servers, and agent configuration.
 */
declare type SDKControlInitializeRequest = {
    subtype: 'initialize';
    hooks?: Partial<Record<coreTypes.HookEvent, SDKHookCallbackMatcher[]>>;
    sdkMcpServers?: string[];
    jsonSchema?: Record<string, unknown>;
    systemPrompt?: string;
    appendSystemPrompt?: string;
    agents?: Record<string, coreTypes.AgentDefinition>;
    promptSuggestions?: boolean;
    agentProgressSummaries?: boolean;
};

/**
 * Response from session initialization with available commands, models, and account info.
 */
export declare type SDKControlInitializeResponse = {
    commands: coreTypes.SlashCommand[];
    agents: coreTypes.AgentInfo[];
    output_style: string;
    available_output_styles: string[];
    models: coreTypes.ModelInfo[];
    /**
     * Information about the logged in user's account.
     */
    account: coreTypes.AccountInfo;

    fast_mode_state?: coreTypes.FastModeState;
};

/**
 * Interrupts the currently running conversation turn.
 */
declare type SDKControlInterruptRequest = {
    subtype: 'interrupt';
};

/**
 * Sends a JSON-RPC message to a specific MCP server.
 */
declare type SDKControlMcpMessageRequest = {
    subtype: 'mcp_message';
    server_name: string;
    message: JSONRPCMessage;
};

/**
 * Reconnects a disconnected or failed MCP server.
 */
declare type SDKControlMcpReconnectRequest = {
    subtype: 'mcp_reconnect';
    serverName: string;
};

/**
 * Replaces the set of dynamically managed MCP servers.
 */
declare type SDKControlMcpSetServersRequest = {
    subtype: 'mcp_set_servers';
    servers: Record<string, coreTypes.McpServerConfigForProcessTransport>;
};

/**
 * Requests the current status of all MCP server connections.
 */
declare type SDKControlMcpStatusRequest = {
    subtype: 'mcp_status';
};

/**
 * Enables or disables an MCP server.
 */
declare type SDKControlMcpToggleRequest = {
    subtype: 'mcp_toggle';
    serverName: string;
    enabled: boolean;
};

/**
 * Requests permission to use a tool with the given input.
 */
declare type SDKControlPermissionRequest = {
    subtype: 'can_use_tool';
    tool_name: string;
    input: Record<string, unknown>;
    permission_suggestions?: coreTypes.PermissionUpdate[];
    blocked_path?: string;
    decision_reason?: string;
    title?: string;
    display_name?: string;
    tool_use_id: string;
    agent_id?: string;
    description?: string;
};

/**
 * Reloads plugins from disk and returns the refreshed session components.
 */
declare type SDKControlReloadPluginsRequest = {
    subtype: 'reload_plugins';
};

/**
 * Refreshed commands, agents, plugins, and MCP server status after reload.
 */
export declare type SDKControlReloadPluginsResponse = {
    commands: coreTypes.SlashCommand[];
    agents: coreTypes.AgentInfo[];
    plugins: {
        name: string;
        path: string;
        source?: string;
    }[];
    mcpServers: coreTypes.McpServerStatus[];
    error_count: number;
};

export declare type SDKControlRequest = {
    type: 'control_request';
    request_id: string;
    request: SDKControlRequestInner;
};

declare type SDKControlRequestInner = SDKControlInterruptRequest | SDKControlPermissionRequest | SDKControlInitializeRequest | SDKControlSetPermissionModeRequest | SDKControlSetModelRequest | SDKControlSetMaxThinkingTokensRequest | SDKControlMcpStatusRequest | SDKControlGetContextUsageRequest | SDKHookCallbackRequest | SDKControlMcpMessageRequest | SDKControlRewindFilesRequest | SDKControlCancelAsyncMessageRequest | SDKControlSeedReadStateRequest | SDKControlMcpSetServersRequest | SDKControlReloadPluginsRequest | SDKControlMcpReconnectRequest | SDKControlMcpToggleRequest | SDKControlChannelEnableRequest | SDKControlEndSessionRequest | SDKControlMcpAuthenticateRequest | SDKControlMcpClearAuthRequest | SDKControlMcpOAuthCallbackUrlRequest | SDKControlClaudeAuthenticateRequest | SDKControlClaudeOAuthCallbackRequest | SDKControlClaudeOAuthWaitForCompletionRequest | SDKControlRemoteControlRequest | SDKControlSetProactiveRequest | SDKControlGenerateSessionTitleRequest | SDKControlSideQuestionRequest | SDKControlStopTaskRequest | SDKControlApplyFlagSettingsRequest | SDKControlGetSettingsRequest | SDKControlElicitationRequest;

export declare type SDKControlResponse = {
    type: 'control_response';
    response: ControlResponse | ControlErrorResponse;
};

/**
 * Rewinds file changes made since a specific user message.
 */
declare type SDKControlRewindFilesRequest = {
    subtype: 'rewind_files';
    user_message_id: string;
    dry_run?: boolean;
};

/**
 * Seeds the readFileState cache with a path+mtime entry. Use when a prior Read was removed from context (e.g. by snip) so Edit validation would fail despite the client having observed the Read. The mtime lets the CLI detect if the file changed since the seeded Read — same staleness check as the normal path.
 */
declare type SDKControlSeedReadStateRequest = {
    subtype: 'seed_read_state';
    path: string;
    mtime: number;
};

/**
 * Sets the maximum number of thinking tokens for extended thinking.
 */
declare type SDKControlSetMaxThinkingTokensRequest = {
    subtype: 'set_max_thinking_tokens';
    max_thinking_tokens: number | null;
};

/**
 * Sets the model to use for subsequent conversation turns.
 */
declare type SDKControlSetModelRequest = {
    subtype: 'set_model';
    model?: string;
};

/**
 * Sets the permission mode for tool execution handling.
 */
declare type SDKControlSetPermissionModeRequest = {
    subtype: 'set_permission_mode';
    /**
     * Permission mode for controlling how tool executions are handled. 'default' - Standard behavior, prompts for dangerous operations. 'acceptEdits' - Auto-accept file edit operations. 'bypassPermissions' - Bypass all permission checks (requires allowDangerouslySkipPermissions). 'plan' - Planning mode, no actual tool execution. 'dontAsk' - Don't prompt for permissions, deny if not pre-approved.
     */
    mode: coreTypes.PermissionMode;

};

/**
 * Stops a running task.
 */
declare type SDKControlStopTaskRequest = {
    subtype: 'stop_task';
    task_id: string;
};

/**
 * Emitted when an MCP server confirms that a URL-mode elicitation is complete.
 */
export declare type SDKElicitationCompleteMessage = {
    type: 'system';
    subtype: 'elicitation_complete';
    mcp_server_name: string;
    elicitation_id: string;
    uuid: UUID;
    session_id: string;
};

export declare type SDKFilesPersistedEvent = {
    type: 'system';
    subtype: 'files_persisted';
    files: {
        filename: string;
        file_id: string;
    }[];
    failed: {
        filename: string;
        error: string;
    }[];
    processed_at: string;
    uuid: UUID;
    session_id: string;
};

/**
 * Configuration for matching and routing hook callbacks.
 */
declare type SDKHookCallbackMatcher = {
    matcher?: string;
    hookCallbackIds: string[];
    timeout?: number;
};

/**
 * Delivers a hook callback with its input data.
 */
declare type SDKHookCallbackRequest = {
    subtype: 'hook_callback';
    callback_id: string;
    input: coreTypes.HookInput;
    tool_use_id?: string;
};

export declare type SDKHookProgressMessage = {
    type: 'system';
    subtype: 'hook_progress';
    hook_id: string;
    hook_name: string;
    hook_event: string;
    stdout: string;
    stderr: string;
    output: string;
    uuid: UUID;
    session_id: string;
};

export declare type SDKHookResponseMessage = {
    type: 'system';
    subtype: 'hook_response';
    hook_id: string;
    hook_name: string;
    hook_event: string;
    output: string;
    stdout: string;
    stderr: string;
    exit_code?: number;
    outcome: 'success' | 'error' | 'cancelled';
    uuid: UUID;
    session_id: string;
};

export declare type SDKHookStartedMessage = {
    type: 'system';
    subtype: 'hook_started';
    hook_id: string;
    hook_name: string;
    hook_event: string;
    uuid: UUID;
    session_id: string;
};

/**
 * Keep-alive message to maintain WebSocket connection.
 */
declare type SDKKeepAliveMessage = {
    type: 'keep_alive';
};

/**
 * Output from a local slash command (e.g. /voice, /cost). Displayed as assistant-style text in the transcript.
 */
export declare type SDKLocalCommandOutputMessage = {
    type: 'system';
    subtype: 'local_command_output';
    content: string;
    uuid: UUID;
    session_id: string;
};

/**
 * MCP tool definition for SDK servers.
 * Contains a handler function, so not serializable.
 * Supports both Zod 3 and Zod 4 schemas.
 */
export declare type SdkMcpToolDefinition<Schema extends AnyZodRawShape = AnyZodRawShape> = {
    name: string;
    description: string;
    inputSchema: Schema;
    annotations?: ToolAnnotations;
    _meta?: Record<string, unknown>;
    handler: (args: InferShape<Schema>, extra: unknown) => Promise<CallToolResult>;
};

export declare type SDKMessage = SDKAssistantMessage | SDKUserMessage | SDKUserMessageReplay | SDKResultMessage | SDKSystemMessage | SDKPartialAssistantMessage | SDKCompactBoundaryMessage | SDKStatusMessage | SDKAPIRetryMessage | SDKLocalCommandOutputMessage | SDKHookStartedMessage | SDKHookProgressMessage | SDKHookResponseMessage | SDKToolProgressMessage | SDKAuthStatusMessage | SDKTaskNotificationMessage | SDKTaskStartedMessage | SDKTaskProgressMessage | SDKSessionStateChangedMessage | SDKFilesPersistedEvent | SDKToolUseSummaryMessage | SDKRateLimitEvent | SDKElicitationCompleteMessage | SDKPromptSuggestionMessage;

export declare type SDKPartialAssistantMessage = {
    type: 'stream_event';
    event: BetaRawMessageStreamEvent;
    parent_tool_use_id: string | null;
    uuid: UUID;
    session_id: string;
};

export declare type SDKPermissionDenial = {
    tool_name: string;
    tool_use_id: string;
    tool_input: Record<string, unknown>;
};

/**
 * Configuration for loading a plugin.
 */
export declare type SdkPluginConfig = {
    /**
     * Plugin type. Currently only 'local' is supported
     */
    type: 'local';
    /**
     * Absolute or relative path to the plugin directory
     */
    path: string;
};

/**
 * Predicted next user prompt, emitted after each turn when promptSuggestions is enabled.
 */
export declare type SDKPromptSuggestionMessage = {
    type: 'prompt_suggestion';
    suggestion: string;
    uuid: UUID;
    session_id: string;
};

/**
 * Rate limit event emitted when rate limit info changes.
 */
export declare type SDKRateLimitEvent = {
    type: 'rate_limit_event';
    /**
     * Rate limit information for claude.ai subscription users.
     */
    rate_limit_info: SDKRateLimitInfo;
    uuid: UUID;
    session_id: string;
};

/**
 * Rate limit information for claude.ai subscription users.
 */
export declare type SDKRateLimitInfo = {
    status: 'allowed' | 'allowed_warning' | 'rejected';
    resetsAt?: number;
    rateLimitType?: 'five_hour' | 'seven_day' | 'seven_day_opus' | 'seven_day_sonnet' | 'overage';
    utilization?: number;
    overageStatus?: 'allowed' | 'allowed_warning' | 'rejected';
    overageResetsAt?: number;
    overageDisabledReason?: 'overage_not_provisioned' | 'org_level_disabled' | 'org_level_disabled_until' | 'out_of_credits' | 'seat_tier_level_disabled' | 'member_level_disabled' | 'seat_tier_zero_credit_limit' | 'group_zero_credit_limit' | 'member_zero_credit_limit' | 'org_service_level_disabled' | 'org_service_zero_credit_limit' | 'no_limits_configured' | 'unknown';
    isUsingOverage?: boolean;
    surpassedThreshold?: number;
};

export declare type SDKResultError = {
    type: 'result';
    subtype: 'error_during_execution' | 'error_max_turns' | 'error_max_budget_usd' | 'error_max_structured_output_retries';
    duration_ms: number;
    duration_api_ms: number;
    is_error: boolean;
    num_turns: number;
    stop_reason: string | null;
    total_cost_usd: number;
    usage: NonNullableUsage;
    modelUsage: Record<string, ModelUsage>;
    permission_denials: SDKPermissionDenial[];
    errors: string[];
    fast_mode_state?: FastModeState;
    uuid: UUID;
    session_id: string;
};

export declare type SDKResultMessage = SDKResultSuccess | SDKResultError;

export declare type SDKResultSuccess = {
    type: 'result';
    subtype: 'success';
    duration_ms: number;
    duration_api_ms: number;
    is_error: boolean;
    num_turns: number;
    result: string;
    stop_reason: string | null;
    total_cost_usd: number;
    usage: NonNullableUsage;
    modelUsage: Record<string, ModelUsage>;
    permission_denials: SDKPermissionDenial[];
    structured_output?: unknown;
    fast_mode_state?: FastModeState;
    uuid: UUID;
    session_id: string;
};

/**
 * V2 API - UNSTABLE
 * Session interface for multi-turn conversations.
 * Has methods, so not serializable.
 * @alpha
 */
export declare interface SDKSession {
    /**
     * The session ID. Available after receiving the first message.
     * For resumed sessions, available immediately.
     * Throws if accessed before the session is initialized.
     */
    readonly sessionId: string;
    /** Send a message to the agent */
    send(message: string | SDKUserMessage): Promise<void>;
    /** Stream messages from the agent */
    stream(): AsyncGenerator<SDKMessage, void>;
    /** Close the session */
    close(): void;
    /** Async disposal support (calls close if not already closed) */
    [Symbol.asyncDispose](): Promise<void>;
}

/**
 * Session metadata returned by listSessions and getSessionInfo.
 */
export declare type SDKSessionInfo = {
    /**
     * Unique session identifier (UUID).
     */
    sessionId: string;
    /**
     * Display title for the session: custom title, auto-generated summary, or first prompt.
     */
    summary: string;
    /**
     * Last modified time in milliseconds since epoch.
     */
    lastModified: number;
    /**
     * File size in bytes. Only populated for local JSONL storage.
     */
    fileSize?: number;
    /**
     * User-set session title via /rename.
     */
    customTitle?: string;
    /**
     * First meaningful user prompt in the session.
     */
    firstPrompt?: string;
    /**
     * Git branch at the end of the session.
     */
    gitBranch?: string;
    /**
     * Working directory for the session.
     */
    cwd?: string;
    /**
     * User-set session tag.
     */
    tag?: string;
    /**
     * Creation time in milliseconds since epoch, extracted from the first entry's timestamp.
     */
    createdAt?: number;
};

/**
 * V2 API - UNSTABLE
 * Options for creating a session.
 * @alpha
 */
export declare type SDKSessionOptions = {
    /** Model to use */
    model: string;
    /** Path to Claude Code executable */
    pathToClaudeCodeExecutable?: string;
    /** Executable to use (node, bun) */
    executable?: 'node' | 'bun';
    /** Arguments to pass to executable */
    executableArgs?: string[];
    /**
     * Environment variables to pass to the Claude Code process.
     * Defaults to `process.env`.
     *
     * SDK consumers can identify their app/library to include in the User-Agent header by setting:
     * - `CLAUDE_AGENT_SDK_CLIENT_APP` - Your app/library identifier (e.g., "my-app/1.0.0", "my-library/2.1")
     */
    env?: {
        [envVar: string]: string | undefined;
    };
    /**
     * List of tool names that are auto-allowed without prompting for permission.
     * These tools will execute automatically without asking the user for approval.
     */
    allowedTools?: string[];
    /**
     * List of tool names that are disallowed. These tools will be removed
     * from the model's context and cannot be used.
     */
    disallowedTools?: string[];
    /**
     * Custom permission handler for controlling tool usage. Called before each
     * tool execution to determine if it should be allowed, denied, or prompt the user.
     */
    canUseTool?: CanUseTool;
    /**
     * Hook callbacks for responding to various events during execution.
     */
    hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;
    /**
     * Permission mode for the session.
     * - `'default'` - Standard permission behavior, prompts for dangerous operations
     * - `'acceptEdits'` - Auto-accept file edit operations
     * - `'plan'` - Planning mode, no execution of tools
     * - `'dontAsk'` - Don't prompt for permissions, deny if not pre-approved
     */
    permissionMode?: PermissionMode;
};

/**
 * Mirrors notifySessionStateChanged. 'idle' fires after heldBackResult flushes and the bg-agent do-while exits — authoritative turn-over signal.
 */
export declare type SDKSessionStateChangedMessage = {
    type: 'system';
    subtype: 'session_state_changed';
    state: 'idle' | 'running' | 'requires_action';
    uuid: UUID;
    session_id: string;
};

export declare type SDKStatus = 'compacting' | null;

export declare type SDKStatusMessage = {
    type: 'system';
    subtype: 'status';
    status: SDKStatus;
    permissionMode?: PermissionMode;
    uuid: UUID;
    session_id: string;
};

export declare type SDKSystemMessage = {
    type: 'system';
    subtype: 'init';
    agents?: string[];
    apiKeySource: ApiKeySource;
    betas?: string[];
    claude_code_version: string;
    cwd: string;
    tools: string[];
    mcp_servers: {
        name: string;
        status: string;
    }[];
    model: string;
    /**
     * Permission mode for controlling how tool executions are handled. 'default' - Standard behavior, prompts for dangerous operations. 'acceptEdits' - Auto-accept file edit operations. 'bypassPermissions' - Bypass all permission checks (requires allowDangerouslySkipPermissions). 'plan' - Planning mode, no actual tool execution. 'dontAsk' - Don't prompt for permissions, deny if not pre-approved.
     */
    permissionMode: PermissionMode;
    slash_commands: string[];
    output_style: string;
    skills: string[];
    plugins: {
        name: string;
        path: string;

    }[];
    fast_mode_state?: FastModeState;
    uuid: UUID;
    session_id: string;
};

export declare type SDKTaskNotificationMessage = {
    type: 'system';
    subtype: 'task_notification';
    task_id: string;
    tool_use_id?: string;
    status: 'completed' | 'failed' | 'stopped';
    output_file: string;
    summary: string;
    usage?: {
        total_tokens: number;
        tool_uses: number;
        duration_ms: number;
    };
    uuid: UUID;
    session_id: string;
};

export declare type SDKTaskProgressMessage = {
    type: 'system';
    subtype: 'task_progress';
    task_id: string;
    tool_use_id?: string;
    description: string;
    usage: {
        total_tokens: number;
        tool_uses: number;
        duration_ms: number;
    };
    last_tool_name?: string;
    summary?: string;

    uuid: UUID;
    session_id: string;
};

export declare type SDKTaskStartedMessage = {
    type: 'system';
    subtype: 'task_started';
    task_id: string;
    tool_use_id?: string;
    description: string;
    task_type?: string;
    /**
     * meta.name from the workflow script (e.g. 'spec'). Only set when task_type is 'local_workflow'.
     */
    workflow_name?: string;
    prompt?: string;
    uuid: UUID;
    session_id: string;
};

export declare type SDKToolProgressMessage = {
    type: 'tool_progress';
    tool_use_id: string;
    tool_name: string;
    parent_tool_use_id: string | null;
    elapsed_time_seconds: number;
    task_id?: string;
    uuid: UUID;
    session_id: string;
};

export declare type SDKToolUseSummaryMessage = {
    type: 'tool_use_summary';
    summary: string;
    preceding_tool_use_ids: string[];
    uuid: UUID;
    session_id: string;
};

export declare type SDKUserMessage = {
    type: 'user';
    message: MessageParam;
    parent_tool_use_id: string | null;
    isSynthetic?: boolean;
    tool_use_result?: unknown;
    priority?: 'now' | 'next' | 'later';
    /**
     * ISO timestamp when the message was created on the originating process. Older emitters omit it; consumers should fall back to receive time.
     */
    timestamp?: string;
    uuid?: UUID;
    session_id?: string;
};

export declare type SDKUserMessageReplay = {
    type: 'user';
    message: MessageParam;
    parent_tool_use_id: string | null;
    isSynthetic?: boolean;
    tool_use_result?: unknown;
    priority?: 'now' | 'next' | 'later';
    /**
     * ISO timestamp when the message was created on the originating process. Older emitters omit it; consumers should fall back to receive time.
     */
    timestamp?: string;
    uuid: UUID;
    session_id: string;
    isReplay: true;
};

export declare type SessionEndHookInput = BaseHookInput & {
    hook_event_name: 'SessionEnd';
    reason: ExitReason;
};

/**
 * A user or assistant message from a session transcript.
 * Returned by `getSessionMessages` for reading historical session data.
 */
export declare type SessionMessage = {
    type: 'user' | 'assistant';
    uuid: string;
    session_id: string;
    message: unknown;
    parent_tool_use_id: null;
};

/**
 * Options shared by session mutation functions (renameSession, tagSession,
 * deleteSession, forkSession).
 */
export declare type SessionMutationOptions = {
    /**
     * Project directory path (same semantics as `listSessions({ dir })`).
     * When omitted, all project directories are searched for the session file.
     */
    dir?: string;
};

export declare type SessionStartHookInput = BaseHookInput & {
    hook_event_name: 'SessionStart';
    source: 'startup' | 'resume' | 'clear' | 'compact';
    agent_type?: string;
    model?: string;
};

export declare type SessionStartHookSpecificOutput = {
    hookEventName: 'SessionStart';
    additionalContext?: string;
    initialUserMessage?: string;
    watchPaths?: string[];
};

/**
 * AUTO-GENERATED - DO NOT EDIT
 *
 * This file is auto-generated from the settings JSON schema.
 * To modify these types, edit SettingsSchema in src/utils/settings/types.ts and run:
 *
 *   bun scripts/generate-sdk-types.ts
 */
export declare interface Settings {
    /**
     * JSON Schema reference for Claude Code settings
     */
    $schema?: 'https://json.schemastore.org/claude-code-settings.json';
    /**
     * Path to a script that outputs authentication values
     */
    apiKeyHelper?: string;
    /**
     * Path to a script that exports AWS credentials
     */
    awsCredentialExport?: string;
    /**
     * Path to a script that refreshes AWS authentication
     */
    awsAuthRefresh?: string;
    /**
     * Command to refresh GCP authentication (e.g., gcloud auth application-default login)
     */
    gcpAuthRefresh?: string;
    /**
     * Custom file suggestion configuration for \@ mentions
     */
    fileSuggestion?: {
        type: 'command';
        command: string;
    };
    /**
     * Whether file picker should respect .gitignore files (default: true). Note: .ignore files are always respected.
     */
    respectGitignore?: boolean;
    /**
     * Number of days to retain chat transcripts (default: 30). Setting to 0 disables session persistence entirely: no transcripts are written and existing transcripts are deleted at startup.
     */
    cleanupPeriodDays?: number;
    /**
     * Environment variables to set for Claude Code sessions
     */
    env?: {
        [k: string]: string;
    };
    /**
     * Customize attribution text for commits and PRs. Each field defaults to the standard Claude Code attribution if not set.
     */
    attribution?: {
        /**
         * Attribution text for git commits, including any trailers. Empty string hides attribution.
         */
        commit?: string;
        /**
         * Attribution text for pull request descriptions. Empty string hides attribution.
         */
        pr?: string;
    };
    /**
     * Deprecated: Use attribution instead. Whether to include Claude's co-authored by attribution in commits and PRs (defaults to true)
     */
    includeCoAuthoredBy?: boolean;
    /**
     * Include built-in commit and PR workflow instructions in Claude's system prompt (default: true)
     */
    includeGitInstructions?: boolean;
    /**
     * Tool usage permissions configuration
     */
    permissions?: {
        /**
         * List of permission rules for allowed operations
         */
        allow?: string[];
        /**
         * List of permission rules for denied operations
         */
        deny?: string[];
        /**
         * List of permission rules that should always prompt for confirmation
         */
        ask?: string[];
        /**
         * Default permission mode when Claude Code needs access
         */
        defaultMode?: 'acceptEdits' | 'bypassPermissions' | 'default' | 'dontAsk' | 'plan';
        /**
         * Disable the ability to bypass permission prompts
         */
        disableBypassPermissionsMode?: 'disable';
        /**
         * Additional directories to include in the permission scope
         */
        additionalDirectories?: string[];
        [k: string]: unknown;
    };
    /**
     * Override the default model used by Claude Code
     */
    model?: string;
    /**
     * Allowlist of models that users can select. Accepts family aliases ("opus" allows any opus version), version prefixes ("opus-4-5" allows only that version), and full model IDs. If undefined, all models are available. If empty array, only the default model is available. Typically set in managed settings by enterprise administrators.
     */
    availableModels?: string[];
    /**
     * Override mapping from Anthropic model ID (e.g. "claude-opus-4-6") to provider-specific model ID (e.g. a Bedrock inference profile ARN). Typically set in managed settings by enterprise administrators.
     */
    modelOverrides?: {
        [k: string]: string;
    };
    /**
     * Whether to automatically approve all MCP servers in the project
     */
    enableAllProjectMcpServers?: boolean;
    /**
     * List of approved MCP servers from .mcp.json
     */
    enabledMcpjsonServers?: string[];
    /**
     * List of rejected MCP servers from .mcp.json
     */
    disabledMcpjsonServers?: string[];
    /**
     * Enterprise allowlist of MCP servers that can be used. Applies to all scopes including enterprise servers from managed-mcp.json. If undefined, all servers are allowed. If empty array, no servers are allowed. Denylist takes precedence - if a server is on both lists, it is denied.
     */
    allowedMcpServers?: {
        /**
         * Name of the MCP server that users are allowed to configure
         */
        serverName?: string;
        /**
         * Command array [command, ...args] to match exactly for allowed stdio servers
         *
         * \@minItems 1
         */
        serverCommand?: [string, ...string[]];
        /**
         * URL pattern with wildcard support (e.g., "https://*.example.com/*") for allowed remote MCP servers
         */
        serverUrl?: string;
    }[];
    /**
     * Enterprise denylist of MCP servers that are explicitly blocked. If a server is on the denylist, it will be blocked across all scopes including enterprise. Denylist takes precedence over allowlist - if a server is on both lists, it is denied.
     */
    deniedMcpServers?: {
        /**
         * Name of the MCP server that is explicitly blocked
         */
        serverName?: string;
        /**
         * Command array [command, ...args] to match exactly for blocked stdio servers
         *
         * \@minItems 1
         */
        serverCommand?: [string, ...string[]];
        /**
         * URL pattern with wildcard support (e.g., "https://*.example.com/*") for blocked remote MCP servers
         */
        serverUrl?: string;
    }[];
    /**
     * Custom commands to run before/after tool executions
     */
    hooks?: {
        [k: string]: {
            /**
             * String pattern to match (e.g. tool names like "Write")
             */
            matcher?: string;
            /**
             * List of hooks to execute when the matcher matches
             */
            hooks: ({
                /**
                 * Shell command hook type
                 */
                type: 'command';
                /**
                 * Shell command to execute
                 */
                command: string;
                /**
                 * Permission rule syntax to filter when this hook runs (e.g., "Bash(git *)"). Only runs if the tool call matches the pattern. Avoids spawning hooks for non-matching commands.
                 */
                if?: string;
                /**
                 * Shell interpreter. 'bash' uses your $SHELL (bash/zsh/sh); 'powershell' uses pwsh. Defaults to bash.
                 */
                shell?: 'bash' | 'powershell';
                /**
                 * Timeout in seconds for this specific command
                 */
                timeout?: number;
                /**
                 * Custom status message to display in spinner while hook runs
                 */
                statusMessage?: string;
                /**
                 * If true, hook runs once and is removed after execution
                 */
                once?: boolean;
                /**
                 * If true, hook runs in background without blocking
                 */
                async?: boolean;
                /**
                 * If true, hook runs in background and wakes the model on exit code 2 (blocking error). Implies async.
                 */
                asyncRewake?: boolean;
            } | {
                /**
                 * LLM prompt hook type
                 */
                type: 'prompt';
                /**
                 * Prompt to evaluate with LLM. Use $ARGUMENTS placeholder for hook input JSON.
                 */
                prompt: string;
                /**
                 * Permission rule syntax to filter when this hook runs (e.g., "Bash(git *)"). Only runs if the tool call matches the pattern. Avoids spawning hooks for non-matching commands.
                 */
                if?: string;
                /**
                 * Timeout in seconds for this specific prompt evaluation
                 */
                timeout?: number;
                /**
                 * Model to use for this prompt hook (e.g., "claude-sonnet-4-6"). If not specified, uses the default small fast model.
                 */
                model?: string;
                /**
                 * Custom status message to display in spinner while hook runs
                 */
                statusMessage?: string;
                /**
                 * If true, hook runs once and is removed after execution
                 */
                once?: boolean;
            } | {
                /**
                 * Agentic verifier hook type
                 */
                type: 'agent';
                /**
                 * Prompt describing what to verify (e.g. "Verify that unit tests ran and passed."). Use $ARGUMENTS placeholder for hook input JSON.
                 */
                prompt: string;
                /**
                 * Permission rule syntax to filter when this hook runs (e.g., "Bash(git *)"). Only runs if the tool call matches the pattern. Avoids spawning hooks for non-matching commands.
                 */
                if?: string;
                /**
                 * Timeout in seconds for agent execution (default 60)
                 */
                timeout?: number;
                /**
                 * Model to use for this agent hook (e.g., "claude-sonnet-4-6"). If not specified, uses Haiku.
                 */
                model?: string;
                /**
                 * Custom status message to display in spinner while hook runs
                 */
                statusMessage?: string;
                /**
                 * If true, hook runs once and is removed after execution
                 */
                once?: boolean;
            } | {
                /**
                 * HTTP hook type
                 */
                type: 'http';
                /**
                 * URL to POST the hook input JSON to
                 */
                url: string;
                /**
                 * Permission rule syntax to filter when this hook runs (e.g., "Bash(git *)"). Only runs if the tool call matches the pattern. Avoids spawning hooks for non-matching commands.
                 */
                if?: string;
                /**
                 * Timeout in seconds for this specific request
                 */
                timeout?: number;
                /**
                 * Additional headers to include in the request. Values may reference environment variables using $VAR_NAME or ${VAR_NAME} syntax (e.g., "Authorization": "Bearer $MY_TOKEN"). Only variables listed in allowedEnvVars will be interpolated.
                 */
                headers?: {
                    [k: string]: string;
                };
                /**
                 * Explicit list of environment variable names that may be interpolated in header values. Only variables listed here will be resolved; all other $VAR references are left as empty strings. Required for env var interpolation to work.
                 */
                allowedEnvVars?: string[];
                /**
                 * Custom status message to display in spinner while hook runs
                 */
                statusMessage?: string;
                /**
                 * If true, hook runs once and is removed after execution
                 */
                once?: boolean;
            })[];
        }[];
    };
    /**
     * Git worktree configuration for --worktree flag.
     */
    worktree?: {
        /**
         * Directories to symlink from main repository to worktrees to avoid disk bloat. Must be explicitly configured - no directories are symlinked by default. Common examples: "node_modules", ".cache", ".bin"
         */
        symlinkDirectories?: string[];
        /**
         * Directories to include when creating worktrees, via git sparse-checkout (cone mode). Dramatically faster in large monorepos — only the listed paths are written to disk.
         */
        sparsePaths?: string[];
    };
    /**
     * Disable all hooks and statusLine execution
     */
    disableAllHooks?: boolean;
    /**
     * Default shell for input-box ! commands. Defaults to 'bash' on all platforms (no Windows auto-flip).
     */
    defaultShell?: 'bash' | 'powershell';
    /**
     * When true (and set in managed settings), only hooks from managed settings run. User, project, and local hooks are ignored.
     */
    allowManagedHooksOnly?: boolean;
    /**
     * Allowlist of URL patterns that HTTP hooks may target. Supports * as a wildcard (e.g. "https://hooks.example.com/*"). When set, HTTP hooks with non-matching URLs are blocked. If undefined, all URLs are allowed. If empty array, no HTTP hooks are allowed. Arrays merge across settings sources (same semantics as allowedMcpServers).
     */
    allowedHttpHookUrls?: string[];
    /**
     * Allowlist of environment variable names HTTP hooks may interpolate into headers. When set, each hook's effective allowedEnvVars is the intersection with this list. If undefined, no restriction is applied. Arrays merge across settings sources (same semantics as allowedMcpServers).
     */
    httpHookAllowedEnvVars?: string[];
    /**
     * When true (and set in managed settings), only permission rules (allow/deny/ask) from managed settings are respected. User, project, local, and CLI argument permission rules are ignored.
     */
    allowManagedPermissionRulesOnly?: boolean;
    /**
     * When true (and set in managed settings), allowedMcpServers is only read from managed settings. deniedMcpServers still merges from all sources, so users can deny servers for themselves. Users can still add their own MCP servers, but only the admin-defined allowlist applies.
     */
    allowManagedMcpServersOnly?: boolean;
    /**
     * When set in managed settings, blocks non-plugin customization sources for the listed surfaces. Array form locks specific surfaces (e.g. ["skills", "hooks"]); `true` locks all four; `false` is an explicit no-op. Blocked: ~/.claude/{surface}/, .claude/{surface}/ (project), settings.json hooks, .mcp.json. NOT blocked: managed (policySettings) sources, plugin-provided customizations. Composes with strictKnownMarketplaces for end-to-end admin control — plugins gated by marketplace allowlist, everything else blocked here.
     */
    strictPluginOnlyCustomization?: boolean | ('skills' | 'agents' | 'hooks' | 'mcp')[];
    /**
     * Custom status line display configuration
     */
    statusLine?: {
        type: 'command';
        command: string;
        padding?: number;
    };
    /**
     * Enabled plugins using plugin-id\@marketplace-id format. Example: { "formatter\@anthropic-tools": true }. Also supports extended format with version constraints.
     */
    enabledPlugins?: {
        [k: string]: string[] | boolean | {
            [k: string]: unknown;
        };
    };
    /**
     * Additional marketplaces to make available for this repository. Typically used in repository .claude/settings.json to ensure team members have required plugin sources.
     */
    extraKnownMarketplaces?: {
        [k: string]: {
            /**
             * Where to fetch the marketplace from
             */
            source: {
                source: 'url';
                /**
                 * Direct URL to marketplace.json file
                 */
                url: string;
                /**
                 * Custom HTTP headers (e.g., for authentication)
                 */
                headers?: {
                    [k: string]: string;
                };
            } | {
                source: 'github';
                /**
                 * GitHub repository in owner/repo format
                 */
                repo: string;
                /**
                 * Git branch or tag to use (e.g., "main", "v1.0.0"). Defaults to repository default branch.
                 */
                ref?: string;
                /**
                 * Path to marketplace.json within repo (defaults to .claude-plugin/marketplace.json)
                 */
                path?: string;
                /**
                 * Directories to include via git sparse-checkout (cone mode). Use for monorepos where the marketplace lives in a subdirectory. Example: [".claude-plugin", "plugins"]. If omitted, the full repository is cloned.
                 */
                sparsePaths?: string[];
            } | {
                source: 'git';
                /**
                 * Full git repository URL
                 */
                url: string;
                /**
                 * Git branch or tag to use (e.g., "main", "v1.0.0"). Defaults to repository default branch.
                 */
                ref?: string;
                /**
                 * Path to marketplace.json within repo (defaults to .claude-plugin/marketplace.json)
                 */
                path?: string;
                /**
                 * Directories to include via git sparse-checkout (cone mode). Use for monorepos where the marketplace lives in a subdirectory. Example: [".claude-plugin", "plugins"]. If omitted, the full repository is cloned.
                 */
                sparsePaths?: string[];
            } | {
                source: 'npm';
                /**
                 * NPM package containing marketplace.json
                 */
                package: string;
            } | {
                source: 'file';
                /**
                 * Local file path to marketplace.json
                 */
                path: string;
            } | {
                source: 'directory';
                /**
                 * Local directory containing .claude-plugin/marketplace.json
                 */
                path: string;
            } | {
                source: 'hostPattern';
                /**
                 * Regex pattern to match the host/domain extracted from any marketplace source type. For github sources, matches against "github.com". For git sources (SSH or HTTPS), extracts the hostname from the URL. Use in strictKnownMarketplaces to allow all marketplaces from a specific host (e.g., "^github\.mycompany\.com$").
                 */
                hostPattern: string;
            } | {
                source: 'pathPattern';
                /**
                 * Regex pattern matched against the .path field of file and directory sources. Use in strictKnownMarketplaces to allow filesystem-based marketplaces alongside hostPattern restrictions for network sources. Use ".*" to allow all filesystem paths, or a narrower pattern (e.g., "^/opt/approved/") to restrict to specific directories.
                 */
                pathPattern: string;
            } | {
                source: 'settings';
                /**
                 * Marketplace name. Must match the extraKnownMarketplaces key (enforced); the synthetic manifest is written under this name. Same validation as PluginMarketplaceSchema plus reserved-name rejection — validateOfficialNameSource runs after the disk write, too late to clean up.
                 */
                name: string;
                /**
                 * Plugin entries declared inline in settings.json
                 */
                plugins: {
                    /**
                     * Plugin name as it appears in the target repository
                     */
                    name: string;
                    /**
                     * Where to fetch the plugin from. Must be a remote source — relative paths have no marketplace repository to resolve against.
                     */
                    source: string | {
                        source: 'npm';
                        /**
                         * Package name (or url, or local path, or anything else that can be passed to `npm` as a package)
                         */
                        package: string;
                        /**
                         * Specific version or version range (e.g., ^1.0.0, ~2.1.0)
                         */
                        version?: string;
                        /**
                         * Custom NPM registry URL (defaults to using system default, likely npmjs.org)
                         */
                        registry?: string;
                    } | {
                        source: 'pip';
                        /**
                         * Python package name as it appears on PyPI
                         */
                        package: string;
                        /**
                         * Version specifier (e.g., ==1.0.0, >=2.0.0, <3.0.0)
                         */
                        version?: string;
                        /**
                         * Custom PyPI registry URL (defaults to using system default, likely pypi.org)
                         */
                        registry?: string;
                    } | {
                        source: 'url';
                        /**
                         * Full git repository URL (https:// or git\@)
                         */
                        url: string;
                        /**
                         * Git branch or tag to use (e.g., "main", "v1.0.0"). Defaults to repository default branch.
                         */
                        ref?: string;
                        /**
                         * Specific commit SHA to use
                         */
                        sha?: string;
                    } | {
                        source: 'github';
                        /**
                         * GitHub repository in owner/repo format
                         */
                        repo: string;
                        /**
                         * Git branch or tag to use (e.g., "main", "v1.0.0"). Defaults to repository default branch.
                         */
                        ref?: string;
                        /**
                         * Specific commit SHA to use
                         */
                        sha?: string;
                    } | {
                        source: 'git-subdir';
                        /**
                         * Git repository: GitHub owner/repo shorthand, https://, or git\@ URL
                         */
                        url: string;
                        /**
                         * Subdirectory within the repo containing the plugin (e.g., "tools/claude-plugin"). Cloned sparsely using partial clone (--filter=tree:0) to minimize bandwidth for monorepos.
                         */
                        path: string;
                        /**
                         * Git branch or tag to use (e.g., "main", "v1.0.0"). Defaults to repository default branch.
                         */
                        ref?: string;
                        /**
                         * Specific commit SHA to use
                         */
                        sha?: string;
                    };
                    description?: string;
                    version?: string;
                    strict?: boolean;
                }[];
                owner?: {
                    /**
                     * Display name of the plugin author or organization
                     */
                    name: string;
                    /**
                     * Contact email for support or feedback
                     */
                    email?: string;
                    /**
                     * Website, GitHub profile, or organization URL
                     */
                    url?: string;
                };
            };
            /**
             * Local cache path where marketplace manifest is stored (auto-generated if not provided)
             */
            installLocation?: string;
            /**
             * Whether to automatically update this marketplace and its installed plugins on startup
             */
            autoUpdate?: boolean;
        };
    };
    /**
     * Enterprise strict list of allowed marketplace sources. When set in managed settings, ONLY these exact sources can be added as marketplaces. The check happens BEFORE downloading, so blocked sources never touch the filesystem. Note: this is a policy gate only — it does NOT register marketplaces. To pre-register allowed marketplaces for users, also set extraKnownMarketplaces.
     */
    strictKnownMarketplaces?: ({
        source: 'url';
        /**
         * Direct URL to marketplace.json file
         */
        url: string;
        /**
         * Custom HTTP headers (e.g., for authentication)
         */
        headers?: {
            [k: string]: string;
        };
    } | {
        source: 'github';
        /**
         * GitHub repository in owner/repo format
         */
        repo: string;
        /**
         * Git branch or tag to use (e.g., "main", "v1.0.0"). Defaults to repository default branch.
         */
        ref?: string;
        /**
         * Path to marketplace.json within repo (defaults to .claude-plugin/marketplace.json)
         */
        path?: string;
        /**
         * Directories to include via git sparse-checkout (cone mode). Use for monorepos where the marketplace lives in a subdirectory. Example: [".claude-plugin", "plugins"]. If omitted, the full repository is cloned.
         */
        sparsePaths?: string[];
    } | {
        source: 'git';
        /**
         * Full git repository URL
         */
        url: string;
        /**
         * Git branch or tag to use (e.g., "main", "v1.0.0"). Defaults to repository default branch.
         */
        ref?: string;
        /**
         * Path to marketplace.json within repo (defaults to .claude-plugin/marketplace.json)
         */
        path?: string;
        /**
         * Directories to include via git sparse-checkout (cone mode). Use for monorepos where the marketplace lives in a subdirectory. Example: [".claude-plugin", "plugins"]. If omitted, the full repository is cloned.
         */
        sparsePaths?: string[];
    } | {
        source: 'npm';
        /**
         * NPM package containing marketplace.json
         */
        package: string;
    } | {
        source: 'file';
        /**
         * Local file path to marketplace.json
         */
        path: string;
    } | {
        source: 'directory';
        /**
         * Local directory containing .claude-plugin/marketplace.json
         */
        path: string;
    } | {
        source: 'hostPattern';
        /**
         * Regex pattern to match the host/domain extracted from any marketplace source type. For github sources, matches against "github.com". For git sources (SSH or HTTPS), extracts the hostname from the URL. Use in strictKnownMarketplaces to allow all marketplaces from a specific host (e.g., "^github\.mycompany\.com$").
         */
        hostPattern: string;
    } | {
        source: 'pathPattern';
        /**
         * Regex pattern matched against the .path field of file and directory sources. Use in strictKnownMarketplaces to allow filesystem-based marketplaces alongside hostPattern restrictions for network sources. Use ".*" to allow all filesystem paths, or a narrower pattern (e.g., "^/opt/approved/") to restrict to specific directories.
         */
        pathPattern: string;
    } | {
        source: 'settings';
        /**
         * Marketplace name. Must match the extraKnownMarketplaces key (enforced); the synthetic manifest is written under this name. Same validation as PluginMarketplaceSchema plus reserved-name rejection — validateOfficialNameSource runs after the disk write, too late to clean up.
         */
        name: string;
        /**
         * Plugin entries declared inline in settings.json
         */
        plugins: {
            /**
             * Plugin name as it appears in the target repository
             */
            name: string;
            /**
             * Where to fetch the plugin from. Must be a remote source — relative paths have no marketplace repository to resolve against.
             */
            source: string | {
                source: 'npm';
                /**
                 * Package name (or url, or local path, or anything else that can be passed to `npm` as a package)
                 */
                package: string;
                /**
                 * Specific version or version range (e.g., ^1.0.0, ~2.1.0)
                 */
                version?: string;
                /**
                 * Custom NPM registry URL (defaults to using system default, likely npmjs.org)
                 */
                registry?: string;
            } | {
                source: 'pip';
                /**
                 * Python package name as it appears on PyPI
                 */
                package: string;
                /**
                 * Version specifier (e.g., ==1.0.0, >=2.0.0, <3.0.0)
                 */
                version?: string;
                /**
                 * Custom PyPI registry URL (defaults to using system default, likely pypi.org)
                 */
                registry?: string;
            } | {
                source: 'url';
                /**
                 * Full git repository URL (https:// or git\@)
                 */
                url: string;
                /**
                 * Git branch or tag to use (e.g., "main", "v1.0.0"). Defaults to repository default branch.
                 */
                ref?: string;
                /**
                 * Specific commit SHA to use
                 */
                sha?: string;
            } | {
                source: 'github';
                /**
                 * GitHub repository in owner/repo format
                 */
                repo: string;
                /**
                 * Git branch or tag to use (e.g., "main", "v1.0.0"). Defaults to repository default branch.
                 */
                ref?: string;
                /**
                 * Specific commit SHA to use
                 */
                sha?: string;
            } | {
                source: 'git-subdir';
                /**
                 * Git repository: GitHub owner/repo shorthand, https://, or git\@ URL
                 */
                url: string;
                /**
                 * Subdirectory within the repo containing the plugin (e.g., "tools/claude-plugin"). Cloned sparsely using partial clone (--filter=tree:0) to minimize bandwidth for monorepos.
                 */
                path: string;
                /**
                 * Git branch or tag to use (e.g., "main", "v1.0.0"). Defaults to repository default branch.
                 */
                ref?: string;
                /**
                 * Specific commit SHA to use
                 */
                sha?: string;
            };
            description?: string;
            version?: string;
            strict?: boolean;
        }[];
        owner?: {
            /**
             * Display name of the plugin author or organization
             */
            name: string;
            /**
             * Contact email for support or feedback
             */
            email?: string;
            /**
             * Website, GitHub profile, or organization URL
             */
            url?: string;
        };
    })[];
    /**
     * Enterprise blocklist of marketplace sources. When set in managed settings, these exact sources are blocked from being added as marketplaces. The check happens BEFORE downloading, so blocked sources never touch the filesystem.
     */
    blockedMarketplaces?: ({
        source: 'url';
        /**
         * Direct URL to marketplace.json file
         */
        url: string;
        /**
         * Custom HTTP headers (e.g., for authentication)
         */
        headers?: {
            [k: string]: string;
        };
    } | {
        source: 'github';
        /**
         * GitHub repository in owner/repo format
         */
        repo: string;
        /**
         * Git branch or tag to use (e.g., "main", "v1.0.0"). Defaults to repository default branch.
         */
        ref?: string;
        /**
         * Path to marketplace.json within repo (defaults to .claude-plugin/marketplace.json)
         */
        path?: string;
        /**
         * Directories to include via git sparse-checkout (cone mode). Use for monorepos where the marketplace lives in a subdirectory. Example: [".claude-plugin", "plugins"]. If omitted, the full repository is cloned.
         */
        sparsePaths?: string[];
    } | {
        source: 'git';
        /**
         * Full git repository URL
         */
        url: string;
        /**
         * Git branch or tag to use (e.g., "main", "v1.0.0"). Defaults to repository default branch.
         */
        ref?: string;
        /**
         * Path to marketplace.json within repo (defaults to .claude-plugin/marketplace.json)
         */
        path?: string;
        /**
         * Directories to include via git sparse-checkout (cone mode). Use for monorepos where the marketplace lives in a subdirectory. Example: [".claude-plugin", "plugins"]. If omitted, the full repository is cloned.
         */
        sparsePaths?: string[];
    } | {
        source: 'npm';
        /**
         * NPM package containing marketplace.json
         */
        package: string;
    } | {
        source: 'file';
        /**
         * Local file path to marketplace.json
         */
        path: string;
    } | {
        source: 'directory';
        /**
         * Local directory containing .claude-plugin/marketplace.json
         */
        path: string;
    } | {
        source: 'hostPattern';
        /**
         * Regex pattern to match the host/domain extracted from any marketplace source type. For github sources, matches against "github.com". For git sources (SSH or HTTPS), extracts the hostname from the URL. Use in strictKnownMarketplaces to allow all marketplaces from a specific host (e.g., "^github\.mycompany\.com$").
         */
        hostPattern: string;
    } | {
        source: 'pathPattern';
        /**
         * Regex pattern matched against the .path field of file and directory sources. Use in strictKnownMarketplaces to allow filesystem-based marketplaces alongside hostPattern restrictions for network sources. Use ".*" to allow all filesystem paths, or a narrower pattern (e.g., "^/opt/approved/") to restrict to specific directories.
         */
        pathPattern: string;
    } | {
        source: 'settings';
        /**
         * Marketplace name. Must match the extraKnownMarketplaces key (enforced); the synthetic manifest is written under this name. Same validation as PluginMarketplaceSchema plus reserved-name rejection — validateOfficialNameSource runs after the disk write, too late to clean up.
         */
        name: string;
        /**
         * Plugin entries declared inline in settings.json
         */
        plugins: {
            /**
             * Plugin name as it appears in the target repository
             */
            name: string;
            /**
             * Where to fetch the plugin from. Must be a remote source — relative paths have no marketplace repository to resolve against.
             */
            source: string | {
                source: 'npm';
                /**
                 * Package name (or url, or local path, or anything else that can be passed to `npm` as a package)
                 */
                package: string;
                /**
                 * Specific version or version range (e.g., ^1.0.0, ~2.1.0)
                 */
                version?: string;
                /**
                 * Custom NPM registry URL (defaults to using system default, likely npmjs.org)
                 */
                registry?: string;
            } | {
                source: 'pip';
                /**
                 * Python package name as it appears on PyPI
                 */
                package: string;
                /**
                 * Version specifier (e.g., ==1.0.0, >=2.0.0, <3.0.0)
                 */
                version?: string;
                /**
                 * Custom PyPI registry URL (defaults to using system default, likely pypi.org)
                 */
                registry?: string;
            } | {
                source: 'url';
                /**
                 * Full git repository URL (https:// or git\@)
                 */
                url: string;
                /**
                 * Git branch or tag to use (e.g., "main", "v1.0.0"). Defaults to repository default branch.
                 */
                ref?: string;
                /**
                 * Specific commit SHA to use
                 */
                sha?: string;
            } | {
                source: 'github';
                /**
                 * GitHub repository in owner/repo format
                 */
                repo: string;
                /**
                 * Git branch or tag to use (e.g., "main", "v1.0.0"). Defaults to repository default branch.
                 */
                ref?: string;
                /**
                 * Specific commit SHA to use
                 */
                sha?: string;
            } | {
                source: 'git-subdir';
                /**
                 * Git repository: GitHub owner/repo shorthand, https://, or git\@ URL
                 */
                url: string;
                /**
                 * Subdirectory within the repo containing the plugin (e.g., "tools/claude-plugin"). Cloned sparsely using partial clone (--filter=tree:0) to minimize bandwidth for monorepos.
                 */
                path: string;
                /**
                 * Git branch or tag to use (e.g., "main", "v1.0.0"). Defaults to repository default branch.
                 */
                ref?: string;
                /**
                 * Specific commit SHA to use
                 */
                sha?: string;
            };
            description?: string;
            version?: string;
            strict?: boolean;
        }[];
        owner?: {
            /**
             * Display name of the plugin author or organization
             */
            name: string;
            /**
             * Contact email for support or feedback
             */
            email?: string;
            /**
             * Website, GitHub profile, or organization URL
             */
            url?: string;
        };
    })[];
    /**
     * Force a specific login method: "claudeai" for Claude Pro/Max, "console" for Console billing
     */
    forceLoginMethod?: 'claudeai' | 'console';
    /**
     * Organization UUID to use for OAuth login
     */
    forceLoginOrgUUID?: string;
    /**
     * Path to a script that outputs OpenTelemetry headers
     */
    otelHeadersHelper?: string;
    /**
     * Controls the output style for assistant responses
     */
    outputStyle?: string;
    /**
     * Preferred language for Claude responses and voice dictation (e.g., "japanese", "spanish")
     */
    language?: string;
    /**
     * Skip the WebFetch blocklist check for enterprise environments with restrictive security policies
     */
    skipWebFetchPreflight?: boolean;
    sandbox?: {
        enabled?: boolean;
        /**
         * Exit with an error at startup if sandbox.enabled is true but the sandbox cannot start (missing dependencies, unsupported platform, or platform not in enabledPlatforms). When false (default), a warning is shown and commands run unsandboxed. Intended for managed-settings deployments that require sandboxing as a hard gate.
         */
        failIfUnavailable?: boolean;
        autoAllowBashIfSandboxed?: boolean;
        /**
         * Allow commands to run outside the sandbox via the dangerouslyDisableSandbox parameter. When false, the dangerouslyDisableSandbox parameter is completely ignored and all commands must run sandboxed. Default: true.
         */
        allowUnsandboxedCommands?: boolean;
        network?: {
            allowedDomains?: string[];
            /**
             * When true (and set in managed settings), only allowedDomains and WebFetch(domain:...) allow rules from managed settings are respected. User, project, local, and flag settings domains are ignored. Denied domains are still respected from all sources.
             */
            allowManagedDomainsOnly?: boolean;
            /**
             * macOS only: Unix socket paths to allow. Ignored on Linux (seccomp cannot filter by path).
             */
            allowUnixSockets?: string[];
            /**
             * If true, allow all Unix sockets (disables blocking on both platforms).
             */
            allowAllUnixSockets?: boolean;
            allowLocalBinding?: boolean;
            httpProxyPort?: number;
            socksProxyPort?: number;
        };
        filesystem?: {
            /**
             * Additional paths to allow writing within the sandbox. Merged with paths from Edit(...) allow permission rules.
             */
            allowWrite?: string[];
            /**
             * Additional paths to deny writing within the sandbox. Merged with paths from Edit(...) deny permission rules.
             */
            denyWrite?: string[];
            /**
             * Additional paths to deny reading within the sandbox. Merged with paths from Read(...) deny permission rules.
             */
            denyRead?: string[];
            /**
             * Paths to re-allow reading within denyRead regions. Takes precedence over denyRead for matching paths.
             */
            allowRead?: string[];
            /**
             * When true (set in managed settings), only allowRead paths from policySettings are used.
             */
            allowManagedReadPathsOnly?: boolean;
        };
        ignoreViolations?: {
            [k: string]: string[];
        };
        enableWeakerNestedSandbox?: boolean;
        /**
         * macOS only: Allow access to com.apple.trustd.agent in the sandbox. Needed for Go-based CLI tools (gh, gcloud, terraform, etc.) to verify TLS certificates when using httpProxyPort with a MITM proxy and custom CA. **Reduces security** — opens a potential data exfiltration vector through the trustd service. Default: false
         */
        enableWeakerNetworkIsolation?: boolean;
        excludedCommands?: string[];
        /**
         * Custom ripgrep configuration for bundled ripgrep support
         */
        ripgrep?: {
            command: string;
            args?: string[];
        };
        [k: string]: unknown;
    };
    /**
     * Probability (0–1) that the session quality survey appears when eligible. 0.05 is a reasonable starting point.
     */
    feedbackSurveyRate?: number;
    /**
     * Whether to show tips in the spinner
     */
    spinnerTipsEnabled?: boolean;
    /**
     * Customize spinner verbs. mode: "append" adds verbs to defaults, "replace" uses only your verbs.
     */
    spinnerVerbs?: {
        mode: 'append' | 'replace';
        verbs: string[];
    };
    /**
     * Override spinner tips. tips: array of tip strings. excludeDefault: if true, only show custom tips (default: false).
     */
    spinnerTipsOverride?: {
        excludeDefault?: boolean;
        tips: string[];
    };
    /**
     * Whether to disable syntax highlighting in diffs
     */
    syntaxHighlightingDisabled?: boolean;
    /**
     * Whether /rename updates the terminal tab title (defaults to true). Set to false to keep auto-generated topic titles.
     */
    terminalTitleFromRename?: boolean;
    /**
     * When false, thinking is disabled. When absent or true, thinking is enabled automatically for supported models.
     */
    alwaysThinkingEnabled?: boolean;
    /**
     * Persisted effort level for supported models.
     */
    effortLevel?: 'low' | 'medium' | 'high';
    /**
     * Advisor model for the server-side advisor tool.
     */
    advisorModel?: string;
    /**
     * When true, fast mode is enabled. When absent or false, fast mode is off.
     */
    fastMode?: boolean;
    /**
     * When true, fast mode does not persist across sessions. Each session starts with fast mode off.
     */
    fastModePerSessionOptIn?: boolean;
    /**
     * When false, prompt suggestions are disabled. When absent or true, prompt suggestions are enabled.
     */
    promptSuggestionEnabled?: boolean;
    /**
     * When true, the plan-approval dialog offers a "clear context" option. Defaults to false.
     */
    showClearContextOnPlanAccept?: boolean;
    /**
     * Name of an agent (built-in or custom) to use for the main thread. Applies the agent's system prompt, tool restrictions, and model.
     */
    agent?: string;
    /**
     * Company announcements to display at startup (one will be randomly selected if multiple are provided)
     */
    companyAnnouncements?: string[];
    /**
     * Per-plugin configuration including MCP server user configs, keyed by plugin ID (plugin\@marketplace format)
     */
    pluginConfigs?: {
        [k: string]: {
            /**
             * User configuration values for MCP servers keyed by server name
             */
            mcpServers?: {
                [k: string]: {
                    [k: string]: string | number | boolean | string[];
                };
            };
            /**
             * Non-sensitive option values from plugin manifest userConfig, keyed by option name. Sensitive values go to secure storage instead.
             */
            options?: {
                [k: string]: string | number | boolean | string[];
            };
        };
    };
    /**
     * Remote session configuration
     */
    remote?: {
        /**
         * Default environment ID to use for remote sessions
         */
        defaultEnvironmentId?: string;
    };
    /**
     * Release channel for auto-updates (latest or stable)
     */
    autoUpdatesChannel?: 'latest' | 'stable';
    /**
     * Minimum version to stay on - prevents downgrades when switching to stable channel
     */
    minimumVersion?: string;
    /**
     * Custom directory for plan files, relative to project root. If not set, defaults to ~/.claude/plans/
     */
    plansDirectory?: string;
    /**
     * Teams/Enterprise opt-in for channel notifications (MCP servers with the claude/channel capability pushing inbound messages). Default off. Set true to allow; users then select servers via --channels.
     */
    channelsEnabled?: boolean;
    /**
     * Teams/Enterprise allowlist of channel plugins. When set, replaces the default Anthropic allowlist — admins decide which plugins may push inbound messages. Undefined falls back to the default. Requires channelsEnabled: true.
     */
    allowedChannelPlugins?: {
        marketplace: string;
        plugin: string;
    }[];
    /**
     * Reduce or disable animations for accessibility (spinner shimmer, flash effects, etc.)
     */
    prefersReducedMotion?: boolean;
    /**
     * Enable auto-memory for this project. When false, Claude will not read from or write to the auto-memory directory.
     */
    autoMemoryEnabled?: boolean;
    /**
     * Custom directory path for auto-memory storage. Supports ~/ prefix for home directory expansion. Ignored if set in projectSettings (checked-in .claude/settings.json) for security. When unset, defaults to ~/.claude/projects/<sanitized-cwd>/memory/.
     */
    autoMemoryDirectory?: string;
    /**
     * Enable background memory consolidation (auto-dream). When set, overrides the server-side default.
     */
    autoDreamEnabled?: boolean;
    /**
     * Show thinking summaries in the transcript view (ctrl+o). Default: false.
     */
    showThinkingSummaries?: boolean;
    /**
     * Whether the user has accepted the bypass permissions mode dialog
     */
    skipDangerousModePermissionPrompt?: boolean;
    /**
     * Disable auto mode
     */
    disableAutoMode?: 'disable';
    /**
     * SSH connection configurations for remote environments. Typically set in managed settings by enterprise administrators to pre-configure SSH connections for team members.
     */
    sshConfigs?: {
        /**
         * Unique identifier for this SSH config. Used to match configs across settings sources.
         */
        id: string;
        /**
         * Display name for the SSH connection
         */
        name: string;
        /**
         * SSH host in format "user\@hostname" or "hostname", or a host alias from ~/.ssh/config
         */
        sshHost: string;
        /**
         * SSH port (default: 22)
         */
        sshPort?: number;
        /**
         * Path to SSH identity file (private key)
         */
        sshIdentityFile?: string;
        /**
         * Default working directory on the remote host. Supports tilde expansion (e.g. ~/projects). If not specified, defaults to the remote user home directory. Can be overridden by the [dir] positional argument in `claude ssh <config> [dir]`.
         */
        startDirectory?: string;
    }[];
    /**
     * Glob patterns or absolute paths of CLAUDE.md files to exclude from loading. Patterns are matched against absolute file paths using picomatch. Only applies to User, Project, and Local memory types (Managed/policy files cannot be excluded). Examples: "/home/user/monorepo/CLAUDE.md", "** /code/CLAUDE.md", "** /some-dir/.claude/rules/**"
     */
    claudeMdExcludes?: string[];
    /**
     * Custom message to append to the plugin trust warning shown before installation. Only read from policy settings (managed-settings.json / MDM). Useful for enterprise administrators to add organization-specific context (e.g., "All plugins from our internal marketplace are vetted and approved.").
     */
    pluginTrustMessage?: string;
    [k: string]: unknown;
}

/**
 * Source for loading filesystem-based settings. 'user' - Global user settings (~/.claude/settings.json). 'project' - Project settings (.claude/settings.json). 'local' - Local settings (.claude/settings.local.json).
 */
export declare type SettingSource = 'user' | 'project' | 'local';

export declare type SetupHookInput = BaseHookInput & {
    hook_event_name: 'Setup';
    trigger: 'init' | 'maintenance';
};

export declare type SetupHookSpecificOutput = {
    hookEventName: 'Setup';
    additionalContext?: string;
};

/**
 * Information about an available skill (invoked via /command syntax).
 */
export declare type SlashCommand = {
    /**
     * Skill name (without the leading slash)
     */
    name: string;
    /**
     * Description of what the skill does
     */
    description: string;
    /**
     * Hint for skill arguments (e.g., "<file>")
     */
    argumentHint: string;
};

/**
 * Represents a spawned process with stdin/stdout streams and lifecycle management.
 * Implementers provide this interface to abstract the process spawning mechanism.
 * ChildProcess already satisfies this interface.
 */
export declare interface SpawnedProcess {
    /** Writable stream for sending data to the process stdin */
    stdin: Writable;
    /** Readable stream for receiving data from the process stdout */
    stdout: Readable;
    /** Whether the process has been killed */
    readonly killed: boolean;
    /** Exit code if the process has exited, null otherwise */
    readonly exitCode: number | null;
    /**
     * Kill the process with the given signal
     * @param signal - The signal to send (e.g., 'SIGTERM', 'SIGKILL')
     */
    kill(signal: NodeJS.Signals): boolean;
    /**
     * Register a callback for when the process exits
     * @param event - Must be 'exit'
     * @param listener - Callback receiving exit code and signal
     */
    on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): void;
    /**
     * Register a callback for process errors
     * @param event - Must be 'error'
     * @param listener - Callback receiving the error
     */
    on(event: 'error', listener: (error: Error) => void): void;
    /**
     * Register a one-time callback for when the process exits
     */
    once(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): void;
    once(event: 'error', listener: (error: Error) => void): void;
    /**
     * Remove an event listener
     */
    off(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): void;
    off(event: 'error', listener: (error: Error) => void): void;
}

/**
 * Options passed to the spawn function.
 */
export declare interface SpawnOptions {
    /** Command to execute */
    command: string;
    /** Arguments to pass to the command */
    args: string[];
    /** Working directory */
    cwd?: string;
    /** Environment variables */
    env: {
        [envVar: string]: string | undefined;
    };
    /** Abort signal for cancellation */
    signal: AbortSignal;
}

declare type StdoutMessage = coreTypes.SDKMessage | coreTypes.SDKStreamlinedTextMessage | coreTypes.SDKStreamlinedToolUseSummaryMessage | coreTypes.SDKPostTurnSummaryMessage | SDKControlResponse | SDKControlRequest | SDKControlCancelRequest | SDKKeepAliveMessage;

export declare type StopFailureHookInput = BaseHookInput & {
    hook_event_name: 'StopFailure';
    error: SDKAssistantMessageError;
    error_details?: string;
    last_assistant_message?: string;
};

export declare type StopHookInput = BaseHookInput & {
    hook_event_name: 'Stop';
    stop_hook_active: boolean;
    /**
     * Text content of the last assistant message before stopping. Avoids the need to read and parse the transcript file.
     */
    last_assistant_message?: string;
};

export declare type SubagentStartHookInput = BaseHookInput & {
    hook_event_name: 'SubagentStart';
    agent_id: string;
    agent_type: string;
};

export declare type SubagentStartHookSpecificOutput = {
    hookEventName: 'SubagentStart';
    additionalContext?: string;
};

export declare type SubagentStopHookInput = BaseHookInput & {
    hook_event_name: 'SubagentStop';
    stop_hook_active: boolean;
    agent_id: string;
    agent_transcript_path: string;
    agent_type: string;
    /**
     * Text content of the last assistant message before stopping. Avoids the need to read and parse the transcript file.
     */
    last_assistant_message?: string;
};

export declare type SyncHookJSONOutput = {
    continue?: boolean;
    suppressOutput?: boolean;
    stopReason?: string;
    decision?: 'approve' | 'block';
    systemMessage?: string;
    reason?: string;

    hookSpecificOutput?: PreToolUseHookSpecificOutput | UserPromptSubmitHookSpecificOutput | SessionStartHookSpecificOutput | SetupHookSpecificOutput | SubagentStartHookSpecificOutput | PostToolUseHookSpecificOutput | PostToolUseFailureHookSpecificOutput | NotificationHookSpecificOutput | PermissionRequestHookSpecificOutput | ElicitationHookSpecificOutput | ElicitationResultHookSpecificOutput | CwdChangedHookSpecificOutput | FileChangedHookSpecificOutput | WorktreeCreateHookSpecificOutput;
};

/**
 * Tag a session. Pass null to clear the tag.
 * @param sessionId - UUID of the session
 * @param tag - Tag string, or null to clear
 * @param options - `{ dir?: string }` project path; omit to search all projects
 */
export declare function tagSession(_sessionId: string, _tag: string | null, _options?: SessionMutationOptions): Promise<void>;

export declare type TaskCompletedHookInput = BaseHookInput & {
    hook_event_name: 'TaskCompleted';
    task_id: string;
    task_subject: string;
    task_description?: string;
    teammate_name?: string;
    team_name?: string;
};

export declare type TaskCreatedHookInput = BaseHookInput & {
    hook_event_name: 'TaskCreated';
    task_id: string;
    task_subject: string;
    task_description?: string;
    teammate_name?: string;
    team_name?: string;
};

export declare type TeammateIdleHookInput = BaseHookInput & {
    hook_event_name: 'TeammateIdle';
    teammate_name: string;
    team_name: string;
};

/**
 * Claude decides when and how much to think (Opus 4.6+).
 */
export declare type ThinkingAdaptive = {
    type: 'adaptive';
};

/**
 * Controls Claude's thinking/reasoning behavior. When set, takes precedence over the deprecated maxThinkingTokens.
 */
export declare type ThinkingConfig = ThinkingAdaptive | ThinkingEnabled | ThinkingDisabled;

/**
 * No extended thinking
 */
export declare type ThinkingDisabled = {
    type: 'disabled';
};

/**
 * Fixed thinking token budget (older models)
 */
export declare type ThinkingEnabled = {
    type: 'enabled';
    budgetTokens?: number;
};

export declare function tool<Schema extends AnyZodRawShape>(_name: string, _description: string, _inputSchema: Schema, _handler: (args: InferShape<Schema>, extra: unknown) => Promise<CallToolResult>, _extras?: {
    annotations?: ToolAnnotations;
    searchHint?: string;
    alwaysLoad?: boolean;
}): SdkMcpToolDefinition<Schema>;

/**
 * Per-tool configuration for built-in tools. Allows SDK consumers to
 * customize tool behavior that the CLI hardcodes.
 */
export declare type ToolConfig = {
    askUserQuestion?: {
        /**
         * Content format for the `preview` field on question options.
         * Controls what the model is instructed to emit and how the field is
         * described in the tool schema.
         *
         * - `'markdown'` — Markdown/ASCII content (CLI default, rendered in a monospace box)
         * - `'html'` — Self-contained HTML fragments (for web-based SDK consumers)
         *
         * @default 'markdown'
         */
        previewFormat?: 'markdown' | 'html';
    };
};

/**
 * Transport interface for Claude Code SDK communication
 * Abstracts the communication layer to support both process and WebSocket transports
 */
export declare interface Transport {
    /**
     * Write data to the transport
     * May be async for network-based transports
     */
    write(data: string): void | Promise<void>;
    /**
     * Close the transport connection and clean up resources
     * This also closes stdin if still open (eliminating need for endInput)
     */
    close(): void;
    /**
     * Check if transport is ready for communication
     */
    isReady(): boolean;
    /**
     * Read and parse messages from the transport
     * Each transport handles its own protocol and error checking
     */
    readMessages(): AsyncGenerator<StdoutMessage, void, unknown>;
    /**
     * End the input stream
     */
    endInput(): void;
}

/**
 * V2 API - UNSTABLE
 * Create a persistent session for multi-turn conversations.
 * @alpha
 */
export declare function unstable_v2_createSession(_options: SDKSessionOptions): SDKSession;

/**
 * V2 API - UNSTABLE
 * One-shot convenience function for single prompts.
 * @alpha
 *
 * @example
 * ```typescript
 * const result = await unstable_v2_prompt("What files are here?", {
 *   model: 'claude-sonnet-4-6'
 * })
 * ```
 */
export declare function unstable_v2_prompt(_message: string, _options: SDKSessionOptions): Promise<SDKResultMessage>;

/**
 * V2 API - UNSTABLE
 * Resume an existing session by ID.
 * @alpha
 */
export declare function unstable_v2_resumeSession(_sessionId: string, _options: SDKSessionOptions): SDKSession;

export declare type UserPromptSubmitHookInput = BaseHookInput & {
    hook_event_name: 'UserPromptSubmit';
    prompt: string;
};

export declare type UserPromptSubmitHookSpecificOutput = {
    hookEventName: 'UserPromptSubmit';
    additionalContext?: string;
};

export declare type WorktreeCreateHookInput = BaseHookInput & {
    hook_event_name: 'WorktreeCreate';
    name: string;
};

/**
 * Hook-specific output for the WorktreeCreate event. Provides the absolute path to the created worktree directory. Command hooks print the path on stdout instead.
 */
export declare type WorktreeCreateHookSpecificOutput = {
    hookEventName: 'WorktreeCreate';
    worktreePath: string;
};

export declare type WorktreeRemoveHookInput = BaseHookInput & {
    hook_event_name: 'WorktreeRemove';
    worktree_path: string;
};

export { }
