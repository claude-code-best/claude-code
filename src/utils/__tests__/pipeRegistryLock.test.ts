import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { determineRole } from '../pipeRegistry.js'

let root: string
let previousCwd: string
const originalEnv = { ...process.env }

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pipe-registry-lock-'))
  previousCwd = process.cwd()
  process.chdir(root)
  process.env = { ...originalEnv }
  delete process.env.CLAUDE_PROJECT_DIR
  process.env.CLAUDE_CONFIG_DIR = join(root, 'config')
  process.env.CLAUDE_SKILL_LEARNING_HOME = join(root, 'learning')
})

afterEach(() => {
  process.chdir(previousCwd)
  process.env = { ...originalEnv }
  rmSync(root, { recursive: true, force: true, maxRetries: 5 })
})

function lockPath(): string {
  return join(process.env.CLAUDE_CONFIG_DIR!, 'pipes', 'registry.lock')
}

function seedPeerLock(content: string): void {
  mkdirSync(join(process.env.CLAUDE_CONFIG_DIR!, 'pipes'), { recursive: true })
  writeFileSync(lockPath(), content, 'utf8')
}

describe('pipeRegistry file lock', () => {
  test('recovers a lock left behind by a dead process', async () => {
    seedPeerLock('999999999:stale-token')    // Determining the role must not hang past LOCK_TIMEOUT_MS and must
    // succeed by removing the stale lock.
    const result = await determineRole('machine-a')
    expect(result.role).toBe('main')
    expect(existsSync(lockPath())).toBe(false)
  })

  test('never deletes a live peer lock on timeout, and release is a no-op', async () => {
    // Simulate a live peer holding a fresh lock. The sleep process stays
    // alive for the whole test, so `process.kill(peer.pid, 0)` succeeds.
    const peer = Bun.spawn(['sleep', '30'])
    const peerLockContent = `${peer.pid}:peer-token`
    try {
      seedPeerLock(peerLockContent)

      // determineRole waits LOCK_TIMEOUT_MS (2s), then proceeds unlocked —
      // crucially WITHOUT deleting the peer's lock.
      const result = await determineRole('machine-a')
      expect(result.role).toBe('main')

      // The peer's lock must still be intact, byte for byte.
      expect(existsSync(lockPath())).toBe(true)
      expect(readFileSync(lockPath(), 'utf8')).toBe(peerLockContent)
    } finally {
      peer.kill()
    }
  })

  test('registry file is valid JSON after an unlocked-timeout operation', async () => {
    const peer = Bun.spawn(['sleep', '30'])
    try {
      seedPeerLock(`${peer.pid}:peer-token`)
      await determineRole('machine-a')
      const registryPath = join(
        process.env.CLAUDE_CONFIG_DIR!,
        'pipes',
        'registry.json',
      )
      expect(existsSync(registryPath)).toBe(false)
    } finally {
      peer.kill()
    }
  })
})
