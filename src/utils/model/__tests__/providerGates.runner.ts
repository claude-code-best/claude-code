import {
  afterAll,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  resetSettingsCache,
  setSessionSettingsCache,
} from '../../settings/settingsCache.js'
import type { SettingsJson } from '../../settings/types.js'

const testRoot = mkdtempSync(join(tmpdir(), 'provider-gates-'))
const testConfigDir = join(testRoot, 'config')
process.env.CLAUDE_CONFIG_DIR = testConfigDir
process.env.NODE_ENV = 'test'
mkdirSync(testConfigDir, { recursive: true })

const isolatedEnvKeys = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_UNIX_SOCKET',
  'CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR',
  'CLAUDE_CODE_SIMPLE',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_FOUNDRY',
  'CLAUDE_CODE_USE_GEMINI',
  'CLAUDE_CODE_USE_GROK',
  'CLAUDE_CODE_USE_OPENAI',
  'CLAUDE_CODE_USE_VERTEX',
  'DISABLE_INSTALL_GITHUB_APP_COMMAND',
  'DISABLE_LOGIN_COMMAND',
  'DISABLE_LOGOUT_COMMAND',
  'GEMINI_BASE_URL',
  'OPENAI_BASE_URL',
] as const

function clearIsolatedEnv(): void {
  for (const key of isolatedEnvKeys) delete process.env[key]
}

function setModelType(modelType?: SettingsJson['modelType']): void {
  setSessionSettingsCache({
    settings: modelType ? { modelType } : {},
    errors: [],
  })
}

clearIsolatedEnv()
setModelType()

// Keep the real auth implementation while preventing platform keychain reads.
// The subprocess wrapper contains this module mock so it cannot leak globally.
mock.module('src/utils/secureStorage/index.ts', () => ({
  getSecureStorage: () => ({
    name: 'provider-gates-test',
    read: () => null,
    readAsync: async () => null,
    update: () => ({ success: true }),
    delete: () => true,
  }),
}))

const { authStatus } = await import('../../../cli/handlers/auth.js')
const { clearCommandsCache, getCommands, meetsAvailabilityRequirement } =
  await import('../../../commands.js')
const { isAnthropicAuthEnabled, isUsing3PServices } = await import(
  '../../auth.js'
)
const { default: fast } = await import('../../../commands/fast/index.js')
const { default: installGitHubApp } = await import(
  '../../../commands/install-github-app/index.js'
)

const envProviderCases = [
  ['CLAUDE_CODE_USE_BEDROCK', 'bedrock'],
  ['CLAUDE_CODE_USE_VERTEX', 'vertex'],
  ['CLAUDE_CODE_USE_FOUNDRY', 'foundry'],
  ['CLAUDE_CODE_USE_OPENAI', 'openai'],
  ['CLAUDE_CODE_USE_GEMINI', 'gemini'],
  ['CLAUDE_CODE_USE_GROK', 'grok'],
] as const

beforeEach(() => {
  clearIsolatedEnv()
  resetSettingsCache()
  setModelType()
})

afterAll(() => {
  clearCommandsCache()
  resetSettingsCache()
  mock.restore()
  rmSync(testRoot, { recursive: true, force: true })
})

describe('Console command availability', () => {
  for (const modelType of ['openai', 'gemini', 'grok'] as const) {
    test(`rejects settings modelType=${modelType}`, () => {
      setModelType(modelType)

      expect(meetsAvailabilityRequirement(fast)).toBe(false)
      expect(meetsAvailabilityRequirement(installGitHubApp)).toBe(false)
    })
  }

  for (const [envKey] of envProviderCases) {
    test(`rejects ${envKey}`, () => {
      process.env[envKey] = '1'

      expect(meetsAvailabilityRequirement(fast)).toBe(false)
      expect(meetsAvailabilityRequirement(installGitHubApp)).toBe(false)
    })
  }

  test('continues accepting direct first-party Anthropic', () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'provider-gates-test-token'
    expect(meetsAvailabilityRequirement(fast)).toBe(true)
    expect(meetsAvailabilityRequirement(installGitHubApp)).toBe(true)
  })
})

describe('Anthropic auth provider gate', () => {
  for (const modelType of ['openai', 'gemini', 'grok'] as const) {
    test(`disables Anthropic auth for settings modelType=${modelType}`, () => {
      setModelType(modelType)
      expect(isAnthropicAuthEnabled()).toBe(false)
    })
  }

  for (const [envKey] of envProviderCases) {
    test(`disables Anthropic auth for ${envKey}`, () => {
      process.env[envKey] = '1'
      expect(isAnthropicAuthEnabled()).toBe(false)
    })
  }

  for (const envKey of ['OPENAI_BASE_URL', 'GEMINI_BASE_URL'] as const) {
    test(`disables Anthropic auth for ${envKey}`, () => {
      process.env[envKey] = 'https://provider-gates.invalid'
      expect(isAnthropicAuthEnabled()).toBe(false)
    })
  }

  test('continues enabling Anthropic auth for first-party OAuth', () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'provider-gates-test-token'
    expect(isAnthropicAuthEnabled()).toBe(true)
  })
})

describe('environment-only third-party compatibility gate', () => {
  for (const modelType of ['openai', 'gemini', 'grok'] as const) {
    test(`ignores settings modelType=${modelType}`, () => {
      setModelType(modelType)

      expect(isUsing3PServices()).toBe(false)
    })
  }
})

class ExitSignal extends Error {
  constructor(readonly code: string | number | null | undefined) {
    super(`process.exit(${String(code)})`)
  }
}

async function captureAuthStatus() {
  let stdout = ''
  const writeSpy = spyOn(process.stdout, 'write').mockImplementation(((
    chunk: string | Uint8Array,
  ) => {
    stdout += chunk.toString()
    return true
  }) as typeof process.stdout.write)
  const exitSpy = spyOn(process, 'exit').mockImplementation(((
    code?: string | number | null,
  ): never => {
    throw new ExitSignal(code)
  }) as typeof process.exit)

  let exitCode: ExitSignal['code']
  try {
    await authStatus({ json: true })
    throw new Error('authStatus did not call process.exit')
  } catch (error) {
    if (!(error instanceof ExitSignal)) throw error
    exitCode = error.code
  } finally {
    exitSpy.mockRestore()
    writeSpy.mockRestore()
  }

  return {
    exitCode,
    output: JSON.parse(stdout) as Record<string, unknown>,
  }
}

describe('auth status provider reporting', () => {
  for (const modelType of ['openai', 'gemini', 'grok'] as const) {
    test(`reports settings modelType=${modelType} as third_party`, async () => {
      setModelType(modelType)
      process.env.CLAUDE_CODE_OAUTH_TOKEN = 'provider-gates-test-token'

      const { exitCode, output } = await captureAuthStatus()

      expect(exitCode).toBe(0)
      expect(output.apiProvider).toBe(modelType)
      expect(output.authMethod).toBe('third_party')
      expect(output.loggedIn).toBe(true)
    })
  }

  for (const [envKey, apiProvider] of envProviderCases) {
    test(`reports ${envKey} as third_party`, async () => {
      process.env[envKey] = '1'
      process.env.CLAUDE_CODE_OAUTH_TOKEN = 'provider-gates-test-token'

      const { exitCode, output } = await captureAuthStatus()

      expect(exitCode).toBe(0)
      expect(output.apiProvider).toBe(apiProvider)
      expect(output.authMethod).toBe('third_party')
      expect(output.loggedIn).toBe(true)
    })
  }

  test('continues reporting direct first-party OAuth', async () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'provider-gates-test-token'

    const { exitCode, output } = await captureAuthStatus()

    expect(exitCode).toBe(0)
    expect(output.apiProvider).toBe('firstParty')
    expect(output.authMethod).toBe('oauth_token')
    expect(output.loggedIn).toBe(true)
  })
})

describe('login and logout visibility', () => {
  for (const modelType of ['openai', 'gemini', 'grok'] as const) {
    test(`keeps both commands visible for settings modelType=${modelType}`, async () => {
      setModelType(modelType)
      process.env.CLAUDE_CODE_OAUTH_TOKEN = 'provider-gates-test-token'
      clearCommandsCache()

      const commandNames = new Set(
        (await getCommands(testRoot)).map(command => command.name),
      )

      expect(commandNames.has('login')).toBe(true)
      expect(commandNames.has('logout')).toBe(true)
    })
  }
})
