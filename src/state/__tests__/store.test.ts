import { describe, expect, test } from 'bun:test'
import { createStore } from '../store'

describe('createStore', () => {
  test('returns object with getState, setState, subscribe', () => {
    const store = createStore({ count: 0 })
    expect(typeof store.getState).toBe('function')
    expect(typeof store.setState).toBe('function')
    expect(typeof store.subscribe).toBe('function')
  })

  test('getState returns initial state', () => {
    const store = createStore({ count: 0, name: 'test' })
    expect(store.getState()).toEqual({ count: 0, name: 'test' })
  })

  test('setState updates state via updater function', () => {
    const store = createStore({ count: 0 })
    store.setState(prev => ({ count: prev.count + 1 }))
    expect(store.getState().count).toBe(1)
  })

  test('setState does not notify when state unchanged (Object.is)', () => {
    const store = createStore({ count: 0 })
    let notified = false
    store.subscribe(() => {
      notified = true
    })
    store.setState(prev => prev)
    expect(notified).toBe(false)
  })

  test('setState notifies subscribers on change', () => {
    const store = createStore({ count: 0 })
    let notified = false
    store.subscribe(() => {
      notified = true
    })
    store.setState(prev => ({ count: prev.count + 1 }))
    expect(notified).toBe(true)
  })

  test('subscribe returns unsubscribe function', () => {
    const store = createStore({ count: 0 })
    const unsub = store.subscribe(() => {})
    expect(typeof unsub).toBe('function')
  })

  test('unsubscribe stops notifications', () => {
    const store = createStore({ count: 0 })
    let count = 0
    const unsub = store.subscribe(() => {
      count++
    })
    store.setState(prev => ({ count: prev.count + 1 }))
    unsub()
    store.setState(prev => ({ count: prev.count + 1 }))
    expect(count).toBe(1)
  })

  test('multiple subscribers all get notified', () => {
    const store = createStore({ count: 0 })
    let a = 0,
      b = 0
    store.subscribe(() => {
      a++
    })
    store.subscribe(() => {
      b++
    })
    store.setState(prev => ({ count: prev.count + 1 }))
    expect(a).toBe(1)
    expect(b).toBe(1)
  })

  test('onChange callback is called on state change', () => {
    let captured: any = null
    const store = createStore({ count: 0 }, ({ newState, oldState }) => {
      captured = { newState, oldState }
    })
    store.setState(prev => ({ count: prev.count + 5 }))
    expect(captured).not.toBeNull()
    expect(captured.oldState.count).toBe(0)
    expect(captured.newState.count).toBe(5)
  })

  test('onChange is not called when state unchanged', () => {
    let called = false
    const store = createStore({ count: 0 }, () => {
      called = true
    })
    store.setState(prev => prev)
    expect(called).toBe(false)
  })

  test('works with complex state objects', () => {
    const store = createStore({ items: [] as number[], name: 'test' })
    store.setState(prev => ({ ...prev, items: [1, 2, 3] }))
    expect(store.getState().items).toEqual([1, 2, 3])
    expect(store.getState().name).toBe('test')
  })

  test('works with primitive state', () => {
    const store = createStore(0)
    store.setState(() => 42)
    expect(store.getState()).toBe(42)
  })

  test('updater receives previous state', () => {
    const store = createStore({ value: 10 })
    store.setState(prev => {
      expect(prev.value).toBe(10)
      return { value: prev.value * 2 }
    })
    expect(store.getState().value).toBe(20)
  })

  test('sequential setState calls produce final state', () => {
    const store = createStore({ count: 0 })
    store.setState(prev => ({ count: prev.count + 1 }))
    store.setState(prev => ({ count: prev.count + 1 }))
    store.setState(prev => ({ count: prev.count + 1 }))
    expect(store.getState().count).toBe(3)
  })
})
