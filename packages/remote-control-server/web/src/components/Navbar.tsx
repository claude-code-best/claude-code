import { cn } from "../lib/utils";

interface NavbarProps {
  onIdentityClick: () => void;
}

export function Navbar({ onIdentityClick }: NavbarProps) {
  return (
    <nav className="sticky top-0 z-40 border-b border-border bg-surface-1/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <a href="/code/" className="flex items-center gap-2 font-display text-lg font-semibold text-text-primary no-underline">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M10 1L12.2 7.8L19 10L12.2 12.2L10 19L7.8 12.2L1 10L7.8 7.8L10 1Z"
              fill="#D97757"
            />
          </svg>
          Remote Control
        </a>
        <div className="flex items-center gap-1">
          <a
            href="/code/"
            className="rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-2 hover:text-text-primary no-underline transition-colors"
          >
            Dashboard
          </a>
          <button
            onClick={onIdentityClick}
            className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors"
            title="Identity & QR"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M6 8C7.66 8 9 6.66 9 5C9 3.34 7.66 2 6 2C4.34 2 3 3.34 3 5C3 6.66 4.34 8 6 8ZM6 10C3.99 10 0 11.01 0 13V14H12V13C12 11.01 8.01 10 6 10ZM13 8V5H11V8H8V10H11V13H13V10H16V8H13Z"
                fill="currentColor"
              />
            </svg>
            Identity
          </button>
        </div>
      </div>
    </nav>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    active: "bg-status-active/20 text-status-active",
    running: "bg-status-running/20 text-status-running",
    idle: "bg-status-idle/20 text-status-idle",
    inactive: "bg-text-muted/20 text-text-muted",
    requires_action: "bg-status-warning/20 text-status-warning",
    archived: "bg-text-muted/20 text-text-muted",
    error: "bg-status-error/20 text-status-error",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        colorMap[status] || "bg-surface-3 text-text-secondary",
      )}
    >
      {status}
    </span>
  );
}
