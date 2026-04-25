import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import { ACPClient } from "./ACPClient";
import { EditorBridge } from "./EditorBridge";
import { HistoryManager } from "./HistoryManager";
import { StatusBarManager, type StatusBarState } from "./StatusBarManager";

// We don't import the webview protocol module directly — we keep the
// bridge protocol *shape* identical via inline types so both ends stay loose.
// (The webview/lib/protocol.ts file is the single source of truth.)
type AnyMessage = { type: string; payload?: unknown; requestId?: string };

const PERMISSION_MODES = ["default", "acceptEdits", "plan", "bypassPermissions"] as const;
type PermissionMode = (typeof PERMISSION_MODES)[number];

const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000;

export class ChatViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private view: vscode.WebviewView | undefined;
  private client: ACPClient;
  private readonly outputChannel: vscode.OutputChannel;
  private readonly editorBridge: EditorBridge;
  private readonly history: HistoryManager;
  private currentPermissionMode: PermissionMode;
  private currentSessionId: string | null = null;
  private currentMode = "";
  private disposed = false;
  private connectedOnce = false;
  /** Becomes true once the webview React tree posts ext:webview_ready. */
  private webviewReady = false;
  /**
   * Buffer for postMessage() calls issued before the webview signaled readiness.
   * VSCode's postMessage is fire-and-forget; if the receiving listener has not
   * attached yet (cold start race), the message is silently dropped. We queue
   * here and flush on ext:webview_ready.
   */
  private readyQueue: unknown[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly statusBar: StatusBarManager,
    globalState: vscode.Memento,
  ) {
    this.outputChannel = vscode.window.createOutputChannel("CCB");
    this.editorBridge = new EditorBridge();
    this.history = new HistoryManager(globalState);
    this.currentPermissionMode = readPermissionModeSetting();
    this.client = this.createClient();
  }

  // ---------------------------------------------------------------------------
  // VSCode lifecycle
  // ---------------------------------------------------------------------------
  resolveWebviewView(webviewView: vscode.WebviewView): void {
    // First resolve vs replacing an existing view. When `this.view` was already
    // set, the prior React tree is gone and any messages still in readyQueue
    // belonged to that dead listener — clear them. When this is the first
    // resolve, callers (e.g. sendSelection invoked before sidebar opened) may
    // have legitimately queued ext:inject_text / ext:notice; preserve those.
    const replacingView = this.view !== undefined;
    this.view = webviewView;
    // Reset readiness — a freshly resolved view always means a fresh React mount.
    this.webviewReady = false;
    if (replacingView) {
      this.readyQueue = [];
    }
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist")],
    };
    // Register the receiver BEFORE assigning HTML so we never miss the
    // webview's first ext:webview_ready (Codex finding 2026-04-25).
    webviewView.webview.onDidReceiveMessage((msg: AnyMessage) => {
      void this.handleWebviewMessage(msg);
    });
    webviewView.webview.html = this.buildHtml(webviewView.webview);

    webviewView.onDidChangeVisibility(() => {
      if (!webviewView.visible) return;
      if (!this.client.isRunning()) {
        void this.client.start();
      }
      // Re-push cached commands every time the sidebar becomes visible —
      // hidden webviews can miss postMessage deliveries even with
      // retainContextWhenHidden=true on certain VSCode builds.
      const cmds = this.client.getAvailableCommands();
      if (cmds.length > 0) {
        this.postToWebview({ type: "ext:available_commands", payload: { commands: cmds } });
      } else {
        this.scheduleCommandsRefresh();
      }
    });

    void this.client.start();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.client.shutdown();
    this.outputChannel.dispose();
  }

  // ---------------------------------------------------------------------------
  // Public commands invoked from extension.ts
  // ---------------------------------------------------------------------------
  async newChat(): Promise<void> {
    this.connectedOnce = false;
    this.client.shutdown();
    this.postToWebview({ type: "ext:notice", payload: { level: "info", message: "Starting a new session..." } });
    this.client = this.createClient();
    await this.client.start();
  }

  cancel(): void {
    void this.client.cancel();
  }

  cycleMode(): void {
    const next = nextPermissionMode(this.currentPermissionMode);
    void this.setPermissionMode(next);
  }

  async sendSelection(): Promise<void> {
    const ctx = this.editorBridge.getSelectedTextWithContext();
    if (!ctx) {
      void vscode.window.showInformationMessage("No text selected.");
      return;
    }
    const text = `Here is code from \`${ctx.filePath}\` (lines ${ctx.startLine}-${ctx.endLine}, ${ctx.language}):\n\`\`\`${ctx.language}\n${ctx.selectedText}\n\`\`\``;
    this.postToWebview({ type: "ext:inject_text", payload: { text } });
    await this.sendPromptText(text);
  }

  async sendFileContext(): Promise<void> {
    const ctx = this.editorBridge.getActiveFileContext();
    if (!ctx) {
      void vscode.window.showInformationMessage("No active editor.");
      return;
    }
    const text = `Here is the full content of \`${ctx.filePath}\` (${ctx.language}):\n\`\`\`${ctx.language}\n${ctx.content}\n\`\`\``;
    this.postToWebview({ type: "ext:inject_text", payload: { text } });
    await this.sendPromptText(text);
  }

  restartAgent(): void {
    void this.newChat();
  }

  openHistory(): void {
    const entries = this.history.getRecent(20);
    void vscode.window
      .showQuickPick(
        entries.map((e) => ({
          label: e.title || e.id,
          description: new Date(e.timestamp).toLocaleString(),
          detail: e.preview,
          id: e.id,
        })),
        { title: "CCB session history", placeHolder: "Pick a session to resume" },
      )
      .then((pick) => {
        if (!pick) return;
        this.postToWebview({ type: "ext:notice", payload: { level: "info", message: `Resuming session ${pick.id}` } });
        // Forward to webview so it can request resume_session through the bridge.
        void this.handleWebviewMessage({ type: "ext:resume_session", payload: { sessionId: pick.id } });
      });
  }

  clearScreen(): void {
    this.postToWebview({ type: "ext:notice", payload: { level: "info", message: "screen cleared" } });
    // Webview interprets this and clears its message list (handled in App.tsx).
    this.postToWebview({ type: "ext:cwd", payload: { cwd: this.client.getCwd() ?? "" } });
  }

  searchHistory(): void {
    const prompts = this.history.getPromptHistory();
    if (prompts.length === 0) {
      void vscode.window.showInformationMessage("No prompt history yet.");
      return;
    }
    void vscode.window
      .showQuickPick(prompts.slice(0, 50), { title: "Search prompt history", matchOnDescription: true })
      .then((pick) => {
        if (!pick) return;
        this.postToWebview({ type: "ext:inject_text", payload: { text: pick } });
      });
  }

  toggleThinking(): void {
    const cfg = vscode.workspace.getConfiguration("ccb");
    const current = cfg.get<boolean>("showThinking", true);
    void cfg.update("showThinking", !current, vscode.ConfigurationTarget.Global);
    this.postToWebview({ type: "ext:notice", payload: { level: "info", message: `Extended thinking ${!current ? "shown" : "hidden"}` } });
  }

  // ---------------------------------------------------------------------------
  // Webview message handling
  // ---------------------------------------------------------------------------
  private async handleWebviewMessage(msg: AnyMessage): Promise<void> {
    switch (msg.type) {
      case "ext:webview_ready": {
        // Mark ready and flush anything that was queued before the React tree
        // mounted its message listener.
        const wasQueued = this.readyQueue.length;
        this.webviewReady = true;
        if (wasQueued > 0) {
          for (const m of this.readyQueue) {
            this.view?.webview.postMessage(m);
          }
          this.readyQueue = [];
        }
        // Re-publish current state so a freshly-mounted webview catches up.
        const caps = this.client.getCapabilities();
        this.postToWebview({
          type: "ext:status",
          payload: {
            connected: this.client.isRunning(),
            capabilities: caps ?? undefined,
            cwd: this.client.getCwd() ?? undefined,
          },
        });
        if (this.currentSessionId) {
          this.postToWebview({
            type: "ext:session_created",
            payload: {
              sessionId: this.currentSessionId,
              models: this.client.getModelState(),
              modes: this.client.getModeState(),
            },
          });
        }
        if (this.currentMode) {
          this.postToWebview({ type: "ext:mode_changed", payload: { modeId: this.currentMode } });
        }
        const cachedCommands = this.client.getAvailableCommands();
        if (cachedCommands.length > 0) {
          this.postToWebview({ type: "ext:available_commands", payload: { commands: cachedCommands } });
        }
        // Always also schedule a polling refresh — the cached snapshot may be
        // stale (commands changed), or the agent's first
        // `available_commands_update` may still be in flight when the webview
        // mounts.
        this.scheduleCommandsRefresh();
        return;
      }

      case "ext:new_session": {
        const payload = msg.payload as { permissionMode?: string } | undefined;
        const mode = (payload?.permissionMode as PermissionMode | undefined) ?? this.currentPermissionMode;
        try {
          await this.client.newSession(mode);
        } catch (err) {
          this.sendError(err);
        }
        return;
      }

      case "ext:prompt": {
        const payload = msg.payload as { content: Array<{ type: string; text?: string; data?: string; mimeType?: string; uri?: string }> } | undefined;
        if (!payload) return;
        // Capture the first text block in prompt history for Up/Down nav.
        const firstText = payload.content.find((c) => c.type === "text" && typeof c.text === "string")?.text;
        if (firstText) this.history.pushPrompt(firstText);
        // The webview can dispatch ext:prompt before bootstrapSession() has
        // resolved. Without an active session ACPClient.prompt() throws "No
        // active session" and the user sees nothing happen. Lazily create one
        // here so the first message always lands.
        try {
          if (!this.client.getSessionId()) {
            await this.client.newSession(this.currentPermissionMode);
          }
          await this.client.prompt(payload.content as Parameters<ACPClient["prompt"]>[0]);
        } catch (err) {
          this.sendError(err);
        }
        return;
      }

      case "ext:cancel": {
        await this.client.cancel();
        return;
      }

      case "ext:permission_response": {
        const payload = msg.payload as { requestId: string; outcome: { outcome: "cancelled" } | { outcome: "selected"; optionId: string } } | undefined;
        if (!payload) return;
        await this.client.respondToPermission(payload.requestId, payload.outcome);
        return;
      }

      case "ext:elicitation_response": {
        const payload = msg.payload as {
          requestId: string;
          response: Parameters<ACPClient["respondToElicitation"]>[1];
        } | undefined;
        if (!payload) return;
        await this.client.respondToElicitation(payload.requestId, payload.response);
        return;
      }

      case "ext:set_session_model": {
        const payload = msg.payload as { modelId: string } | undefined;
        if (!payload) return;
        try {
          await this.client.setSessionModel(payload.modelId);
          this.statusBar.updateModel(payload.modelId);
          this.postToWebview({ type: "ext:model_changed", payload: { modelId: payload.modelId } });
        } catch (err) {
          this.sendError(err);
        }
        return;
      }

      case "ext:set_session_mode": {
        const payload = msg.payload as { modeId: string } | undefined;
        if (!payload) return;
        await this.setPermissionMode(payload.modeId as PermissionMode);
        return;
      }

      case "ext:list_sessions": {
        try {
          const result = await this.client.listSessions(msg.payload as Parameters<ACPClient["listSessions"]>[0]);
          this.postToWebview({ type: "ext:session_list", payload: result });
        } catch (err) {
          this.sendError(err);
        }
        return;
      }

      case "ext:load_session": {
        const payload = msg.payload as { sessionId: string; cwd?: string } | undefined;
        if (!payload) return;
        try {
          await this.client.loadSession(payload);
        } catch (err) {
          this.sendError(err);
        }
        return;
      }

      case "ext:resume_session": {
        const payload = msg.payload as { sessionId: string; cwd?: string } | undefined;
        if (!payload) return;
        try {
          await this.client.resumeSession(payload);
        } catch (err) {
          this.sendError(err);
        }
        return;
      }

      case "ext:open_file": {
        const payload = msg.payload as { path: string; line?: number } | undefined;
        if (!payload) return;
        await this.editorBridge.openFile(payload.path, payload.line);
        return;
      }

      case "ext:copy": {
        const payload = msg.payload as { text: string } | undefined;
        if (!payload) return;
        await this.editorBridge.copyToClipboard(payload.text);
        void vscode.window.showInformationMessage("Copied to clipboard");
        return;
      }

      case "ext:apply_diff": {
        const payload = msg.payload as { path: string; oldText?: string | null; newText: string } | undefined;
        if (!payload) return;
        try {
          await this.editorBridge.showDiff(payload.path, payload.oldText, payload.newText);
        } catch (err) {
          this.sendError(err);
        }
        return;
      }

      case "ext:send_selection": {
        await this.sendSelection();
        return;
      }

      case "ext:send_file": {
        await this.sendFileContext();
        return;
      }

      case "ext:find_files": {
        const payload = msg.payload as { query: string; requestId: string; max?: number } | undefined;
        if (!payload) return;
        try {
          const files = await this.editorBridge.findFiles(payload.query, payload.max);
          this.postToWebview({
            type: "ext:find_files_result",
            payload: { requestId: payload.requestId, files },
          });
        } catch (err) {
          this.sendError(err);
        }
        return;
      }

      case "ext:get_diagnostics": {
        const payload = msg.payload as { uri?: string; requestId: string } | undefined;
        if (!payload) return;
        const items = this.editorBridge.getDiagnostics(payload.uri);
        this.postToWebview({
          type: "ext:diagnostics_result",
          payload: { requestId: payload.requestId, items },
        });
        return;
      }

      case "ext:restart_agent": {
        await this.newChat();
        return;
      }

      case "ext:save_history_meta": {
        const payload = msg.payload as { sessionId: string; title: string; preview: string; messageCount: number; model: string } | undefined;
        if (!payload) return;
        this.history.upsert({
          id: payload.sessionId,
          title: payload.title,
          timestamp: Date.now(),
          messageCount: payload.messageCount,
          model: payload.model,
          preview: payload.preview,
          cwd: this.client.getCwd() ?? undefined,
        });
        this.history.setLastSessionId(payload.sessionId);
        return;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------
  private async sendPromptText(text: string): Promise<void> {
    if (!this.currentSessionId) {
      // Defer: send_session implicitly creates one if needed.
      try {
        await this.client.newSession(this.currentPermissionMode);
      } catch (err) {
        this.sendError(err);
        return;
      }
    }
    try {
      await this.client.prompt([{ type: "text", text }]);
    } catch (err) {
      this.sendError(err);
    }
  }

  private async setPermissionMode(mode: PermissionMode): Promise<void> {
    this.currentPermissionMode = mode;
    this.currentMode = mode;
    this.statusBar.updateMode(mode);
    this.postToWebview({ type: "ext:mode_changed", payload: { modeId: mode } });

    // Persist as a workspace-scoped default for next launches.
    try {
      await vscode.workspace
        .getConfiguration("ccb")
        .update("permissionMode", mode, vscode.ConfigurationTarget.Workspace);
    } catch {
      /* may not be a workspace; ignore */
    }

    // Try to apply on the live session via ACP setSessionMode. If the agent
    // rejects (no live mode state, methodNotFound, or any other error), fall
    // back to recreating the session with the new mode in `_meta` — that's
    // the only path that's guaranteed to work for agents that don't implement
    // `session/set_mode` server-side.
    const liveSession = this.client.getModeState() && this.client.getSessionId();
    if (liveSession) {
      try {
        await this.client.setSessionMode(mode);
        return;
      } catch (err) {
        this.outputChannel.appendLine(
          `[ChatViewProvider] setSessionMode rejected (${(err as Error).message}); falling back to session reset`,
        );
      }
    }
    // Fallback: replay newSession with the new permissionMode. The current
    // conversation is dropped — that's the cost of the agent not supporting
    // live mode switching. We surface a notice so the user understands.
    this.postToWebview({
      type: "ext:notice",
      payload: { level: "info", message: `Session reset to apply mode "${mode}"` },
    });
    try {
      await this.client.newSession(mode);
    } catch (err) {
      this.sendError(err);
    }
  }

  private createClient(): ACPClient {
    const enableFs = vscode.workspace.getConfiguration("ccb").get<boolean>("enableFsCapabilities", true);

    const client = new ACPClient(
      {
        onStatus: (status) => {
          if (status.connected && !this.connectedOnce) {
            this.connectedOnce = true;
            // Auto-create a session as soon as the agent comes up so the user can chat.
            const resumeId = vscode.workspace.getConfiguration("ccb").get<boolean>("resumeLastSession", true)
              ? this.history.getLastSessionId()
              : undefined;
            void this.bootstrapSession(resumeId).catch((err) => this.sendError(err));
          }
          this.statusBar.update(status.connected ? "idle" : "disconnected");
          this.postToWebview({ type: "ext:status", payload: status });
          if (status.cwd) this.postToWebview({ type: "ext:cwd", payload: { cwd: status.cwd } });
        },
        onSessionCreated: (payload) => {
          this.currentSessionId = payload.sessionId;
          if (payload.models?.currentModelId) {
            this.statusBar.updateModel(payload.models.currentModelId);
          }
          if (payload.modes?.currentModeId) {
            this.currentMode = payload.modes.currentModeId;
            this.statusBar.updateMode(payload.modes.currentModeId);
          }
          this.postToWebview({ type: "ext:session_created", payload });
        },
        onSessionUpdate: (sessionId, update) => {
          this.postToWebview({ type: "ext:session_update", payload: { sessionId, update } });
          // Belt-and-braces: also push a dedicated ext:available_commands
          // event so the webview always sees the catalog even if the inline
          // session_update path is missed by an early-mounted reducer.
          if (update.sessionUpdate === "available_commands_update") {
            this.postToWebview({
              type: "ext:available_commands",
              payload: { commands: update.availableCommands },
            });
          }
        },
        onPromptComplete: (stopReason) => {
          this.statusBar.update("idle");
          this.postToWebview({ type: "ext:prompt_complete", payload: { stopReason } });
          // Persist a lightweight record so the user can resume later.
          if (this.currentSessionId) {
            this.history.setLastSessionId(this.currentSessionId);
          }
        },
        onPermissionRequest: (req) => {
          this.statusBar.update("waiting_permission");
          this.postToWebview({ type: "ext:permission_request", payload: req });
        },
        onElicitationRequest: (req) => {
          this.statusBar.update("waiting_permission");
          this.postToWebview({ type: "ext:elicitation_request", payload: req });
        },
        onError: (message) => {
          this.outputChannel.appendLine(`[CCB] ${message}`);
          this.postToWebview({ type: "ext:error", payload: { message } });
        },
        onModeChanged: (modeId) => {
          this.currentMode = modeId;
          this.statusBar.updateMode(modeId);
          this.postToWebview({ type: "ext:mode_changed", payload: { modeId } });
        },
        onProcessExit: (code) => {
          if (code !== 0 && code !== null) {
            this.postToWebview({
              type: "ext:notice",
              payload: { level: "error", message: `Agent exited with code ${code}` },
            });
          }
        },
        readTextFile: async ({ path: absPath, line, limit }) => {
          const content = await this.editorBridge.acpReadTextFile(absPath, line ?? undefined, limit ?? undefined);
          return { content };
        },
        writeTextFile: async ({ path: absPath, content }) => {
          await this.editorBridge.acpWriteTextFile(absPath, content);
          return {};
        },
      },
      {
        extensionDir: this.extensionUri.fsPath,
        enableFsCapabilities: enableFs,
        permissionTimeoutMs: PERMISSION_TIMEOUT_MS,
        outputChannel: this.outputChannel,
      },
    );
    return client;
  }

  private async bootstrapSession(resumeId: string | undefined): Promise<void> {
    if (resumeId) {
      const caps = this.client.getCapabilities();
      const supportsResume = caps?.sessionCapabilities?.resume != null;
      const supportsLoad = caps?.loadSession === true;
      try {
        if (supportsResume) {
          await this.client.resumeSession({ sessionId: resumeId });
          return;
        }
        if (supportsLoad) {
          await this.client.loadSession({ sessionId: resumeId });
          return;
        }
      } catch (err) {
        this.outputChannel.appendLine(`[CCB] resume/load failed (${(err as Error).message}), creating new session`);
      }
    }
    await this.client.newSession(this.currentPermissionMode);
  }

  private sendError(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this.outputChannel.appendLine(`[CCB] ${message}`);
    this.postToWebview({ type: "ext:error", payload: { message } });
  }

  private postToWebview(message: unknown): void {
    // Ready barrier: VSCode's webview.postMessage is fire-and-forget. If the
    // React tree hasn't mounted its message listener yet (cold start race),
    // the message is silently dropped. Queue until ext:webview_ready arrives,
    // at which point handleWebviewMessage flushes the queue.
    if (!this.webviewReady) {
      this.readyQueue.push(message);
      return;
    }
    this.view?.webview.postMessage(message);
  }

  /**
   * Polls the ACPClient command cache and pushes them to the webview as soon
   * as they show up. Cold-start can be 2-5 seconds (spawn + initialize +
   * newSession + agent's setTimeout(0) emit), so we extend the polling window
   * to 30s. Once delivered we stop. Multiple concurrent calls are coalesced
   * via a generation counter so we don't spam the webview.
   */
  private commandsRefreshGen = 0;
  private scheduleCommandsRefresh(): void {
    const myGen = ++this.commandsRefreshGen;
    let attempts = 0;
    const maxAttempts = 150; // 150 × 200ms = 30s
    const tick = () => {
      // A newer scheduler superseded us — bail out so we don't double-push.
      if (myGen !== this.commandsRefreshGen) return;
      // The view was disposed; stop polling.
      if (!this.view) return;
      attempts += 1;
      const cmds = this.client.getAvailableCommands();
      if (cmds.length > 0) {
        this.postToWebview({ type: "ext:available_commands", payload: { commands: cmds } });
        return;
      }
      if (attempts < maxAttempts) {
        setTimeout(tick, 200);
      }
    };
    setTimeout(tick, 100);
  }

  private buildHtml(webview: vscode.Webview): string {
    const nonce = randomBytes(16).toString("hex");
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview.js"),
    );
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  <title>CCB Chat</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function readPermissionModeSetting(): PermissionMode {
  const value = vscode.workspace.getConfiguration("ccb").get<string>("permissionMode", "default");
  return (PERMISSION_MODES as readonly string[]).includes(value) ? (value as PermissionMode) : "default";
}

function nextPermissionMode(current: PermissionMode): PermissionMode {
  const idx = PERMISSION_MODES.indexOf(current);
  return PERMISSION_MODES[(idx + 1) % PERMISSION_MODES.length];
}

// Re-export for any downstream type consumers (none yet).
export type ChatStatusBarState = StatusBarState;
