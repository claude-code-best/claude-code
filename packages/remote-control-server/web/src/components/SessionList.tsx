import type { Session } from "../types";
import { StatusBadge } from "./Navbar";
import { esc, formatTime } from "../lib/utils";

interface SessionListProps {
  sessions: Session[];
  onSelect: (sessionId: string) => void;
}

export function SessionList({ sessions, onSelect }: SessionListProps) {
  if (!sessions || sessions.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface-1 p-8 text-center text-text-muted">
        No sessions
      </div>
    );
  }

  const sorted = [...sessions].sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));

  return (
    <div className="space-y-2">
      {sorted.map((session) => (
        <div
          key={session.id}
          onClick={() => onSelect(session.id)}
          className="flex cursor-pointer items-center justify-between rounded-xl border border-border bg-surface-1 px-4 py-3 transition-colors hover:border-border-light hover:bg-surface-2"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-text-primary">
              {session.title || session.id}
            </div>
            <div className="truncate text-xs text-text-muted">{session.id}</div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={session.status} />
            <span className="text-xs text-text-muted">
              {formatTime(session.created_at || session.updated_at)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
