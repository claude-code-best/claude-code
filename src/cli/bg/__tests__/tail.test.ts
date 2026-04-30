import { describe, test, expect } from 'bun:test'

describe('tailLog', () => {
  test('module exports tailLog function', async () => {
    const mod = await import('../tail.js')
    expect(typeof mod.tailLog).toBe('function')
  })
})
