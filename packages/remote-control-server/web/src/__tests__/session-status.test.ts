import { describe, expect, test } from 'bun:test'
import { getSessionIndicatorState } from '../lib/session-status'

describe('getSessionIndicatorState', () => {
  test('marks an idle or online worker as online', () => {
    expect(getSessionIndicatorState({ worker_status: 'idle' })).toBe('online')
    expect(getSessionIndicatorState({ worker_status: 'online' })).toBe('online')
  })

  test('marks running workers as working', () => {
    expect(getSessionIndicatorState({ worker_status: 'running' })).toBe(
      'working',
    )
    expect(getSessionIndicatorState({ worker_status: 'busy' })).toBe('working')
  })

  test('keeps permission requests in the waiting state', () => {
    expect(getSessionIndicatorState({ worker_status: 'requires_action' })).toBe(
      'waiting',
    )
  })

  test('does not render an indicator for offline or unknown workers', () => {
    expect(getSessionIndicatorState({ worker_status: 'offline' })).toBeNull()
    expect(getSessionIndicatorState({ worker_status: null })).toBeNull()
    expect(getSessionIndicatorState({ worker_status: undefined })).toBeNull()
    expect(getSessionIndicatorState({ worker_status: 'starting' })).toBeNull()
  })
})
