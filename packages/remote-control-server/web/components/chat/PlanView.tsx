import { useState } from 'react';
import type { PlanDisplayEntry } from '../../src/lib/types';
import type { PlanEntry, PlanEntryPriority, PlanEntryStatus } from '../../src/acp/types';
import { cn } from '../../src/lib/utils';
import { CheckCircle2, Loader2, Circle } from 'lucide-react';

// =============================================================================
// Plan 展示组件 — 执行计划可视化
// =============================================================================

interface PlanDisplayProps {
  entry: PlanDisplayEntry;
}

export function PlanDisplay({ entry }: PlanDisplayProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { entries } = entry;

  if (entries.length === 0) return null;

  const completed = entries.filter(e => e.status === 'completed').length;
  const total = entries.length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="pl-10">
      <div className="rounded-xl border border-border bg-brand/5 overflow-hidden">
        {/* Header */}
        <button
          type="button"
          className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-surface-1/50 transition-colors"
          onClick={() => setCollapsed(!collapsed)}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            className={cn('transition-transform text-text-muted flex-shrink-0', collapsed && 'rotate-90')}
          >
            <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>

          <span className="text-xs font-display font-medium text-text-secondary">执行计划</span>

          <span className="text-[10px] text-text-muted font-mono">
            {completed}/{total}
          </span>

          {/* Progress bar */}
          <div className="flex-1 h-1 rounded-full bg-surface-1 overflow-hidden ml-1 mr-2">
            <div
              className="h-full rounded-full bg-brand/70 transition-all duration-500"
              style={{ width: `${percentage}%` }}
            />
          </div>

          <span className="text-[10px] text-text-muted font-mono">{percentage}%</span>
        </button>

        {/* Entry list */}
        {!collapsed && (
          <div
            className={cn('border-t border-border px-3 py-1.5 space-y-0.5', total > 5 && 'max-h-64 overflow-y-auto')}
          >
            {entries.map((planEntry, i) => (
              <PlanEntryRow key={i} entry={planEntry} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// 单条 Plan 条目
// =============================================================================

function PlanEntryRow({ entry }: { entry: PlanEntry }) {
  return (
    <div className="flex items-start gap-2 py-1.5 px-1">
      <span className="flex-shrink-0 mt-0.5">
        <StatusIcon status={entry.status} />
      </span>
      <span
        className={cn(
          'text-xs leading-relaxed flex-1',
          entry.status === 'completed' ? 'text-text-muted line-through' : 'text-text-secondary',
          entry.status === 'in_progress' && 'text-text-primary font-medium',
        )}
      >
        {entry.content}
      </span>
      <PriorityBadge priority={entry.priority} />
    </div>
  );
}

// =============================================================================
// 状态图标
// =============================================================================

function StatusIcon({ status }: { status: PlanEntryStatus }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-3.5 w-3.5 text-status-active" />;
    case 'in_progress':
      return <Loader2 className="h-3.5 w-3.5 text-brand animate-spin" style={{ animationDuration: '2s' }} />;
    case 'pending':
      return <Circle className="h-3.5 w-3.5 text-text-muted" />;
  }
}

// =============================================================================
// 优先级标签
// =============================================================================

function PriorityBadge({ priority }: { priority: PlanEntryPriority }) {
  const styles: Record<PlanEntryPriority, string> = {
    high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    medium: 'bg-brand/10 text-brand dark:bg-brand/20',
    low: 'bg-surface-1 text-text-muted',
  };

  const labels: Record<PlanEntryPriority, string> = {
    high: '高',
    medium: '中',
    low: '低',
  };

  return (
    <span
      className={cn('text-[9px] font-display rounded-full px-1.5 py-0.5 flex-shrink-0 leading-none', styles[priority])}
    >
      {labels[priority]}
    </span>
  );
}
