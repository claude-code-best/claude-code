import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import {
  buildLockfilePayload,
  getLockfilePath,
} from '../src/server/lockfile.js'

describe('lockfile helpers', () => {
  test('builds a ws-ide lockfile payload with auth token and workspace folders', () => {
    const payload = buildLockfilePayload({
      pid: 123,
      ideName: 'VS Code',
      workspaceFolders: ['D:/vibe/claude-code'],
      authToken: 'token-123',
      runningInWindows: true,
    })

    expect(payload.transport).toBe('ws')
    expect(payload.authToken).toBe('token-123')
    expect(payload.workspaceFolders).toEqual(['D:/vibe/claude-code'])
    expect(payload.pid).toBe(123)
  })

  test('derives the lockfile path from CLAUDE_CONFIG_DIR when provided', () => {
    const originalConfigDir = process.env.CLAUDE_CONFIG_DIR
    process.env.CLAUDE_CONFIG_DIR = 'D:/tmp/claude-config'

    try {
      expect(getLockfilePath(4567)).toBe(
        join('D:/tmp/claude-config', 'ide', '4567.lock'),
      )
    } finally {
      if (originalConfigDir === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR
      } else {
        process.env.CLAUDE_CONFIG_DIR = originalConfigDir
      }
    }
  })
})
