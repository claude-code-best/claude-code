import { useState } from 'react';
import { Archive, ArrowRightLeft, MoreHorizontal, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import {
  apiArchiveSession,
  apiDeleteChatSession,
  apiDeleteSession,
  apiRebindSession,
  apiRenameSession,
  apiRestoreSession,
} from '../api/client';
import type { Environment, Session } from '../types';
import { envDisplayName } from '../shell/EnvPicker';
import { cn } from '../lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';

type Action = 'rename' | 'archive' | 'restore' | 'rebind' | 'delete';

interface SessionActionsProps {
  session: Pick<Session, 'id' | 'title' | 'status' | 'environment_id' | 'product' | 'project_id'>;
  environments?: Environment[];
  onChanged?: () => void | Promise<void>;
  onDeleted?: () => void | Promise<void>;
  className?: string;
}

const actionCopy: Record<Action, { title: string; description: string; confirm: string }> = {
  rename: {
    title: '重命名对话',
    description: '名称会同步显示在侧边栏、对话列表和项目详情中。',
    confirm: '保存名称',
  },
  archive: {
    title: '归档对话？',
    description: '对话历史会保留，之后可以从“已归档”列表恢复。',
    confirm: '归档',
  },
  restore: {
    title: '恢复对话？',
    description: '对话会回到活动列表；工作进程离线时消息仍会保存，并在重连后派发。',
    confirm: '恢复',
  },
  rebind: {
    title: '切换运行环境',
    description: '将此对话精确绑定到一个在线设备和工作区，并重新派发待处理消息。',
    confirm: '切换环境',
  },
  delete: {
    title: '永久删除对话？',
    description: '所有消息历史和会话状态都会被永久删除，此操作无法撤销。',
    confirm: '永久删除',
  },
};

export function canRebindProductSession(session: Pick<Session, 'product' | 'project_id'>): boolean {
  return session.product !== 'chat' && !session.project_id;
}

export function SessionActions({ session, environments = [], onChanged, onDeleted, className }: SessionActionsProps) {
  const [action, setAction] = useState<Action | null>(null);
  const [targetTitle, setTargetTitle] = useState(session.title || '');
  const [targetEnvironmentId, setTargetEnvironmentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const archived = session.status === 'archived';
  const canRebind = canRebindProductSession(session);
  const rebindTargets = environments.filter(
    environment => environment.worker_type !== 'acp' && environment.id !== session.environment_id,
  );

  const selectAction = (next: Action) => {
    setError('');
    if (next === 'rename') setTargetTitle(session.title || '');
    if (next === 'rebind') setTargetEnvironmentId(rebindTargets[0]?.id || '');
    setAction(next);
  };

  const confirm = async () => {
    if (!action || busy) return;
    setBusy(true);
    setError('');
    try {
      if (action === 'rename') {
        if (!targetTitle.trim()) return;
        await apiRenameSession(session.id, targetTitle.trim());
        await onChanged?.();
      } else if (action === 'archive') {
        await apiArchiveSession(session.id);
        await onChanged?.();
      } else if (action === 'restore') {
        await apiRestoreSession(session.id);
        await onChanged?.();
      } else if (action === 'rebind') {
        if (!targetEnvironmentId) return;
        await apiRebindSession(session.id, targetEnvironmentId);
        await onChanged?.();
      } else {
        if (session.product === 'chat') await apiDeleteChatSession(session.id);
        else await apiDeleteSession(session.id);
        await onDeleted?.();
      }
      setAction(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`管理对话 ${session.title || session.id}`}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary',
              className,
            )}
            onClick={event => event.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={event => event.stopPropagation()}>
          <DropdownMenuItem onSelect={() => selectAction('rename')}>
            <Pencil />
            重命名
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {archived ? (
            <DropdownMenuItem onSelect={() => selectAction('restore')}>
              <RotateCcw />
              恢复对话
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => selectAction('archive')}>
              <Archive />
              归档对话
            </DropdownMenuItem>
          )}
          {!archived && canRebind && rebindTargets.length > 0 && (
            <DropdownMenuItem onSelect={() => selectAction('rebind')}>
              <ArrowRightLeft />
              切换运行环境
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => selectAction('delete')}>
            <Trash2 />
            永久删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={action !== null}
        onOpenChange={open => {
          if (!open && !busy) setAction(null);
        }}
      >
        <DialogContent>
          {action && (
            <>
              <DialogHeader>
                <DialogTitle>{actionCopy[action].title}</DialogTitle>
                <DialogDescription>{actionCopy[action].description}</DialogDescription>
              </DialogHeader>
              {action === 'rename' && (
                <label className="space-y-2 text-sm text-text-secondary">
                  <span>对话名称</span>
                  <input
                    autoFocus
                    value={targetTitle}
                    onChange={event => setTargetTitle(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter') void confirm();
                    }}
                    className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-text-primary"
                  />
                </label>
              )}
              {action === 'rebind' && (
                <label className="space-y-2 text-sm text-text-secondary">
                  <span>目标设备与工作区</span>
                  <select
                    value={targetEnvironmentId}
                    onChange={event => setTargetEnvironmentId(event.target.value)}
                    className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-text-primary"
                  >
                    {rebindTargets.map(environment => (
                      <option key={environment.id} value={environment.id}>
                        {envDisplayName(environment)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setAction(null)}>
                  取消
                </Button>
                <Button
                  type="button"
                  variant={action === 'delete' ? 'destructive' : 'default'}
                  disabled={
                    busy ||
                    (action === 'rename' && !targetTitle.trim()) ||
                    (action === 'rebind' && !targetEnvironmentId)
                  }
                  onClick={confirm}
                >
                  {busy ? '处理中…' : actionCopy[action].confirm}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
