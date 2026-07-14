import { useState, useMemo } from 'react';
import { Search, Plus } from 'lucide-react';
import { cn } from '../lib/utils';
import type { Session, Environment, Project } from '../types';
import { SessionListItem } from '../components/SessionListItem';

// =============================================================================
// 对话列表页 — 仿 claude.ai Chats：标题 + 搜索 + 历史列表
// =============================================================================

interface ChatsPageProps {
  sessions: Session[];
  environments: Environment[];
  projects?: Project[];
  onOpen: (sessionId: string) => void;
  onNew: () => void;
  onRefresh: () => void | Promise<void>;
}

export function ChatsPage({ sessions, environments, projects = [], onOpen, onNew, onRefresh }: ChatsPageProps) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'active' | 'archived'>('active');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessions.filter(s => {
      const inScope = scope === 'archived' ? s.status === 'archived' : s.status !== 'archived';
      if (!inScope) return false;
      return !q || (s.title || '').toLowerCase().includes(q) || s.id.toLowerCase().includes(q);
    });
  }, [sessions, query, scope]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        {/* 标题行 */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-sans text-2xl sm:text-3xl font-medium text-text-primary">你的对话记录</h1>
          <button
            type="button"
            onClick={onNew}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 font-display text-sm font-medium text-white hover:bg-brand-light transition-colors"
          >
            <Plus className="h-4 w-4" />
            新对话
          </button>
        </div>

        <div className="mb-4 inline-flex rounded-lg border border-border bg-surface-1 p-1">
          {(
            [
              ['active', '活动'],
              ['archived', '已归档'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setScope(value)}
              className={cn(
                'rounded-md px-3 py-1.5 font-display text-sm transition-colors',
                scope === value
                  ? 'bg-surface-3 text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-secondary',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 搜索 */}
        <div className="relative mb-6">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="搜索你的对话…"
            className="w-full rounded-xl border border-border bg-surface-2 py-2.5 pl-10 pr-4 font-display text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand/50 transition-colors"
          />
        </div>

        {/* 列表 */}
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface-1 px-6 py-12 text-center">
            <p className="font-display text-sm text-text-muted">
              {query ? '没有匹配的对话' : '还没有对话，从「新对话」开始吧'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface-1">
            {filtered.map(session => (
              <SessionListItem
                key={session.id}
                session={session}
                product="chat"
                projects={projects}
                environments={environments}
                onOpen={onOpen}
                onRefresh={onRefresh}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
