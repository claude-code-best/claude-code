import { beforeEach, describe, expect, test } from 'bun:test'
import {
  notifyAutomationStateChanged,
  notifySessionStateChanged,
  notifySessionMetadataChanged,
  resetSessionStateForTests,
  setSessionMetadataChangedListener,
} from '../sessionState'

describe('sessionState metadata replay', () => {
  beforeEach(() => {
    resetSessionStateForTests()
  })

  test('replays cached automation state to listeners that attach later', () => {
    const seen: Array<Record<string, unknown>> = []

    notifyAutomationStateChanged({
      enabled: true,
      phase: 'standby',
      next_tick_at: 123,
      sleep_until: null,
    })

    setSessionMetadataChangedListener(
      metadata => {
        seen.push(metadata as Record<string, unknown>)
      },
      { replayCurrent: true },
    )

    expect(seen).toEqual([
      {
        automation_state: {
          enabled: true,
          phase: 'standby',
          next_tick_at: 123,
          sleep_until: null,
        },
      },
    ])
  })

  test('dedupes identical automation states after replay but forwards changes', () => {
    const seen: Array<Record<string, unknown>> = []

    notifyAutomationStateChanged({
      enabled: true,
      phase: 'standby',
      next_tick_at: 123,
      sleep_until: null,
    })
    setSessionMetadataChangedListener(
      metadata => {
        seen.push(metadata as Record<string, unknown>)
      },
      { replayCurrent: true },
    )

    notifyAutomationStateChanged({
      enabled: true,
      phase: 'standby',
      next_tick_at: 123,
      sleep_until: null,
    })
    notifyAutomationStateChanged({
      enabled: true,
      phase: 'sleeping',
      next_tick_at: null,
      sleep_until: 456,
    })

    expect(seen).toEqual([
      {
        automation_state: {
          enabled: true,
          phase: 'standby',
          next_tick_at: 123,
          sleep_until: null,
        },
      },
      {
        automation_state: {
          enabled: true,
          phase: 'sleeping',
          next_tick_at: null,
          sleep_until: 456,
        },
      },
    ])
  })

  test('replays merged metadata snapshots instead of only the latest delta', () => {
    const seen: Array<Record<string, unknown>> = []

    notifySessionMetadataChanged({ model: 'claude-sonnet-4-6' })
    notifyAutomationStateChanged({
      enabled: true,
      phase: 'sleeping',
      next_tick_at: null,
      sleep_until: 456,
    })

    setSessionMetadataChangedListener(
      metadata => {
        seen.push(metadata as Record<string, unknown>)
      },
      { replayCurrent: true },
    )

    expect(seen).toEqual([
      {
        model: 'claude-sonnet-4-6',
        automation_state: {
          enabled: true,
          phase: 'sleeping',
          next_tick_at: null,
          sleep_until: 456,
        },
      },
    ])
  })

  test('replays pending_action metadata cached through session-state transitions', () => {
    const seen: Array<Record<string, unknown>> = []

    notifySessionStateChanged('requires_action', {
      tool_name: 'Edit',
      action_description: 'Edit src/utils/sessionState.ts',
      tool_use_id: 'toolu_123',
      request_id: 'req_123',
      input: { path: 'src/utils/sessionState.ts' },
    })

    setSessionMetadataChangedListener(
      metadata => {
        seen.push(metadata as Record<string, unknown>)
      },
      { replayCurrent: true },
    )

    expect(seen).toEqual([
      {
        pending_action: {
          tool_name: 'Edit',
          action_description: 'Edit src/utils/sessionState.ts',
          tool_use_id: 'toolu_123',
          request_id: 'req_123',
          input: { path: 'src/utils/sessionState.ts' },
        },
      },
    ])
  })

  test('replays cleared task_summary metadata after returning to idle', () => {
    const seen: Array<Record<string, unknown>> = []

    notifySessionMetadataChanged({ task_summary: 'Running regression suite' })
    notifySessionStateChanged('idle')

    setSessionMetadataChangedListener(
      metadata => {
        seen.push(metadata as Record<string, unknown>)
      },
      { replayCurrent: true },
    )

    expect(seen).toEqual([
      {
        task_summary: null,
      },
    ])
  })
})
