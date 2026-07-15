import { useState, useEffect } from 'react';
import { FolderOpen, Map, Pencil, Shield, ShieldOff } from 'lucide-react';
import type { Environment, Session } from '../types';
import { apiCreateSession } from '../api/client';
import { cn } from '../lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { environmentDefaultModelLabel } from '../lib/session-model-options';

const PERMISSION_MODE_OPTIONS: Array<{
  id: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
}> = [
  { id: 'default', label: '标准', hint: '敏感操作前询问', icon: <Shield className="h-3.5 w-3.5" /> },
  { id: 'acceptEdits', label: '自动编辑', hint: '自动批准文件编辑', icon: <Pencil className="h-3.5 w-3.5" /> },
  { id: 'plan', label: '规划', hint: '只读，先出方案', icon: <Map className="h-3.5 w-3.5" /> },
  {
    id: 'bypassPermissions',
    label: '跳过权限',
    hint: '需 CLI 允许 bypass',
    icon: <ShieldOff className="h-3.5 w-3.5" />,
  },
];

interface NewSessionDialogProps {
  open: boolean;
  environments: Environment[];
  onClose: () => void;
  onCreated: (session: Session) => void;
}

export function NewSessionDialog({ open, environments, onClose, onCreated }: NewSessionDialogProps) {
  const [title, setTitle] = useState('');
  const [envId, setEnvId] = useState('');
  const [permissionMode, setPermissionMode] = useState('default');
  const [directory, setDirectory] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle('');
      setEnvId('');
      setPermissionMode('default');
      setDirectory('');
      setError('');
    }
  }, [open]);

  const selectedEnv = environments.find(env => env.id === envId);

  const handleCreate = async () => {
    setCreating(true);
    setError('');
    try {
      const body: Record<string, string> = {};
      if (title.trim()) body.title = title.trim();
      if (envId) body.environment_id = envId;
      if (permissionMode !== 'default') body.permission_mode = permissionMode;
      if (directory.trim()) body.directory = directory.trim();
      const session = await apiCreateSession(body);
      onCreated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-md rounded-2xl border-border bg-surface-1 p-6 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-semibold text-text-primary">新建会话</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-text-secondary">标题（可选）</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="My session"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-text-secondary">运行环境</label>
            <select
              value={envId}
              onChange={e => setEnvId(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary focus:border-brand focus:outline-none"
            >
              <option value="">-- 不绑定 --</option>
              {environments.map(env => (
                <option key={env.id} value={env.id}>
                  {env.machine_name || env.id}
                  {env.directory ? ` · ${env.directory}` : ''} ({env.branch || 'no branch'})
                </option>
              ))}
            </select>
            {selectedEnv?.directory && (
              <p className="mt-1 flex items-center gap-1 font-mono text-[11px] text-text-muted">
                <FolderOpen className="h-3 w-3 flex-shrink-0" />
                默认目录：{selectedEnv.directory}
              </p>
            )}
            {selectedEnv && (
              <p className="mt-1 text-[11px] text-text-muted">
                新会话模型：{environmentDefaultModelLabel(selectedEnv) ?? 'CLI 默认模型'}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm text-text-secondary">工作目录（可选）</label>
            <input
              type="text"
              value={directory}
              onChange={e => setDirectory(e.target.value)}
              placeholder={selectedEnv?.directory || '/path/to/project'}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
            />
            <p className="mt-1 text-[11px] leading-relaxed text-text-muted">
              留空使用环境默认目录。指定目录必须已在目标机器上通过 <code className="font-mono">claude</code> 信任（trust
              dialog），否则回退默认目录。
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm text-text-secondary">权限模式</label>
            <div className="grid grid-cols-2 gap-1.5">
              {PERMISSION_MODE_OPTIONS.map(option => {
                const active = permissionMode === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setPermissionMode(option.id)}
                    title={option.hint}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-left transition-colors',
                      active
                        ? 'border-brand/50 bg-brand/[0.08] text-brand'
                        : 'border-border bg-surface-2 text-text-secondary hover:border-brand/30',
                    )}
                  >
                    {option.icon}
                    <span className="min-w-0">
                      <span className="block font-display text-[12px] font-medium">{option.label}</span>
                      <span className="block truncate font-display text-[10px] text-text-muted">{option.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {error && <div className="text-sm text-status-error">{error}</div>}
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface-2 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-light disabled:opacity-50 transition-colors"
          >
            {creating ? '创建中…' : '创建会话'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
