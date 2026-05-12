import { beforeEach, describe, expect, test } from 'bun:test'
import {
  clearActiveMonitor,
  getActiveMonitor,
  isMonitoring,
  setActiveMonitor,
  trySetActiveMonitor,
} from '../monitorState.js'

function makeState(
  overrides?: Partial<Parameters<typeof setActiveMonitor>[0]>,
) {
  return {
    taskId: 'task-1',
    owner: 'acme',
    repo: 'myrepo',
    prNumber: 42,
    abortController: new AbortController(),
    startedAt: Date.now(),
    ...overrides,
  }
}

describe('monitorState', () => {
  beforeEach(() => {
    clearActiveMonitor()
  })

  test('getActiveMonitor returns null when nothing set', () => {
    expect(getActiveMonitor()).toBeNull()
  })

  test('setActiveMonitor stores state and getActiveMonitor returns it', () => {
    const state = makeState()
    setActiveMonitor(state)
    expect(getActiveMonitor()).toBe(state)
  })

  test('clearActiveMonitor resets state to null', () => {
    setActiveMonitor(makeState())
    clearActiveMonitor()
    expect(getActiveMonitor()).toBeNull()
  })

  test('isMonitoring returns true for matching owner/repo/prNumber', () => {
    setActiveMonitor(makeState())
    expect(isMonitoring('acme', 'myrepo', 42)).toBe(true)
  })

  test('isMonitoring returns false when not monitoring', () => {
    expect(isMonitoring('acme', 'myrepo', 42)).toBe(false)
  })

  test('setActiveMonitor throws when already active', () => {
    setActiveMonitor(makeState())
    expect(() => setActiveMonitor(makeState({ prNumber: 99 }))).toThrow(
      /Monitor already active/,
    )
  })

  test('clearActiveMonitor calls abort on the controller', () => {
    const abortController = new AbortController()
    setActiveMonitor(makeState({ abortController }))
    clearActiveMonitor()
    expect(abortController.signal.aborted).toBe(true)
  })

  test('trySetActiveMonitor returns true when no active monitor', () => {
    expect(trySetActiveMonitor(makeState())).toBe(true)
    expect(getActiveMonitor()).not.toBeNull()
  })

  test('trySetActiveMonitor returns false when monitor already active', () => {
    expect(trySetActiveMonitor(makeState({ prNumber: 1 }))).toBe(true)
    expect(trySetActiveMonitor(makeState({ prNumber: 2 }))).toBe(false)
    // First state remains
    expect(getActiveMonitor()?.prNumber).toBe(1)
  })
})
