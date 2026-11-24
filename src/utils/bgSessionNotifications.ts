/**
 * Bg-session completion / needs-input notifications (official 2.1.330,
 * scan logic L927692 + tmux-verified behavior).
 *
 * The interactive REPL periodically scans the session registry
 * (`~/.claude/sessions/<pid>.json`) for background sessions and fires a
 * SYSTEM notification when:
 *
 * - a bg session's process exited and its entry records an outcome
 *   (system notification type `agent_completed`; message `${label}
 *   finished`, or `${label} failed` when `outcome === 'failure'`), or
 * - a live bg session is waiting for input (`waitingFor` set →
 *   `agent_needs_input`).
 *
 * Exclusions (official): `outcome === 'stopped'` (user-stopped sessions do
 * not notify) and `selfDriving` sessions never notify.
 *
 * Dedup: each session notifies at most once per kind. The notified set is
 * persisted in GlobalConfig (`notifiedSessions`) so restarts don't re-notify
 * (official keeps a `seenNotifications` record in storageV5, L909295).
 *
 * NOT in the transcript (tmux-verified): a completed bg session produces no
 * message row in the main transcript — only the system notification (via
 * `preferredNotifChannel`: auto/iterm2/terminal_bell/kitty/ghostty) plus the
 * agents view moving the session into the Completed group.
 */

import type { TerminalNotification } from '@anthropic/ink'
import type { SessionEntry } from '../cli/bg.js'
import { getGlobalConfig, saveGlobalConfig } from './config.js'
import { logForDebugging } from './debug.js'
import { isProcessRunning } from './genericProcessUtils.js'
import { sendNotification } from '../services/notifier.js'

/** Notification kinds the scanner can fire (official `T.push({sessionId, kind})`). */
export type BgSessionNotificationKind = 'completed' | 'needs_input'

/**
 * Persisted dedup set: sessionId → kind already notified. One key per
 * session (not per session+kind pair): the two kinds are mutually exclusive
 * in practice — `needs_input` only fires while the process is alive,
 * `completed` only after it died — and once `completed` fires the session
 * never transitions back, so storing the latest kind and comparing for
 * equality gives the official at-most-once-per-kind semantics.
 */
export type NotifiedSessionsMap = Record<string, BgSessionNotificationKind>

/** A notification the scanner decided to fire. */
export type BgSessionNotification = {
  sessionId: string
  kind: BgSessionNotificationKind
  /** The message shown by the system notification channel. */
  message: string
  /** `agent_completed` / `agent_needs_input` (official notification types). */
  notificationType: 'agent_completed' | 'agent_needs_input'
}

/**
 * Scan interval for the REPL's bg-session watcher. No official evidence for
 * the exact value — aligned with the agents view's 5s list refresh.
 */
export const BG_SESSION_SCAN_INTERVAL_MS = 5000

/** Display label for a session (official `${label}`): name, else id prefix. */
function sessionLabel(session: SessionEntry): string {
  return session.name ?? session.sessionId.slice(0, 8)
}

/**
 * Compute which notifications to fire for a set of registry entries.
 *
 * Pure (aside from `isProcessRunning` probes) so the official scan
 * semantics — three states, exclusions, per-kind dedup — are unit-testable
 * without I/O. Returns the notifications in registry order plus the updated
 * dedup map (input map is not mutated).
 */
export function computeBgSessionNotifications(
  sessions: SessionEntry[],
  notified: NotifiedSessionsMap,
): { notifications: BgSessionNotification[]; notified: NotifiedSessionsMap } {
  const result: NotifiedSessionsMap = { ...notified }
  const notifications: BgSessionNotification[] = []

  for (const session of sessions) {
    // Only background sessions notify (interactive sessions are their own
    // user's business; daemon/daemon-worker entries are infrastructure).
    if (session.kind !== 'bg') continue
    // Official exclusion: self-driving sessions never notify.
    if (session.selfDriving) continue

    const alive = isProcessRunning(session.pid)

    if (
      alive &&
      session.waitingFor &&
      notified[session.sessionId] !== 'needs_input'
    ) {
      result[session.sessionId] = 'needs_input'
      notifications.push({
        sessionId: session.sessionId,
        kind: 'needs_input',
        // No official evidence for the exact message text — `${label}
        // needs input` mirrors the completed notification's phrasing.
        message: `${sessionLabel(session)} needs input`,
        notificationType: 'agent_needs_input',
      })
      continue
    }

    if (
      !alive &&
      session.outcome !== undefined &&
      session.outcome !== 'stopped'
    ) {
      if (notified[session.sessionId] === 'completed') continue
      result[session.sessionId] = 'completed'
      notifications.push({
        sessionId: session.sessionId,
        kind: 'completed',
        // Official: `${label} finished`, `failed` when outcome === 'failure'.
        message: `${sessionLabel(session)} ${session.outcome === 'failure' ? 'failed' : 'finished'}`,
        notificationType: 'agent_completed',
      })
    }
  }

  return { notifications, notified: result }
}

/**
 * One scan pass: read the registry (including exited entries — completed bg
 * sessions persist), compute + fire system notifications, and persist the
 * updated dedup map. Fire-and-forget from the REPL's interval — errors are
 * logged, never thrown.
 */
export async function scanAndNotifyBgSessions(
  terminal: TerminalNotification,
): Promise<void> {
  try {
    const { listSessions } = await import('../cli/bg.js')
    const sessions = await listSessions({ includeExited: true })
    const { notifications, notified } = computeBgSessionNotifications(
      sessions,
      getGlobalConfig().notifiedSessions ?? {},
    )
    if (notifications.length > 0) {
      saveGlobalConfig(config => ({ ...config, notifiedSessions: notified }))
      for (const notification of notifications) {
        await sendNotification(
          {
            message: notification.message,
            notificationType: notification.notificationType,
          },
          terminal,
        )
      }
    }
  } catch (e) {
    logForDebugging(`[bgSessionNotifications] scan failed: ${String(e)}`)
  }
}
