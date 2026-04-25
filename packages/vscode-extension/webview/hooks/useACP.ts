import { useEffect, useReducer, useRef, useCallback } from "react";
import type {
  AgentCapabilities,
  AvailableCommand,
  ContentBlock,
  Cost,
  ElicitationResponse,
  PermissionOption,
  PromptCapabilities,
  SessionModelState,
  SessionModeState,
  SessionUpdate,
} from "../lib/acp/types";

export interface UsageInfo {
  size: number;
  used: number;
  cost: Cost | null;
}
import {
  applySessionUpdate,
  attachPermissionToToolCall,
  resolvePermissionForToolCall,
} from "../lib/threadReducer";
import type {
  ConnectionState,
  PendingElicitation,
  PendingPermission,
  ThreadEntry,
  UserMessageEntry,
  UserMessageImage,
} from "../lib/types";
import {
  type FromExtensionMessage,
  type ToExtensionMessage,
  isFromExtension,
} from "../lib/protocol";
import { useVSCodeAPI } from "./useVSCodeAPI";

let entryCounter = 0;
const nextEntryId = (prefix: string) => `${prefix}-${Date.now()}-${++entryCounter}`;

// =============================================================================
// State machine
// =============================================================================

interface DiagnosticsResponse {
  requestId: string;
  items: Array<{
    uri: string;
    range: { startLine: number; endLine: number };
    message: string;
    severity: "error" | "warning" | "info" | "hint";
    source?: string;
  }>;
}

interface FindFilesResponse {
  requestId: string;
  files: Array<{ path: string; relPath: string }>;
}

export interface ACPViewState {
  connection: ConnectionState;
  agentCapabilities: AgentCapabilities | null;
  promptCapabilities: PromptCapabilities | null;
  modelState: SessionModelState | null;
  modeState: SessionModeState | null;
  currentMode: string;
  cwd: string;
  sessionId: string | null;
  entries: ThreadEntry[];
  isLoading: boolean;
  availableCommands: AvailableCommand[];
  pendingPermissions: PendingPermission[];
  pendingElicitations: PendingElicitation[];
  usage: UsageInfo | null;
  errorBanner: string | null;
  noticeBanner: { level: "info" | "warning" | "error"; message: string } | null;
}

type Action =
  | { type: "set_connection"; state: ConnectionState }
  | { type: "set_capabilities"; capabilities: AgentCapabilities | null }
  | { type: "set_cwd"; cwd: string }
  | { type: "session_created"; sessionId: string; promptCaps: PromptCapabilities | null; models: SessionModelState | null; modes: SessionModeState | null }
  | { type: "session_update"; sessionId: string; update: SessionUpdate }
  | { type: "permission_request"; payload: { requestId: string; sessionId: string; options: PermissionOption[]; toolCall: { toolCallId: string; title?: string } } }
  | { type: "permission_resolved"; requestId: string; approved: boolean }
  | { type: "elicitation_request"; payload: PendingElicitation }
  | { type: "elicitation_resolved"; requestId: string }
  | { type: "model_changed"; modelId: string }
  | { type: "mode_changed"; modeId: string }
  | { type: "available_commands"; commands: AvailableCommand[] }
  | { type: "prompt_complete" }
  | { type: "set_loading"; loading: boolean }
  | { type: "append_user_message"; entry: UserMessageEntry }
  | { type: "error"; message: string }
  | { type: "clear_error" }
  | { type: "notice"; level: "info" | "warning" | "error"; message: string }
  | { type: "clear_notice" }
  | { type: "reset_thread" };

const initialState: ACPViewState = {
  connection: "disconnected",
  agentCapabilities: null,
  promptCapabilities: null,
  modelState: null,
  modeState: null,
  currentMode: "default",
  cwd: "",
  sessionId: null,
  entries: [],
  isLoading: false,
  availableCommands: [],
  pendingPermissions: [],
  pendingElicitations: [],
  usage: null,
  errorBanner: null,
  noticeBanner: null,
};

function reducer(state: ACPViewState, action: Action): ACPViewState {
  switch (action.type) {
    case "set_connection":
      return { ...state, connection: action.state };
    case "set_capabilities":
      return {
        ...state,
        agentCapabilities: action.capabilities,
        promptCapabilities: action.capabilities?.promptCapabilities ?? null,
      };
    case "set_cwd":
      return { ...state, cwd: action.cwd };
    case "session_created": {
      // The session_created notification can arrive *after* the user has
      // already typed an optimistic prompt. Clearing entries unconditionally
      // would erase that prompt and leave the UI looking unresponsive.
      // Only reset the visible thread when we're actually switching to a
      // different sessionId (load/resume of a historical session, or explicit
      // newSession). For the very first session created during bootstrap,
      // keep whatever the user already queued.
      const switchingSession =
        state.sessionId !== null && state.sessionId !== action.sessionId;
      return {
        ...state,
        sessionId: action.sessionId,
        promptCapabilities: action.promptCaps,
        modelState: action.models,
        modeState: action.modes,
        currentMode: action.modes?.currentModeId ?? state.currentMode,
        entries: switchingSession ? [] : state.entries,
        availableCommands: state.availableCommands,
        isLoading: state.isLoading && !switchingSession,
        pendingPermissions: switchingSession ? [] : state.pendingPermissions,
        pendingElicitations: switchingSession ? [] : state.pendingElicitations,
      };
    }
    case "session_update": {
      const next = applySessionUpdate(state.entries, action.update);
      // Capture available_commands_update at this layer.
      if (action.update.sessionUpdate === "available_commands_update") {
        return {
          ...state,
          entries: next,
          availableCommands: action.update.availableCommands,
        };
      }
      if (action.update.sessionUpdate === "current_mode_update") {
        return { ...state, entries: next, currentMode: action.update.currentModeId };
      }
      // Cumulative token / cost telemetry — does not enter the visible thread.
      if (action.update.sessionUpdate === "usage_update") {
        return {
          ...state,
          entries: next,
          usage: {
            size: action.update.size,
            used: action.update.used,
            cost: action.update.cost ?? null,
          },
        };
      }
      return { ...state, entries: next };
    }
    case "permission_request": {
      const entries = attachPermissionToToolCall(
        state.entries,
        action.payload.toolCall.toolCallId,
        { requestId: action.payload.requestId, options: action.payload.options },
        action.payload.toolCall.title ?? "Permission request",
      );
      const pending: PendingPermission = {
        requestId: action.payload.requestId,
        toolName: action.payload.toolCall.title ?? "tool",
        toolInput: {},
        options: action.payload.options,
      };
      return {
        ...state,
        entries,
        pendingPermissions: [...state.pendingPermissions, pending],
      };
    }
    case "permission_resolved":
      return {
        ...state,
        entries: resolvePermissionForToolCall(state.entries, action.requestId, action.approved),
        pendingPermissions: state.pendingPermissions.filter((p) => p.requestId !== action.requestId),
      };
    case "elicitation_request":
      return {
        ...state,
        pendingElicitations: [
          ...state.pendingElicitations.filter((p) => p.requestId !== action.payload.requestId),
          action.payload,
        ],
      };
    case "elicitation_resolved":
      return {
        ...state,
        pendingElicitations: state.pendingElicitations.filter((p) => p.requestId !== action.requestId),
      };
    case "model_changed":
      return state.modelState
        ? { ...state, modelState: { ...state.modelState, currentModelId: action.modelId } }
        : state;
    case "mode_changed":
      return {
        ...state,
        currentMode: action.modeId,
        modeState: state.modeState ? { ...state.modeState, currentModeId: action.modeId } : state.modeState,
      };
    case "available_commands":
      return { ...state, availableCommands: action.commands };
    case "prompt_complete":
      return { ...state, isLoading: false };
    case "set_loading":
      return { ...state, isLoading: action.loading };
    case "append_user_message":
      return { ...state, entries: [...state.entries, action.entry], isLoading: true };
    case "error":
      return { ...state, errorBanner: action.message };
    case "clear_error":
      return { ...state, errorBanner: null };
    case "notice":
      return { ...state, noticeBanner: { level: action.level, message: action.message } };
    case "clear_notice":
      return { ...state, noticeBanner: null };
    case "reset_thread":
      return { ...state, entries: [], pendingPermissions: [], pendingElicitations: [], isLoading: false };
    default:
      return state;
  }
}

// =============================================================================
// Hook surface
// =============================================================================

export interface UseACP {
  state: ACPViewState;
  send: (text: string, images?: UserMessageImage[]) => Promise<void>;
  cancel: () => void;
  newSession: (permissionMode?: string) => void;
  resumeSession: (sessionId: string) => void;
  setModel: (modelId: string) => void;
  setMode: (modeId: string) => void;
  respondPermission: (requestId: string, optionId: string | null, approved: boolean) => void;
  respondElicitation: (requestId: string, response: ElicitationResponse) => void;
  openFile: (path: string, line?: number) => void;
  copy: (text: string) => void;
  applyDiff: (path: string, oldText: string | null | undefined, newText: string) => void;
  findFiles: (query: string) => Promise<FindFilesResponse["files"]>;
  getDiagnostics: (uri?: string) => Promise<DiagnosticsResponse["items"]>;
  /** Subscribe to inject_text broadcasts (e.g. send selection from editor). */
  onInjectText: (handler: (text: string) => void) => () => void;
}

export function useACP(): UseACP {
  const vscode = useVSCodeAPI();
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Pending request maps for find_files / diagnostics (request/response pairing).
  const pendingFindFiles = useRef(new Map<string, (files: FindFilesResponse["files"]) => void>());
  const pendingDiagnostics = useRef(new Map<string, (items: DiagnosticsResponse["items"]) => void>());
  const injectHandlers = useRef(new Set<(text: string) => void>());

  const post = useCallback(
    (msg: ToExtensionMessage) => {
      vscode.postMessage(msg);
    },
    [vscode],
  );

  // Wire incoming messages from the extension host.
  useEffect(() => {
    function onMessage(event: MessageEvent): void {
      const msg = event.data;
      if (!isFromExtension(msg)) {
        return;
      }
      handleFromExtension(msg);
    }
    window.addEventListener("message", onMessage);
    post({ type: "ext:webview_ready" });
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFromExtension(msg: FromExtensionMessage): void {
    switch (msg.type) {
      case "ext:status":
        dispatch({ type: "set_connection", state: msg.payload.connected ? "connected" : "disconnected" });
        if (msg.payload.capabilities !== undefined) {
          dispatch({ type: "set_capabilities", capabilities: msg.payload.capabilities });
        }
        if (msg.payload.cwd) dispatch({ type: "set_cwd", cwd: msg.payload.cwd });
        return;

      case "ext:cwd":
        dispatch({ type: "set_cwd", cwd: msg.payload.cwd });
        return;

      case "ext:session_created":
      case "ext:session_loaded":
      case "ext:session_resumed":
        dispatch({
          type: "session_created",
          sessionId: msg.payload.sessionId,
          promptCaps: msg.payload.promptCapabilities ?? null,
          models: msg.payload.models ?? null,
          modes: msg.payload.modes ?? null,
        });
        return;

      case "ext:session_update":
        dispatch({ type: "session_update", sessionId: msg.payload.sessionId, update: msg.payload.update });
        return;

      case "ext:permission_request":
        dispatch({ type: "permission_request", payload: msg.payload });
        return;

      case "ext:elicitation_request":
        dispatch({ type: "elicitation_request", payload: msg.payload });
        return;

      case "ext:prompt_complete":
        dispatch({ type: "prompt_complete" });
        return;

      case "ext:model_changed":
        dispatch({ type: "model_changed", modelId: msg.payload.modelId });
        return;

      case "ext:mode_changed":
        dispatch({ type: "mode_changed", modeId: msg.payload.modeId });
        return;

      case "ext:available_commands":
        dispatch({ type: "available_commands", commands: msg.payload.commands });
        return;

      case "ext:error":
        dispatch({ type: "error", message: msg.payload.message });
        return;

      case "ext:notice":
        dispatch({ type: "notice", level: msg.payload.level, message: msg.payload.message });
        return;

      case "ext:inject_text":
        for (const handler of injectHandlers.current) handler(msg.payload.text);
        return;

      case "ext:find_files_result": {
        const cb = pendingFindFiles.current.get(msg.payload.requestId);
        if (cb) {
          pendingFindFiles.current.delete(msg.payload.requestId);
          cb(msg.payload.files);
        }
        return;
      }

      case "ext:diagnostics_result": {
        const cb = pendingDiagnostics.current.get(msg.payload.requestId);
        if (cb) {
          pendingDiagnostics.current.delete(msg.payload.requestId);
          cb(msg.payload.items);
        }
        return;
      }

      case "ext:session_list":
        // Currently consumed via VSCode quickpick, not in webview state.
        return;
    }
  }

  // ---- Public API ----------------------------------------------------------
  const send = useCallback(
    async (text: string, images?: UserMessageImage[]): Promise<void> => {
      const blocks: ContentBlock[] = [];
      if (text) blocks.push({ type: "text", text });
      if (images) {
        for (const img of images) {
          blocks.push({ type: "image", mimeType: img.mimeType, data: img.data });
        }
      }
      if (blocks.length === 0) return;

      const userEntry: UserMessageEntry = {
        type: "user_message",
        id: nextEntryId("u"),
        content: text,
        ...(images && images.length > 0 ? { images } : {}),
      };
      dispatch({ type: "append_user_message", entry: userEntry });
      dispatch({ type: "clear_error" });
      post({ type: "ext:prompt", payload: { content: blocks } });
    },
    [post],
  );

  const cancel = useCallback(() => post({ type: "ext:cancel" }), [post]);

  const newSession = useCallback(
    (permissionMode?: string) => {
      dispatch({ type: "reset_thread" });
      post({ type: "ext:new_session", payload: permissionMode ? { permissionMode } : undefined });
    },
    [post],
  );

  const resumeSession = useCallback(
    (sessionId: string) => {
      dispatch({ type: "reset_thread" });
      post({ type: "ext:resume_session", payload: { sessionId } });
    },
    [post],
  );

  const setModel = useCallback(
    (modelId: string) => {
      post({ type: "ext:set_session_model", payload: { modelId } });
    },
    [post],
  );

  const setMode = useCallback(
    (modeId: string) => {
      post({ type: "ext:set_session_mode", payload: { modeId } });
    },
    [post],
  );

  const respondPermission = useCallback(
    (requestId: string, optionId: string | null, approved: boolean) => {
      post({
        type: "ext:permission_response",
        payload: optionId
          ? { requestId, outcome: { outcome: "selected", optionId } }
          : { requestId, outcome: { outcome: "cancelled" } },
      });
      dispatch({ type: "permission_resolved", requestId, approved });
    },
    [post],
  );

  const respondElicitation = useCallback(
    (requestId: string, response: ElicitationResponse) => {
      post({
        type: "ext:elicitation_response",
        payload: { requestId, response },
      });
      dispatch({ type: "elicitation_resolved", requestId });
    },
    [post],
  );

  const openFile = useCallback((path: string, line?: number) => post({ type: "ext:open_file", payload: { path, line } }), [post]);
  const copy = useCallback((text: string) => post({ type: "ext:copy", payload: { text } }), [post]);
  const applyDiff = useCallback(
    (path: string, oldText: string | null | undefined, newText: string) =>
      post({ type: "ext:apply_diff", payload: { path, oldText, newText } }),
    [post],
  );

  const findFiles = useCallback(
    (query: string): Promise<FindFilesResponse["files"]> => {
      const requestId = `ff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      return new Promise((resolve) => {
        pendingFindFiles.current.set(requestId, resolve);
        post({ type: "ext:find_files", payload: { query, requestId } });
        // Failsafe: 3s timeout.
        setTimeout(() => {
          if (pendingFindFiles.current.delete(requestId)) resolve([]);
        }, 3000);
      });
    },
    [post],
  );

  const getDiagnostics = useCallback(
    (uri?: string): Promise<DiagnosticsResponse["items"]> => {
      const requestId = `dg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      return new Promise((resolve) => {
        pendingDiagnostics.current.set(requestId, resolve);
        post({ type: "ext:get_diagnostics", payload: { uri, requestId } });
        setTimeout(() => {
          if (pendingDiagnostics.current.delete(requestId)) resolve([]);
        }, 3000);
      });
    },
    [post],
  );

  const onInjectText = useCallback((handler: (text: string) => void): (() => void) => {
    injectHandlers.current.add(handler);
    return () => injectHandlers.current.delete(handler);
  }, []);

  return {
    state,
    send,
    cancel,
    newSession,
    resumeSession,
    setModel,
    setMode,
    respondPermission,
    respondElicitation,
    openFile,
    copy,
    applyDiff,
    findFiles,
    getDiagnostics,
    onInjectText,
  };
}
