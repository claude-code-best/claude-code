import { useState, useRef, useEffect } from "react";
import { cn, isClosedSessionStatus } from "../lib/utils";

interface ControlBarProps {
  sessionId: string;
  sessionStatus: string | null;
  activityMode: string;
  onSend: (text: string) => Promise<void>;
  onInterrupt: () => Promise<void>;
}

export function ControlBar({
  sessionId,
  sessionStatus,
  activityMode,
  onSend,
  onInterrupt,
}: ControlBarProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const closed = isClosedSessionStatus(sessionStatus);
  const working = activityMode === "working";

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || closed) return;
    setText("");
    try {
      await onSend(trimmed);
    } catch {
      setText(trimmed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent?.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, [sessionId]);

  return (
    <div className="border-t border-border bg-surface-1 px-4 py-3">
      <div className="mx-auto flex max-w-5xl items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={closed ? "Session is closed" : "Type a message..."}
          disabled={closed}
          className="flex-1 rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20 disabled:opacity-50 transition-colors"
        />
        <button
          onClick={working ? onInterrupt : handleSend}
          disabled={closed}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
            working
              ? "bg-status-error/20 text-status-error hover:bg-status-error/30"
              : "bg-brand text-white hover:bg-brand-light",
            closed && "opacity-50 cursor-not-allowed",
          )}
          aria-label={working ? "Stop" : "Send"}
          title={closed ? "Session is closed" : working ? "Stop" : "Send"}
        >
          {working ? (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="3" y="3" width="12" height="12" rx="2" fill="currentColor" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M3 10L17 3L10 17L9 11L3 10Z" fill="currentColor" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
