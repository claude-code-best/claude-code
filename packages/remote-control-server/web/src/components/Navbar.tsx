import { cn } from '../lib/utils';
import { ThemeToggle } from '../../components/ui/theme-toggle';
import { ChevronLeft, LayoutGrid, UserPlus, KeyRound } from 'lucide-react';

interface NavbarProps {
  onIdentityClick: () => void;
  onTokenClick: () => void;
  activeTokenLabel?: string | null;
  sessionTitle?: string;
  onBack?: () => void;
}

export function Navbar({ onIdentityClick, onTokenClick, activeTokenLabel, sessionTitle, onBack }: NavbarProps) {
  return (
    <nav className="sticky top-0 z-40 border-b border-border bg-surface-1/80 backdrop-blur-md">
      <div className="mx-auto flex h-11 sm:h-12 max-w-5xl items-center justify-between px-3 sm:px-4">
        {sessionTitle ? (
          /* Session 页面 — 返回按钮 + agent 名 */
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition-colors flex-shrink-0"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </button>
            <span className="text-text-muted/40">/</span>
            <span className="text-sm font-display font-medium text-text-primary truncate">{sessionTitle}</span>
            <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-medium text-brand flex-shrink-0">
              ACP
            </span>
          </div>
        ) : (
          /* Dashboard 页面 — 品牌 */
          <a
            href="/code/"
            className="flex items-center gap-2 font-display text-lg font-semibold text-text-primary no-underline"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="flex-shrink-0">
              <path d="M10 1L12.2 7.8L19 10L12.2 12.2L10 19L7.8 12.2L1 10L7.8 7.8L10 1Z" fill="var(--color-brand)" />
            </svg>
            <span className="hidden sm:inline">Remote Control</span>
          </a>
        )}
        <div className="flex items-center gap-0.5 sm:gap-1">
          {!sessionTitle && (
            <a
              href="/code/"
              className="flex items-center gap-1 rounded-md px-2 sm:px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-2 hover:text-text-primary no-underline transition-colors"
              title="Dashboard"
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </a>
          )}
          <ThemeToggle />
          <button
            onClick={onTokenClick}
            className={cn(
              'flex items-center gap-1 rounded-md px-2 sm:px-3 py-1.5 text-sm transition-colors',
              activeTokenLabel
                ? 'bg-brand/10 text-brand hover:bg-brand/20'
                : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary',
            )}
            title="Token Manager"
          >
            <KeyRound className="h-4 w-4" />
            <span className="hidden sm:inline max-w-24 truncate">{activeTokenLabel || 'No Token'}</span>
          </button>
          <button
            onClick={onIdentityClick}
            className="flex items-center gap-1 rounded-md px-2 sm:px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors"
            title="Identity & QR"
          >
            <UserPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Identity</span>
          </button>
        </div>
      </div>
    </nav>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    active: 'bg-status-active/20 text-status-active',
    running: 'bg-status-running/20 text-status-running',
    idle: 'bg-status-idle/20 text-status-idle',
    inactive: 'bg-text-muted/20 text-text-muted',
    requires_action: 'bg-status-warning/20 text-status-warning',
    archived: 'bg-text-muted/20 text-text-muted',
    error: 'bg-status-error/20 text-status-error',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        colorMap[status] || 'bg-surface-3 text-text-secondary',
      )}
    >
      {status}
    </span>
  );
}
