import React, { useCallback, useEffect, useRef, useState } from "react";
import { useACP } from "./hooks/useACP";
import { ChatView } from "./components/ChatView";
import { ElicitationDialog } from "./components/ElicitationDialog";
import { PermissionPanel } from "./components/PermissionPanel";
import { PromptInput, type PromptInputHandle } from "./components/PromptInput";
import { StatusBar } from "./components/StatusBar";
import { FALLBACK_PERMISSION_MODES } from "./lib/types";
import cssText from "./styles.css";

const SHOW_THINKING_DEFAULT = true;
const AUTOSCROLL_DEFAULT = true;
const PROMPT_HISTORY_LIMIT = 100;

export function App(): React.ReactElement {
  const acp = useACP();
  const inputRef = useRef<PromptInputHandle>(null);
  const [showThinking, setShowThinking] = useState(SHOW_THINKING_DEFAULT);
  const [autoScroll] = useState(AUTOSCROLL_DEFAULT);
  const [promptHistory, setPromptHistory] = useState<string[]>([]);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modeSelectorOpen, setModeSelectorOpen] = useState(false);

  // Subscribe to extension-side text injection (e.g. send_selection from editor).
  useEffect(() => {
    const off = acp.onInjectText((text) => {
      inputRef.current?.insert(text);
    });
    return off;
  }, [acp]);

  // Keep recent prompts available for ↑/↓ navigation. The extension also
  // persists them globally; this is a session-local convenience.
  const onPromptSubmitted = useCallback((text: string) => {
    if (!text) return;
    setPromptHistory((prev) => {
      const cleaned = prev.filter((p) => p !== text);
      return [text, ...cleaned].slice(0, PROMPT_HISTORY_LIMIT);
    });
  }, []);

  const handleSend = useCallback(
    (text: string, images?: Parameters<typeof acp.send>[1]) => {
      void acp.send(text, images);
    },
    [acp],
  );

  const handleCancel = useCallback(() => acp.cancel(), [acp]);

  const handleNewChat = useCallback(() => {
    acp.newSession(acp.state.currentMode || "default");
  }, [acp]);

  const handleCycleMode = useCallback(() => {
    const modes = acp.state.modeState?.availableModes.map((m) => m.id) ?? Array.from(FALLBACK_PERMISSION_MODES);
    if (modes.length === 0) return;
    const currentIndex = Math.max(0, modes.indexOf(acp.state.currentMode));
    const next = modes[(currentIndex + 1) % modes.length];
    acp.setMode(next);
  }, [acp]);

  const handleOpenModelPicker = useCallback(() => {
    setModeSelectorOpen(false);
    setModelPickerOpen(true);
  }, []);

  const handleSetModeFromSlash = useCallback((modeId: string) => {
    setModelPickerOpen(false);
    setModeSelectorOpen(false);
    acp.setMode(modeId);
  }, [acp]);

  const handleToggleThinking = useCallback(() => {
    setShowThinking((v) => !v);
  }, []);

  const handlePermissionPanelRespond = useCallback(
    (requestId: string, optionId: string | null, approved: boolean) => {
      acp.respondPermission(requestId, optionId, approved);
    },
    [acp],
  );

  const placeholder = computePlaceholder(acp.state.connection, acp.state.isLoading, acp.state.pendingPermissions.length);
  const isInputDisabled = acp.state.connection !== "connected";

  return (
    <>
      <style>{cssText}</style>
      <div className="app-container">
        <header className="header-bar">
          <h2>CCB</h2>
          <div className="header-actions">
            <button type="button" onClick={handleToggleThinking} title="Toggle extended thinking">
              {showThinking ? "Hide thoughts" : "Show thoughts"}
            </button>
            <button type="button" onClick={handleNewChat} title="New chat">+ New</button>
          </div>
        </header>

        {acp.state.errorBanner && (
          <div className="banner banner-error">
            <span>{acp.state.errorBanner}</span>
          </div>
        )}
        {acp.state.noticeBanner && (
          <div className={`banner banner-${acp.state.noticeBanner.level}`}>
            <span>{acp.state.noticeBanner.message}</span>
          </div>
        )}

        <ChatView
          entries={acp.state.entries}
          isLoading={acp.state.isLoading}
          showThinking={showThinking}
          autoScroll={autoScroll}
          onApplyDiff={acp.applyDiff}
          onOpenFile={acp.openFile}
        />

        <PermissionPanel
          requests={acp.state.pendingPermissions}
          onRespond={handlePermissionPanelRespond}
        />

        <ElicitationDialog
          requests={acp.state.pendingElicitations}
          onRespond={acp.respondElicitation}
        />

        <PromptInput
          ref={inputRef}
          disabled={isInputDisabled}
          isLoading={acp.state.isLoading}
          placeholder={placeholder}
          availableCommands={acp.state.availableCommands}
          permissionMode={acp.state.currentMode || "default"}
          onSend={handleSend}
          onCancel={handleCancel}
          onCycleMode={handleCycleMode}
          onNewSession={handleNewChat}
          onOpenModelPicker={handleOpenModelPicker}
          onSetMode={handleSetModeFromSlash}
          findFiles={acp.findFiles}
          promptHistory={promptHistory}
          onPromptSubmitted={onPromptSubmitted}
        />

        <StatusBar
          connection={acp.state.connection}
          isLoading={acp.state.isLoading}
          modelState={acp.state.modelState}
          modeState={acp.state.modeState}
          currentMode={acp.state.currentMode}
          cwd={acp.state.cwd}
          pendingPermissions={acp.state.pendingPermissions.length}
          entries={acp.state.entries}
          usage={acp.state.usage}
          onModelChange={acp.setModel}
          onModeChange={acp.setMode}
          modelPickerOpen={modelPickerOpen}
          onModelPickerOpenChange={setModelPickerOpen}
          modeSelectorOpen={modeSelectorOpen}
          onModeSelectorOpenChange={setModeSelectorOpen}
        />
      </div>
    </>
  );
}

function computePlaceholder(connection: string, isLoading: boolean, pendingPermissions: number): string {
  if (connection !== "connected") {
    if (connection === "connecting") return "Connecting to agent...";
    return "Agent disconnected — try Restart Agent from the title bar";
  }
  if (pendingPermissions > 0) return `Waiting on ${pendingPermissions} permission${pendingPermissions === 1 ? "" : "s"}...`;
  if (isLoading) return "Working — Esc to cancel";
  return "Ask Claude...   /  for commands  ·  @  for files";
}
