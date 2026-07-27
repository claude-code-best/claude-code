import { useMemo, useState } from 'react';
import { Check, ChevronDown, FolderGit2, TerminalSquare } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '../../components/ui/popover';
import { cn } from '../lib/utils';
import { dirBasename } from './format';
import type { Environment } from '../types';

// =============================================================================
// 环境选择器 — 仿 "Select repo…" chip，对接 /web/environments
// 仅列出可创建会话的 Claude Code (bridge) 环境；ACP agent 需 WS 直连，不在此列
// =============================================================================

/** 可用于新建会话的环境（bridge worker） */
export function creatableEnvironments(environments: Environment[]): Environment[] {
  return environments.filter(env => env.worker_type !== 'acp');
}

export function envDisplayName(env: Environment): string {
  const dir = dirBasename(env.directory);
  const device = env.device_name || env.machine_name || env.id.slice(0, 8);
  return dir ? `${device} · ${dir}` : device;
}

interface EnvPickerProps {
  environments: Environment[];
  value: string | null;
  onChange: (envId: string) => void;
  /** 外部控制打开（如提交时未选环境） */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export function EnvPicker({ environments, value, onChange, open, onOpenChange, className }: EnvPickerProps) {
  const [innerOpen, setInnerOpen] = useState(false);
  const isOpen = open ?? innerOpen;
  const setOpen = onOpenChange ?? setInnerOpen;

  const usable = useMemo(() => creatableEnvironments(environments), [environments]);
  const selected = usable.find(env => env.id === value) || null;

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs font-display transition-colors',
            selected ? 'text-text-primary' : 'text-text-muted',
            'hover:border-border-light hover:text-text-primary',
            className,
          )}
        >
          <FolderGit2 className="h-3.5 w-3.5 text-text-muted" />
          <span className="max-w-48 truncate">{selected ? envDisplayName(selected) : '选择环境…'}</span>
          <ChevronDown className="h-3 w-3 text-text-muted" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-1.5 rounded-xl border-border bg-surface-2 shadow-lg">
        {usable.length === 0 ? (
          <div className="px-3 py-4 text-center">
            <p className="text-sm text-text-secondary font-display">暂无可用环境</p>
            <p className="mt-1.5 text-xs text-text-muted leading-relaxed">
              在目标机器上运行{' '}
              <code className="rounded bg-surface-1 px-1 py-0.5 font-mono text-[11px]">ccb remote-control</code>{' '}
              接入后即可在此选择
            </p>
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            {usable.map(env => {
              const active = env.id === value;
              return (
                <button
                  key={env.id}
                  type="button"
                  onClick={() => {
                    onChange(env.id);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                    active ? 'bg-brand/10' : 'hover:bg-surface-1',
                  )}
                >
                  <TerminalSquare className="mt-0.5 h-4 w-4 flex-shrink-0 text-text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-display font-medium text-text-primary">
                        {env.device_name || env.machine_name || env.id.slice(0, 12)}
                      </span>
                      <StatusDot status={env.status} />
                    </span>
                    {env.directory && (
                      <span className="mt-0.5 block truncate font-mono text-[11px] text-text-muted">
                        {env.directory}
                        {env.branch ? `  ·  ${env.branch}` : ''}
                      </span>
                    )}
                  </span>
                  {active && <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand" />}
                </button>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function StatusDot({ status, className }: { status: string; className?: string }) {
  const colorMap: Record<string, string> = {
    active: 'bg-status-active',
    running: 'bg-status-running',
    idle: 'bg-status-idle',
    requires_action: 'bg-status-warning',
    error: 'bg-status-error',
  };
  return (
    <span
      className={cn(
        'inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full',
        colorMap[status] || 'bg-surface-3',
        className,
      )}
      title={status}
    />
  );
}
