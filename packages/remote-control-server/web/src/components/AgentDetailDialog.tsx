import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { MessageResponse } from '../../components/ai-elements/message';
import type { RuntimeAgent } from '../lib/work-center-model';
import { cn } from '../lib/utils';

// =============================================================================
// 子代理详情弹窗 — 点击侧边栏 "Agents & processes" 中的条目打开。
// 数据全部来自会话事件（Agent 工具输入/输出 + task_* 遥测），无额外请求。
// =============================================================================

const AGENT_STATUS_LABELS: Record<RuntimeAgent['status'], string> = {
  running: '运行中',
  complete: '已完成',
  error: '失败',
  waiting_for_confirmation: '等待确认',
  rejected: '已拒绝',
  canceled: '已取消',
};

interface AgentDetailDialogProps {
  agent: RuntimeAgent | null;
  onClose: () => void;
}

export function AgentDetailDialog({ agent, onClose }: AgentDetailDialogProps) {
  return (
    <Dialog
      open={agent !== null}
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[82vh] flex-col gap-3 sm:max-w-2xl">
        {agent && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-display text-base">
                <span
                  className={cn(
                    'h-2 w-2 flex-shrink-0 rounded-full',
                    agent.status === 'running'
                      ? 'animate-pulse bg-brand'
                      : agent.status === 'error' || agent.status === 'rejected'
                        ? 'bg-status-error'
                        : agent.status === 'canceled'
                          ? 'bg-text-muted'
                          : 'bg-status-active',
                  )}
                />
                <span className="min-w-0 truncate">{agent.name}</span>
                <span className="flex-shrink-0 text-[10px] font-normal text-text-muted">
                  {AGENT_STATUS_LABELS[agent.status]}
                </span>
              </DialogTitle>
              {agent.description !== agent.name && (
                <DialogDescription className="text-xs">{agent.description}</DialogDescription>
              )}
            </DialogHeader>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-md border border-border bg-surface-2 px-3 py-2.5 text-[10px] sm:grid-cols-3">
              {agent.agentType && <MetaItem label="类型" value={agent.agentType} mono />}
              {agent.model && <MetaItem label="模型" value={agent.model} mono />}
              <MetaItem label="运行方式" value={agent.background ? '后台' : '前台'} />
              {agent.isolated && <MetaItem label="隔离" value="独立工作区" />}
              {agent.parentId && <MetaItem label="父级" value={agent.parentId} mono />}
              {agent.lastToolName && <MetaItem label="最近工具" value={agent.lastToolName} mono />}
              {agent.usage && (
                <>
                  <MetaItem label="用时" value={formatDuration(agent.usage.durationMs)} mono />
                  <MetaItem label="工具调用" value={`${agent.usage.toolUses} 次`} mono />
                  <MetaItem label="Tokens" value={agent.usage.totalTokens.toLocaleString()} mono />
                </>
              )}
              {!agent.usage && agent.elapsedSeconds !== undefined && (
                <MetaItem label="已运行" value={`${Math.round(agent.elapsedSeconds)}s`} mono />
              )}
              {agent.toolUseId && <MetaItem label="tool_use" value={agent.toolUseId} mono />}
            </div>

            {(agent.worktreePath || agent.outputFile) && (
              <div className="space-y-1 text-[9px] text-text-muted">
                {agent.worktreePath && <p className="break-all font-mono">worktree: {agent.worktreePath}</p>}
                {agent.outputFile && <p className="break-all font-mono">输出文件: {agent.outputFile}</p>}
              </div>
            )}

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {agent.summary && agent.summary !== agent.description && (
                <DetailSection title="进度摘要" defaultOpen>
                  <p className="text-[11px] leading-relaxed text-text-secondary">{agent.summary}</p>
                </DetailSection>
              )}

              {agent.prompt && (
                <DetailSection title={`完整 Prompt（${agent.prompt.length} chars）`} defaultOpen={!agent.outputText}>
                  <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-surface-2 p-2.5 font-mono text-[10px] leading-relaxed text-text-secondary">
                    {agent.prompt}
                  </pre>
                </DetailSection>
              )}

              {agent.outputText ? (
                <DetailSection title="最终报告" defaultOpen>
                  <div className="rounded-md border border-border bg-surface-2 p-3 text-sm">
                    <MessageResponse>{agent.outputText}</MessageResponse>
                  </div>
                </DetailSection>
              ) : (
                <p className="text-[10px] text-text-muted">
                  {agent.status === 'running'
                    ? '子代理仍在运行，完成后这里会显示最终报告。'
                    : '事件流中没有该子代理的最终报告文本。'}
                </p>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MetaItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[8px] uppercase tracking-[0.08em] text-text-muted">{label}</p>
      <p className={cn('truncate text-text-secondary', mono && 'font-mono text-[9px]')} title={value}>
        {value}
      </p>
    </div>
  );
}

function DetailSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="flex w-full items-center gap-1.5 py-1 text-left"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 text-text-muted" />
        ) : (
          <ChevronRight className="h-3 w-3 text-text-muted" />
        )}
        <span className="text-[10px] font-medium text-text-primary">{title}</span>
      </button>
      {open && <div className="mt-1">{children}</div>}
    </section>
  );
}

function formatDuration(durationMs: number): string {
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
