import { useState } from "react";
import type { UIMessage } from "ai";
import { cn, esc, truncate } from "../lib/utils";

// ============================================================
// ChatMessage — renders a UIMessage with its parts
// ============================================================

interface ChatMessageProps {
  message: UIMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
  switch (message.role) {
    case "user":
      return <UserBubble message={message} />;
    case "assistant":
      return <AssistantBubble message={message} />;
    case "system":
      return <SystemBubble message={message} />;
    default:
      return null;
  }
}

// ============================================================
// User Bubble
// ============================================================

function UserBubble({ message }: { message: UIMessage }) {
  const text = message.parts
    .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("");

  return (
    <div className="flex justify-end">
      <div className="max-w-[75%] rounded-2xl rounded-br-md bg-brand/15 px-4 py-2.5 text-sm text-text-primary whitespace-pre-wrap">
        {esc(text)}
      </div>
    </div>
  );
}

// ============================================================
// Assistant Bubble — with tool traces
// ============================================================

function AssistantBubble({ message }: { message: UIMessage }) {
  const textParts = message.parts.filter(
    (p): p is Extract<typeof p, { type: "text" }> => p.type === "text",
  );
  const toolParts = message.parts.filter(
    (p): p is Extract<typeof p, { type: "tool-call" }> => p.type === "tool-call",
  );
  const toolResults = message.parts.filter(
    (p): p is Extract<typeof p, { type: "tool-result" }> => p.type === "tool-result",
  );

  // Match tool results to tool calls
  const toolResultMap = new Map<string, Extract<typeof toolResults[0], { type: "tool-result" }>>();
  for (const tr of toolResults) {
    toolResultMap.set(tr.toolCallId, tr);
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-2">
        {textParts.map((part, i) => (
          <div
            key={`text-${i}`}
            className="rounded-2xl rounded-bl-md bg-surface-2 px-4 py-2.5 text-sm text-text-primary"
            dangerouslySetInnerHTML={{ __html: formatAssistantContent(part.text) }}
          />
        ))}

        {toolParts.length > 0 && (
          <ToolTrace calls={toolParts} results={toolResultMap} />
        )}
      </div>
    </div>
  );
}

// ============================================================
// Tool Trace — expandable tool call/result pairs
// ============================================================

function ToolTrace({
  calls,
  results,
}: {
  calls: Extract<UIMessage["parts"][0], { type: "tool-call" }>[];
  results: Map<string, Extract<UIMessage["parts"][0], { type: "tool-result" }>>;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className={cn("transition-transform", expanded && "rotate-90")}
        >
          <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
        <span>
          {calls.length} tool {calls.length === 1 ? "call" : "calls"}
        </span>
      </button>
      {expanded && (
        <div className="mt-1 space-y-1 pl-2">
          {calls.map((call, i) => {
            const result = results.get(call.toolCallId);
            return <ToolCard key={call.toolCallId || i} call={call} result={result} />;
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Tool Card — individual tool call + result
// ============================================================

function ToolCard({
  call,
  result,
}: {
  call: Extract<UIMessage["parts"][0], { type: "tool-call" }>;
  result?: Extract<UIMessage["parts"][0], { type: "tool-result" }>;
}) {
  const [expanded, setExpanded] = useState(false);
  const inputStr = typeof call.args === "string" ? call.args : JSON.stringify(call.args, null, 2);
  const isError = result && typeof result.result === "object" && result.result !== null && "is_error" in (result.result as Record<string, unknown>) && (result.result as Record<string, unknown>).is_error;
  const outputStr = result
    ? typeof result.result === "string"
      ? result.result
      : JSON.stringify(result.result, null, 2)
    : null;

  return (
    <div
      className={cn(
        "cursor-pointer rounded-lg border bg-tool-card transition-colors",
        isError ? "border-status-error/30" : "border-border hover:border-border-light",
      )}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-2 px-3 py-2 text-xs">
        {result ? (
          <span className={cn(
            "flex h-4 w-4 items-center justify-center rounded-full text-[10px]",
            isError ? "bg-status-error/15 text-status-error" : "bg-status-active/15 text-status-active",
          )}>
            {isError ? "\u2715" : "\u2713"}
          </span>
        ) : (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand/15 text-[10px] text-brand">
            {"\u25B6"}
          </span>
        )}
        <span className="font-medium text-text-primary">{esc(call.toolName)}</span>
        {!expanded && call.args && typeof call.args === "object" && (
          <span className="truncate text-text-muted">
            {truncate(JSON.stringify(call.args), 60)}
          </span>
        )}
      </div>
      {expanded && (
        <>
          <div className="border-t border-border px-3 py-2 text-xs text-text-secondary overflow-x-auto">
            <div className="mb-1 text-text-muted font-medium">Input:</div>
            <pre className="whitespace-pre-wrap font-mono">{truncate(inputStr, 2000)}</pre>
          </div>
          {outputStr && (
            <div className="border-t border-border px-3 py-2 text-xs text-text-secondary overflow-x-auto">
              <div className="mb-1 text-text-muted font-medium">Output:</div>
              <pre className="whitespace-pre-wrap font-mono">{truncate(outputStr, 2000)}</pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================
// System Bubble
// ============================================================

function SystemBubble({ message }: { message: UIMessage }) {
  const text = message.parts
    .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("");

  if (!text) return null;

  return (
    <div className="flex justify-center">
      <div className="rounded-full bg-surface-2 px-4 py-1.5 text-xs text-text-muted">
        {esc(text)}
      </div>
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function formatAssistantContent(content: string): string {
  let html = esc(content);
  // Code blocks
  html = html.replace(
    /```(\w*)\n?([\s\S]*?)```/g,
    () =>
      `<pre class="my-2 overflow-x-auto rounded-lg bg-tool-card p-3 font-mono text-xs text-text-primary">${RegExp.$2?.trim() || ""}</pre>`,
  );
  // Inline code
  html = html.replace(
    /`([^`]+)`/g,
    '<code class="rounded bg-tool-card px-1.5 py-0.5 font-mono text-xs">$1</code>',
  );
  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return html;
}
