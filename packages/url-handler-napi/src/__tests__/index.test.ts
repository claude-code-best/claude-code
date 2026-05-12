import { afterEach, describe, expect, test } from 'bun:test'
import { waitForUrlEvent } from '../index'

const originalEnv = {
  CLAUDE_CODE_URL_EVENT: process.env.CLAUDE_CODE_URL_EVENT,
  CLAUDE_CODE_DEEP_LINK_URL: process.env.CLAUDE_CODE_DEEP_LINK_URL,
  CLAUDE_CODE_URL: process.env.CLAUDE_CODE_URL,
}
const originalArgv = process.argv.slice()

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
  process.argv = originalArgv.slice()
})

describe('waitForUrlEvent', () => {
  test('resolves to null without a timeout', async () => {
    await expect(waitForUrlEvent()).resolves.toBeNull()
  })

  test('resolves to null with an explicit timeout', async () => {
    await expect(waitForUrlEvent(1)).resolves.toBeNull()
  })

  test('returns a Claude URL from environment variables', async () => {
    process.env.CLAUDE_CODE_URL_EVENT = 'claude-cli://prompt?q=hello'

    await expect(waitForUrlEvent()).resolves.toBe('claude-cli://prompt?q=hello')
  })

  test('returns a Claude URL from argv', async () => {
    process.argv = [...originalArgv, 'claude://prompt?q=hello']

    await expect(waitForUrlEvent()).resolves.toBe('claude://prompt?q=hello')
  })

  test('rejects URLs exceeding the maximum length', async () => {
    process.env.CLAUDE_CODE_URL_EVENT = `claude-cli://${'x'.repeat(2048)}`

    await expect(waitForUrlEvent()).resolves.toBeNull()
  })
})
