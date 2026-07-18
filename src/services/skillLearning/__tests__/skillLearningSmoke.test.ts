/**
 * Runs the end-to-end skill learning smoke test in an isolated process.
 * Bun's process-global module mocks from other suites must not alter command
 * discovery, settings, or advisor dependencies used by this smoke test.
 */
import { describe, expect, test } from 'bun:test'
import { relative, resolve } from 'node:path'

const PROJECT_ROOT = resolve(__dirname, '..', '..', '..', '..')
const RUNNER_ABS = resolve(__dirname, 'skillLearningSmoke.runner.ts')
const RUNNER_REL = `./${relative(PROJECT_ROOT, RUNNER_ABS).replace(/\\/g, '/')}`

describe('skillLearning smoke', () => {
  test('runs end-to-end smoke test in an isolated subprocess', async () => {
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
        `skill learning smoke subprocess failed (exit ${code}):\n${output}`,
      )
    }
    expect(code).toBe(0)
  }, 60_000)
})
