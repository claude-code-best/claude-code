// ACP protocol types — ported and trimmed from packages/remote-control-server/web/src/acp/types.ts.
// Spec: https://agentclientprotocol.com — matches @agentclientprotocol/sdk@0.19.

// =============================================================================
// Permission types
// =============================================================================

export type PermissionOptionKind =
  | "allow_once"
  | "allow_always"
  | "reject_once"
  | "reject_always";

export interface PermissionOption {
  optionId: string;
  name: string;
  kind: PermissionOptionKind;
}

export interface PermissionRequestPayload {
  requestId: string;
  sessionId: string;
  options: PermissionOption[];
  toolCall: {
    toolCallId: string;
    title?: string;
    content?: ToolCallContent[];
  };
}

export type PermissionOutcome =
  | { outcome: "cancelled" }
  | { outcome: "selected"; optionId: string };

export interface PermissionResponsePayload {
  requestId: string;
  outcome: PermissionOutcome;
}

// =============================================================================
// Elicitation types
// =============================================================================

export type ElicitationContentValue = string | number | boolean | string[];

export interface EnumOption {
  const: string;
  title: string;
}

export type ElicitationPropertySchema =
  | {
      type: "string";
      title?: string | null;
      description?: string | null;
      enum?: string[] | null;
      oneOf?: EnumOption[] | null;
      default?: string | null;
    }
  | {
      type: "number" | "integer";
      title?: string | null;
      description?: string | null;
      minimum?: number | null;
      maximum?: number | null;
      default?: number | null;
    }
  | {
      type: "boolean";
      title?: string | null;
      description?: string | null;
      default?: boolean | null;
    }
  | {
      type: "array";
      title?: string | null;
      description?: string | null;
      default?: string[] | null;
      minItems?: number | null;
      maxItems?: number | null;
      items: {
        enum?: string[] | null;
        oneOf?: EnumOption[] | null;
      };
    };

export interface ElicitationSchema {
  type?: "object";
  title?: string | null;
  description?: string | null;
  properties?: Record<string, ElicitationPropertySchema>;
  required?: string[] | null;
}

export type ElicitationResponse =
  | { action: "accept"; content?: Record<string, ElicitationContentValue> | null }
  | { action: "decline" }
  | { action: "cancel" };

export interface ElicitationRequestPayload {
  requestId: string;
  sessionId?: string;
  message: string;
  schema: ElicitationSchema;
}

// =============================================================================
// Content blocks
// =============================================================================

export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageContent {
  type: "image";
  mimeType: string;
  data: string; // base64
  uri?: string;
}

export interface ResourceLinkContent {
  type: "resource_link";
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
  size?: number;
}

export type ContentBlock =
  | TextContent
  | ImageContent
  | ResourceLinkContent
  | { type: string; text?: string };

// =============================================================================
// Tool call content
// =============================================================================

export interface ToolCallContentBlock {
  type: "content";
  content: ContentBlock;
}

export interface ToolCallDiffContent {
  type: "diff";
  path: string;
  oldText?: string | null;
  newText: string;
}

export interface ToolCallTerminalContent {
  type: "terminal";
  terminalId: string;
}

export type ToolCallContent =
  | ToolCallContentBlock
  | ToolCallDiffContent
  | ToolCallTerminalContent;

// =============================================================================
// Session updates (notifications from agent)
// =============================================================================

export interface AgentMessageChunkUpdate {
  sessionUpdate: "agent_message_chunk";
  content: ContentBlock;
}

export interface AgentThoughtChunkUpdate {
  sessionUpdate: "agent_thought_chunk";
  content: ContentBlock;
}

export interface UserMessageChunkUpdate {
  sessionUpdate: "user_message_chunk";
  content: ContentBlock;
}

export interface ToolCallUpdate {
  sessionUpdate: "tool_call";
  toolCallId: string;
  title: string;
  status: string;
  content?: ToolCallContent[];
  rawInput?: Record<string, unknown>;
  rawOutput?: unknown;
}

export interface ToolCallStatusUpdate {
  sessionUpdate: "tool_call_update";
  toolCallId: string;
  status?: string;
  title?: string;
  content?: ToolCallContent[];
  rawInput?: Record<string, unknown>;
  rawOutput?: unknown;
}

export type PlanEntryPriority = "high" | "medium" | "low";
export type PlanEntryStatus = "pending" | "in_progress" | "completed";

export interface PlanEntry {
  _meta?: Record<string, unknown> | null;
  content: string;
  priority: PlanEntryPriority;
  status: PlanEntryStatus;
}

export interface PlanUpdate {
  sessionUpdate: "plan";
  _meta?: Record<string, unknown> | null;
  entries: PlanEntry[];
}

export interface AvailableCommand {
  _meta?: Record<string, unknown> | null;
  name: string;
  description: string;
  input?: { hint: string } | null;
  type?: "prompt" | "local" | "local-jsx";
}

export interface AvailableCommandsUpdate {
  sessionUpdate: "available_commands_update";
  availableCommands: AvailableCommand[];
}

export interface CurrentModeUpdate {
  sessionUpdate: "current_mode_update";
  currentModeId: string;
}

export interface Cost {
  amount: number;
  currency: string;
}

export interface UsageUpdate {
  sessionUpdate: "usage_update";
  /** Total context window size in tokens. */
  size: number;
  /** Tokens currently in context. */
  used: number;
  /** Cumulative session cost (optional). */
  cost?: Cost | null;
  _meta?: Record<string, unknown> | null;
}

export type SessionUpdate =
  | AgentMessageChunkUpdate
  | AgentThoughtChunkUpdate
  | UserMessageChunkUpdate
  | ToolCallUpdate
  | ToolCallStatusUpdate
  | PlanUpdate
  | AvailableCommandsUpdate
  | CurrentModeUpdate
  | UsageUpdate;

// =============================================================================
// Capabilities (advertised via initialize)
// =============================================================================

export interface PromptCapabilities {
  audio?: boolean;
  embeddedContext?: boolean;
  image?: boolean;
}

export interface McpCapabilities {
  clientServers?: boolean;
  _meta?: Record<string, unknown> | null;
}

export interface SessionForkCapabilities {
  _meta?: Record<string, unknown> | null;
}
export interface SessionListCapabilities {
  _meta?: Record<string, unknown> | null;
}
export interface SessionResumeCapabilities {
  _meta?: Record<string, unknown> | null;
}

export interface SessionCapabilities {
  _meta?: Record<string, unknown> | null;
  fork?: SessionForkCapabilities | null;
  list?: SessionListCapabilities | null;
  resume?: SessionResumeCapabilities | null;
}

export interface AgentCapabilities {
  _meta?: Record<string, unknown> | null;
  loadSession?: boolean;
  mcpCapabilities?: McpCapabilities;
  promptCapabilities?: PromptCapabilities;
  sessionCapabilities?: SessionCapabilities;
}

// =============================================================================
// Session model state
// =============================================================================

export interface ModelInfo {
  modelId: string;
  name: string;
  description?: string | null;
}

export interface SessionModelState {
  availableModels: ModelInfo[];
  currentModelId: string;
}

// =============================================================================
// Session mode state (spec ACP 0.19)
// Note: ACP SDK schema names the per-mode field `id` (NOT `modeId`).
// `currentModeId` on the parent state is `currentModeId`. Matches
// node_modules/@agentclientprotocol/sdk/dist/schema/types.gen.d.ts SessionMode.
// =============================================================================

export interface ModeInfo {
  id: string;
  name: string;
  description?: string | null;
}

export interface SessionModeState {
  availableModes: ModeInfo[];
  currentModeId: string;
}

// =============================================================================
// Session list / load / resume
// =============================================================================

export interface AgentSessionInfo {
  _meta?: Record<string, unknown> | null;
  cwd: string;
  sessionId: string;
  title?: string | null;
  updatedAt?: string | null;
}

export interface ListSessionsRequest {
  _meta?: Record<string, unknown> | null;
  cwd?: string;
  cursor?: string;
}

export interface ListSessionsResponse {
  _meta?: Record<string, unknown> | null;
  nextCursor?: string | null;
  sessions: AgentSessionInfo[];
}

export interface LoadSessionRequest {
  _meta?: Record<string, unknown> | null;
  sessionId: string;
  cwd?: string;
}

export interface ResumeSessionRequest {
  _meta?: Record<string, unknown> | null;
  sessionId: string;
  cwd?: string;
}

// =============================================================================
// Connection state
// =============================================================================

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";
