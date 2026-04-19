import { useState, useEffect, useRef } from "react";
import type { SessionEvent, EventPayload } from "../types";
import { esc, truncate, cn, extractEventText, isConversationClearedStatus } from "../lib/utils";

// ============================================================
// Tool Trace State
// ============================================================

interface TraceHost {
  id: string;
  kind: "assistant" | "orphan";
  assistantContent: string;
  entryKinds: ("use" | "result")[];
}

interface ToolTraceState {
  nextHostId: number;
  activeHostId: string | null;
  hosts: TraceHost[];
}

function createTraceState(): ToolTraceState {
  return { nextHostId: 1, activeHostId: null, hosts: [] };
}

function addAssistantHost(state: ToolTraceState, content: string): { state: ToolTraceState; host: TraceHost } {
  const host: TraceHost = {
    id: `trace-${state.nextHostId}`,
    kind: "assistant",
    assistantContent: content,
    entryKinds: [],
  };
  return {
    state: {
      nextHostId: state.nextHostId + 1,
      activeHostId: host.id,
      hosts: [...state.hosts, host],
    },
    host,
  };
}

function clearActiveHost(state: ToolTraceState): ToolTraceState {
  if (!state.activeHostId) return state;
  return { ...state, activeHostId: null };
}

function addTraceEntry(state: ToolTraceState, entryKind: "use" | "result"): {
  state: ToolTraceState;
  host: TraceHost;
  createdHost: TraceHost | null;
} {
  let host = state.hosts.find((h) => h.id === state.activeHostId);
  let createdHost: TraceHost | null = null;

  if (!host) {
    createdHost = {
      id: `trace-${state.nextHostId}`,
      kind: "orphan",
      assistantContent: "",
      entryKinds: [],
    };
    host = createdHost;
  }

  const updatedHost = { ...host, entryKinds: [...host.entryKinds, entryKind] };
  const newHosts = state.hosts.map((h) => (h.id === updatedHost.id ? updatedHost : h));
  if (createdHost) newHosts.push(createdHost);

  return {
    state: {
      nextHostId: createdHost ? state.nextHostId + 1 : state.nextHostId,
      activeHostId: (createdHost || host).id,
      hosts: newHosts,
    },
    host: updatedHost,
    createdHost,
  };
}

// ============================================================
// Message Types
// ============================================================

interface UserMessage {
  kind: "user";
  content: string;
}

interface AssistantMessage {
  kind: "assistant";
  content: string;
  traceEntries: TraceEntry[];
  traceExpanded: boolean;
  traceId: string;
}

interface TraceEntry {
  entryKind: "use" | "result";
  toolName?: string;
  toolInput?: unknown;
  content?: string;
  output?: string;
  isError?: boolean;
}

interface SystemMessage {
  kind: "system";
  content: string;
}

interface PermissionMessage {
  kind: "permission";
  requestId: string;
  toolName: string;
  toolInput: unknown;
  description: string;
}

interface AskUserMessage {
  kind: "ask_user";
  requestId: string;
  questions: import("../types").Question[];
  description: string;
}

interface PlanMessage {
  kind: "plan";
  requestId: string;
  planContent: string;
  description: string;
}

interface LoadingMessage {
  kind: "loading";
  verb: string;
  startTime: number;
}

type DisplayMessage =
  | UserMessage
  | AssistantMessage
  | SystemMessage
  | PermissionMessage
  | AskUserMessage
  | PlanMessage
  | LoadingMessage;

// ============================================================
// Spinner
// ============================================================

const SPINNER_FRAMES = ["·", "✢", "✱", "✶", "✻", "✽"];
const SPINNER_CYCLE = [...SPINNER_FRAMES, ...SPINNER_FRAMES.slice().reverse()];

const SPINNER_VERBS = [
  "Accomplishing", "Baking", "Calculating", "Clauding", "Cogitating", "Computing",
  "Considering", "Contemplating", "Cooking", "Crafting", "Creating", "Crunching",
  "Deliberating", "Doing", "Effecting", "Generating", "Hatching", "Ideating",
  "Imagining", "Inferring", "Manifesting", "Mulling", "Pondering", "Processing",
  "Ruminating", "Simmering", "Synthesizing", "Thinking", "Tinkering", "Working",
];

// ============================================================
// EventStream Component
// ============================================================

interface EventStreamProps {
  messages: DisplayMessage[];
  onApprovePermission: (requestId: string) => void;
  onRejectPermission: (requestId: string) => void;
  onSubmitAnswers: (requestId: string, answers: Record<string, unknown>, questions: import("../types").Question[]) => void;
  onSubmitPlanResponse: (requestId: string, value: string, feedback?: string) => void;
}

export function EventStream({
  messages,
  onApprovePermission,
  onRejectPermission,
  onSubmitAnswers,
  onSubmitPlanResponse,
}: EventStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
      <div className="mx-auto max-w-5xl space-y-3">
        {messages.map((msg, i) => (
          <MessageRow key={i} message={msg} {...{ onApprovePermission, onRejectPermission, onSubmitAnswers, onSubmitPlanResponse }} />
        ))}
      </div>
    </div>
  );
}

function MessageRow({ message, onApprovePermission, onRejectPermission, onSubmitAnswers, onSubmitPlanResponse }: {
  message: DisplayMessage;
  onApprovePermission: (requestId: string) => void;
  onRejectPermission: (requestId: string) => void;
  onSubmitAnswers: (requestId: string, answers: Record<string, unknown>, questions: import("../types").Question[]) => void;
  onSubmitPlanResponse: (requestId: string, value: string, feedback?: string) => void;
}) {
  switch (message.kind) {
    case "user":
      return <UserBubble content={message.content} />;
    case "assistant":
      return <AssistantBubble content={message.content} traceEntries={message.traceEntries} />;
    case "system":
      return <SystemBubble content={message.content} />;
    case "permission":
      return (
        <PermissionPrompt
          {...message}
          onApprove={() => onApprovePermission(message.requestId)}
          onReject={() => onRejectPermission(message.requestId)}
        />
      );
    case "ask_user":
      return (
        <AskUserPanel
          {...message}
          onSubmit={(answers) => onSubmitAnswers(message.requestId, answers, message.questions)}
          onSkip={() => onRejectPermission(message.requestId)}
        />
      );
    case "plan":
      return (
        <PlanPanel
          {...message}
          onSubmit={(value, feedback) => onSubmitPlanResponse(message.requestId, value, feedback)}
        />
      );
    case "loading":
      return <LoadingIndicator verb={message.verb} />;
    default:
      return null;
  }
}

// ============================================================
// Sub-Components
// ============================================================

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[75%] rounded-2xl rounded-br-md bg-brand/15 px-4 py-2.5 text-sm text-text-primary">
        {esc(content)}
      </div>
    </div>
  );
}

function formatAssistantContent(content: string): string {
  let html = esc(content);
  // Code blocks
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, _lang, code) => {
    return `<pre class="my-2 overflow-x-auto rounded-lg bg-tool-card p-3 font-mono text-xs text-text-primary">${code.trim()}</pre>`;
  });
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="rounded bg-tool-card px-1.5 py-0.5 font-mono text-xs">$1</code>');
  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return html;
}

function AssistantBubble({ content, traceEntries }: { content: string; traceEntries: TraceEntry[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-2">
        {content && (
          <div
            className="rounded-2xl rounded-bl-md bg-surface-2 px-4 py-2.5 text-sm text-text-primary"
            dangerouslySetInnerHTML={{ __html: formatAssistantContent(content) }}
          />
        )}
        {traceEntries.length > 0 && (
          <div>
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
            >
              <span className={cn("transition-transform", expanded && "rotate-90")}>›</span>
              <span>{traceEntries.length} tool {traceEntries.length === 1 ? "call" : "calls"}</span>
            </button>
            {expanded && (
              <div className="mt-1 space-y-1 pl-2">
                {traceEntries.map((entry, i) => (
                  <ToolCard key={i} entry={entry} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolCard({ entry }: { entry: TraceEntry }) {
  const [expanded, setExpanded] = useState(false);

  if (entry.entryKind === "use") {
    const inputStr = typeof entry.toolInput === "string" ? entry.toolInput : JSON.stringify(entry.toolInput, null, 2);
    return (
      <div
        className="cursor-pointer rounded-lg border border-border bg-tool-card"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 px-3 py-2 text-xs">
          <span className="text-brand">▶</span>
          <span className="font-medium text-text-primary">{entry.toolName || "tool"}</span>
        </div>
        {expanded && (
          <pre className="border-t border-border px-3 py-2 text-xs text-text-secondary overflow-x-auto">
            {truncate(inputStr, 2000)}
          </pre>
        )}
      </div>
    );
  }

  const contentStr = typeof entry.output === "string" ? entry.output : JSON.stringify(entry.output, null, 2);
  return (
    <div
      className={cn(
        "cursor-pointer rounded-lg border bg-tool-card",
        entry.isError ? "border-status-error/30" : "border-border",
      )}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-2 px-3 py-2 text-xs">
        <span className={entry.isError ? "text-status-error" : "text-status-active"}>
          {entry.isError ? "✕" : "✓"}
        </span>
        <span className="font-medium text-text-primary">
          {entry.isError ? "Error" : "Result"}
        </span>
      </div>
      {expanded && (
        <pre className="border-t border-border px-3 py-2 text-xs text-text-secondary overflow-x-auto">
          {truncate(contentStr, 2000)}
        </pre>
      )}
    </div>
  );
}

function SystemBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-center">
      <div className="rounded-full bg-surface-2 px-4 py-1.5 text-xs text-text-muted">
        {esc(content)}
      </div>
    </div>
  );
}

function PermissionPrompt({
  requestId,
  toolName,
  toolInput,
  description,
  onApprove,
  onReject,
}: {
  requestId: string;
  toolName: string;
  toolInput: unknown;
  description: string;
  onApprove: () => void;
  onReject: () => void;
}) {
  const inputStr = typeof toolInput === "string" ? toolInput : JSON.stringify(toolInput, null, 2);

  return (
    <div className="rounded-xl border border-status-warning/30 bg-surface-1 p-4">
      <div className="mb-2 text-sm font-semibold text-status-warning">Permission Request</div>
      {description && <div className="mb-2 text-sm text-text-secondary">{esc(description)}</div>}
      <div className="mb-2 font-mono text-xs font-bold text-text-primary">{esc(toolName)}</div>
      {toolName !== "AskUserQuestion" && (
        <pre className="mb-3 max-h-40 overflow-auto rounded-lg bg-tool-card p-2 text-xs text-text-secondary">
          {truncate(inputStr, 500)}
        </pre>
      )}
      <div className="flex gap-2">
        <button
          onClick={onApprove}
          className="rounded-lg bg-status-active/20 px-4 py-2 text-sm font-medium text-status-active hover:bg-status-active/30 transition-colors"
        >
          Approve
        </button>
        <button
          onClick={onReject}
          className="rounded-lg bg-status-error/20 px-4 py-2 text-sm font-medium text-status-error hover:bg-status-error/30 transition-colors"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

function AskUserPanel({
  questions,
  description,
  onSubmit,
  onSkip,
}: {
  requestId: string;
  questions: import("../types").Question[];
  description: string;
  onSubmit: (answers: Record<string, unknown>) => void;
  onSkip: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [otherTexts, setOtherTexts] = useState<Record<string, string>>({});

  const handleSelect = (qIdx: number, oIdx: number, multiSelect: boolean) => {
    if (multiSelect) {
      const current = (answers[qIdx] as number[]) || [];
      const next = current.includes(oIdx) ? current.filter((i) => i !== oIdx) : [...current, oIdx];
      setAnswers({ ...answers, [qIdx]: next });
    } else {
      setAnswers({ ...answers, [qIdx]: oIdx });
    }
  };

  const handleOtherSubmit = (qIdx: number) => {
    const text = otherTexts[qIdx]?.trim();
    if (!text) return;
    setAnswers({ ...answers, [qIdx]: text });
    setOtherTexts({ ...otherTexts, [qIdx]: "" });
  };

  const handleSubmit = () => {
    const mapped: Record<string, unknown> = {};
    for (const [qIdx, val] of Object.entries(answers)) {
      const q = questions[parseInt(qIdx, 10)];
      if (!q) continue;
      if (typeof val === "number") {
        mapped[qIdx] = q.options?.[val]?.label || String(val);
      } else if (Array.isArray(val)) {
        mapped[qIdx] = val.map((i) => q.options?.[i]?.label || String(i));
      } else {
        mapped[qIdx] = val;
      }
    }
    onSubmit(mapped);
  };

  if (questions.length <= 1) {
    const q = questions[0] || { question: description, options: [], multiSelect: false };
    const selectedIdx = answers[0];
    const multiSelect = q.multiSelect || false;

    return (
      <div className="rounded-xl border border-brand/30 bg-surface-1 p-4">
        <div className="mb-3 text-sm font-semibold text-text-primary">
          {esc(description || q.question || "Question")}
        </div>
        <div className="space-y-2">
          {(q.options || []).map((opt, j) => {
            const isSelected = multiSelect
              ? ((answers[0] as number[]) || []).includes(j)
              : selectedIdx === j;
            return (
              <button
                key={j}
                onClick={() => handleSelect(0, j, multiSelect)}
                className={cn(
                  "w-full rounded-lg border px-4 py-2.5 text-left text-sm transition-colors",
                  isSelected
                    ? "border-brand bg-brand/10 text-text-primary"
                    : "border-border bg-surface-2 text-text-secondary hover:border-border-light",
                )}
              >
                <div className="font-medium">{esc(opt.label)}</div>
                {opt.description && <div className="mt-0.5 text-xs text-text-muted">{esc(opt.description)}</div>}
              </button>
            );
          })}
          <div className="flex gap-2">
            <input
              type="text"
              value={otherTexts[0] || ""}
              onChange={(e) => setOtherTexts({ ...otherTexts, [0]: e.target.value })}
              placeholder="Other..."
              className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
              onKeyDown={(e) => e.key === "Enter" && handleOtherSubmit(0)}
            />
            <button
              onClick={() => handleOtherSubmit(0)}
              className="rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:bg-surface-2 transition-colors"
            >
              Send
            </button>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={handleSubmit}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-light transition-colors"
          >
            Submit
          </button>
          <button
            onClick={onSkip}
            className="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface-2 transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    );
  }

  // Multiple questions — tab layout
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="rounded-xl border border-brand/30 bg-surface-1 p-4">
      <div className="mb-3 text-sm font-semibold text-text-primary">{esc(description || "Questions")}</div>
      <div className="mb-3 flex gap-1 overflow-x-auto">
        {questions.map((q, i) => (
          <button
            key={i}
            onClick={() => setActiveTab(i)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs whitespace-nowrap transition-colors",
              activeTab === i
                ? "bg-brand/20 text-brand"
                : "text-text-muted hover:bg-surface-2",
            )}
          >
            {q.header || `Q${i + 1}`}
          </button>
        ))}
      </div>
      {questions[activeTab] && (
        <QuestionTab
          question={questions[activeTab]}
          qIdx={activeTab}
          answers={answers}
          otherTexts={otherTexts}
          onSelect={handleSelect}
          onOtherTextChange={(qIdx, text) => setOtherTexts({ ...otherTexts, [qIdx]: text })}
          onOtherSubmit={handleOtherSubmit}
        />
      )}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-text-muted">{activeTab + 1} / {questions.length}</span>
        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-light transition-colors"
          >
            Submit All
          </button>
          <button
            onClick={onSkip}
            className="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface-2 transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}

function QuestionTab({
  question,
  qIdx,
  answers,
  otherTexts,
  onSelect,
  onOtherTextChange,
  onOtherSubmit,
}: {
  question: import("../types").Question;
  qIdx: number;
  answers: Record<string, unknown>;
  otherTexts: Record<string, string>;
  onSelect: (qIdx: number, oIdx: number, multiSelect: boolean) => void;
  onOtherTextChange: (qIdx: number, text: string) => void;
  onOtherSubmit: (qIdx: number) => void;
}) {
  const multiSelect = question.multiSelect || false;

  return (
    <div>
      <div className="mb-2 text-sm text-text-secondary">{esc(question.question)}</div>
      <div className="space-y-2">
        {(question.options || []).map((opt, j) => {
          const isSelected = multiSelect
            ? ((answers[qIdx] as number[]) || []).includes(j)
            : answers[qIdx] === j;
          return (
            <button
              key={j}
              onClick={() => onSelect(qIdx, j, multiSelect)}
              className={cn(
                "w-full rounded-lg border px-4 py-2.5 text-left text-sm transition-colors",
                isSelected
                  ? "border-brand bg-brand/10 text-text-primary"
                  : "border-border bg-surface-2 text-text-secondary hover:border-border-light",
              )}
            >
              <div className="font-medium">{esc(opt.label)}</div>
              {opt.description && <div className="mt-0.5 text-xs text-text-muted">{esc(opt.description)}</div>}
            </button>
          );
        })}
        <div className="flex gap-2">
          <input
            type="text"
            value={otherTexts[qIdx] || ""}
            onChange={(e) => onOtherTextChange(qIdx, e.target.value)}
            placeholder="Other..."
            className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
            onKeyDown={(e) => e.key === "Enter" && onOtherSubmit(qIdx)}
          />
          <button
            onClick={() => onOtherSubmit(qIdx)}
            className="rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:bg-surface-2 transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function PlanPanel({
  planContent,
  description,
  onSubmit,
}: {
  requestId: string;
  planContent: string;
  description: string;
  onSubmit: (value: string, feedback?: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const isEmpty = !planContent || !planContent.trim();

  const handleSubmit = () => {
    if (!selected) return;
    onSubmit(selected, selected === "no" ? feedback : undefined);
  };

  return (
    <div className="rounded-xl border border-brand/30 bg-surface-1 p-4">
      <div className="mb-3 text-sm font-semibold text-text-primary">
        {isEmpty ? "Exit plan mode?" : "Ready to code?"}
      </div>
      {!isEmpty && (
        <div
          className="mb-4 max-h-64 overflow-auto rounded-lg bg-tool-card p-4 text-sm text-text-secondary prose prose-invert"
          dangerouslySetInnerHTML={{ __html: formatPlanContent(planContent) }}
        />
      )}
      <div className="space-y-2">
        {isEmpty ? (
          <>
            <PlanOption selected={selected === "yes-default"} onClick={() => setSelected("yes-default")} label="Yes" />
            <PlanOption selected={selected === "no"} onClick={() => setSelected("no")} label="No" />
          </>
        ) : (
          <>
            <PlanOption
              selected={selected === "yes-accept-edits"}
              onClick={() => setSelected("yes-accept-edits")}
              label="Yes, auto-accept edits"
              desc="Approve plan and auto-accept file edits"
            />
            <PlanOption
              selected={selected === "yes-default"}
              onClick={() => setSelected("yes-default")}
              label="Yes, manually approve edits"
              desc="Approve plan but confirm each edit"
            />
            <PlanOption
              selected={selected === "no"}
              onClick={() => setSelected("no")}
              label="No, keep planning"
              desc="Provide feedback to refine the plan"
            />
          </>
        )}
      </div>
      {selected === "no" && (
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Tell Claude what to change..."
          className="mt-3 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
          rows={3}
        />
      )}
      <div className="mt-4">
        <button
          onClick={handleSubmit}
          disabled={!selected}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-light disabled:opacity-50 transition-colors"
        >
          Submit
        </button>
      </div>
    </div>
  );
}

function PlanOption({
  selected,
  onClick,
  label,
  desc,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  desc?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full rounded-lg border px-4 py-2.5 text-left text-sm transition-colors",
        selected
          ? "border-brand bg-brand/10 text-text-primary"
          : "border-border bg-surface-2 text-text-secondary hover:border-border-light",
      )}
    >
      <div className="font-medium">{label}</div>
      {desc && <div className="mt-0.5 text-xs text-text-muted">{desc}</div>}
    </button>
  );
}

function formatPlanContent(content: string): string {
  let html = esc(content);
  // Code blocks
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, _lang, code) => {
    return `<pre class="my-2 overflow-x-auto rounded-lg bg-tool-card p-3 font-mono text-xs">${code.trim()}</pre>`;
  });
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="rounded bg-tool-card px-1.5 py-0.5 font-mono text-xs">$1</code>');
  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return html;
}

function LoadingIndicator({ verb }: { verb: string }) {
  const [frame, setFrame] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const spinInterval = setInterval(() => setFrame((f) => (f + 1) % SPINNER_CYCLE.length), 120);
    const timerInterval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      clearInterval(spinInterval);
      clearInterval(timerInterval);
    };
  }, []);

  return (
    <div className="flex items-center gap-2 text-sm text-text-secondary">
      <span className="animate-glimmer text-brand">{SPINNER_CYCLE[frame]}</span>
      <span className="animate-glimmer">{esc(verb)}…</span>
      <span className="text-text-muted">{elapsed}s</span>
    </div>
  );
}

// ============================================================
// Event Processing Hook
// ============================================================

export { type DisplayMessage, type TraceEntry, type UserMessage, type AssistantMessage, type SystemMessage, type PermissionMessage, type AskUserMessage, type PlanMessage, type LoadingMessage };

export function useEventProcessor() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const traceStateRef = useRef<ToolTraceState>(createTraceState());
  const renderedUserUuidsRef = useRef(new Set<string>());

  const reset = () => {
    setMessages([]);
    traceStateRef.current = createTraceState();
    renderedUserUuidsRef.current.clear();
  };

  const removeLoading = () => {
    setMessages((prev) => prev.filter((m) => m.kind !== "loading"));
  };

  const showLoading = () => {
    removeLoading();
    const verb = SPINNER_VERBS[Math.floor(Math.random() * SPINNER_VERBS.length)];
    setMessages((prev) => [...prev, { kind: "loading", verb, startTime: Date.now() }]);
  };

  const processEvent = (event: SessionEvent, replay = false) => {
    const type = event.type;
    const payload = event.payload || ({} as EventPayload);
    const direction = event.direction || "inbound";

    // Skip bridge init noise
    const serialized = JSON.stringify(event);
    if (/Remote Control connecting/i.test(serialized)) return;

    if (replay) {
      processReplayEvent(type, payload, direction, event);
      return;
    }

    switch (type) {
      case "user": {
        const toolResultBlocks = getEmbeddedToolBlocks(payload, "tool_result");
        if (toolResultBlocks.length > 0) {
          // Process tool results
          for (const block of toolResultBlocks) {
            addToolTraceEntry("result", {
              content: block.content as string || "",
              output: block.content as string || "",
              is_error: !!block.is_error,
            });
          }
          return;
        }
        const uuid = getUserUuid(payload);
        if (uuid) {
          if (renderedUserUuidsRef.current.has(uuid)) return;
          renderedUserUuidsRef.current.add(uuid);
        }
        traceStateRef.current = clearActiveHost(traceStateRef.current);
        const text = extractEventText(payload as Record<string, unknown>);
        if (text) {
          setMessages((prev) => [...prev, { kind: "user", content: text }]);
          if (!replay) showLoading();
        }
        break;
      }
      case "partial_assistant":
        return;
      case "assistant": {
        removeLoading();
        const text = extractEventText(payload as Record<string, unknown>);
        const toolUseBlocks = getEmbeddedToolBlocks(payload, "tool_use");

        if (text && text.trim()) {
          const result = addAssistantHost(traceStateRef.current, text);
          traceStateRef.current = result.state;
          setMessages((prev) => [
            ...prev,
            {
              kind: "assistant",
              content: text,
              traceEntries: [],
              traceExpanded: false,
              traceId: result.host.id,
            },
          ]);
        }

        for (const block of toolUseBlocks) {
          addToolTraceEntry("use", {
            tool_name: (block.name as string) || "tool",
            tool_input: block.input,
          });
        }
        break;
      }
      case "task_state":
      case "automation_state":
        return;
      case "result":
      case "result_success":
        removeLoading();
        return;
      case "tool_use":
        addToolTraceEntry("use", payload as Record<string, unknown> as { tool_name: string; tool_input: unknown });
        break;
      case "tool_result":
        addToolTraceEntry("result", payload as Record<string, unknown> as { content: string; output: string; is_error: boolean });
        break;
      case "control_request":
      case "permission_request": {
        const req = payload.request;
        if (req && req.subtype === "can_use_tool") {
          const toolName = req.tool_name || "unknown";
          const toolInput = req.input || req.tool_input || {};
          if (toolName === "AskUserQuestion") {
            setMessages((prev) => [
              ...prev,
              {
                kind: "ask_user",
                requestId: payload.request_id || event.id || "",
                questions: (toolInput as Record<string, unknown>).questions as import("../types").Question[] || [],
                description: req.description || "",
              },
            ]);
          } else if (toolName === "ExitPlanMode") {
            setMessages((prev) => [
              ...prev,
              {
                kind: "plan",
                requestId: payload.request_id || event.id || "",
                planContent: ((toolInput as Record<string, unknown>).plan as string) || "",
                description: req.description || "",
              },
            ]);
          } else {
            setMessages((prev) => [
              ...prev,
              {
                kind: "permission",
                requestId: payload.request_id || event.id || "",
                toolName,
                toolInput,
                description: req.description || "",
              },
            ]);
          }
        }
        break;
      }
      case "control_response":
      case "permission_response":
        return;
      case "status": {
        if (isConversationClearedStatus(payload as Record<string, unknown>)) {
          reset();
          return;
        }
        const rawMsg = payload.message;
        const msg = (typeof rawMsg === "string" ? rawMsg : "") || payload.content || "";
        if (/connecting|waiting|initializing|Remote Control/i.test(msg)) return;
        if (!msg.trim()) return;
        setMessages((prev) => [...prev, { kind: "system", content: msg }]);
        break;
      }
      case "error":
        removeLoading();
        setMessages((prev) => [
          ...prev,
          { kind: "system", content: `Error: ${(typeof payload.message === "string" ? payload.message : "") || payload.content || "Unknown error"}` },
        ]);
        break;
      case "session_status":
        if (payload.status === "archived" || payload.status === "inactive") {
          removeLoading();
          setMessages((prev) => [...prev, { kind: "system", content: `Session ${payload.status}` }]);
        }
        break;
      case "interrupt":
        removeLoading();
        setMessages((prev) => [...prev, { kind: "system", content: "Session interrupted" }]);
        break;
      case "system":
        return;
      default: {
        const raw = JSON.stringify(payload);
        if (/Remote Control connecting/i.test(raw)) return;
        setMessages((prev) => [...prev, { kind: "system", content: `${type}: ${truncate(raw, 200)}` }]);
      }
    }
  };

  function processReplayEvent(type: string, payload: EventPayload, direction: string, event: SessionEvent) {
    switch (type) {
      case "user": {
        const text = extractEventText(payload as Record<string, unknown>);
        if (text) {
          traceStateRef.current = clearActiveHost(traceStateRef.current);
          setMessages((prev) => [...prev, { kind: "user", content: text }]);
        }
        break;
      }
      case "assistant": {
        const text = extractEventText(payload as Record<string, unknown>);
        if (text && text.trim()) {
          const result = addAssistantHost(traceStateRef.current, text);
          traceStateRef.current = result.state;
          setMessages((prev) => [
            ...prev,
            { kind: "assistant", content: text, traceEntries: [], traceExpanded: false, traceId: result.host.id },
          ]);
        }
        break;
      }
      case "error":
        setMessages((prev) => [...prev, { kind: "system", content: `Error: ${payload.message || "Unknown error"}` }]);
        break;
      case "session_status":
        if (payload.status === "archived" || payload.status === "inactive") {
          setMessages((prev) => [...prev, { kind: "system", content: `Session ${payload.status}` }]);
        }
        break;
    }
  }

  function addToolTraceEntry(entryKind: "use" | "result", payload: Record<string, unknown>) {
    const result = addTraceEntry(traceStateRef.current, entryKind);
    traceStateRef.current = result.state;

    const entry: TraceEntry = entryKind === "use"
      ? {
          entryKind: "use",
          toolName: (payload.tool_name as string) || (payload.name as string) || "tool",
          toolInput: payload.tool_input || payload.input,
        }
      : {
          entryKind: "result",
          content: (payload.content as string) || "",
          output: (payload.output as string) || (payload.content as string) || "",
          isError: !!payload.is_error,
        };

    // Add entry to the last assistant message
    setMessages((prev) => {
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].kind === "assistant") {
          const msg = prev[i] as AssistantMessage;
          return [
            ...prev.slice(0, i),
            { ...msg, traceEntries: [...msg.traceEntries, entry] },
            ...prev.slice(i + 1),
          ];
        }
      }
      return prev;
    });
  }

  function getUserUuid(payload: EventPayload): string | null {
    if (!payload || typeof payload !== "object") return null;
    if (typeof payload.uuid === "string" && payload.uuid) return payload.uuid;
    if (payload.raw && typeof payload.raw === "object" && typeof payload.raw.uuid === "string" && payload.raw.uuid) {
      return payload.raw.uuid;
    }
    return null;
  }

  function getEmbeddedToolBlocks(payload: EventPayload, blockType: string): import("../types").ContentBlock[] {
    if (!payload || typeof payload !== "object") return [];
    const msg = payload.message as Record<string, unknown> | undefined;
    if (!msg || typeof msg !== "object" || !Array.isArray(msg.content)) return [];
    return (msg.content as import("../types").ContentBlock[]).filter(
      (b) => b && typeof b === "object" && b.type === blockType,
    );
  }

  return { messages, processEvent, reset, showLoading, removeLoading };
}
