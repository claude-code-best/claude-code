import { useState } from "react";
import type { Question } from "../types";
import { esc, cn, truncate } from "../lib/utils";
import { TriangleAlert, Check } from "lucide-react";

// ============================================================
// PermissionPromptView — simple approve/reject for tool use
// ============================================================

export function PermissionPromptView({
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
    <div className="rounded-xl border border-warning-border/30 bg-surface-1 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-warning-border/15 text-warning-text">
          <TriangleAlert className="h-3 w-3" />
        </span>
        <span className="text-sm font-semibold text-warning-text">Permission Request</span>
      </div>
      {description && <div className="mb-2 text-sm text-text-secondary">{esc(description)}</div>}
      <div className="mb-2 font-mono text-xs font-bold text-text-primary">{esc(toolName)}</div>
      {toolName !== "AskUserQuestion" && (
        <pre className="mb-3 max-h-40 overflow-auto rounded-lg bg-surface-1 p-2 text-xs text-text-secondary font-mono">
          {truncate(inputStr, 500)}
        </pre>
      )}
      <div className="flex gap-2">
        <button
          onClick={onApprove}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-light transition-colors"
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

// ============================================================
// AskUserPanelView — multi-question interactive panel
// ============================================================

export function AskUserPanelView({
  questions,
  description,
  onSubmit,
  onSkip,
}: {
  requestId: string;
  questions: Question[];
  description: string;
  onSubmit: (answers: Record<string, unknown>) => void;
  onSkip: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [otherTexts, setOtherTexts] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState(0);

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
      if (typeof val === "number") mapped[qIdx] = q.options?.[val]?.label || String(val);
      else if (Array.isArray(val)) mapped[qIdx] = val.map((i) => q.options?.[i]?.label || String(i));
      else mapped[qIdx] = val;
    }
    onSubmit(mapped);
  };

  // Single question — simple layout
  if (questions.length <= 1) {
    const q = questions[0] || { question: description, options: [], multiSelect: false };
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
              : answers[0] === j;
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
            <button onClick={() => handleOtherSubmit(0)} className="rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:bg-surface-2 transition-colors">
              Send
            </button>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={handleSubmit} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-light transition-colors">Submit</button>
          <button onClick={onSkip} className="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface-2 transition-colors">Skip</button>
        </div>
      </div>
    );
  }

  // Multiple questions — tab layout
  const currentQ = questions[activeTab];

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
              activeTab === i ? "bg-brand/20 text-brand" : "text-text-muted hover:bg-surface-2",
            )}
          >
            {q.header || `Q${i + 1}`}
          </button>
        ))}
      </div>

      {currentQ && (
        <QuestionTab
          question={currentQ}
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
          <button onClick={handleSubmit} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-light transition-colors">Submit All</button>
          <button onClick={onSkip} className="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface-2 transition-colors">Skip</button>
        </div>
      </div>
    </div>
  );
}

function QuestionTab({
  question, qIdx, answers, otherTexts, onSelect, onOtherTextChange, onOtherSubmit,
}: {
  question: Question;
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
          <button onClick={() => onOtherSubmit(qIdx)} className="rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:bg-surface-2 transition-colors">Send</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PlanPanelView — plan approval with feedback
// ============================================================

export function PlanPanelView({
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
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand/15 text-brand">
          <Check className="h-3 w-3" strokeWidth={2.5} />
        </span>
        <span className="text-sm font-semibold text-text-primary">
          {isEmpty ? "Exit plan mode?" : "Ready to code?"}
        </span>
      </div>
      {!isEmpty && (
        <div
          className="mb-4 max-h-64 overflow-auto rounded-lg bg-tool-card p-4 text-sm text-text-secondary"
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
            <PlanOption selected={selected === "yes-accept-edits"} onClick={() => setSelected("yes-accept-edits")} label="Yes, auto-accept edits" desc="Approve plan and auto-accept file edits" />
            <PlanOption selected={selected === "yes-default"} onClick={() => setSelected("yes-default")} label="Yes, manually approve edits" desc="Approve plan but confirm each edit" />
            <PlanOption selected={selected === "no"} onClick={() => setSelected("no")} label="No, keep planning" desc="Provide feedback to refine the plan" />
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

function PlanOption({ selected, onClick, label, desc }: { selected: boolean; onClick: () => void; label: string; desc?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full rounded-lg border px-4 py-2.5 text-left text-sm transition-colors",
        selected ? "border-brand bg-brand/10 text-text-primary" : "border-border bg-surface-2 text-text-secondary hover:border-border-light",
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn(
          "flex h-4 w-4 items-center justify-center rounded-full border text-[10px] transition-colors",
          selected ? "border-brand bg-brand text-white" : "border-border",
        )}>
          {selected && "\u2713"}
        </span>
        <span className="font-medium">{label}</span>
      </div>
      {desc && <div className="mt-0.5 pl-6 text-xs text-text-muted">{desc}</div>}
    </button>
  );
}

function formatPlanContent(content: string): string {
  let html = esc(content);
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, _l, code) =>
    `<pre class="my-2 overflow-x-auto rounded-lg bg-tool-card p-3 font-mono text-xs">${code.trim()}</pre>`
  );
  html = html.replace(/`([^`]+)`/g, '<code class="rounded bg-tool-card px-1.5 py-0.5 font-mono text-xs">$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return html;
}
