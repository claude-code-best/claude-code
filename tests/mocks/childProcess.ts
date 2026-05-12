/**
 * Shared mock for `node:child_process`.
 *
 * Usage:
 *   import { mock } from 'bun:test'
 *   import { childProcessMock, execFileMock, execFileSyncMock } from 'tests/mocks/childProcess'
 *   mock.module('node:child_process', () => childProcessMock)
 *
 * Call `execFileMock.mockImplementation(...)` or `execFileSyncMock.mockImplementation(...)`
 * before each test that needs specific behavior.
 */
import { mock } from 'bun:test'

// execFile: node-style callback (cmd, args, opts?, callback)
export const execFileMock = mock(
  (
    _cmd: string,
    _args: string[],
    _optsOrCb?: unknown,
    _cb?: (err: Error | null, stdout: string, stderr: string) => void,
  ) => {
    const cb =
      typeof _optsOrCb === 'function'
        ? (_optsOrCb as (
            err: Error | null,
            stdout: string,
            stderr: string,
          ) => void)
        : _cb
    if (cb) cb(null, '', '')
    return null
  },
)

// execFileSync: synchronous (returns Buffer)
export const execFileSyncMock = mock(
  (_cmd: string, _args: string[], _opts?: unknown): Buffer => {
    return Buffer.from('')
  },
)

export const childProcessMock = {
  execFile: execFileMock,
  execFileSync: execFileSyncMock,
}
