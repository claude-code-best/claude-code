import React, { useEffect, useRef } from "react";
import type { ThreadEntry } from "../lib/types";
import { AssistantBubble, SystemNotice, UserBubble } from "./MessageBubble";
import { PlanView } from "./PlanView";
import { ToolCallCard } from "./ToolCallCard";

interface ChatViewProps {
  entries: ThreadEntry[];
  isLoading: boolean;
  showThinking: boolean;
  autoScroll: boolean;
  onApplyDiff: (path: string, oldText: string | null | undefined, newText: string) => void;
  onOpenFile: (path: string, line?: number) => void;
}

export function ChatView({
  entries,
  isLoading,
  showThinking,
  autoScroll,
  onApplyDiff,
  onOpenFile,
}: ChatViewProps): React.ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [entries.length, isLoading, autoScroll]);

  if (entries.length === 0) {
    return (
      <div className="message-list" ref={scrollRef}>
        <div className="message-list-empty">
          <span className="empty-icon" aria-hidden>◐</span>
          <p>Ask Claude to start. Type <code>/</code> for commands or <code>@</code> to reference a file.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="message-list" ref={scrollRef}>
      {entries.map((entry) => renderEntry(entry, { showThinking, onApplyDiff, onOpenFile }))}
      {isLoading && <LoadingIndicator />}
    </div>
  );
}

function renderEntry(
  entry: ThreadEntry,
  ctx: {
    showThinking: boolean;
    onApplyDiff: ChatViewProps["onApplyDiff"];
    onOpenFile: ChatViewProps["onOpenFile"];
  },
): React.ReactNode {
  switch (entry.type) {
    case "user_message":
      return <UserBubble key={entry.id} entry={entry} />;
    case "assistant_message":
      return <AssistantBubble key={entry.id} entry={entry} showThinking={ctx.showThinking} />;
    case "tool_call":
      return (
        <ToolCallCard
          key={entry.toolCall.id}
          entry={entry}
          onApplyDiff={ctx.onApplyDiff}
          onOpenFile={ctx.onOpenFile}
        />
      );
    case "plan":
      return <PlanView key={entry.id} entry={entry} />;
    case "system":
      return <SystemNotice key={entry.id} level={entry.level} text={entry.text} />;
  }
}

function LoadingIndicator(): React.ReactElement {
  return (
    <div className="loading-indicator">
      <span className="streaming-dots">
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}
