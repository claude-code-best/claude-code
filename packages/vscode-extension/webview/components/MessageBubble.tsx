// biome-ignore-all lint/security/noDangerouslySetInnerHtml: renderMarkdown sanitizes generated HTML before rendering.
import React, { useState } from "react";
import { renderMarkdown } from "../markdown";
import type { AssistantChunk, AssistantMessageEntry, UserMessageEntry } from "../lib/types";

interface UserBubbleProps {
  entry: UserMessageEntry;
}

export function UserBubble({ entry }: UserBubbleProps): React.ReactElement {
  return (
    <div className="message-bubble user">
      <div className="message-label user-label">You</div>
      <div className="message-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.content) }} />
      {entry.images && entry.images.length > 0 && (
        <div className="message-attachments">
          {entry.images.map((img, i) => (
            <img
              key={i}
              className="user-attachment"
              alt={`attachment-${i}`}
              src={`data:${img.mimeType};base64,${img.data}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface AssistantBubbleProps {
  entry: AssistantMessageEntry;
  showThinking: boolean;
}

export function AssistantBubble({ entry, showThinking }: AssistantBubbleProps): React.ReactElement {
  return (
    <div className="message-bubble assistant">
      <div className="message-label assistant-label">Claude</div>
      {entry.chunks.map((chunk, i) => (
        <ChunkRenderer key={i} chunk={chunk} showThinking={showThinking} />
      ))}
    </div>
  );
}

function ChunkRenderer({
  chunk,
  showThinking,
}: {
  chunk: AssistantChunk;
  showThinking: boolean;
}): React.ReactElement | null {
  if (chunk.type === "thought") {
    if (!showThinking) return null;
    return <ThinkingBlock text={chunk.text} />;
  }
  return (
    <div
      className="message-content"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(chunk.text) }}
    />
  );
}

function ThinkingBlock({ text }: { text: string }): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <div className="thinking-block">
      <button type="button" className="thinking-header" onClick={() => setOpen((v) => !v)}>
        <span className={`thinking-chevron ${open ? "expanded" : ""}`} aria-hidden>▶</span>
        <span className="thinking-icon" aria-hidden>◇</span>
        <span className="thinking-label">Extended thinking</span>
      </button>
      {open && <div className="thinking-content">{text}</div>}
    </div>
  );
}

interface SystemNoticeProps {
  level: "info" | "warning" | "error";
  text: string;
}

export function SystemNotice({ level, text }: SystemNoticeProps): React.ReactElement {
  return <div className={`message-bubble system notice-${level}`}>{text}</div>;
}
