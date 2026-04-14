import { describe, expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

const isolatedPath = fileURLToPath(
  new URL('./langfuse.isolated.ts', import.meta.url),
)

describe('Langfuse integration', () => {
  test('passes in isolated subprocess', async () => {
    const proc = Bun.spawn({
      cmd: [process.execPath, 'test', isolatedPath],
      cwd: process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
      env: process.env,
    })

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    if (exitCode !== 0) {
      throw new Error(
        [
          `isolated langfuse test failed with exit code ${exitCode}`,
          '',
          'STDOUT:',
          stdout,
          '',
          'STDERR:',
          stderr,
        ].join('\n'),
      )
    }

    expect(exitCode).toBe(0)
  })
})
