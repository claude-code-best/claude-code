import { useCallback, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { SessionActions } from './SessionActions';
import { SessionContextMenu } from './SessionContextMenu';
import { StatusDot } from '../shell/EnvPicker';
import { timeAgo, sessionTimestamp } from '../shell/format';
import type { Environment, Product, Project, Session } from '../types';
import { cn } from '../lib/utils';

interface SessionListItemProps {
  session: Session;
  product: Product;
  onOpen: (sessionId: string) => void;
  onRefresh?: () => void | Promise<void>;
  projects?: Project[];
  environments?: Environment[];
  compact?: boolean;
  active?: boolean;
}

export function SessionListItem({
  session,
  product,
  onOpen,
  onRefresh,
  projects = [],
  environments = [],
  compact = false,
  active = false,
}: SessionListItemProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const openMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY });
  }, []);
  const closeMenu = useCallback(() => setMenu(null), []);
  const projectName = session.project_id ? projects.find(project => project.id === session.project_id)?.name : null;

  return (
    <div className="group relative flex items-center" onContextMenu={openMenu}>
      <button
        type="button"
        onClick={() => onOpen(session.id)}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left transition-colors hover:bg-surface-2',
          compact ? 'px-2.5 py-2' : 'px-3 py-3',
          active && 'bg-brand/10 shadow-[inset_2px_0_0_var(--color-brand)]',
        )}
      >
        <StatusDot status={session.status} />
        {!compact && <MessageSquare className="h-4 w-4 flex-shrink-0 text-text-muted" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[14px] text-text-primary">
            {session.title || session.id}
          </span>
          {!compact && session.project_id && (
            <span className="mt-0.5 block truncate font-display text-xs text-text-muted">
              {projectName || '项目会话'}
            </span>
          )}
        </span>
        <span className="flex-shrink-0 font-display text-xs text-text-muted">{timeAgo(sessionTimestamp(session))}</span>
      </button>
      <SessionActions
        session={session}
        environments={environments}
        onChanged={onRefresh}
        onDeleted={onRefresh}
        className="mr-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      />
      <SessionContextMenu
        session={session}
        product={product}
        projects={projects}
        open={menu !== null}
        x={menu?.x || 0}
        y={menu?.y || 0}
        onClose={closeMenu}
        onChanged={onRefresh}
      />
    </div>
  );
}
