import { afterEach, describe, expect, mock, test } from 'bun:test'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { debugMock } from '../../../../../tests/mocks/debug.js'

mock.module('src/utils/debug.ts', debugMock)

const originalConfigDir = process.env.CLAUDE_CONFIG_DIR
const originalCodexHome = process.env.CODEX_HOME
let tempRoot: string | undefined

afterEach(() => {
  if (originalConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR
  else process.env.CLAUDE_CONFIG_DIR = originalConfigDir
  if (originalCodexHome === undefined) delete process.env.CODEX_HOME
  else process.env.CODEX_HOME = originalCodexHome
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true })
  tempRoot = undefined
})

describe('ChatGPT auth storage', () => {
  test('imports Codex auth into the Claude config directory with restrictive permissions', async () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'chatgpt-auth-test-'))
    const codexHome = join(tempRoot, 'codex')
    const claudeHome = join(tempRoot, 'claude')
    mkdirSync(codexHome, { recursive: true })
    process.env.CODEX_HOME = codexHome
    process.env.CLAUDE_CONFIG_DIR = claudeHome

    writeFileSync(
      join(codexHome, 'auth.json'),
      JSON.stringify({
        auth_mode: 'chatgpt',
        tokens: {
          id_token: 'id-token',
          access_token: 'access-token',
          refresh_token: 'refresh-token',
        },
      }),
      { encoding: 'utf8' },
    )

    const { hasStoredChatGPTAuth, importChatGPTAuthFromCodex } = await import(
      '../chatgptAuth.js'
    )
    expect(hasStoredChatGPTAuth()).toBe(true)
    await expect(importChatGPTAuthFromCodex()).resolves.toBe(true)

    const importedPath = join(claudeHome, 'openai-chatgpt-auth.json')
    const imported = JSON.parse(readFileSync(importedPath, 'utf8')) as {
      auth_mode: string
      tokens: { access_token: string; refresh_token: string }
    }
    expect(imported).toMatchObject({
      auth_mode: 'chatgpt',
      tokens: {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
      },
    })
    expect(statSync(importedPath).mode & 0o777).toBe(0o600)
  })
})
