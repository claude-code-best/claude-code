import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowUp, Code, GraduationCap, Pencil, Plus, Sparkles, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { ClaudeSpark } from '../shell/brand';
import { createChatSessionWithFirstMessage } from '../shell/createSession';
import { apiCreateChatProject } from '../api/client';
import type { Project } from '../types';

const STARTERS: { icon: React.ReactNode; label: string; prompt: string }[] = [
  { icon: <Pencil className="h-3.5 w-3.5" />, label: '写作', prompt: '帮我写一段文字：' },
  { icon: <GraduationCap className="h-3.5 w-3.5" />, label: '学习', prompt: '请给我讲解一下：' },
  { icon: <Code className="h-3.5 w-3.5" />, label: '编码', prompt: '帮我实现以下功能：' },
  { icon: <Sparkles className="h-3.5 w-3.5" />, label: '头脑风暴', prompt: '我们来头脑风暴一下：' },
];

interface ChatHomeProps {
  projects?: Project[];
  onCreated: (sessionId: string) => void;
  onProjectsChanged?: () => void | Promise<void>;
}

export function ChatHome({ projects = [], onCreated, onProjectsChanged }: ChatHomeProps) {
  const [text, setText] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [projectBusy, setProjectBusy] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (projectId && !projects.some(project => project.id === projectId && project.state === 'active')) {
      setProjectId(null);
    }
  }, [projects, projectId]);

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    setError('');
    try {
      const session = await createChatSessionWithFirstMessage({ text: trimmed, projectId });
      onCreated(session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建会话失败');
      setCreating(false);
    }
  }, [text, projectId, creating, onCreated]);

  const handleCreateProject = async () => {
    const name = projectName.trim();
    if (!name || projectBusy) return;
    setProjectBusy(true);
    setError('');
    try {
      const project = await apiCreateChatProject({ name });
      setProjectId(project.id);
      setProjectName('');
      setProjectFormOpen(false);
      await onProjectsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建项目失败');
    } finally {
      setProjectBusy(false);
    }
  };

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleInput = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(event.target.value);
    event.target.style.height = 'auto';
    event.target.style.height = `${Math.min(event.target.scrollHeight, 200)}px`;
  }, []);

  const applyStarter = useCallback((prompt: string) => {
    setText(prompt);
    textareaRef.current?.focus();
  }, []);

  const canSend = text.trim().length > 0 && !creating;

  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto px-4">
      <div className="w-full max-w-2xl pb-16" style={{ animation: 'fadeUp 0.5s ease-out' }}>
        <div className="mb-8 flex items-center justify-center gap-3">
          <ClaudeSpark size={30} />
          <h1 className="font-sans text-3xl font-medium tracking-tight text-text-primary sm:text-4xl">
            What shall we think through?
          </h1>
        </div>

        <div className="mb-3 flex items-center justify-end gap-2">
          <label htmlFor="chat-project-select" className="font-display text-sm text-text-muted">
            项目
          </label>
          <select
            id="chat-project-select"
            aria-label="选择 Chat 项目"
            value={projectId ?? ''}
            onChange={event => setProjectId(event.target.value || null)}
            className="max-w-[220px] rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 font-display text-sm text-text-primary outline-none focus:border-brand/50"
          >
            <option value="">无项目</option>
            {projects
              .filter(project => project.state === 'active')
              .map(project => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
          </select>
          <button
            type="button"
            aria-label="新建项目"
            onClick={() => setProjectFormOpen(open => !open)}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 font-display text-sm text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
          >
            {projectFormOpen ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            新建项目
          </button>
        </div>

        {projectFormOpen && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-border bg-surface-1 p-2">
            <input
              aria-label="项目名称"
              value={projectName}
              onChange={event => setProjectName(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') void handleCreateProject();
              }}
              placeholder="输入项目名称"
              autoFocus
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 font-display text-sm text-text-primary outline-none focus:border-brand/50"
            />
            <button
              type="button"
              onClick={() => void handleCreateProject()}
              disabled={!projectName.trim() || projectBusy}
              className="rounded-lg bg-brand px-3 py-2 font-display text-sm font-medium text-white disabled:opacity-50"
            >
              {projectBusy ? '创建中…' : '创建项目'}
            </button>
          </div>
        )}

        <div
          className={cn(
            'overflow-hidden rounded-2xl border border-border bg-surface-2 shadow-sm transition-all',
            'focus-within:border-brand/50 focus-within:shadow-[0_0_0_3px_rgba(217,119,87,0.12)]',
          )}
        >
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="今天想聊点什么？"
            rows={2}
            disabled={creating}
            className="max-h-[200px] w-full resize-none border-none bg-transparent px-4 pb-1 pt-4 font-display text-[15px] text-text-primary outline-none placeholder:text-text-muted"
          />
          <div className="flex items-center justify-between gap-2 px-3 pb-3 pt-1">
            <div className="flex flex-wrap gap-1">
              {STARTERS.map(starter => (
                <button
                  key={starter.label}
                  type="button"
                  onClick={() => applyStarter(starter.prompt)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-display text-xs text-text-secondary transition-colors hover:bg-surface-1 hover:text-text-primary"
                >
                  {starter.icon}
                  {starter.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!canSend}
              aria-label="发送"
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg transition-all',
                canSend ? 'bg-brand text-white hover:bg-brand-light' : 'text-text-muted',
              )}
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>
        {error && <p className="mt-3 text-center font-display text-sm text-status-error">{error}</p>}
      </div>
    </div>
  );
}
