import { describe, expect, test } from 'bun:test'
import { existsSync } from 'fs'
import { findSuitableShell } from '../../Shell'
import { getPlatform } from '../../platform'
import { createBashShellProvider } from '../bashProvider'

describe('createBashShellProvider', () => {
  test('does not detach Bash child processes on Windows', async () => {
    const provider = await createBashShellProvider('bash', {
      skipSnapshot: true,
    })
    expect(provider.detached).toBe(getPlatform() !== 'windows')
  })
})

describe('findSuitableShell', () => {
  const hasDefaultGitBash = existsSync('C:\\Program Files\\Git\\bin\\bash.exe')
  const testWithGitBash =
    getPlatform() === 'windows' && hasDefaultGitBash ? test : test.skip

  testWithGitBash('uses Git Bash instead of PATH bash on Windows', async () => {
    const shellPath = await findSuitableShell()
    expect(shellPath.toLowerCase()).toContain('\\git\\bin\\bash.exe')
  })
})
