import { useState } from 'react';
import { Archive, ArrowLeft, FolderGit2, MessageSquare, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import {
  apiArchiveCodeProject,
  apiDeleteChatProject,
  apiRestoreCodeProject,
  apiUpdateProjectPrompt,
} from '../api/client';
import { SessionListItem } from '../components/SessionListItem';
import { sessionTimestamp } from '../shell/format';
import type { Environment, Product, Project, Session } from '../types';
import { cn } from '../lib/utils';

export interface ProjectDetailPageProps {
  product: Product;
  project: Project;
  projects: Project[];
  sessions: Session[];
  environments: Environment[];
  onBack: () => void;
  onOpenSession: (sessionId: string) => void;
  onRefresh: () => void | Promise<void>;
  /** 在该项目下新建会话：带入项目的环境 + 工作目录后进入 Code 首页撰写。 */
  onNewConversation?: (context: { environmentId?: string | null; directory?: string | null }) => void;
}

export function ProjectDetailPage({
  product,
  project,
  projects,
  sessions,
  environments,
  onBack,
  onOpenSession,
  onRefresh,
  onNewConversation,
}: ProjectDetailPageProps) {
  const [prompt, setPrompt] = useState(project.project_prompt);
  const [saving, setSaving] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [error, setError] = useState('');
  const environment = project.device_id
    ? environments.find(item => item.device_id === project.device_id && item.workspace_key === project.workspace_key)
    : undefined;
  const sortedSessions = [...sessions].sort((a, b) => sessionTimestamp(b) - sessionTimestamp(a));
  const isArchived = project.state !== 'active';
  const isMissing = product === 'code' && project.state === 'missing';
  // Offer "new conversation" for any active Code project. The composer (Code
  // Home) handles online-environment selection; here we only carry the
  // project's env + canonical directory so the new session defaults to it.
  const canCreateSession = product === 'code' && !isArchived && !isMissing && onNewConversation !== undefined;

  const startProjectSession = () => {
    onNewConversation?.({
      environmentId: environment?.id ?? null,
      directory: project.canonical_path ?? null,
    });
  };

  const savePrompt = async () => {
    if (saving || prompt === project.project_prompt) return;
    setSaving(true);
    setError('');
    try {
      await apiUpdateProjectPrompt(product, project.id, prompt);
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存项目提示词失败');
    } finally {
      setSaving(false);
    }
  };

  const changeLifecycle = async () => {
    if (lifecycleBusy) return;
    setLifecycleBusy(true);
    setError('');
    try {
      if (product === 'chat') {
        if (isArchived) return;
        if (!window.confirm('删除此 Chat 项目及其全部对话？临时文件和项目记录也会被永久清理。')) return;
        await apiDeleteChatProject(project.id);
        await onRefresh();
        onBack();
      } else if (isArchived) {
        await apiRestoreCodeProject(project.id);
        await onRefresh();
      } else {
        await apiArchiveCodeProject(project.id);
        await onRefresh();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '项目状态更新失败');
    } finally {
      setLifecycleBusy(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-7 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1.5 font-display text-sm text-text-muted transition-colors hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          返回项目
        </button>

        <div className="mb-6 rounded-2xl border border-border bg-surface-1 p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <FolderGit2 className="h-5 w-5 flex-shrink-0 text-brand" />
                <h1 className="truncate font-sans text-2xl font-semibold text-text-primary">{project.name}</h1>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 font-display text-xs',
                    isArchived ? 'bg-surface-3 text-text-muted' : 'bg-brand/10 text-brand',
                  )}
                >
                  {isArchived ? (project.state === 'missing' ? '工作区缺失' : '已归档') : '活动'}
                </span>
              </div>
              {product === 'code' && (
                <div className="mt-3 space-y-1 font-mono text-xs text-text-muted">
                  {project.canonical_path && <p>{project.canonical_path}</p>}
                  {project.git_root && <p>Git: {project.git_root}</p>}
                  {project.git_repo_url && <p>Remote: {project.git_repo_url}</p>}
                  {environment && (
                    <p className="font-display text-text-secondary">
                      设备：{environment.machine_name || environment.device_name || environment.id}
                    </p>
                  )}
                </div>
              )}
              {product === 'chat' && (
                <p className="mt-2 font-display text-sm text-text-muted">
                  Chat 项目不绑定工作区，对话会在临时环境中运行。
                </p>
              )}
            </div>
            {isMissing ? (
              <div className="max-w-xs rounded-lg border border-border bg-surface-2 px-3 py-2 font-display text-xs leading-5 text-text-muted">
                文件夹已不存在；请重新从 Code 首页选择该文件夹。检测到工作区后会复用原项目。
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void changeLifecycle()}
                disabled={lifecycleBusy || (product === 'chat' && isArchived)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 font-display text-sm transition-colors disabled:opacity-50',
                  isArchived
                    ? 'border-brand/30 text-brand hover:bg-brand/10'
                    : 'border-border text-text-secondary hover:border-status-error/40 hover:text-status-error',
                )}
              >
                {isArchived ? (
                  <RotateCcw className="h-4 w-4" />
                ) : product === 'chat' ? (
                  <Trash2 className="h-4 w-4" />
                ) : (
                  <Archive className="h-4 w-4" />
                )}
                {lifecycleBusy ? '处理中…' : isArchived ? '恢复项目' : product === 'chat' ? '删除项目' : '归档项目'}
              </button>
            )}
          </div>

          <div className="mt-5 border-t border-border pt-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <label htmlFor="project-prompt" className="font-display text-sm font-semibold text-text-primary">
                项目提示词
              </label>
              <span className="font-mono text-[11px] text-text-muted">修订 {project.prompt_revision}</span>
            </div>
            <textarea
              id="project-prompt"
              aria-label="项目提示词"
              value={prompt}
              onChange={event => setPrompt(event.target.value)}
              disabled={isArchived}
              rows={5}
              placeholder="给这个项目的每个新会话追加的指导…"
              className="w-full resize-y rounded-xl border border-border bg-surface-2 px-3 py-2.5 font-display text-sm leading-6 text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand/50 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="font-display text-xs text-text-muted">保存后只影响新建会话，不会重启正在运行的会话。</p>
              <button
                type="button"
                onClick={() => void savePrompt()}
                disabled={saving || isArchived || prompt === project.project_prompt}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 font-display text-sm font-medium text-white transition-colors hover:bg-brand-light disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? '保存中…' : '保存提示词'}
              </button>
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-status-error">{error}</p>}
        </div>

        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="font-display text-base font-semibold text-text-primary">项目会话</h2>
          <div className="flex items-center gap-3">
            <span className="font-display text-sm text-text-muted">{sortedSessions.length} 个</span>
            {canCreateSession && (
              <button
                type="button"
                onClick={startProjectSession}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 font-display text-sm font-medium text-white transition-colors hover:bg-brand-light"
              >
                <Plus className="h-4 w-4" />
                新建会话
              </button>
            )}
          </div>
        </div>
        {sortedSessions.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface-1 px-6 py-12 text-center">
            <MessageSquare className="mx-auto mb-3 h-5 w-5 text-text-muted" />
            <p className="font-display text-sm text-text-muted">该项目还没有会话</p>
            {canCreateSession && (
              <button
                type="button"
                onClick={startProjectSession}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 font-display text-sm font-medium text-white transition-colors hover:bg-brand-light"
              >
                <Plus className="h-4 w-4" />
                在此项目新建会话
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface-1">
            {sortedSessions.map(session => (
              <SessionListItem
                key={session.id}
                session={session}
                product={product}
                projects={product === 'chat' ? projects : []}
                environments={environments}
                onOpen={onOpenSession}
                onRefresh={onRefresh}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
