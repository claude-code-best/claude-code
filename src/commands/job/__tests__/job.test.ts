import { describe, test, expect } from 'bun:test'

describe('/job command', () => {
  test('index exports a valid Command', async () => {
    const mod = await import('../index.js')
    const cmd = mod.default
    expect(cmd.name).toBe('job')
    expect(cmd.type).toBe('local-jsx')
    expect(typeof cmd.load).toBe('function')
    expect(cmd.description).toContain('job')
  })

  test('job module exports call function', async () => {
    const mod = await import('../job.js')
    expect(typeof mod.call).toBe('function')
  })

  test('argumentHint lists subcommands', async () => {
    const mod = await import('../index.js')
    const cmd = mod.default
    expect(cmd.argumentHint).toContain('list')
    expect(cmd.argumentHint).toContain('new')
    expect(cmd.argumentHint).toContain('status')
  })
})
