import { beforeEach, describe, expect, test } from 'bun:test'
import {
  activateProactive,
  deactivateProactive,
  getActivationSource,
  getNextTickAt,
  isContextBlocked,
  isProactiveActive,
  isProactivePaused,
  pauseProactive,
  resumeProactive,
  setContextBlocked,
  setNextTickAt,
  shouldTick,
  subscribeToProactiveChanges,
} from '../index'

function resetProactiveState() {
  activateProactive('reset')
  setContextBlocked(false)
  setNextTickAt(null)
  deactivateProactive()
}

beforeEach(() => {
  resetProactiveState()
})

describe('proactive state baseline', () => {
  test('activateProactive enables proactive mode and records the source', () => {
    activateProactive('baseline_test')

    expect(isProactiveActive()).toBe(true)
    expect(isProactivePaused()).toBe(false)
    expect(isContextBlocked()).toBe(false)
    expect(getActivationSource()).toBe('baseline_test')
    expect(shouldTick()).toBe(true)
  })

  test('pauseProactive suppresses ticking and clears nextTickAt', () => {
    activateProactive('pause_case')
    setNextTickAt(Date.now() + 30_000)

    pauseProactive()

    expect(isProactivePaused()).toBe(true)
    expect(getNextTickAt()).toBeNull()
    expect(shouldTick()).toBe(false)

    resumeProactive()
    expect(isProactivePaused()).toBe(false)
    expect(shouldTick()).toBe(true)
  })

  test('setContextBlocked clears nextTickAt and blocks ticking', () => {
    activateProactive('blocked_case')
    setNextTickAt(Date.now() + 5_000)

    setContextBlocked(true)

    expect(isContextBlocked()).toBe(true)
    expect(getNextTickAt()).toBeNull()
    expect(shouldTick()).toBe(false)
  })

  test('subscribers are notified on state changes', () => {
    let notifications = 0
    const unsubscribe = subscribeToProactiveChanges(() => {
      notifications += 1
    })

    activateProactive('subscriber_case')
    setNextTickAt(Date.now() + 1_000)
    setContextBlocked(true)
    deactivateProactive()
    unsubscribe()

    expect(notifications).toBeGreaterThanOrEqual(3)
  })
})
