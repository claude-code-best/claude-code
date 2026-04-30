import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

const mockParseDeepLink = mock((uri: string) => {
  if (uri === null || uri === undefined || uri === 'bad-uri') {
    throw new Error('invalid deep link')
  }
  return { query: 'hello', cwd: 'E:/Source_code/Claude-code-bast-test' }
})
const mockLaunchInTerminal = mock(async () => true)

mock.module('../parseDeepLink.js', () => ({
  parseDeepLink: mockParseDeepLink,
}))
mock.module('../registerProtocol.js', () => ({
  MACOS_BUNDLE_ID: 'com.anthropic.claude-code-url-handler',
}))
mock.module('../terminalLauncher.js', () => ({
  launchInTerminal: mockLaunchInTerminal,
}))
mock.module('../banner.js', () => ({
  readLastFetchTime: async () => undefined,
  buildDeepLinkBanner: () => '',
}))
mock.module('../../githubRepoPathMapping.js', () => ({
  updateGithubRepoPathMapping: async () => {},
  getKnownPathsForRepo: () => [],
  filterExistingPaths: async () => [],
  validateRepoAtPath: async () => false,
  removePathFromRepo: () => {},
}))

const { handleDeepLinkUri, handleUrlSchemeLaunch } = await import(
  '../protocolHandler.js'
)

const originalBundleId = process.env.__CFBundleIdentifier
const originalUrlEvent = process.env.CLAUDE_CODE_URL_EVENT

beforeEach(() => {
  mockParseDeepLink.mockClear()
  mockLaunchInTerminal.mockClear()
  process.env.__CFBundleIdentifier = undefined
  delete process.env.CLAUDE_CODE_URL_EVENT
})

afterEach(() => {
  process.env.__CFBundleIdentifier = originalBundleId
  if (originalUrlEvent === undefined) {
    delete process.env.CLAUDE_CODE_URL_EVENT
  } else {
    process.env.CLAUDE_CODE_URL_EVENT = originalUrlEvent
  }
})

describe('handleUrlSchemeLaunch', () => {
  test('returns null without calling url-handler-napi when bundle id does not match', async () => {
    process.env.__CFBundleIdentifier = 'other.bundle'

    await expect(handleUrlSchemeLaunch()).resolves.toBeNull()
    expect(mockParseDeepLink).not.toHaveBeenCalled()
  })

  test('returns null for a matching bundle id when no URL event arrives', async () => {
    process.env.__CFBundleIdentifier = 'com.anthropic.claude-code-url-handler'

    await expect(handleUrlSchemeLaunch()).resolves.toBeNull()
    expect(mockParseDeepLink).not.toHaveBeenCalled()
  })

  test('handles a URL event after waiting for url-handler-napi', async () => {
    process.env.__CFBundleIdentifier = 'com.anthropic.claude-code-url-handler'
    process.env.CLAUDE_CODE_URL_EVENT = 'claude-cli://prompt?q=hello'

    await expect(handleUrlSchemeLaunch()).resolves.toBe(0)
    expect(mockParseDeepLink).toHaveBeenCalledWith(
      'claude-cli://prompt?q=hello',
    )
  })
})

describe('handleDeepLinkUri', () => {
  test('returns 1 when parsing fails', async () => {
    await expect(handleDeepLinkUri('bad-uri')).resolves.toBe(1)
    expect(mockLaunchInTerminal).not.toHaveBeenCalled()
  })

  test('returns 0 when parsing succeeds and terminal launch succeeds', async () => {
    await expect(
      handleDeepLinkUri('claude-cli://prompt?q=hello'),
    ).resolves.toBe(0)
    expect(mockLaunchInTerminal).toHaveBeenCalled()
  })
})
