/**
 * Tests for daemon/main.ts subcommand routing.
 *
 * The `status` and `bg` subcommands trigger dynamic imports of `cli/bg.ts`
 * which depends on `envUtils.ts` → `lodash-es/memoize.js` (unavailable in
 * raw test context without `bun run dev`'s define flags). We test only the
 * self-contained subcommands: help and unknown.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'

describe('daemonMain subcommand routing', () => {
  const origLog = console.log
  const origError = console.error
  let logLines: string[]

  beforeEach(() => {
    logLines = []
    console.log = (...a: unknown[]) => logLines.push(a.map(String).join(' '))
    console.error = (...a: unknown[]) => logLines.push(a.map(String).join(' '))
  })

  afterEach(() => {
    console.log = origLog
    console.error = origError
    process.exitCode = 0
  })

  test('unknown subcommand sets exitCode to 1', async () => {
    const { daemonMain } = await import('../main.js')
    await daemonMain(['unknown-command-xyz'])
    expect(process.exitCode).toBe(1)
  })

  test('help subcommand prints usage', async () => {
    const { daemonMain } = await import('../main.js')
    await daemonMain(['help'])
    const output = logLines.join('\n')
    expect(output).toContain('SUBCOMMANDS')
    expect(output).toContain('status')
    expect(output).toContain('start')
    expect(output).toContain('stop')
    expect(output).toContain('bg')
    expect(output).toContain('attach')
    expect(output).toContain('logs')
    expect(output).toContain('kill')
  })

  test('--help is alias for help', async () => {
    const { daemonMain } = await import('../main.js')
    await daemonMain(['--help'])
    const output = logLines.join('\n')
    expect(output).toContain('SUBCOMMANDS')
  })

  test('-h is alias for help', async () => {
    const { daemonMain } = await import('../main.js')
    await daemonMain(['-h'])
    const output = logLines.join('\n')
    expect(output).toContain('SUBCOMMANDS')
  })
})
