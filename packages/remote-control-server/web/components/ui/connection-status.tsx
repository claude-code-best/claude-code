import type { ConnectionState } from '../../src/acp/types';
import { cn } from '../../src/lib/utils';

// Shared styles for connection state dots
const connectionDotStyles: Record<ConnectionState, string> = {
  disconnected: 'bg-gray-400',
  connecting: 'bg-yellow-400 animate-pulse',
  connected: 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]',
  error: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]',
};

// Shared labels for connection states
const connectionStateLabels: Record<ConnectionState, string> = {
  disconnected: 'Disconnected',
  connecting: 'Connecting...',
  connected: 'Connected',
  error: 'Error',
};

/**
 * Get the display label for a connection state
 */
export function getConnectionStateLabel(state: ConnectionState): string {
  return connectionStateLabels[state];
}

/**
 * A small dot indicator for connection state
 * Used in status bars and headers
 */
export function StatusDot({ state, className }: { state: ConnectionState; className?: string }) {
  return <span className={cn('w-2 h-2 rounded-full', connectionDotStyles[state], className)} />;
}

/**
 * A status indicator with dot and label
 * Used in cards and detailed views
 */
export function StatusIndicator({ state, className }: { state: ConnectionState; className?: string }) {
  return (
    <span className={cn('flex items-center gap-2 text-sm font-normal', className)}>
      <StatusDot state={state} />
      {state}
    </span>
  );
}

/**
 * A complete status bar section with dot, label, and optional URL
 */
export function ConnectionStatusBar({
  state,
  displayUrl,
  className,
}: {
  state: ConnectionState;
  displayUrl?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <StatusDot state={state} />
      <span className="text-sm font-medium">{getConnectionStateLabel(state)}</span>
      {state === 'connected' && displayUrl && (
        <span className="text-xs text-muted-foreground truncate max-w-[150px]">{displayUrl}</span>
      )}
    </div>
  );
}
