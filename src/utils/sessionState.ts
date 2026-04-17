export type SessionState = 'idle' | 'running' | 'requires_action'

import { isProactiveActive } from '../proactive/index.js'

/**
 * Context carried with requires_action transitions so downstream
 * surfaces (CCR sidebar, push notifications) can show what the
 * session is blocked on, not just that it's blocked.
 *
 * Two delivery paths:
 * - tool_name + action_description → RequiresActionDetails proto
 *   (webhook payload, typed, logged in Datadog)
 * - full object → external_metadata.pending_action (queryable JSON
 *   on the Session, lets the frontend iterate on shape without
 *   proto round-trips)
 */
export type RequiresActionDetails = {
  tool_name: string
  /** Human-readable summary, e.g. "Editing src/foo.ts", "Running npm test" */
  action_description: string
  tool_use_id: string
  request_id: string
  /** Raw tool input — the frontend reads from external_metadata.pending_action.input
   * to parse question options / plan content without scanning the event stream. */
  input?: Record<string, unknown>
}

export type AutomationStatePhase = 'standby' | 'sleeping'

export type AutomationStateMetadata = {
  enabled: boolean
  phase: AutomationStatePhase | null
  next_tick_at: number | null
  sleep_until: number | null
}

import { isEnvTruthy } from './envUtils.js'
import type { PermissionMode } from './permissions/PermissionMode.js'
import { enqueueSdkEvent } from './sdkEventQueue.js'

// CCR external_metadata keys — push in onChangeAppState, restore in
// externalMetadataToAppState.
export type SessionExternalMetadata = {
  permission_mode?: string | null
  is_ultraplan_mode?: boolean | null
  model?: string | null
  pending_action?: RequiresActionDetails | null
  automation_state?: AutomationStateMetadata | null
  // Opaque — typed at the emit site. Importing PostTurnSummaryOutput here
  // would leak the import path string into sdk.d.ts via agentSdkBridge's
  // re-export of SessionState.
  post_turn_summary?: unknown
  // Mid-turn progress line from the forked-agent summarizer — fires every
  // ~5 steps / 2min so long-running turns still surface "what's happening
  // right now" before post_turn_summary arrives.
  task_summary?: string | null
}

type SessionStateChangedListener = (
  state: SessionState,
  details?: RequiresActionDetails,
) => void
type SessionMetadataChangedListener = (
  metadata: SessionExternalMetadata,
) => void
type PermissionModeChangedListener = (mode: PermissionMode) => void
type SessionMetadataListenerOptions = {
  replayCurrent?: boolean
}

let stateListener: SessionStateChangedListener | null = null
let metadataListener: SessionMetadataChangedListener | null = null
let permissionModeListener: PermissionModeChangedListener | null = null

export function setSessionStateChangedListener(
  cb: SessionStateChangedListener | null,
): void {
  stateListener = cb
}

export function setSessionMetadataChangedListener(
  cb: SessionMetadataChangedListener | null,
  options?: SessionMetadataListenerOptions,
): void {
  metadataListener = cb
  if (!cb || !options?.replayCurrent) {
    return
  }

  const snapshot = getSessionMetadataSnapshot()
  if (Object.keys(snapshot).length === 0) {
    return
  }

  cb(snapshot)
}

/**
 * Register a listener for permission-mode changes from onChangeAppState.
 * Wired by print.ts to emit an SDK system:status message so CCR/IDE clients
 * see mode transitions in real time — regardless of which code path mutated
 * toolPermissionContext.mode (Shift+Tab, ExitPlanMode dialog, slash command,
 * bridge set_permission_mode, etc.).
 */
export function setPermissionModeChangedListener(
  cb: PermissionModeChangedListener | null,
): void {
  permissionModeListener = cb
}

let hasPendingAction = false
let currentState: SessionState = 'idle'
let currentAutomationState: AutomationStateMetadata | null = null
let currentMetadata: SessionExternalMetadata = {}

function normalizeAutomationState(
  state: AutomationStateMetadata | null | undefined,
): AutomationStateMetadata | null {
  if (!state || state.enabled !== true) {
    return null
  }

  return {
    enabled: true,
    phase:
      state.phase === 'standby' || state.phase === 'sleeping'
        ? state.phase
        : null,
    next_tick_at:
      typeof state.next_tick_at === 'number' ? state.next_tick_at : null,
    sleep_until:
      typeof state.sleep_until === 'number' ? state.sleep_until : null,
  }
}

function automationStateKey(
  state: AutomationStateMetadata | null,
): string {
  return JSON.stringify(state)
}

function applyMetadataUpdate(
  metadata: SessionExternalMetadata,
): void {
  const nextMetadata = { ...currentMetadata }
  for (const key of Object.keys(metadata) as Array<
    keyof SessionExternalMetadata
  >) {
    const value = metadata[key]
    if (value === undefined) {
      delete nextMetadata[key]
      continue
    }
    ;(nextMetadata as Record<string, unknown>)[key] = value
  }
  currentMetadata = nextMetadata
}

export function getSessionMetadataSnapshot(): SessionExternalMetadata {
  const snapshot: SessionExternalMetadata = { ...currentMetadata }
  if (currentAutomationState) {
    snapshot.automation_state = { ...currentAutomationState }
  } else if ('automation_state' in currentMetadata) {
    snapshot.automation_state = currentMetadata.automation_state ?? null
  }
  return snapshot
}

export function getSessionState(): SessionState {
  return currentState
}

export function notifySessionStateChanged(
  state: SessionState,
  details?: RequiresActionDetails,
): void {
  currentState = state
  stateListener?.(state, details)

  // Mirror details into external_metadata so GetSession carries the
  // pending-action context without proto changes. Cleared via RFC 7396
  // null on the next non-blocked transition.
  if (state === 'requires_action' && details) {
    hasPendingAction = true
    notifySessionMetadataChanged({
      pending_action: details,
    })
  } else if (hasPendingAction) {
    hasPendingAction = false
    notifySessionMetadataChanged({ pending_action: null })
  }

  // task_summary is written mid-turn by the forked summarizer; clear it at
  // idle so the next turn doesn't briefly show the previous turn's progress.
  if (state === 'idle') {
    notifySessionMetadataChanged({ task_summary: null })
  }

  if (state !== 'idle') {
    notifyAutomationStateChanged(
      isProactiveActive()
        ? {
            enabled: true,
            phase: null,
            next_tick_at: null,
            sleep_until: null,
          }
        : null,
    )
  }

  // Mirror to the SDK event stream so non-CCR consumers (scmuxd, VS Code)
  // see the same authoritative idle/running signal the CCR bridge does.
  // 'idle' fires after heldBackResult flushes — lets scmuxd flip IDLE and
  // show the bg-task dot instead of a stuck generating spinner.
  //
  // Opt-in until CCR web + mobile clients learn to ignore this subtype in
  // their isWorking() last-message heuristics — the trailing idle event
  // currently pins them at "Running...".
  // https://anthropic.slack.com/archives/C093BJBD1CP/p1774152406752229
  if (isEnvTruthy(process.env.CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS)) {
    enqueueSdkEvent({
      type: 'system',
      subtype: 'session_state_changed',
      state,
    })
  }
}

export function notifySessionMetadataChanged(
  metadata: SessionExternalMetadata,
): void {
  applyMetadataUpdate(metadata)
  metadataListener?.(metadata)
}

export function notifyAutomationStateChanged(
  state: AutomationStateMetadata | null | undefined,
): void {
  const nextState = normalizeAutomationState(state)
  if (
    automationStateKey(nextState) === automationStateKey(currentAutomationState)
  ) {
    return
  }

  currentAutomationState = nextState
  applyMetadataUpdate({ automation_state: nextState })
  metadataListener?.({ automation_state: nextState })
}

/**
 * Fired by onChangeAppState when toolPermissionContext.mode changes.
 * Downstream listeners (CCR external_metadata PUT, SDK status stream) are
 * both wired through this single choke point so no mode-mutation path can
 * silently bypass them.
 */
export function notifyPermissionModeChanged(mode: PermissionMode): void {
  permissionModeListener?.(mode)
}

export function resetSessionStateForTests(): void {
  stateListener = null
  metadataListener = null
  permissionModeListener = null
  hasPendingAction = false
  currentState = 'idle'
  currentAutomationState = null
  currentMetadata = {}
}
