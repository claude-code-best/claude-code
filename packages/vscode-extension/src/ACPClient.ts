import * as acp from "@agentclientprotocol/sdk";
import { spawn, type ChildProcess } from "node:child_process";
import { Readable, Writable } from "node:stream";
import * as vscode from "vscode";
import { resolveAgent, type ResolvedAgent } from "./agentSpawner";

// =============================================================================
// Types re-exported in shape compatible with the webview protocol
// =============================================================================

export interface PendingPermission {
  resolve: (outcome: { outcome: "cancelled" } | { outcome: "selected"; optionId: string }) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface PendingElicitation {
  resolve: (response: acp.CreateElicitationResponse) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface ACPClientHandlers {
  onStatus: (status: { connected: boolean; agentInfo?: { name?: string; version?: string }; capabilities?: acp.AgentCapabilities; cwd?: string }) => void;
  onSessionCreated: (payload: {
    sessionId: string;
    promptCapabilities?: acp.PromptCapabilities;
    models?: acp.SessionModelState | null;
    modes?: acp.SessionModeState | null;
  }) => void;
  onSessionUpdate: (sessionId: string, update: acp.SessionNotification["update"]) => void;
  onPromptComplete: (stopReason: string) => void;
  onPermissionRequest: (request: {
    requestId: string;
    sessionId: string;
    options: acp.PermissionOption[];
    toolCall: acp.ToolCallUpdate;
  }) => void;
  onElicitationRequest: (request: {
    requestId: string;
    sessionId?: string;
    message: string;
    schema: acp.ElicitationSchema;
  }) => void;
  onError: (message: string) => void;
  onModeChanged?: (modeId: string) => void;
  /** Called when agent process exits unexpectedly; client will need a restart. */
  onProcessExit: (code: number | null, signal: NodeJS.Signals | null) => void;
  // VSCode FS hooks (used by Client implementation)
  readTextFile: (params: acp.ReadTextFileRequest) => Promise<acp.ReadTextFileResponse>;
  writeTextFile: (params: acp.WriteTextFileRequest) => Promise<acp.WriteTextFileResponse>;
}

export interface ACPClientOptions {
  extensionDir: string;
  enableFsCapabilities: boolean;
  permissionTimeoutMs?: number;
  outputChannel?: vscode.OutputChannel;
}

const PERMISSION_TIMEOUT_DEFAULT = 5 * 60 * 1000;
const ELICITATION_TIMEOUT_DEFAULT = 5 * 60 * 1000;
type SlashCommandType = "prompt" | "local" | "local-jsx";
type WebviewAvailableCommand = acp.AvailableCommand & { type?: SlashCommandType };

/**
 * Wraps `@agentclientprotocol/sdk` ClientSideConnection over a child-process
 * stdio stream and exposes a promise-friendly API.
 *
 * Lifecycle:
 *   start()        spawn `claude --acp`, run `initialize`, then notify status
 *   newSession()   create or reuse a session
 *   prompt()       send content blocks; returns when prompt completes
 *   cancel()       cancel current prompt turn
 *   shutdown()     dispose resources
 */
export class ACPClient {
  private proc: ChildProcess | null = null;
  private connection: acp.ClientSideConnection | null = null;
  private sessionId: string | null = null;
  private agentCapabilities: acp.AgentCapabilities | null = null;
  private promptCapabilities: acp.PromptCapabilities | null = null;
  private modelState: acp.SessionModelState | null = null;
  private modeState: acp.SessionModeState | null = null;
  private availableCommands: WebviewAvailableCommand[] = [];
  private resolved: ResolvedAgent | null = null;
  private pendingPermissions = new Map<string, PendingPermission>();
  private pendingElicitations = new Map<string, PendingElicitation>();
  private permCounter = 0;
  private elicitCounter = 0;
  private connectionClosedHandled = false;

  constructor(
    private readonly handlers: ACPClientHandlers,
    private readonly options: ACPClientOptions,
  ) {}

  // ---------------------------------------------------------------------------
  // State accessors
  // ---------------------------------------------------------------------------
  isRunning(): boolean {
    return this.proc !== null && this.proc.exitCode === null && !this.proc.killed;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  getCwd(): string | null {
    return this.resolved?.cwd ?? null;
  }

  getCapabilities(): acp.AgentCapabilities | null {
    return this.agentCapabilities;
  }

  getModelState(): acp.SessionModelState | null {
    return this.modelState;
  }

  getModeState(): acp.SessionModeState | null {
    return this.modeState;
  }

  getAvailableCommands(): WebviewAvailableCommand[] {
    return this.availableCommands;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------
  async start(): Promise<void> {
    if (this.isRunning()) return;

    let resolved: ResolvedAgent | null;
    try {
      resolved = resolveAgent(this.options.extensionDir);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.handlers.onError(msg);
      this.handlers.onStatus({ connected: false });
      return;
    }
    if (!resolved) {
      this.handlers.onError(
        "CCB CLI not found. Build the project (bun run build) or install `claude` on PATH.",
      );
      this.handlers.onStatus({ connected: false });
      return;
    }
    this.resolved = resolved;

    this.log(`spawning (${resolved.runtime}) ${resolved.command} ${resolved.args.join(" ")}`);
    let proc: ChildProcess;
    try {
      proc = spawn(resolved.command, resolved.args, {
        cwd: resolved.cwd,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        detached: process.platform !== "win32",
        env: buildAgentEnvironment(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.handlers.onError(`Failed to spawn agent: ${msg}`);
      this.handlers.onStatus({ connected: false });
      return;
    }
    this.proc = proc;
    this.connectionClosedHandled = false;

    // Capture stderr separately for diagnostics (don't pollute stdio JSON-RPC channel).
    proc.stderr?.setEncoding("utf-8");
    proc.stderr?.on("data", (chunk: string) => this.log(`[agent stderr] ${chunk.trimEnd()}`));

    proc.on("error", (err) => {
      this.handlers.onError(`Agent process error: ${err.message}`);
    });

    proc.on("exit", (code, signal) => {
      this.log(`agent exited code=${code} signal=${signal ?? ""}`);
      const wasMine = this.proc === proc;
      if (wasMine) {
        this.proc = null;
        this.connection = null;
        this.sessionId = null;
        this.availableCommands = [];
        this.modelState = null;
        this.modeState = null;
        this.failPendingPermissions("Agent process exited");
        this.failPendingElicitations("Agent process exited");
      }
      this.handlers.onProcessExit(code, signal);
      this.handlers.onStatus({ connected: false });
    });

    if (!proc.stdin || !proc.stdout) {
      this.handlers.onError("Agent stdio not available");
      return;
    }

    const input = Writable.toWeb(proc.stdin) as unknown as WritableStream<Uint8Array>;
    const output = Readable.toWeb(proc.stdout) as unknown as ReadableStream<Uint8Array>;
    const stream = acp.ndJsonStream(input, output);

    const connection = new acp.ClientSideConnection(() => this.makeClient(), stream);
    this.connection = connection;

    connection.closed
      .then(() => {
        if (this.connectionClosedHandled) return;
        this.connectionClosedHandled = true;
        this.log("ACP connection closed");
        this.connection = null;
        this.sessionId = null;
        this.failPendingPermissions("Connection closed");
        this.failPendingElicitations("Connection closed");
        this.handlers.onStatus({ connected: false });
      })
      .catch((err) => {
        this.connectionClosedHandled = true;
        this.log(`ACP connection error: ${(err as Error).message}`);
      });

    try {
      const initResult = await connection.initialize({
        protocolVersion: acp.PROTOCOL_VERSION,
        clientInfo: { name: "vscode-ccb", version: "0.3.0" },
        clientCapabilities: {
          fs: {
            readTextFile: this.options.enableFsCapabilities,
            writeTextFile: this.options.enableFsCapabilities,
          },
          elicitation: {
            form: {},
          },
        },
      });
      this.agentCapabilities = initResult.agentCapabilities ?? null;
      this.promptCapabilities = initResult.agentCapabilities?.promptCapabilities ?? null;
      this.handlers.onStatus({
        connected: true,
        agentInfo: initResult.agentInfo ?? undefined,
        capabilities: initResult.agentCapabilities,
        cwd: this.resolved?.cwd,
      });
      this.log("initialize complete");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.handlers.onError(`Initialize failed: ${msg}`);
      this.handlers.onStatus({ connected: false });
      this.shutdown();
    }
  }

  async newSession(permissionMode?: string): Promise<void> {
    if (!this.connection) throw new Error("Not connected");
    const cwd = this.resolved?.cwd;
    if (!cwd) throw new Error("No working directory available");
    const params: acp.NewSessionRequest = {
      cwd,
      mcpServers: [],
      ...(permissionMode ? ({ _meta: { permissionMode } } as Partial<acp.NewSessionRequest>) : {}),
    };
    const result = await this.connection.newSession(params);
    this.sessionId = result.sessionId;
    this.modelState = result.models ?? null;
    this.modeState = result.modes ?? null;
    this.handlers.onSessionCreated({
      sessionId: result.sessionId,
      promptCapabilities: this.promptCapabilities ?? undefined,
      models: this.modelState,
      modes: this.modeState,
    });
  }

  async prompt(content: acp.ContentBlock[]): Promise<void> {
    if (!this.connection || !this.sessionId) throw new Error("No active session");
    const result = await this.connection.prompt({
      sessionId: this.sessionId,
      prompt: content,
    });
    this.handlers.onPromptComplete(result.stopReason);
  }

  async cancel(): Promise<void> {
    if (!this.connection || !this.sessionId) return;
    // Resolve all pending permissions as cancelled before notifying agent.
    for (const [requestId, pending] of this.pendingPermissions) {
      clearTimeout(pending.timer);
      pending.resolve({ outcome: "cancelled" });
      this.pendingPermissions.delete(requestId);
    }
    this.cancelPendingElicitations("Prompt cancelled");
    try {
      await this.connection.cancel({ sessionId: this.sessionId });
    } catch (err) {
      this.log(`cancel failed: ${(err as Error).message}`);
    }
  }

  async setSessionModel(modelId: string): Promise<void> {
    if (!this.connection || !this.sessionId) throw new Error("No active session");
    if (!this.modelState) throw new Error("Model selection not supported");
    await this.connection.unstable_setSessionModel({
      sessionId: this.sessionId,
      modelId,
    });
    this.modelState = { ...this.modelState, currentModelId: modelId };
  }

  async setSessionMode(modeId: string): Promise<void> {
    if (!this.connection || !this.sessionId) throw new Error("No active session");
    await this.connection.setSessionMode({
      sessionId: this.sessionId,
      modeId,
    });
    if (this.modeState) {
      this.modeState = { ...this.modeState, currentModeId: modeId };
    }
    this.handlers.onModeChanged?.(modeId);
  }

  async listSessions(req?: { cwd?: string; cursor?: string }): Promise<acp.ListSessionsResponse> {
    if (!this.connection) throw new Error("Not connected");
    const cwd = req?.cwd ?? this.resolved?.cwd ?? "";
    const params: acp.ListSessionsRequest = { cwd };
    if (req?.cursor !== undefined) params.cursor = req.cursor;
    return this.connection.listSessions(params);
  }

  async loadSession(req: { sessionId: string; cwd?: string }): Promise<void> {
    if (!this.connection) throw new Error("Not connected");
    const cwd = req.cwd ?? this.resolved?.cwd;
    if (!cwd) throw new Error("No working directory");
    const result = await this.connection.loadSession({
      sessionId: req.sessionId,
      cwd,
      mcpServers: [],
    });
    this.sessionId = req.sessionId;
    this.modelState = result.models ?? null;
    this.modeState = result.modes ?? null;
    this.handlers.onSessionCreated({
      sessionId: req.sessionId,
      promptCapabilities: this.promptCapabilities ?? undefined,
      models: this.modelState,
      modes: this.modeState,
    });
  }

  async resumeSession(req: { sessionId: string; cwd?: string }): Promise<void> {
    if (!this.connection) throw new Error("Not connected");
    const cwd = req.cwd ?? this.resolved?.cwd;
    if (!cwd) throw new Error("No working directory");
    const result = await this.connection.unstable_resumeSession({
      sessionId: req.sessionId,
      cwd,
    });
    this.sessionId = req.sessionId;
    this.modelState = result.models ?? null;
    this.modeState = result.modes ?? null;
    this.handlers.onSessionCreated({
      sessionId: req.sessionId,
      promptCapabilities: this.promptCapabilities ?? undefined,
      models: this.modelState,
      modes: this.modeState,
    });
  }

  async respondToPermission(requestId: string, outcome: { outcome: "cancelled" } | { outcome: "selected"; optionId: string }): Promise<void> {
    const pending = this.pendingPermissions.get(requestId);
    if (!pending) {
      this.log(`permission response for unknown id ${requestId}`);
      return;
    }
    clearTimeout(pending.timer);
    this.pendingPermissions.delete(requestId);
    pending.resolve(outcome);
  }

  async respondToElicitation(requestId: string, response: acp.CreateElicitationResponse): Promise<void> {
    const pending = this.pendingElicitations.get(requestId);
    if (!pending) {
      this.log(`elicitation response for unknown id ${requestId}`);
      return;
    }
    clearTimeout(pending.timer);
    this.pendingElicitations.delete(requestId);
    pending.resolve(response);
  }

  shutdown(): void {
    this.failPendingPermissions("Client shutdown");
    this.failPendingElicitations("Client shutdown");
    if (this.proc) {
      terminateProcessTree(this.proc, (msg) => this.log(msg));
      this.proc = null;
    }
    this.connection = null;
    this.sessionId = null;
    this.availableCommands = [];
    this.modelState = null;
    this.modeState = null;
  }

  // ---------------------------------------------------------------------------
  // ACP Client implementation (callbacks the agent invokes on us)
  // ---------------------------------------------------------------------------
  private makeClient(): acp.Client {
    return {
      requestPermission: async (params) => {
        const requestId = this.nextPermissionId();
        const outcomePromise = new Promise<{ outcome: "cancelled" } | { outcome: "selected"; optionId: string }>((resolve, reject) => {
          const timer = setTimeout(() => {
            this.pendingPermissions.delete(requestId);
            this.log(`permission ${requestId} timed out`);
            resolve({ outcome: "cancelled" });
          }, this.options.permissionTimeoutMs ?? PERMISSION_TIMEOUT_DEFAULT);
          this.pendingPermissions.set(requestId, { resolve, reject, timer });
        });

        this.handlers.onPermissionRequest({
          requestId,
          sessionId: params.sessionId,
          options: params.options,
          toolCall: params.toolCall,
        });

        const outcome = await outcomePromise;
        return { outcome };
      },

      unstable_createElicitation: async (params) => {
        if (params.mode !== "form") {
          return { action: "decline" };
        }

        const requestId = this.nextElicitationId();
        const responsePromise = new Promise<acp.CreateElicitationResponse>((resolve, reject) => {
          const timer = setTimeout(() => {
            this.pendingElicitations.delete(requestId);
            this.log(`elicitation ${requestId} timed out`);
            resolve({ action: "cancel" });
          }, ELICITATION_TIMEOUT_DEFAULT);
          this.pendingElicitations.set(requestId, { resolve, reject, timer });
        });

        this.handlers.onElicitationRequest({
          requestId,
          sessionId: "sessionId" in params ? params.sessionId : undefined,
          message: params.message,
          schema: params.requestedSchema,
        });

        return responsePromise;
      },

      sessionUpdate: async (params) => {
        // Track current mode locally so the UI can stay in sync.
        if (params.update.sessionUpdate === "current_mode_update") {
          if (this.modeState) {
            this.modeState = { ...this.modeState, currentModeId: params.update.currentModeId };
          }
          this.handlers.onModeChanged?.(params.update.currentModeId);
        }
        // Cache slash-command catalog so the webview can replay it after a
        // remount race (the agent emits this update once, asynchronously,
        // immediately after newSession returns).
        if (params.update.sessionUpdate === "available_commands_update") {
          const update = {
            ...params.update,
            availableCommands: params.update.availableCommands.map(normalizeAvailableCommand),
          };
          this.availableCommands = update.availableCommands;
          this.handlers.onSessionUpdate(params.sessionId, update as acp.SessionNotification["update"]);
          return;
        }
        this.handlers.onSessionUpdate(params.sessionId, params.update);
      },

      readTextFile: this.handlers.readTextFile,

      writeTextFile: this.handlers.writeTextFile,
    };
  }

  private nextPermissionId(): string {
    return `perm_${Date.now()}_${++this.permCounter}`;
  }

  private nextElicitationId(): string {
    return `elicit_${Date.now()}_${++this.elicitCounter}`;
  }

  private failPendingPermissions(reason: string): void {
    for (const [requestId, pending] of this.pendingPermissions) {
      clearTimeout(pending.timer);
      pending.resolve({ outcome: "cancelled" });
      this.log(`permission ${requestId} cancelled: ${reason}`);
    }
    this.pendingPermissions.clear();
  }

  private cancelPendingElicitations(reason: string): void {
    for (const [requestId, pending] of this.pendingElicitations) {
      clearTimeout(pending.timer);
      pending.resolve({ action: "cancel" });
      this.log(`elicitation ${requestId} cancelled: ${reason}`);
    }
    this.pendingElicitations.clear();
  }

  private failPendingElicitations(reason: string): void {
    for (const [requestId, pending] of this.pendingElicitations) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
      this.log(`elicitation ${requestId} failed: ${reason}`);
    }
    this.pendingElicitations.clear();
  }

  private log(msg: string): void {
    this.options.outputChannel?.appendLine(`[ACPClient] ${msg}`);
  }
}

function normalizeAvailableCommand(command: acp.AvailableCommand): WebviewAvailableCommand {
  const rawType = command._meta?.ccbCommandType;
  if (rawType === "prompt" || rawType === "local" || rawType === "local-jsx") {
    return { ...command, type: rawType };
  }
  return { ...command };
}

function buildAgentEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  env.CCB_VSCODE_ACP = "1";
  if (process.platform === "win32") {
    env.CLAUDE_CODE_USE_POWERSHELL_TOOL ??= "1";
    env.CCB_VSCODE_ENABLE_BASH_TOOL ??= "0";
  }
  return env;
}

function terminateProcessTree(proc: ChildProcess, log: (msg: string) => void): void {
  const pid = proc.pid;
  if (proc.exitCode !== null || proc.killed) return;

  if (process.platform === "win32" && pid) {
    try {
      const killer = spawn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      killer.on("error", (err) => log(`taskkill failed for pid=${pid}: ${err.message}`));
      return;
    } catch (err) {
      log(`taskkill launch failed for pid=${pid}: ${(err as Error).message}`);
    }
  }

  if (process.platform !== "win32" && pid) {
    try {
      process.kill(-pid, "SIGTERM");
      return;
    } catch (err) {
      log(`process group kill failed for pid=${pid}: ${(err as Error).message}`);
    }
  }

  try {
    proc.kill("SIGTERM");
  } catch {
    /* already gone */
  }
}
