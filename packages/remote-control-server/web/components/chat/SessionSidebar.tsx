import { cn } from '../../src/lib/utils';
import { Plus, MessageSquare, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { SessionListItem } from '../../src/lib/types';

// =============================================================================
// 会话侧边栏 — Anthropic 分段式：今天/昨天/更早 + 橙色活跃态
// =============================================================================

interface SessionSidebarProps {
  sessions: SessionListItem[];
  activeId?: string | null;
  onSelect?: (id: string) => void;
  onNew?: () => void;
  className?: string;
}

export function SessionSidebar({ sessions, activeId, onSelect, onNew, className }: SessionSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  // 按日期分组
  const groups = groupByRecency(sessions);

  return (
    <div
      className={cn(
        'hidden md:flex flex-col border-r border-border bg-surface-1 transition-all duration-200',
        collapsed ? 'w-12' : 'w-64',
        className,
      )}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-border">
        {!collapsed && (
          <span className="text-xs font-display font-medium text-text-muted uppercase tracking-wider">会话</span>
        )}
        <div className="flex items-center gap-1">
          {!collapsed && onNew && (
            <button
              type="button"
              onClick={onNew}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-text-muted hover:text-brand hover:bg-brand/10 transition-colors"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* 会话列表 — 分段 */}
      {!collapsed && (
        <nav className="flex-1 overflow-y-auto py-2" aria-label="历史会话">
          {groups.map(group => (
            <div key={group.label}>
              <div className="px-3 py-1.5">
                <span className="text-[10px] font-display font-medium uppercase tracking-widest text-text-muted">
                  {group.label}
                </span>
              </div>
              {group.sessions.map(session => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => onSelect?.(session.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-left transition-colors',
                    session.id === activeId
                      ? 'bg-brand/10 text-text-primary'
                      : 'text-text-secondary hover:bg-surface-1/50 hover:text-text-primary',
                  )}
                  title={session.title || session.id}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                  <span className="text-sm font-display truncate">{session.title || session.id.slice(0, 8)}</span>
                </button>
              ))}
            </div>
          ))}
          {sessions.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <span className="text-xs text-text-muted font-display">暂无会话</span>
            </div>
          )}
        </nav>
      )}
    </div>
  );
}

// =============================================================================
// 按日期分组
// =============================================================================

interface SessionGroup {
  label: string;
  sessions: SessionListItem[];
}

function groupByRecency(sessions: SessionListItem[]): SessionGroup[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);

  const groups: SessionGroup[] = [
    { label: '今天', sessions: [] },
    { label: '昨天', sessions: [] },
    { label: '更早', sessions: [] },
  ];

  for (const session of sessions) {
    const date = session.updatedAt ? new Date(session.updatedAt) : new Date(0);
    if (date >= today) {
      groups[0].sessions.push(session);
    } else if (date >= yesterday) {
      groups[1].sessions.push(session);
    } else {
      groups[2].sessions.push(session);
    }
  }

  return groups.filter(g => g.sessions.length > 0);
}
