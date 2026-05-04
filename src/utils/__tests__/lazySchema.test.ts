import { describe, expect, test } from 'bun:test'
import { lazySchema } from '../lazySchema'

describe('lazySchema', () => {
  test('returns a function', () => {
    const factory = lazySchema(() => 42)
    expect(typeof factory).toBe('function')
  })

  test('calls factory on first invocation', () => {
    let callCount = 0
    const factory = lazySchema(() => {
      callCount++
      return 'result'
    })
    factory()
    expect(callCount).toBe(1)
  })

  test('returns cached result on subsequent invocations', () => {
    const factory = lazySchema(() => ({ value: Math.random() }))
    const first = factory()
    const second = factory()
    expect(first).toBe(second)
  })

  test('factory is called only once', () => {
    let callCount = 0
    const factory = lazySchema(() => {
      callCount++
      return 'cached'
    })
    factory()
    factory()
    factory()
    expect(callCount).toBe(1)
  })

  test('works with different return types', () => {
    const numFactory = lazySchema(() => 123)
    expect(numFactory()).toBe(123)

    const arrFactory = lazySchema(() => [1, 2, 3])
    expect(arrFactory()).toEqual([1, 2, 3])
  })

  test('each call to lazySchema returns independent cache', () => {
    const a = lazySchema(() => ({ id: 'a' }))
    const b = lazySchema(() => ({ id: 'b' }))
    expect(a()).not.toBe(b())
    expect(a().id).toBe('a')
    expect(b().id).toBe('b')
  })
})
