/**
 * Pure list helpers for the agents view (official 2.1.330 `agents:find` /
 * `agents:previousGroup` / `agents:nextGroup`).
 *
 * Kept separate from the component so the behaviors are unit-testable
 * without rendering Ink.
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

/**
 * Indices where a new group starts. Groups are contiguous runs of the same
 * cwd in the current list order (pinned sessions may split a cwd into two
 * runs — that is intentional: navigation follows what the user sees).
 */
export function groupStartIndices(sessions: SessionEntry[]): number[] {
  const starts: number[] = []
  for (let i = 0; i < sessions.length; i++) {
    if (i === 0 || sessions[i].cwd !== sessions[i - 1].cwd) starts.push(i)
  }
  return starts
}

/** Jump target for `agents:previousGroup` (ctrl+↑). */
export function previousGroupIndex(
  sessions: SessionEntry[],
  current: number,
): number {
  const starts = groupStartIndices(sessions)
  if (starts.length === 0) return 0
  // Find the group containing `current`.
  let group = 0
  for (let i = 0; i < starts.length; i++) {
    if (starts[i] <= current) group = i
    else break
  }
  // At (or before) the group start → previous group; otherwise → this
  // group's start (first press returns to the top of the current group).
  if (current <= starts[group]) {
    return starts[Math.max(0, group - 1)]
  }
  return starts[group]
}

/** Jump target for `agents:nextGroup` (ctrl+↓). */
export function nextGroupIndex(
  sessions: SessionEntry[],
  current: number,
): number {
  const starts = groupStartIndices(sessions)
  if (starts.length === 0) return 0
  for (const start of starts) {
    if (start > current) return start
  }
  return sessions.length - 1
}
