import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { logMock } from '../../../../tests/mocks/log.js'

// Must mock log before any import that transitively loads log.ts
mock.module('src/utils/log.ts', logMock)

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'provider-secrets-test-'))
  process.env['CLAUDE_CONFIG_DIR'] = tmpDir
})

afterEach(() => {
  delete process.env['CLAUDE_CONFIG_DIR']
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('provider secret store', () => {
  test('persists and reads back a credential by provider id', async () => {
    const { writeProviderSecret, readProviderSecret } = await import(
      '../providerSecrets.js'
    )
    writeProviderSecret('glm', 'OPENAI_API_KEY', 'sk-glm-123')
    expect(readProviderSecret('glm')).toMatchObject({
      envName: 'OPENAI_API_KEY',
      value: 'sk-glm-123',
    })
  })

  test('keeps sibling providers when a new one is saved (no clobber)', async () => {
    const { writeProviderSecret, readProviderSecret } = await import(
      '../providerSecrets.js'
    )
    writeProviderSecret('glm', 'OPENAI_API_KEY', 'sk-glm')
    writeProviderSecret('qwen', 'DASHSCOPE_API_KEY', 'sk-qwen')
    expect(readProviderSecret('glm')?.value).toBe('sk-glm')
    expect(readProviderSecret('qwen')?.value).toBe('sk-qwen')
  })

  test('writes the secrets file with 0600 permissions', async () => {
    const { writeProviderSecret, getProviderSecretsFilePath } = await import(
      '../providerSecrets.js'
    )
    writeProviderSecret('glm', 'OPENAI_API_KEY', 'sk-glm')
    const mode = statSync(getProviderSecretsFilePath()).mode & 0o777
    expect(mode).toBe(0o600)
  })

  test('ignores empty credentials', async () => {
    const { writeProviderSecret, readProviderSecret } = await import(
      '../providerSecrets.js'
    )
    writeProviderSecret('glm', 'OPENAI_API_KEY', '   ')
    expect(readProviderSecret('glm')).toBeUndefined()
  })

  test('deleteProviderSecret removes only the target provider', async () => {
    const { writeProviderSecret, deleteProviderSecret, readProviderSecret } =
      await import('../providerSecrets.js')
    writeProviderSecret('glm', 'OPENAI_API_KEY', 'sk-glm')
    writeProviderSecret('qwen', 'DASHSCOPE_API_KEY', 'sk-qwen')
    deleteProviderSecret('glm')
    expect(readProviderSecret('glm')).toBeUndefined()
    expect(readProviderSecret('qwen')?.value).toBe('sk-qwen')
  })

  test('hydrate fills empty slots but never clobbers a live env value', async () => {
    const { writeProviderSecret, hydrateProviderSecretsIntoEnv } = await import(
      '../providerSecrets.js'
    )
    writeProviderSecret('glm', 'OPENAI_API_KEY', 'sk-stored')
    const env: Record<string, string | undefined> = {
      OPENAI_API_KEY: 'sk-live',
    }
    hydrateProviderSecretsIntoEnv(env)
    expect(env.OPENAI_API_KEY).toBe('sk-live')

    const emptyEnv: Record<string, string | undefined> = {}
    hydrateProviderSecretsIntoEnv(emptyEnv)
    expect(emptyEnv.OPENAI_API_KEY).toBe('sk-stored')
  })

  test('the active provider always wins its env slot', async () => {
    const { writeProviderSecret, hydrateProviderSecretsIntoEnv } = await import(
      '../providerSecrets.js'
    )
    writeProviderSecret('glm', 'OPENAI_API_KEY', 'sk-glm')
    const env: Record<string, string | undefined> = {
      OPENAI_API_KEY: 'sk-stale',
    }
    hydrateProviderSecretsIntoEnv(env, { activeProviderId: 'glm' })
    expect(env.OPENAI_API_KEY).toBe('sk-glm')
  })

  test('a corrupt secrets file degrades to empty rather than throwing', async () => {
    const { getProviderSecretsFilePath, readProviderSecret } = await import(
      '../providerSecrets.js'
    )
    writeFileSync(getProviderSecretsFilePath(), '{ not json', 'utf8')
    expect(readProviderSecret('glm')).toBeUndefined()
  })
})
