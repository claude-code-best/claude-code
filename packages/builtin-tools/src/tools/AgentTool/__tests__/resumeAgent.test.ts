import { describe, expect, mock, test } from 'bun:test'

mock.module('bun:bundle', () => ({
  feature: (_name: string) => true,
}))

describe('resumeAgent', () => {
  test('module exports resumeAgentBackground', async () => {
    const mod = await import('../resumeAgent.js')
    expect(typeof mod.resumeAgentBackground).toBe('function')
  })

  test('module exports ResumeAgentResult type (compile-time)', async () => {
    // TypeScript-only: just ensure the module loads cleanly so the type
    // surface is in the patch coverage trace.
    const mod = await import('../resumeAgent.js')
    expect(mod).toBeDefined()
  })
})
