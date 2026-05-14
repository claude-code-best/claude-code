/**
 * ExecuteTool.test.ts
 *
 * 薄层子进程包装器，在独立的 bun:test 进程中运行实际测试。
 * 这样可以防止其他测试文件的 mock.module() 漏出（例如 agentToolUtils.test.ts
 * 对 src/Tool.js 的 mock）影响 ExecuteTool 的测试。
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
