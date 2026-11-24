/**
 * Pure list helpers for the agents view (official 2.1.330, tmux-verified
 * against the official binary).
 *
 * Kept separate from the component so the behaviors are unit-testable
 * without rendering Ink.
 *
 * Official list layout (tmux-verified):
 * - Three status groups in a fixed order: `Needs input` / `Working` /
 *   `Completed`. NOT grouped by cwd. Zero-count groups are hidden.
 * - Counts line under the top banner: `1 awaiting input · 1 working ·
 *   2 completed` (zero-count groups omitted).
 * - Row: icon + name + summary column + relative time. Icons: `✶` working,
 *   `✻` awaiting input, `∙` completed.
 * - opt+↑/↓ jump between the three status groups.
 */

import type { SessionEntry } from '../../cli/bg.js'

/**
 * Filter sessions by a free-text query. Matches (case-insensitively) the
 * display name, session id, cwd, and agent name — the fields shown in the
 * list rows.
 */
export function filterSessions(
  sessions: SessionEntry[],
  query: string,
): SessionEntry[] {
  const q = query.trim().toLowerCase()
  if (q === '') return sessions
  return sessions.filter(s => {
    const haystack = [s.name, s.sessionId, s.cwd, s.agent]
      .filter((v): v is string => typeof v === 'string')
      .join('\n')
      .toLowerCase()
    return haystack.includes(q)
  })
}

// ── Status groups (official: Needs input / Working / Completed) ────────────

export type SessionGroupKey = 'needs-input' | 'working' | 'completed'

/** Display order of the three groups (official: Needs input, Working, Completed). */
export const SESSION_GROUP_ORDER: SessionGroupKey[] = [
  'needs-input',
  'working',
  'completed',
]

/** Group heading rows shown in the list. */
export const SESSION_GROUP_LABELS: Record<SessionGroupKey, string> = {
  'needs-input': 'Needs input',
  working: 'Working',
  completed: 'Completed',
}

/**
 * Row icon per group (official): `✶` = working, `✻` = awaiting input (or
 * unread), `∙` = completed and read.
 */
export const SESSION_GROUP_ICONS: Record<SessionGroupKey, string> = {
  'needs-input': '✻',
  working: '✶',
  completed: '∙',
}

/**
 * Row icon for one session (official 2.1.330, tmux-verified):
 * - awaiting input → `✻` ALWAYS (never marked read — the session still
 *   needs something, so it keeps drawing attention)
 * - working → `✶`
 * - completed → `✻` while unread (no `readAt` yet), `∙` once read.
 *
 * The unread marker persists across sessions: `readAt` is stored in the
 * registry entry, so a session that completed yesterday still shows `✻`
 * today until opened (tmux-verified: today's completed session shows `✻`,
 * yesterday's dispatched-and-opened one shows `∙`).
 */
export function sessionGroupIcon(
  session: SessionEntry,
  isAlive: boolean,
): string {
  const group = sessionGroup(session, isAlive)
  if (group === 'completed') {
    return session.readAt === undefined ? '✻' : SESSION_GROUP_ICONS.completed
  }
  return SESSION_GROUP_ICONS[group]
}

/**
 * Which group a session belongs to (tmux-verified rule):
 * - `waitingFor` is set → Needs input
 * - process alive without `waitingFor` → Working
 * - process exited → Completed
 */
export function sessionGroup(
  session: SessionEntry,
  isAlive: boolean,
): SessionGroupKey {
  if (session.waitingFor) return 'needs-input'
  return isAlive ? 'working' : 'completed'
}

export interface GroupedSessions {
  /** Non-empty groups in display order. */
  groups: { key: SessionGroupKey; sessions: SessionEntry[] }[]
  /** All sessions flattened in display order (groups concatenated). */
  flat: SessionEntry[]
  /** Index in `flat` where each displayed group starts. */
  groupStartIndices: number[]
  /** Row counts per group key (zero for hidden groups). */
  counts: Record<SessionGroupKey, number>
}

/**
 * Group sessions by status for the agents list. The input is expected to be
 * already sorted (pinned first, then newest first — sortSessions); grouping
 * preserves that order within each group.
 */
export function groupByStatus(
  sessions: SessionEntry[],
  isAlive: (session: SessionEntry) => boolean,
): GroupedSessions {
  const buckets = new Map<SessionGroupKey, SessionEntry[]>(
    SESSION_GROUP_ORDER.map(key => [key, [] as SessionEntry[]]),
  )
  const counts: Record<SessionGroupKey, number> = {
    'needs-input': 0,
    working: 0,
    completed: 0,
  }
  for (const session of sessions) {
    const key = sessionGroup(session, isAlive(session))
    buckets.get(key)!.push(session)
    counts[key] += 1
  }

  const groups = SESSION_GROUP_ORDER.map(key => ({
    key,
    sessions: buckets.get(key)!,
  })).filter(group => group.sessions.length > 0)

  const flat: SessionEntry[] = []
  const groupStartIndices: number[] = []
  for (const group of groups) {
    groupStartIndices.push(flat.length)
    flat.push(...group.sessions)
  }

  return { groups, flat, groupStartIndices, counts }
}

/** Jump target for `agents:previousGroup` (opt+↑). */
export function previousGroupIndex(
  grouped: GroupedSessions,
  current: number,
): number {
  const starts = grouped.groupStartIndices
  if (starts.length === 0) return 0
  // Find the group containing `current`.
  let group = 0
  for (let i = 0; i < starts.length; i++) {
    if (starts[i]! <= current) group = i
    else break
  }
  // At (or before) the group start → previous group; otherwise → this
  // group's start (first press returns to the top of the current group).
  if (current <= starts[group]!) {
    return starts[Math.max(0, group - 1)]!
  }
  return starts[group]!
}

/** Jump target for `agents:nextGroup` (opt+↓). */
export function nextGroupIndex(
  grouped: GroupedSessions,
  current: number,
): number {
  for (const start of grouped.groupStartIndices) {
    if (start > current) return start
  }
  return Math.max(0, grouped.flat.length - 1)
}

/**
 * Counts line under the top banner (official):
 * `1 awaiting input · 1 working · 2 completed` — zero-count groups omitted.
 */
export function buildCountsLine(
  counts: Record<SessionGroupKey, number>,
): string {
  const parts: string[] = []
  if (counts['needs-input'] > 0) {
    parts.push(`${counts['needs-input']} awaiting input`)
  }
  if (counts.working > 0) parts.push(`${counts.working} working`)
  if (counts.completed > 0) parts.push(`${counts.completed} completed`)
  return parts.join(' · ')
}

/**
 * Slash commands offered by the input box's autocomplete (official:
 * typing `/` in the input box surfaces /permissions /plan /plugin /powerup
 * in the completion list). TODO: the full command list + selection UX.
 */
export const SLASH_COMMANDS: string[] = [
  'permissions',
  'plan',
  'plugin',
  'powerup',
]

/**
 * Relative timestamp for the row's right column (official: `0s` / `4s` /
 * `9m` / `2h` / `120d`). Seconds under a minute, minutes under an hour,
 * hours under a day, then days. Future timestamps clamp to `0s`.
 */
export function formatRelativeTime(now: number, ts: number): string {
  const seconds = Math.max(0, Math.floor((now - ts) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}
