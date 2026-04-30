import { afterEach, describe, expect, test } from 'bun:test'
import {
  hasPermissionCallback,
  processMailboxPermissionResponse,
  registerPermissionCallback,
  clearAllPendingCallbacks,
  unregisterPermissionCallback,
} from '../../hooks/useSwarmPermissionPoller.js'

afterEach(() => {
  clearAllPendingCallbacks()
})

describe('swarm permission poller registry', () => {
  test('register and unregister callback', () => {
    registerPermissionCallback({
      requestId: 'req-1',
      toolUseId: 'tool-1',
      onAllow: () => {},
      onReject: () => {},
    })
    expect(hasPermissionCallback('req-1')).toBe(true)
    unregisterPermissionCallback('req-1')
    expect(hasPermissionCallback('req-1')).toBe(false)
  })

  test('processMailboxPermissionResponse removes callback on approve', () => {
    let approved = false
    registerPermissionCallback({
      requestId: 'req-2',
      toolUseId: 'tool-2',
      onAllow: () => { approved = true },
      onReject: () => {},
    })
    const result = processMailboxPermissionResponse({
      requestId: 'req-2',
      decision: 'approved',
    })
    expect(result).toBe(true)
    expect(approved).toBe(true)
    // Callback is removed after processing
    expect(hasPermissionCallback('req-2')).toBe(false)
  })

  test('processMailboxPermissionResponse removes callback on reject', () => {
    let rejected = false
    registerPermissionCallback({
      requestId: 'req-3',
      toolUseId: 'tool-3',
      onAllow: () => {},
      onReject: () => { rejected = true },
    })
    const result = processMailboxPermissionResponse({
      requestId: 'req-3',
      decision: 'rejected',
      feedback: 'denied',
    })
    expect(result).toBe(true)
    expect(rejected).toBe(true)
    expect(hasPermissionCallback('req-3')).toBe(false)
  })

  test('processMailboxPermissionResponse returns false for unknown request', () => {
    const result = processMailboxPermissionResponse({
      requestId: 'unknown',
      decision: 'approved',
    })
    expect(result).toBe(false)
  })

  test('resetPermissionCallbacks clears all callbacks', () => {
    registerPermissionCallback({
      requestId: 'req-a',
      toolUseId: 'tool-a',
      onAllow: () => {},
      onReject: () => {},
    })
    registerPermissionCallback({
      requestId: 'req-b',
      toolUseId: 'tool-b',
      onAllow: () => {},
      onReject: () => {},
    })
    clearAllPendingCallbacks()
    expect(hasPermissionCallback('req-a')).toBe(false)
    expect(hasPermissionCallback('req-b')).toBe(false)
  })

  test('callback is removed BEFORE invoking handler (prevents re-entrant leak)', () => {
    const order: string[] = []
    registerPermissionCallback({
      requestId: 'req-order',
      toolUseId: 'tool-order',
      onAllow: () => {
        // During callback execution, the callback should already be removed
        order.push('callback')
        order.push(`has:${hasPermissionCallback('req-order')}`)
      },
      onReject: () => {},
    })
    processMailboxPermissionResponse({
      requestId: 'req-order',
      decision: 'approved',
    })
    expect(order).toEqual(['callback', 'has:false'])
  })
})