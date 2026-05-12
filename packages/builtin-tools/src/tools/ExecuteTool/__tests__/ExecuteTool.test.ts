/**
 * ExecuteTool.test.ts
 *
 * Thin subprocess wrapper that runs the actual tests in an isolated bun:test
 * process. This prevents mock.module() leaks from other test files
 * (e.g., agentToolUtils.test.ts mocking src/Tool.js) from affecting
 * ExecuteTool's tests.
 */

import { describe, test, expect } from 'bun:test'
import { resolve, relative } from 'path'

const PROJECT_ROOT = resolve(__dirname, '..', '..', '..', '..', '..')
const RUNNER_ABS = resolve(__dirname, 'ExecuteTool.runner.ts')
const RUNNER_REL = './' + relative(PROJECT_ROOT, RUNNER_ABS).replace(/\\/g, '/')

describe('ExecuteTool', () => {
  test('runs all ExecuteTool tests in isolated subprocess', async () => {
    const proc = Bun.spawn(['bun', 'test', RUNNER_REL], {
      cwd: PROJECT_ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const code = await proc.exited
    if (code !== 0) {
      const stderr = await new Response(proc.stderr).text()
      const stdout = await new Response(proc.stdout).text()
      const output = (stderr + '\n' + stdout).slice(-3000)
      throw new Error(
        `ExecuteTool test subprocess failed (exit ${code}):\n${output}`,
      )
    }
  }, 60_000)
})
