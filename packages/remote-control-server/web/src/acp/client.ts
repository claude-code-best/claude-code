import type {
  ACPSettings,
  AgentCapabilities,
  AgentSessionInfo,
  BrowserToolParams,
  BrowserToolResult,
  ConnectionState,
  ContentBlock,
  ListSessionsRequest,
  ListSessionsResponse,
  LoadSessionRequest,
  PermissionRequestPayload,
  PromptCapabilities,
  ProxyMessage,
  ProxyResponse,
  ResumeSessionRequest,
  SessionUpdate,
  SessionModelState,
  ModelInfo,
  AvailableCommand,
} from "./types";

function encodeWebSocketAuthProtocol(token: string): string {
  const bytes = new TextEncoder().encode(token);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const encoded = btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `rcs.auth.${encoded}`;
}

/**
 * Error thrown when disconnect() is called while a connection is in progress.
 * Callers can use `instanceof` to distinguish this from real connection errors.
 */
export class DisconnectRequestedError extends Error {
  constructor() {
    super("Disconnect requested");
    this.name = "DisconnectRequestedError";
  }
}

export type ConnectionStateHandler = (
  state: ConnectionState,
  error?: string,
) => void;
export type SessionUpdateHandler = (sessionId: string, update: SessionUpdate) => void;
export type SessionCreatedHandler = (sessionId: string) => void;
export type PromptCompleteHandler = (stopReason: string) => void;
export type PermissionRequestHandler = (request: PermissionRequestPayload) => void;
export type BrowserToolCallHandler = (
  params: BrowserToolParams,
) => Promise<BrowserToolResult>;
export type ErrorMessageHandler = (message: string) => void;
export type ModelChangedHandler = (modelId: string) => void;
export type ModelStateChangedHandler = (state: SessionModelState | null) => void;
export type AvailableCommandsChangedHandler = (commands: AvailableCommand[]) => void;
// Handler for session loaded/resumed events
export type SessionLoadedHandler = (sessionId: string) => void;
// Handler fired before switching the active session.
// This matches Zed's model more closely: the UI changes active thread first,
// then receives updates for that thread while load/resume is in flight.
export type SessionSwitchingHandler = (sessionId: string) => void;

export class ACPClient {
  private ws: WebSocket | null = null;
  private settings: ACPSettings;
  private connectionState: ConnectionState = "disconnected";
  private sessionId: string | null = null;
  private pendingSessionTarget: string | null = null;
  // Reference: Zed stores full agentCapabilities from initialize response
  // Used to check supports_load_session, supports_resume_session, etc.
  private _agentCapabilities: AgentCapabilities | null = null;
  // Reference: Zed's prompt_capabilities in MessageEditor
  // Stores capabilities from agent's initialize response
  private _promptCapabilities: PromptCapabilities | null = null;
  // Reference: Zed stores model state from NewSessionResponse
  private _modelState: SessionModelState | null = null;
  private _availableCommands: AvailableCommand[] = [];
  private onModelChanged: ModelChangedHandler | null = null;
  private onModelStateChanged: ModelStateChangedHandler | null = null;
  private onAvailableCommandsChanged: AvailableCommandsChangedHandler | null = null;
  private onSessionLoaded: SessionLoadedHandler | null = null;
  private onSessionSwitching: SessionSwitchingHandler | null = null;

  private onConnectionStateChange: Set<ConnectionStateHandler> = new Set();
  private onSessionUpdate: SessionUpdateHandler | null = null;
  private onSessionCreated: SessionCreatedHandler | null = null;
  private onPromptComplete: PromptCompleteHandler | null = null;
  private onPermissionRequest: PermissionRequestHandler | null = null;
  private onBrowserToolCall: BrowserToolCallHandler | null = null;
  private onErrorMessage: ErrorMessageHandler | null = null;

  // Pending session operations
  private pendingSessionList: { resolve: (response: ListSessionsResponse) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  private pendingSessionLoad: { resolve: (sessionId: string) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  private pendingSessionResume: { resolve: (sessionId: string) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;

  private connectResolve: ((value: void) => void) | null = null;
  private connectReject: ((error: Error) => void) | null = null;

  // Heartbeat state
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
  private missedPongs = 0;
  private static readonly HEARTBEAT_INTERVAL_MS = 30_000;
  private static readonly PONG_TIMEOUT_MS = 10_000;
  private static readonly MAX_MISSED_PONGS = 2;

  constructor(settings: ACPSettings) {
    this.settings = settings;
  }

  updateSettings(settings: ACPSettings): void {
    this.settings = settings;
  }

  setConnectionStateHandler(handler: ConnectionStateHandler): void {
    this.onConnectionStateChange.add(handler);
  }

  removeConnectionStateHandler(handler: ConnectionStateHandler): void {
    this.onConnectionStateChange.delete(handler);
  }

  setSessionUpdateHandler(handler: SessionUpdateHandler): void {
    this.onSessionUpdate = handler;
  }

  setSessionCreatedHandler(handler: SessionCreatedHandler): void {
    this.onSessionCreated = handler;
  }

  setPromptCompleteHandler(handler: PromptCompleteHandler): void {
    this.onPromptComplete = handler;
  }

  setModelChangedHandler(handler: ModelChangedHandler): void {
    this.onModelChanged = handler;
  }

  /**
   * Set handler for model state changes (called when session is created/destroyed).
   * This replaces polling - the handler is called immediately with current state,
   * and again whenever session is created or disconnected.
   */
  setModelStateChangedHandler(handler: ModelStateChangedHandler): void {
    this.onModelStateChanged = handler;
    // Immediately notify with current state
    handler(this._modelState);
  }

  setAvailableCommandsChangedHandler(handler: AvailableCommandsChangedHandler): void {
    this.onAvailableCommandsChanged = handler;
    handler(this._availableCommands);
  }

  setPermissionRequestHandler(handler: PermissionRequestHandler): void {
    this.onPermissionRequest = handler;
  }

  setBrowserToolCallHandler(handler: BrowserToolCallHandler): void {
    this.onBrowserToolCall = handler;
  }

  setErrorMessageHandler(handler: ErrorMessageHandler): void {
    this.onErrorMessage = handler;
  }

  setSessionSwitchingHandler(handler: SessionSwitchingHandler | null): void {
    this.onSessionSwitching = handler;
  }

  private setState(state: ConnectionState, error?: string): void {
    this.connectionState = state;
    for (const handler of this.onConnectionStateChange) {
      handler(state, error);
    }
  }

  getState(): ConnectionState {
    return this.connectionState;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  // Reference: Zed's supports_images() in MessageEditor
  // Returns true if the agent supports image content in prompts
  get supportsImages(): boolean {
    return this._promptCapabilities?.image === true;
  }

  // Reference: Zed's prompt_capabilities in MessageEditor
  getPromptCapabilities(): PromptCapabilities | null {
    return this._promptCapabilities;
  }

  /**
   * Get the current model state (available models and current model ID).
   * Reference: Zed's AgentModelSelector reads from state.available_models
   */
  get modelState(): SessionModelState | null {
    return this._modelState;
  }

  /**
   * Get the list of available commands from the agent.
   */
  get availableCommands(): AvailableCommand[] {
    return this._availableCommands;
  }

  /**
   * Check if the agent supports model selection.
   * Reference: Zed's model_selector() returns Option<Rc<dyn AgentModelSelector>>
   */
  get supportsModelSelection(): boolean {
    return this._modelState !== null && this._modelState.availableModels.length > 0;
  }

  // ============================================================================
  // Session Capability Getters
  // Reference: Zed's AgentConnection supports_* methods
  // ============================================================================

  /**
   * Get the full agent capabilities.
   * Reference: Zed's AcpConnection.agent_capabilities
   */
  get agentCapabilities(): AgentCapabilities | null {
    return this._agentCapabilities;
  }

  /**
   * Check if the agent supports loading existing sessions.
   * Reference: Zed's AcpConnection.supports_load_session()
   */
  get supportsLoadSession(): boolean {
    return this._agentCapabilities?.loadSession === true;
  }

  /**
   * Check if the agent supports resuming existing sessions.
   * Reference: Zed's AcpConnection.supports_resume_session()
   */
  get supportsResumeSession(): boolean {
    return this._agentCapabilities?.sessionCapabilities?.resume !== undefined
      && this._agentCapabilities?.sessionCapabilities?.resume !== null;
  }

  /**
   * Check if the agent supports listing sessions.
   * Reference: Zed checks agent_capabilities.session_capabilities.list
   */
  get supportsSessionList(): boolean {
    return this._agentCapabilities?.sessionCapabilities?.list !== undefined
      && this._agentCapabilities?.sessionCapabilities?.list !== null;
  }

  /**
   * Check if the agent supports session history (load or resume).
   * Reference: Zed's AgentConnection.supports_session_history()
   */
  get supportsSessionHistory(): boolean {
    return this.supportsLoadSession || this.supportsResumeSession;
  }

  async connect(): Promise<void> {
    // Clean up any existing connection first
    if (this.ws) {
      const oldWs = this.ws;
      this.ws = null;
      try { oldWs.close(); } catch { /* ignore */ }
      this.stopHeartbeat();
      this.connectResolve = null;
      this.connectReject = null;
    }

    this.setState("connecting");

    return new Promise((resolve, reject) => {
      this.connectResolve = resolve;
      this.connectReject = reject;

      try {
        const ws = new WebSocket(
          this.settings.proxyUrl,
          this.settings.token
            ? [encodeWebSocketAuthProtocol(this.settings.token)]
            : undefined,
        );
        this.ws = ws;

        ws.onopen = () => {
          // Guard against race condition: check if this WebSocket is still current
          if (this.ws !== ws) {
            console.log("[ACPClient] WebSocket opened but already disconnected/replaced, closing stale socket");
            ws.close();
            return;
          }
          console.log("[ACPClient] WebSocket connected, sending connect command");
          this.send({ type: "connect" });
        };

        ws.onmessage = (event) => {
          // Ignore messages from stale sockets
          if (this.ws !== ws) return;
          try {
            const response: ProxyResponse = JSON.parse(event.data);
            this.handleResponse(response);
          } catch (error) {
            console.error("[ACPClient] Failed to parse message:", error);
          }
        };

        ws.onerror = () => {
          // Ignore errors from stale sockets
          if (this.ws !== ws) return;
          console.error("[ACPClient] WebSocket error");
          this.setState("error", "WebSocket connection error");
          this.connectReject?.(new Error("WebSocket connection error"));
          this.connectResolve = null;
          this.connectReject = null;
        };

        ws.onclose = (event) => {
          // Ignore close events from stale sockets (replaced by a new connection)
          if (this.ws !== ws) return;
          console.log("[ACPClient] WebSocket closed", event.code, event.reason);

          // Check if closed due to auth failure (code 4001) or other error during connect
          if (this.connectReject) {
            const errorMessage = event.reason || `Connection closed (code: ${event.code})`;
            this.setState("error", errorMessage);
            this.connectReject(new Error(errorMessage));
            this.connectResolve = null;
            this.connectReject = null;
          } else {
            this.setState("disconnected");
          }

          this.ws = null;
          this.sessionId = null;
        };
      } catch (error) {
        this.setState("error", (error as Error).message);
        reject(error);
      }
    });
  }

  private handleResponse(response: ProxyResponse): void {
    console.log("[ACPClient] Received:", response.type);

    switch (response.type) {
      case "status":
        if (response.payload.connected) {
          // Reference: Zed stores full agentCapabilities from status message
          this._agentCapabilities = response.payload.capabilities ?? null;
          this.setState("connected");
          this.startHeartbeat();
          this.connectResolve?.();
        } else {
          this.stopHeartbeat();
          this.setState("disconnected");
        }
        this.connectResolve = null;
        this.connectReject = null;
        break;

      case "error":
        console.error("[ACPClient] Error:", response.payload);
        const errorMsg = response.payload?.message || JSON.stringify(response.payload);
        this.pendingSessionTarget = null;
        // Reject pending session operations if any (clear their timers)
        if (this.pendingSessionList) {
          clearTimeout(this.pendingSessionList.timer);
          this.pendingSessionList.reject(new Error(errorMsg));
          this.pendingSessionList = null;
        }
        if (this.pendingSessionLoad) {
          clearTimeout(this.pendingSessionLoad.timer);
          this.pendingSessionLoad.reject(new Error(errorMsg));
          this.pendingSessionLoad = null;
        }
        if (this.pendingSessionResume) {
          clearTimeout(this.pendingSessionResume.timer);
          this.pendingSessionResume.reject(new Error(errorMsg));
          this.pendingSessionResume = null;
        }
        // If during connect phase, reject the connect promise
        if (this.connectReject) {
          this.connectReject(new Error(errorMsg));
          this.connectResolve = null;
          this.connectReject = null;
        } else {
          // After connected, notify UI about the error
          console.error("[ACPClient] Agent error:", errorMsg);
          this.onErrorMessage?.(errorMsg);
        }
        break;

      case "session_created":
        this.sessionId = response.payload.sessionId;
        this.pendingSessionTarget = null;
        // Reference: Zed stores promptCapabilities from session/initialize response
        this._promptCapabilities = response.payload.promptCapabilities ?? null;
        // Reference: Zed stores model state from NewSessionResponse.models
        this._modelState = response.payload.models ?? null;
        console.log("[ACPClient] Session created, promptCapabilities:", this._promptCapabilities, "models:", this._modelState);
        this.onSessionCreated?.(response.payload.sessionId);
        // Notify model state subscribers (replaces polling in useModels)
        this.onModelStateChanged?.(this._modelState);
        break;

      // Session history responses - Reference: Zed's AgentSessionList
      case "session_list":
        console.log("[ACPClient] Session list received:", response.payload.sessions.length, "sessions");
        if (this.pendingSessionList) {
          clearTimeout(this.pendingSessionList.timer);
          this.pendingSessionList.resolve(response.payload);
          this.pendingSessionList = null;
        }
        break;

      case "session_loaded":
        this.sessionId = response.payload.sessionId;
        this.pendingSessionTarget = null;
        this._promptCapabilities = response.payload.promptCapabilities ?? null;
        this._modelState = response.payload.models ?? null;
        console.log("[ACPClient] Session loaded:", response.payload.sessionId);
        if (this.pendingSessionLoad) {
          clearTimeout(this.pendingSessionLoad.timer);
          this.pendingSessionLoad.resolve(response.payload.sessionId);
          this.pendingSessionLoad = null;
        }
        this.onSessionLoaded?.(response.payload.sessionId);
        this.onModelStateChanged?.(this._modelState);
        break;

      case "session_resumed":
        this.sessionId = response.payload.sessionId;
        this.pendingSessionTarget = null;
        this._promptCapabilities = response.payload.promptCapabilities ?? null;
        this._modelState = response.payload.models ?? null;
        console.log("[ACPClient] Session resumed:", response.payload.sessionId);
        if (this.pendingSessionResume) {
          clearTimeout(this.pendingSessionResume.timer);
          this.pendingSessionResume.resolve(response.payload.sessionId);
          this.pendingSessionResume = null;
        }
        this.onSessionLoaded?.(response.payload.sessionId);
        this.onModelStateChanged?.(this._modelState);
        break;

      case "session_update":
        // Intercept available_commands_update for internal state
        const updateType = response.payload.update?.sessionUpdate;
        console.log("[ACPClient] session_update type:", updateType, "payload:", response.payload);
        if (updateType === "available_commands_update") {
          this._availableCommands = response.payload.update.availableCommands;
          console.log("[ACPClient] Available commands updated:", this._availableCommands.length, "commands");
          this.onAvailableCommandsChanged?.(this._availableCommands);
        }
        this.onSessionUpdate?.(response.payload.sessionId, response.payload.update);
        break;

      case "prompt_complete":
        this.onPromptComplete?.(response.payload.stopReason);
        break;

      case "permission_request":
        console.log("[ACPClient] Permission request:", response.payload);
        this.onPermissionRequest?.(response.payload);
        break;

      case "model_changed":
        console.log("[ACPClient] Model changed:", response.payload.modelId);
        if (this._modelState) {
          this._modelState = {
            ...this._modelState,
            currentModelId: response.payload.modelId,
          };
        }
        this.onModelChanged?.(response.payload.modelId);
        break;

      case "browser_tool_call":
        this.handleBrowserToolCall(response.callId, response.params);
        break;

      case "pong":
        this.missedPongs = 0;
        if (this.heartbeatTimeout) {
          clearTimeout(this.heartbeatTimeout);
          this.heartbeatTimeout = null;
        }
        break;
    }
  }

  private async handleBrowserToolCall(
    callId: string,
    params: BrowserToolParams,
  ): Promise<void> {
    console.log("[ACPClient] Browser tool call:", callId, params);

    if (!this.onBrowserToolCall) {
      console.error("[ACPClient] No browser tool handler registered");
      this.send({
        type: "browser_tool_result",
        callId,
        result: { error: "No browser tool handler registered" },
      });
      return;
    }

    try {
      const result = await this.onBrowserToolCall(params);
      this.send({
        type: "browser_tool_result",
        callId,
        result,
      });
    } catch (error) {
      console.error("[ACPClient] Browser tool error:", error);
      this.send({
        type: "browser_tool_result",
        callId,
        result: { error: (error as Error).message },
      });
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.missedPongs = 0;

    this.heartbeatInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.stopHeartbeat();
        return;
      }

      this.ws.send(JSON.stringify({ type: "ping" }));

      this.heartbeatTimeout = setTimeout(() => {
        this.missedPongs++;
        if (this.missedPongs >= ACPClient.MAX_MISSED_PONGS) {
          console.warn(`[ACPClient] Server unresponsive (${this.missedPongs} missed pongs), closing connection`);
          this.stopHeartbeat();
          this.ws?.close(4000, "Heartbeat timeout");
        }
      }, ACPClient.PONG_TIMEOUT_MS);
    }, ACPClient.HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  private send(message: ProxyMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }
    this.ws.send(JSON.stringify(message));
  }

  async createSession(cwd?: string, permissionMode?: string): Promise<void> {
    // Use provided cwd, or fall back to settings.cwd
    const sessionCwd = cwd ?? this.settings.cwd;
    this.send({ type: "new_session", payload: { cwd: sessionCwd, permissionMode } });
  }

  // Reference: Zed's MessageEditor.contents() builds Vec<acp::ContentBlock>
  // and sends via AcpThread.send()
  // Accepts either a string (for backward compatibility) or ContentBlock[]
  async sendPrompt(content: string | ContentBlock[]): Promise<void> {
    if (!this.sessionId) {
      throw new Error("No active session");
    }
    // Convert string to ContentBlock[] for backward compatibility
    const contentBlocks: ContentBlock[] = typeof content === "string"
      ? [{ type: "text", text: content }]
      : content;

    this.send({ type: "prompt", payload: { content: contentBlocks } });
  }

  cancel(): void {
    this.send({ type: "cancel" });
  }

  /**
   * Set the model for the current session.
   * Reference: Zed's AgentModelSelector.select_model() calls connection.set_session_model()
   */
  async setSessionModel(modelId: string): Promise<void> {
    if (!this.sessionId) {
      throw new Error("No active session");
    }
    this.send({ type: "set_session_model", payload: { modelId } });
  }

  respondToPermission(requestId: string, optionId: string | null): void {
    const outcome = optionId
      ? { outcome: "selected" as const, optionId }
      : { outcome: "cancelled" as const };

    this.send({
      type: "permission_response",
      payload: { requestId, outcome },
    });
  }

  // ============================================================================
  // Session History Methods
  // Reference: Zed's AgentSessionList trait and AgentConnection methods
  // ============================================================================

  /**
   * Set handler for session loaded/resumed events.
   */
  setSessionLoadedHandler(handler: SessionLoadedHandler): void {
    this.onSessionLoaded = handler;
  }

  /**
   * List existing sessions from the agent.
   * Reference: Zed's AcpSessionList.list_sessions()
   * @throws Error if agent doesn't support session listing
   */
  async listSessions(request?: ListSessionsRequest): Promise<ListSessionsResponse> {
    if (!this.supportsSessionList) {
      throw new Error("Listing sessions is not supported by this agent");
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingSessionList) {
          this.pendingSessionList = null;
          reject(new Error("List sessions timed out"));
        }
      }, 30000);
      this.pendingSessionList = { resolve, reject, timer };
      try {
        this.send({ type: "list_sessions", payload: request });
      } catch (err) {
        clearTimeout(timer);
        this.pendingSessionList = null;
        reject(err);
      }
    });
  }

  /**
   * Load an existing session with history replay.
   * Reference: Zed's AcpConnection.load_session()
   * @throws Error if agent doesn't support session loading
   */
  async loadSession(request: LoadSessionRequest): Promise<string> {
    if (!this.supportsLoadSession) {
      throw new Error("Loading sessions is not supported by this agent");
    }
    return new Promise((resolve, reject) => {
      this.pendingSessionTarget = request.sessionId;
      this.onSessionSwitching?.(request.sessionId);
      const timer = setTimeout(() => {
        if (this.pendingSessionLoad) {
          this.pendingSessionTarget = null;
          this.pendingSessionLoad = null;
          reject(new Error("Load session timed out"));
        }
      }, 60000);
      this.pendingSessionLoad = { resolve, reject, timer };
      try {
        this.send({ type: "load_session", payload: request });
      } catch (err) {
        clearTimeout(timer);
        this.pendingSessionTarget = null;
        this.pendingSessionLoad = null;
        reject(err);
      }
    });
  }

  /**
   * Resume an existing session without history replay.
   * Reference: Zed's AcpConnection.resume_session()
   * @throws Error if agent doesn't support session resuming
   */
  async resumeSession(request: ResumeSessionRequest): Promise<string> {
    if (!this.supportsResumeSession) {
      throw new Error("Resuming sessions is not supported by this agent");
    }
    return new Promise((resolve, reject) => {
      this.pendingSessionTarget = request.sessionId;
      this.onSessionSwitching?.(request.sessionId);
      const timer = setTimeout(() => {
        if (this.pendingSessionResume) {
          this.pendingSessionTarget = null;
          this.pendingSessionResume = null;
          reject(new Error("Resume session timed out"));
        }
      }, 30000);
      this.pendingSessionResume = { resolve, reject, timer };
      try {
        this.send({ type: "resume_session", payload: request });
      } catch (err) {
        clearTimeout(timer);
        this.pendingSessionTarget = null;
        this.pendingSessionResume = null;
        reject(err);
      }
    });
  }

  disconnect(): void {
    this.stopHeartbeat();

    // Reject any pending connect promise with a distinguishable error
    // This ensures the promise settles and callers can catch/ignore it
    if (this.connectReject) {
      this.connectReject(new DisconnectRequestedError());
    }
    this.connectResolve = null;
    this.connectReject = null;

    if (this.ws) {
      try {
        // Don't send disconnect to acp-link — keep agent process alive for reconnection
        // Just close the WebSocket
      } catch {
        // Ignore send errors during disconnect
      }
      this.ws.close();
      this.ws = null;
    }
    this.setState("disconnected");
    this.sessionId = null;
    this.pendingSessionTarget = null;
    this._modelState = null;
    this._agentCapabilities = null;
    this._availableCommands = [];
    // Notify model state subscribers that session is gone
    this.onModelStateChanged?.(null);
    this.onAvailableCommandsChanged?.([]);

    // Reject all pending operations before clearing (clear their timers too)
    const disconnectError = new Error("Disconnected");
    if (this.pendingSessionList) {
      clearTimeout(this.pendingSessionList.timer);
      this.pendingSessionList.reject(disconnectError);
      this.pendingSessionList = null;
    }
    if (this.pendingSessionLoad) {
      clearTimeout(this.pendingSessionLoad.timer);
      this.pendingSessionLoad.reject(disconnectError);
      this.pendingSessionLoad = null;
    }
    if (this.pendingSessionResume) {
      clearTimeout(this.pendingSessionResume.timer);
      this.pendingSessionResume.reject(disconnectError);
      this.pendingSessionResume = null;
    }
  }
}
