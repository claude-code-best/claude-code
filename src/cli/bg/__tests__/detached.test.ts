import { describe, test, expect } from 'bun:test'
import { DetachedEngine } from '../engines/detached.js'

describe('DetachedEngine', () => {
  test('name is "detached"', () => {
    const engine = new DetachedEngine()
    expect(engine.name).toBe('detached')
  })

  test('available always returns true', async () => {
    const engine = new DetachedEngine()
    const result = await engine.available()
    expect(result).toBe(true)
  })
})
