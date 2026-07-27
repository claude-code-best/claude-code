import { useEffect, useRef, useState } from 'react';
import { Archive, FolderInput, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import {
  apiArchiveSession,
  apiAssignChatSessionProject,
  apiDeleteChatSession,
  apiDeleteSession,
  apiRenameSession,
  apiRestoreSession,
} from '../api/client';
import type { Product, Project, Session } from '../types';
import { cn } from '../lib/utils';

interface SessionContextMenuProps {
  session: Session;
  product: Product;
  open: boolean;
  x: number;
  y: number;
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
  projects?: Project[];
}

export function clampContextMenuPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  return {
    left: Math.max(8, Math.min(x, viewportWidth - width - 8)),
    top: Math.max(8, Math.min(y, viewportHeight - height - 8)),
  };
}

export function SessionContextMenu({
  session,
  product,
  open,
  x,
  y,
  onClose,
  onChanged,
  projects = [],
}: SessionContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [position, setPosition] = useState({ left: x, top: y });
  const archived = session.status === 'archived';
  const chatProjects = projects.filter(project => project.product === 'chat' && project.state === 'active');

  useEffect(() => {
    if (!open) return;
    setError('');
    const frame = requestAnimationFrame(() => {
      const bounds = menuRef.current?.getBoundingClientRect();
      setPosition(
        clampContextMenuPosition(
          x,
          y,
          bounds?.width || 208,
          bounds?.height || 280,
          window.innerWidth,
          window.innerHeight,
        ),
      );
    });
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose, x, y]);

  if (!open) return null;

  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
      await onChanged?.();
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`更多操作 ${session.title || session.id}`}
      className="fixed z-[100] min-w-52 rounded-xl border border-border bg-surface-2 p-1.5 shadow-xl"
      style={position}
      onContextMenu={event => event.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        disabled={busy}
        onClick={() => {
          const title = window.prompt('重命名对话', session.title || '')?.trim();
          if (title) void run(() => apiRenameSession(session.id, title));
        }}
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-display text-sm text-text-primary hover:bg-surface-3 disabled:opacity-50"
      >
        <Pencil className="h-4 w-4" />
        重命名
      </button>
      <div className="my-1 border-t border-border" />
      <button
        type="button"
        role="menuitem"
        disabled={busy}
        onClick={() => void run(archived ? () => apiRestoreSession(session.id) : () => apiArchiveSession(session.id))}
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-display text-sm text-text-primary hover:bg-surface-3 disabled:opacity-50"
      >
        {archived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
        {archived ? '恢复对话' : '归档对话'}
      </button>
      {product === 'chat' && (chatProjects.length > 0 || session.project_id) && (
        <label className="flex items-center gap-2 rounded-lg px-2.5 py-2 font-display text-sm text-text-primary hover:bg-surface-3">
          <FolderInput className="h-4 w-4 flex-shrink-0" />
          <span className="min-w-0 flex-1">移入项目</span>
          <select
            aria-label="移入项目"
            value={session.project_id || ''}
            disabled={busy}
            onChange={event => void run(() => apiAssignChatSessionProject(session.id, event.target.value || null))}
            className="max-w-28 rounded border border-border bg-surface-1 px-1.5 py-1 text-xs text-text-primary"
          >
            <option value="">无项目</option>
            {chatProjects.map(project => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && (
        <p role="alert" className="px-2.5 py-1.5 font-display text-xs text-status-error">
          {error}
        </p>
      )}
      <div className="my-1 border-t border-border" />
      <button
        type="button"
        role="menuitem"
        disabled={busy}
        onClick={() => {
          if (window.confirm('永久删除此对话？此操作无法撤销。')) {
            void run(() => (product === 'chat' ? apiDeleteChatSession(session.id) : apiDeleteSession(session.id)));
          }
        }}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-display text-sm text-status-error hover:bg-status-error/10 disabled:opacity-50',
        )}
      >
        <Trash2 className="h-4 w-4" />
        永久删除
      </button>
    </div>
  );
}
