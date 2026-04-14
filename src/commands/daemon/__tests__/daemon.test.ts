import { describe, test, expect } from 'bun:test'

describe('/daemon command', () => {
  test('index exports a valid Command', async () => {
    const mod = await import('../index.js')
    const cmd = mod.default
    expect(cmd.name).toBe('daemon')
    expect(cmd.type).toBe('local-jsx')
    expect(typeof cmd.load).toBe('function')
    expect(cmd.description).toContain('daemon')
  })

  test('daemon module exports call function', async () => {
    const mod = await import('../daemon.js')
    expect(typeof mod.call).toBe('function')
  })

  test('argumentHint lists subcommands', async () => {
    const mod = await import('../index.js')
    const cmd = mod.default
    expect(cmd.argumentHint).toContain('status')
    expect(cmd.argumentHint).toContain('bg')
  })
})
