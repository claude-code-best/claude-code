/**
 * Regression tests for src/services/auth/hostGuard.ts
 *
 * Tests verify:
 *   - assertWorkspaceHost: passes for api.anthropic.com, throws for third-party hosts
 *   - assertSubscriptionBaseUrl: passes for api.anthropic.com, throws for third-party hosts
 *   - assertNoAnthropicEnvForOpenAI: logs warning (does not throw) when both env vars set
 *
 * NOTE: This file imports hostGuard functions LAZILY (in beforeAll) so that the
 * module is resolved after any mock.module calls. Do NOT mock hostGuard.js in
 * other test files — it would replace the real module in the process-level cache.
 */

import { afterEach, beforeAll, describe, expect, mock, test } from 'bun:test'
import { debugMock } from '../../../../tests/mocks/debug.js'
import { logMock } from '../../../../tests/mocks/log.js'

// Side-effect module mocks must come first
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)

let assertWorkspaceHost: typeof import('../hostGuard.js').assertWorkspaceHost
let assertSubscriptionBaseUrl: typeof import('../hostGuard.js').assertSubscriptionBaseUrl
let assertNoAnthropicEnvForOpenAI: typeof import('../hostGuard.js').assertNoAnthropicEnvForOpenAI

beforeAll(async () => {
  const mod = await import('../hostGuard.js')
  assertWorkspaceHost = mod.assertWorkspaceHost
  assertSubscriptionBaseUrl = mod.assertSubscriptionBaseUrl
  assertNoAnthropicEnvForOpenAI = mod.assertNoAnthropicEnvForOpenAI
})

// ── assertWorkspaceHost ─────────────────────────────────────────────────────

describe('assertWorkspaceHost', () => {
  test('passes for https://api.anthropic.com/v1/agents', () => {
    expect(() =>
      assertWorkspaceHost('https://api.anthropic.com/v1/agents'),
    ).not.toThrow()
  })

  test('passes for https://api.anthropic.com/v1/vaults', () => {
    expect(() =>
      assertWorkspaceHost('https://api.anthropic.com/v1/vaults'),
    ).not.toThrow()
  })

  test('passes for https://api.anthropic.com/v1/memory_stores', () => {
    expect(() =>
      assertWorkspaceHost('https://api.anthropic.com/v1/memory_stores'),
    ).not.toThrow()
  })

  test('throws for third-party host (api.cerebras.ai)', () => {
    expect(() =>
      assertWorkspaceHost('https://api.cerebras.ai/v1/agents'),
    ).toThrow('non-Anthropic host')
  })

  test('throws for third-party host (api.openai.com)', () => {
    expect(() =>
      assertWorkspaceHost('https://api.openai.com/v1/agents'),
    ).toThrow('non-Anthropic host')
  })

  test('throws for attacker host', () => {
    expect(() => assertWorkspaceHost('https://attacker.com/steal')).toThrow(
      'non-Anthropic host',
    )
  })

  test('throws for invalid URL', () => {
    expect(() => assertWorkspaceHost('not-a-url')).toThrow('invalid URL')
  })

  test('error message contains workspace API key hint', () => {
    let message = ''
    try {
      assertWorkspaceHost('https://api.cerebras.ai/v1/agents')
    } catch (err) {
      message = err instanceof Error ? err.message : String(err)
    }
    expect(message).toContain('api.anthropic.com')
  })

  // E2 regression: hostname-based check catches subdomain-confusion attacks
  test('throws for api.anthropic.com.evil.com (subdomain confusion)', () => {
    expect(() =>
      assertWorkspaceHost('https://api.anthropic.com.evil.com/v1/agents'),
    ).toThrow('non-Anthropic host')
  })

  test('throws for URL with credentials (url@host bypass attempt)', () => {
    // new URL('https://api.anthropic.com@evil.com/').hostname === 'evil.com'
    // so this is caught by hostname !== WORKSPACE_API_HOST
    expect(() =>
      assertWorkspaceHost('https://api.anthropic.com@evil.com/v1/agents'),
    ).toThrow('non-Anthropic host')
  })
})

// ── assertSubscriptionBaseUrl ───────────────────────────────────────────────

describe('assertSubscriptionBaseUrl', () => {
  test('passes for https://api.anthropic.com/v1/code/triggers', () => {
    expect(() =>
      assertSubscriptionBaseUrl('https://api.anthropic.com/v1/code/triggers'),
    ).not.toThrow()
  })

  test('passes for https://api.anthropic.com/v1/sessions', () => {
    expect(() =>
      assertSubscriptionBaseUrl('https://api.anthropic.com/v1/sessions'),
    ).not.toThrow()
  })

  test('throws for attacker.com', () => {
    expect(() =>
      assertSubscriptionBaseUrl('https://attacker.com/steal'),
    ).toThrow('non-Anthropic host')
  })

  test('throws for third-party host', () => {
    expect(() =>
      assertSubscriptionBaseUrl('https://api.openai.com/v1/chat/completions'),
    ).toThrow('non-Anthropic host')
  })

  test('throws for invalid URL', () => {
    expect(() => assertSubscriptionBaseUrl('not-a-url')).toThrow('invalid URL')
  })
})

// ── assertNoAnthropicEnvForOpenAI ───────────────────────────────────────────

describe('assertNoAnthropicEnvForOpenAI', () => {
  const origAnthropicKey = process.env['ANTHROPIC_API_KEY']
  const origOpenAIKey = process.env['OPENAI_API_KEY']
  const origOpenAIMode = process.env['CLAUDE_CODE_USE_OPENAI']

  afterEach(() => {
    // Restore env vars
    if (origAnthropicKey === undefined) {
      delete process.env['ANTHROPIC_API_KEY']
    } else {
      process.env['ANTHROPIC_API_KEY'] = origAnthropicKey
    }
    if (origOpenAIKey === undefined) {
      delete process.env['OPENAI_API_KEY']
    } else {
      process.env['OPENAI_API_KEY'] = origOpenAIKey
    }
    if (origOpenAIMode === undefined) {
      delete process.env['CLAUDE_CODE_USE_OPENAI']
    } else {
      process.env['CLAUDE_CODE_USE_OPENAI'] = origOpenAIMode
    }
  })

  test('does not throw when only ANTHROPIC_API_KEY is set', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api03-test'
    delete process.env['OPENAI_API_KEY']
    delete process.env['CLAUDE_CODE_USE_OPENAI']
    expect(() => assertNoAnthropicEnvForOpenAI()).not.toThrow()
  })

  test('does not throw when only OpenAI mode is set', () => {
    delete process.env['ANTHROPIC_API_KEY']
    process.env['CLAUDE_CODE_USE_OPENAI'] = '1'
    expect(() => assertNoAnthropicEnvForOpenAI()).not.toThrow()
  })

  test('does not throw (only warns) when both ANTHROPIC_API_KEY and OPENAI_API_KEY are set', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api03-test'
    process.env['OPENAI_API_KEY'] = 'sk-openai-test'
    // Must NOT throw
    expect(() => assertNoAnthropicEnvForOpenAI()).not.toThrow()
  })

  test('does not throw (only warns) when both ANTHROPIC_API_KEY and CLAUDE_CODE_USE_OPENAI=1 are set', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-api03-test'
    process.env['CLAUDE_CODE_USE_OPENAI'] = '1'
    // Must NOT throw
    expect(() => assertNoAnthropicEnvForOpenAI()).not.toThrow()
  })
})
