import React, { useState } from "react";
import type { ContentBlock, ToolCallContent } from "../lib/acp/types";
import type { ToolCallEntry } from "../lib/types";

interface ToolCallCardProps {
  entry: ToolCallEntry;
  onApplyDiff: (path: string, oldText: string | null | undefined, newText: string) => void;
  onOpenFile: (path: string, line?: number) => void;
}

export function ToolCallCard({ entry, onApplyDiff, onOpenFile }: ToolCallCardProps): React.ReactElement {
  const [expanded, setExpanded] = useState<boolean>(initialExpanded(entry));
  const tc = entry.toolCall;
  const statusInfo = renderStatus(tc.status);

  return (
    <div className={`tool-card status-${tc.status}`}>
      <button type="button" className="tool-card-header" onClick={() => setExpanded((v) => !v)}>
        <span className={`tool-card-chevron ${expanded ? "expanded" : ""}`}>▶</span>
        <span className="tool-card-name">{tc.title}</span>
        <span className={`tool-card-status ${statusInfo.className}`}>{statusInfo.text}</span>
      </button>
      {expanded && (
        <div className="tool-card-body">
          {tc.content?.map((block, i) => (
            <ToolContentRenderer
              key={i}
              block={block}
              onApplyDiff={onApplyDiff}
              onOpenFile={onOpenFile}
            />
          ))}
          {tc.rawInput && Object.keys(tc.rawInput).length > 0 && (
            <details className="tool-raw">
              <summary>Input</summary>
              <pre>{JSON.stringify(tc.rawInput, null, 2)}</pre>
            </details>
          )}
          {tc.rawOutput !== undefined && (
            <details className="tool-raw">
              <summary>Output</summary>
              <pre>{formatRawValue(tc.rawOutput)}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function formatRawValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function initialExpanded(entry: ToolCallEntry): boolean {
  if (entry.toolCall.status === "waiting_for_confirmation") return true;
  if (entry.toolCall.status === "error") return true;
  return false;
}

function renderStatus(status: ToolCallEntry["toolCall"]["status"]): { className: string; text: string } {
  switch (status) {
    case "running":
      return { className: "running", text: "running" };
    case "complete":
      return { className: "done", text: "done" };
    case "error":
      return { className: "error", text: "error" };
    case "canceled":
      return { className: "error", text: "canceled" };
    case "rejected":
      return { className: "error", text: "rejected" };
    case "waiting_for_confirmation":
      return { className: "running", text: "needs approval" };
    case "pending":
      return { className: "running", text: "pending" };
  }
}

function ToolContentRenderer({
  block,
  onApplyDiff,
  onOpenFile,
}: {
  block: ToolCallContent;
  onApplyDiff: (path: string, oldText: string | null | undefined, newText: string) => void;
  onOpenFile: (path: string, line?: number) => void;
}): React.ReactElement | null {
  if (block.type === "diff") {
    return (
      <div className="tool-diff">
        <div className="tool-diff-header">
          <span className="tool-diff-path" title={block.path}>{block.path}</span>
          <div className="tool-diff-actions">
            <button type="button" onClick={() => onOpenFile(block.path)}>Open</button>
            <button type="button" onClick={() => onApplyDiff(block.path, block.oldText, block.newText)}>
              View Diff
            </button>
          </div>
        </div>
        <DiffPreview oldText={block.oldText ?? ""} newText={block.newText} />
      </div>
    );
  }
  if (block.type === "terminal") {
    return <div className="tool-terminal">Terminal: {block.terminalId}</div>;
  }
  // type === "content"
  return <ContentBlockRenderer block={block.content} />;
}

function ContentBlockRenderer({ block }: { block: ContentBlock }): React.ReactElement | null {
  if (block.type === "text") {
    return <pre className="tool-text">{block.text}</pre>;
  }
  if (block.type === "image") {
    const data = (block as { data?: string; mimeType?: string }).data;
    const mime = (block as { mimeType?: string }).mimeType ?? "image/png";
    if (!data) return null;
    return <img className="tool-image" alt="agent screenshot" src={`data:${mime};base64,${data}`} />;
  }
  if (block.type === "resource_link") {
    const link = block as { name: string; uri: string; description?: string };
    return (
      <a className="tool-link" href={link.uri} target="_blank" rel="noopener noreferrer">
        {link.name}
      </a>
    );
  }
  return null;
}

function DiffPreview({ oldText, newText }: { oldText: string; newText: string }): React.ReactElement {
  const lines = naiveDiff(oldText, newText);
  const visible = lines.slice(0, 40);
  return (
    <div className="diff-preview">
      {visible.map((line, i) => (
        <div key={i} className={`diff-line diff-${line.kind}`}>
          <span className="diff-marker">{line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " "}</span>
          <span className="diff-text">{line.text}</span>
        </div>
      ))}
      {lines.length > visible.length && (
        <div className="diff-more">… {lines.length - visible.length} more lines</div>
      )}
    </div>
  );
}

interface DiffLine {
  kind: "added" | "removed" | "context";
  text: string;
}

function naiveDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split(/\r?\n/);
  const newLines = newText.split(/\r?\n/);
  // Naïve sequential compare — fine for short snippets, agent typically keeps them small.
  const result: DiffLine[] = [];
  const max = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < max; i += 1) {
    const a = oldLines[i];
    const b = newLines[i];
    if (a === b) {
      if (a !== undefined) result.push({ kind: "context", text: a });
    } else {
      if (a !== undefined) result.push({ kind: "removed", text: a });
      if (b !== undefined) result.push({ kind: "added", text: b });
    }
  }
  return result;
}
