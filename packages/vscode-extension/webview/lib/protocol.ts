// Bridge protocol: webview ↔ extension host.
// All messages use the `ext:` prefix to namespace from VSCode's own messages.

import type {
  AgentCapabilities,
  AvailableCommand,
  ContentBlock,
  ElicitationRequestPayload,
  ElicitationResponse,
  ListSessionsRequest,
  ListSessionsResponse,
  LoadSessionRequest,
  PermissionOutcome,
  PermissionRequestPayload,
  PromptCapabilities,
  ResumeSessionRequest,
  SessionModelState,
  SessionModeState,
  SessionUpdate,
} from "./acp/types";

// =============================================================================
// Webview → Extension
// =============================================================================

export type ToExtensionMessage =
  | { type: "ext:webview_ready" }
  | { type: "ext:new_session"; payload?: { permissionMode?: string } }
  | { type: "ext:prompt"; payload: { content: ContentBlock[] } }
  | { type: "ext:cancel" }
  | { type: "ext:permission_response"; payload: { requestId: string; outcome: PermissionOutcome } }
  | { type: "ext:elicitation_response"; payload: { requestId: string; response: ElicitationResponse } }
  | { type: "ext:set_session_model"; payload: { modelId: string } }
  | { type: "ext:set_session_mode"; payload: { modeId: string } }
  | { type: "ext:list_sessions"; payload?: ListSessionsRequest }
  | { type: "ext:load_session"; payload: LoadSessionRequest }
  | { type: "ext:resume_session"; payload: ResumeSessionRequest }
  | { type: "ext:open_file"; payload: { path: string; line?: number } }
  | { type: "ext:copy"; payload: { text: string } }
  | { type: "ext:apply_diff"; payload: { path: string; oldText?: string | null; newText: string } }
  | { type: "ext:send_selection" }
  | { type: "ext:send_file" }
  | { type: "ext:find_files"; payload: { query: string; requestId: string; max?: number } }
  | { type: "ext:get_diagnostics"; payload: { uri?: string; requestId: string } }
  | { type: "ext:restart_agent" }
  | { type: "ext:get_settings" }
  | { type: "ext:save_history_meta"; payload: { sessionId: string; title: string; preview: string; messageCount: number; model: string } };

// =============================================================================
// Extension → Webview
// =============================================================================

export interface AgentInfo {
  name?: string;
  version?: string;
}

export type FromExtensionMessage =
  | { type: "ext:status"; payload: { connected: boolean; agentInfo?: AgentInfo; capabilities?: AgentCapabilities; cwd?: string } }
  | { type: "ext:cwd"; payload: { cwd: string } }
  | {
      type: "ext:session_created";
      payload: {
        sessionId: string;
        promptCapabilities?: PromptCapabilities;
        models?: SessionModelState | null;
        modes?: SessionModeState | null;
      };
    }
  | { type: "ext:session_update"; payload: { sessionId: string; update: SessionUpdate } }
  | { type: "ext:prompt_complete"; payload: { stopReason: string } }
  | { type: "ext:permission_request"; payload: PermissionRequestPayload }
  | { type: "ext:elicitation_request"; payload: ElicitationRequestPayload }
  | { type: "ext:model_changed"; payload: { modelId: string } }
  | { type: "ext:mode_changed"; payload: { modeId: string } }
  | { type: "ext:available_commands"; payload: { commands: AvailableCommand[] } }
  | { type: "ext:session_list"; payload: ListSessionsResponse }
  | { type: "ext:session_loaded"; payload: { sessionId: string; promptCapabilities?: PromptCapabilities; models?: SessionModelState | null; modes?: SessionModeState | null } }
  | { type: "ext:session_resumed"; payload: { sessionId: string; promptCapabilities?: PromptCapabilities; models?: SessionModelState | null; modes?: SessionModeState | null } }
  | { type: "ext:error"; payload: { message: string } }
  | { type: "ext:find_files_result"; payload: { requestId: string; files: Array<{ path: string; relPath: string }> } }
  | { type: "ext:diagnostics_result"; payload: { requestId: string; items: Array<{ uri: string; range: { startLine: number; endLine: number }; message: string; severity: "error" | "warning" | "info" | "hint"; source?: string }> } }
  | { type: "ext:inject_text"; payload: { text: string } }
  | { type: "ext:notice"; payload: { level: "info" | "warning" | "error"; message: string } };

// =============================================================================
// Type guards (used in webview hook)
// =============================================================================

export function isFromExtension(msg: unknown): msg is FromExtensionMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    typeof (msg as { type?: unknown }).type === "string" &&
    (msg as { type: string }).type.startsWith("ext:")
  );
}
