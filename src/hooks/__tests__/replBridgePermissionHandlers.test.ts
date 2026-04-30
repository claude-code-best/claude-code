import { describe, expect, test } from 'bun:test'

/**
 * Tests for the pendingPermissionHandlers cleanup pattern used in
 * useReplBridge.tsx. The handlers Map tracks in-flight permission
 * requests; the cleanup function must clear it on unmount to release
 * closures that capture React state.
 *
 * The actual hook is deeply integrated with React/bridge lifecycle,
 * so these tests validate the Map management pattern in isolation.
 */

type PermissionHandler = (response: { approved: boolean }) => void

function createPermissionHandlersMap() {
  const handlers = new Map<string, PermissionHandler>()

  return {
    handlers,
    onResponse(requestId: string, handler: PermissionHandler): () => void {
      handlers.set(requestId, handler)
      return () => {
        handlers.delete(requestId)
      }
    },
    handleResponse(requestId: string, response: { approved: boolean }): boolean {
      const handler = handlers.get(requestId)
      if (!handler) return false
      handlers.delete(requestId)
      handler(response)
      return true
    },
    cleanup(): void {
      handlers.clear()
    },
    size(): number {
      return handlers.size
    },
  }
}

describe('pendingPermissionHandlers cleanup pattern', () => {
  test('onResponse registers a handler', () => {
    const map = createPermissionHandlersMap()
    map.onResponse('req-1', () => {})
    expect(map.size()).toBe(1)
  })

  test('onResponse returns a cancel function', () => {
    const map = createPermissionHandlersMap()
    const cancel = map.onResponse('req-1', () => {})
    expect(map.size()).toBe(1)
    cancel()
    expect(map.size()).toBe(0)
  })

  test('handleResponse dispatches to handler and removes it', () => {
    const map = createPermissionHandlersMap()
    let received: { approved: boolean } | null = null
    map.onResponse('req-1', (resp) => { received = resp })
    const dispatched = map.handleResponse('req-1', { approved: true })
    expect(dispatched).toBe(true)
    expect(received as unknown as { approved: boolean }).toEqual({ approved: true })
    expect(map.size()).toBe(0)
  })

  test('handleResponse returns false for unknown requestId', () => {
    const map = createPermissionHandlersMap()
    const dispatched = map.handleResponse('unknown', { approved: true })
    expect(dispatched).toBe(false)
  })

  test('cleanup clears all registered handlers', () => {
    const map = createPermissionHandlersMap()
    map.onResponse('req-1', () => {})
    map.onResponse('req-2', () => {})
    map.onResponse('req-3', () => {})
    expect(map.size()).toBe(3)

    map.cleanup()

    expect(map.size()).toBe(0)
  })

  test('handlers are not dispatched after cleanup', () => {
    const map = createPermissionHandlersMap()
    let called = false
    map.onResponse('req-1', () => { called = true })

    map.cleanup()

    // Late-arriving response after cleanup should not find a handler
    const dispatched = map.handleResponse('req-1', { approved: true })
    expect(dispatched).toBe(false)
    expect(called).toBe(false)
  })

  test('cancel function is a no-op after cleanup', () => {
    const map = createPermissionHandlersMap()
    const cancel = map.onResponse('req-1', () => {})
    map.cleanup()
    // Should not throw
    expect(() => cancel()).not.toThrow()
  })

  test('cleanup can be called multiple times safely', () => {
    const map = createPermissionHandlersMap()
    map.onResponse('req-1', () => {})
    map.cleanup()
    map.cleanup()
    map.cleanup()
    expect(map.size()).toBe(0)
  })
})
