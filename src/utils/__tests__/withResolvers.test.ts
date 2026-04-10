import { describe, expect, test } from 'bun:test'
import { withResolvers } from '../withResolvers'

describe('withResolvers', () => {
  test('returns object with promise, resolve, reject', () => {
    const result = withResolvers<string>()
    expect(result).toHaveProperty('promise')
    expect(result).toHaveProperty('resolve')
    expect(result).toHaveProperty('reject')
    expect(typeof result.resolve).toBe('function')
    expect(typeof result.reject).toBe('function')
  })

  test('promise resolves when resolve is called', async () => {
    const { promise, resolve } = withResolvers<string>()
    resolve('hello')
    const result = await promise
    expect(result).toBe('hello')
  })

  test('promise rejects when reject is called', async () => {
    const { promise, reject } = withResolvers<string>()
    reject(new Error('fail'))
    await expect(promise).rejects.toThrow('fail')
  })

  test('resolve passes value through', async () => {
    const { promise, resolve } = withResolvers<number>()
    resolve(42)
    expect(await promise).toBe(42)
  })

  test('reject passes error through', async () => {
    const { promise, reject } = withResolvers<void>()
    const err = new Error('custom error')
    reject(err)
    await expect(promise).rejects.toBe(err)
  })

  test('promise is instanceof Promise', () => {
    const { promise } = withResolvers<void>()
    expect(promise).toBeInstanceOf(Promise)
  })

  test('works with generic type parameter', async () => {
    const { promise, resolve } = withResolvers<{ name: string }>()
    resolve({ name: 'test' })
    const result = await promise
    expect(result.name).toBe('test')
  })

  test('resolve/reject can be called asynchronously', async () => {
    const { promise, resolve } = withResolvers<number>()
    setTimeout(() => resolve(99), 10)
    const result = await promise
    expect(result).toBe(99)
  })
})
