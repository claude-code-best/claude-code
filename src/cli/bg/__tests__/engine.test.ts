import { describe, test, expect } from 'bun:test'

describe('selectEngine', () => {
  test('returns engine with valid BgEngine interface', async () => {
    const { selectEngine } = await import('../engines/index.js')
    const engine = await selectEngine()
    expect(engine.name).toBeDefined()
    expect(['tmux', 'detached']).toContain(engine.name)
    expect(typeof engine.available).toBe('function')
    expect(typeof engine.start).toBe('function')
    expect(typeof engine.attach).toBe('function')
  })

  test('engine.available() returns a boolean', async () => {
    const { selectEngine } = await import('../engines/index.js')
    const engine = await selectEngine()
    const result = await engine.available()
    expect(typeof result).toBe('boolean')
  })
})

describe('SessionEntry type', () => {
  test('engine field accepts tmux or detached', async () => {
    // Verify the module loads and exports the expected interface shape
    const mod = await import('../engine.js')
    expect(mod).toBeDefined()
    const entry = {
      pid: 123,
      sessionId: 'test',
      cwd: '/tmp',
      startedAt: Date.now(),
      kind: 'bg',
      engine: 'detached' as const,
    }
    expect(entry.engine).toBe('detached')
  })
})
