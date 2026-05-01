import type { AutomationStateResponse } from '../types/api'

const DISABLED_AUTOMATION_STATE: AutomationStateResponse = Object.freeze({
  enabled: false,
  phase: null,
  next_tick_at: null,
  sleep_until: null,
})

function cloneAutomationState(
  state: AutomationStateResponse,
): AutomationStateResponse {
  return { ...state }
}

function normalizeAutomationState(raw: unknown): AutomationStateResponse {
  if (!raw || typeof raw !== 'object') {
    return cloneAutomationState(DISABLED_AUTOMATION_STATE)
  }

  const state = raw as Record<string, unknown>
  return {
    enabled: state.enabled === true,
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

function readAutomationStateValue(
  metadata: Record<string, unknown> | null | undefined,
): unknown {
  if (!metadata || typeof metadata !== 'object') {
    return undefined
  }
  if (!Object.hasOwn(metadata, 'automation_state')) {
    return undefined
  }
  return metadata.automation_state
}

export function getAutomationStateSnapshot(
  metadata: Record<string, unknown> | null | undefined,
): AutomationStateResponse | undefined {
  const raw = readAutomationStateValue(metadata)
  if (raw === undefined) {
    return undefined
  }
  return normalizeAutomationState(raw)
}

export function getAutomationStateEventPayload(
  metadata: Record<string, unknown> | null | undefined,
): AutomationStateResponse {
  return (
    getAutomationStateSnapshot(metadata) ??
    cloneAutomationState(DISABLED_AUTOMATION_STATE)
  )
}

export function automationStatesEqual(
  a: AutomationStateResponse,
  b: AutomationStateResponse,
): boolean {
  return (
    a.enabled === b.enabled &&
    a.phase === b.phase &&
    a.next_tick_at === b.next_tick_at &&
    a.sleep_until === b.sleep_until
  )
}
