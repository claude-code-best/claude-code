/**
 * Runs the integration-style skill discovery tests in an isolated process.
 * Bun's mock.module registry is process-global, so unrelated test files can
 * otherwise replace feature/config dependencies before this suite is loaded.
 */
import { describe, expect, test } from 'bun:test'
import { relative, resolve } from 'node:path'

const PROJECT_ROOT = resolve(__dirname, '..', '..', '..', '..')
const RUNNER_ABS = resolve(__dirname, 'prefetch.runner.ts')
const RUNNER_REL = `./${relative(PROJECT_ROOT, RUNNER_ABS).replace(/\\/g, '/')}`

describe('skill search prefetch', () => {
  test('runs integration tests in an isolated subprocess', async () => {
    const proc = Bun.spawn([process.execPath, 'test', RUNNER_REL], {
      cwd: PROJECT_ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const code = await proc.exited
    if (code !== 0) {
      const stderr = await new Response(proc.stderr).text()
      const stdout = await new Response(proc.stdout).text()
      const output = `${stderr}\n${stdout}`.slice(-3000)
      throw new Error(
        `skill search prefetch subprocess failed (exit ${code}):\n${output}`,
      )
    }
    expect(code).toBe(0)
  }, 60_000)
})
