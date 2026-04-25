import React from "react";
import type { ConnectionState, ThreadEntry } from "../lib/types";
import type { SessionModelState, SessionModeState } from "../lib/acp/types";
import type { UsageInfo } from "../hooks/useACP";
import { ModelPicker } from "./ModelPicker";
import { ModeSelector } from "./ModeSelector";

interface StatusBarProps {
  connection: ConnectionState;
  isLoading: boolean;
  modelState: SessionModelState | null;
  modeState: SessionModeState | null;
  currentMode: string;
  cwd: string;
  pendingPermissions: number;
  entries: ThreadEntry[];
  usage: UsageInfo | null;
  onModelChange: (modelId: string) => void;
  onModeChange: (modeId: string) => void;
  modelPickerOpen?: boolean;
  onModelPickerOpenChange?: (open: boolean) => void;
  modeSelectorOpen?: boolean;
  onModeSelectorOpenChange?: (open: boolean) => void;
}

export function StatusBar({
  connection,
  isLoading,
  modelState,
  modeState,
  currentMode,
  cwd,
  pendingPermissions,
  entries,
  usage,
  onModelChange,
  onModeChange,
  modelPickerOpen,
  onModelPickerOpenChange,
  modeSelectorOpen,
  onModeSelectorOpenChange,
}: StatusBarProps): React.ReactElement {
  const dot = dotClass({ connection, isLoading, pendingPermissions });
  const status = statusLabel({ connection, isLoading, pendingPermissions });
  const cwdShort = cwd ? shortenPath(cwd) : "";
  const turnsLabel = `${countConversationTurns(entries)} turn${countConversationTurns(entries) === 1 ? "" : "s"}`;
  const usageLabel = usage ? formatUsage(usage) : null;

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        <div className="status-indicator">
          <span className={`status-dot ${dot}`} />
          <span>{status}</span>
        </div>
        <ModeSelector
          state={modeState}
          currentMode={currentMode}
          onSelect={onModeChange}
          open={modeSelectorOpen}
          onOpenChange={onModeSelectorOpenChange}
        />
        <ModelPicker
          state={modelState}
          onSelect={onModelChange}
          open={modelPickerOpen}
          onOpenChange={onModelPickerOpenChange}
        />
      </div>
      <div className="status-bar-right">
        {usage && (
          <span className="status-usage" title={usageTooltip(usage)}>
            {usageLabel}
          </span>
        )}
        <span className="status-cwd" title={cwd}>{cwdShort}</span>
        <span className="status-turns">{turnsLabel}</span>
      </div>
    </div>
  );
}

function formatUsage(u: UsageInfo): string {
  const pct = u.size > 0 ? Math.round((u.used / u.size) * 100) : 0;
  const usedShort = formatTokens(u.used);
  const sizeShort = formatTokens(u.size);
  const cost = u.cost ? ` ${u.cost.currency === "USD" ? "$" : ""}${u.cost.amount.toFixed(4)}` : "";
  return `${usedShort}/${sizeShort} (${pct}%)${cost}`;
}

function usageTooltip(u: UsageInfo): string {
  const lines = [`Context: ${u.used.toLocaleString()} / ${u.size.toLocaleString()} tokens`];
  if (u.cost) lines.push(`Cumulative cost: ${u.cost.amount} ${u.cost.currency}`);
  return lines.join("\n");
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function dotClass(props: { connection: ConnectionState; isLoading: boolean; pendingPermissions: number }): string {
  if (props.connection !== "connected") return props.connection === "error" ? "disconnected" : "";
  if (props.pendingPermissions > 0) return "thinking";
  if (props.isLoading) return "thinking";
  return "idle";
}

function statusLabel(props: { connection: ConnectionState; isLoading: boolean; pendingPermissions: number }): string {
  if (props.connection === "disconnected") return "Offline";
  if (props.connection === "connecting") return "Connecting";
  if (props.connection === "error") return "Error";
  if (props.pendingPermissions > 0) return `${props.pendingPermissions} permission${props.pendingPermissions === 1 ? "" : "s"}`;
  if (props.isLoading) return "Working";
  return "Ready";
}

function countConversationTurns(entries: ThreadEntry[]): number {
  return entries.filter((e) => e.type === "user_message").length;
}

function shortenPath(p: string): string {
  if (p.length <= 28) return p;
  const parts = p.split(/[\\/]/);
  if (parts.length <= 3) return p;
  return `${parts[0]}/.../${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}
