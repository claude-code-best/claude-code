import React, { useState } from "react";
import type { PlanEntry, PlanEntryPriority, PlanEntryStatus } from "../lib/acp/types";
import type { PlanDisplayEntry } from "../lib/types";

interface PlanViewProps {
  entry: PlanDisplayEntry;
}

export function PlanView({ entry }: PlanViewProps): React.ReactElement | null {
  const [collapsed, setCollapsed] = useState(false);
  if (entry.entries.length === 0) return null;

  const completed = entry.entries.filter((e) => e.status === "completed").length;
  const total = entry.entries.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="plan-view">
      <button
        type="button"
        className="plan-header"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
      >
        <span className={`plan-chevron ${collapsed ? "" : "expanded"}`}>▶</span>
        <span className="plan-title">Execution Plan</span>
        <span className="plan-counter">
          {completed}/{total}
        </span>
        <div className="plan-progress">
          <div className="plan-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="plan-pct">{pct}%</span>
      </button>
      {!collapsed && (
        <div className="plan-list">
          {entry.entries.map((row, i) => (
            <PlanRow key={i} entry={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function PlanRow({ entry }: { entry: PlanEntry }): React.ReactElement {
  return (
    <div className={`plan-row plan-status-${entry.status}`}>
      <StatusIcon status={entry.status} />
      <span className="plan-content">{entry.content}</span>
      <PriorityBadge priority={entry.priority} />
    </div>
  );
}

function StatusIcon({ status }: { status: PlanEntryStatus }): React.ReactElement {
  if (status === "completed") return <span className="plan-icon icon-done" aria-hidden>✓</span>;
  if (status === "in_progress") return <span className="plan-icon icon-running" aria-hidden>◐</span>;
  return <span className="plan-icon icon-pending" aria-hidden>○</span>;
}

function PriorityBadge({ priority }: { priority: PlanEntryPriority }): React.ReactElement {
  const labels: Record<PlanEntryPriority, string> = { high: "H", medium: "M", low: "L" };
  return <span className={`plan-priority priority-${priority}`}>{labels[priority]}</span>;
}
