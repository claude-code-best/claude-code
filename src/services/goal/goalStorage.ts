/**
 * Goal persistence bridge — connects the in-memory `goalState` map
 * to the JSONL transcript that backs --resume.
 *
 * Splitting this off keeps goalState pure (testable without touching
 * the file system) while still giving the slash command + tool a
 * single call to "save the current goal".
 */
import type { UUID } from 'crypto'
import { getSessionId } from '../../bootstrap/state.js'
import type { GoalState } from '../../types/logs.js'
import {
  clearGoalEntry as clearGoalEntryOnDisk,
  saveGoal as saveGoalOnDisk,
} from '../../utils/sessionStorage.js'
import { _setGoalFromPersistedState, getGoal } from './goalState.js'

/**
 * Snapshot the current in-memory goal for the running session to the
 * JSONL transcript. Called by every mutating helper in goalState
 * (set / pause / resume / complete / token update / blocked).
 *
 * No-op when there is no goal — used as a fire-and-forget convenience.
 */
export function persistCurrentGoal(): void {
  const sessionId = getSessionId() as UUID
  const goal = getGoal(sessionId)
  if (!goal) return
  saveGoalOnDisk(sessionId, goal)
}

/**
 * Hydrate the in-memory map from a `loadTranscriptFile` result. Called
 * by REPL.tsx after restoreSessionMetadata so `--resume` carries the
 * goal across process restarts.
 */
export function hydrateGoalFromTranscript(
  goalsMap: Map<UUID, GoalState>,
  sessionId?: UUID,
): GoalState | null {
  const id = (sessionId ?? (getSessionId() as UUID)) as UUID
  const state = goalsMap.get(id)
  if (!state) return null
  _setGoalFromPersistedState(state, id)
  return state
}

/**
 * Persist an explicit clear — writes the `goal-cleared` tombstone so
 * a future --resume cannot resurrect a stale goal entry.
 */
export function persistGoalClear(): void {
  const sessionId = getSessionId() as UUID
  clearGoalEntryOnDisk(sessionId)
}
