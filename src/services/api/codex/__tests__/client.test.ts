import { describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type { ResponsesRequest } from '../../openai/responsesAdapter.js'
import { createCodexResponsesStream } from '../client.js'

function restoreCodexEnv(env: {
  CODEX_API_KEY?: string
  CODEX_BASE_URL?: string
  CODEX_RESPONSES_URL?: string
  CODEX_AUTH_MODE?: string
  CLAUDE_CONFIG_DIR?: string
}): void {
  if (env.CODEX_API_KEY === undefined) {
    delete process.env.CODEX_API_KEY
  } else {
    process.env.CODEX_API_KEY = env.CODEX_API_KEY
  }
  if (env.CODEX_BASE_URL === undefined) {
    delete process.env.CODEX_BASE_URL
  } else {
    process.env.CODEX_BASE_URL = env.CODEX_BASE_URL
  }
  if (env.CODEX_RESPONSES_URL === undefined) {
    delete process.env.CODEX_RESPONSES_URL
  } else {
    process.env.CODEX_RESPONSES_URL = env.CODEX_RESPONSES_URL
  }
  if (env.CODEX_AUTH_MODE === undefined) {
    delete process.env.CODEX_AUTH_MODE
  } else {
    process.env.CODEX_AUTH_MODE = env.CODEX_AUTH_MODE
  }
  if (env.CLAUDE_CONFIG_DIR === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = env.CLAUDE_CONFIG_DIR
  }
}

const request: ResponsesRequest = {
  model: 'gpt-5.5',
  stream: true,
  store: false,
  input: [{ role: 'user', content: 'hello' }],
}

function fakeJwt(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `header.${encoded}.signature`
}

describe('createCodexResponsesStream', () => {
  test('posts a native Responses payload to /v1/responses', async () => {
    const env = {
      CODEX_API_KEY: process.env.CODEX_API_KEY,
      CODEX_BASE_URL: process.env.CODEX_BASE_URL,
      CODEX_RESPONSES_URL: process.env.CODEX_RESPONSES_URL,
      CODEX_AUTH_MODE: process.env.CODEX_AUTH_MODE,
      CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
    }
    let url = ''
    let body = ''
    let authorization = ''
    try {
      process.env.CODEX_API_KEY = 'test-key'
      process.env.CODEX_BASE_URL = 'https://example.test/v1'
      delete process.env.CODEX_RESPONSES_URL
      delete process.env.CODEX_AUTH_MODE

      await createCodexResponsesStream({
        request,
        signal: new AbortController().signal,
        fetchOverride: (async (
          input: Parameters<typeof fetch>[0],
          init: Parameters<typeof fetch>[1],
        ) => {
          url = String(input)
          body = String(init?.body)
          authorization =
            (init?.headers as Record<string, string> | undefined)
              ?.Authorization ?? ''
          return new Response('data: [DONE]\n\n', {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          })
        }) as unknown as typeof fetch,
      })

      const payload = JSON.parse(body) as Record<string, unknown>
      expect(url).toBe('https://example.test/v1/responses')
      expect(payload.input).toEqual([{ role: 'user', content: 'hello' }])
      expect('messages' in payload).toBe(false)
      expect(authorization).toBe('Bearer test-key')
    } finally {
      restoreCodexEnv(env)
    }
  })

  test('does not append /responses twice', async () => {
    const env = {
      CODEX_API_KEY: process.env.CODEX_API_KEY,
      CODEX_BASE_URL: process.env.CODEX_BASE_URL,
      CODEX_RESPONSES_URL: process.env.CODEX_RESPONSES_URL,
      CODEX_AUTH_MODE: process.env.CODEX_AUTH_MODE,
      CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
    }
    let url = ''
    try {
      delete process.env.CODEX_API_KEY
      process.env.CODEX_BASE_URL = 'https://example.test/v1/responses'
      delete process.env.CODEX_RESPONSES_URL
      delete process.env.CODEX_AUTH_MODE

      await createCodexResponsesStream({
        request,
        signal: new AbortController().signal,
        fetchOverride: (async (input: Parameters<typeof fetch>[0]) => {
          url = String(input)
          return new Response('data: [DONE]\n\n', {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          })
        }) as unknown as typeof fetch,
      })

      expect(url).toBe('https://example.test/v1/responses')
    } finally {
      restoreCodexEnv(env)
    }
  })

  test('uses ChatGPT login auth when CODEX_AUTH_MODE=chatgpt', async () => {
    const env = {
      CODEX_API_KEY: process.env.CODEX_API_KEY,
      CODEX_BASE_URL: process.env.CODEX_BASE_URL,
      CODEX_RESPONSES_URL: process.env.CODEX_RESPONSES_URL,
      CODEX_AUTH_MODE: process.env.CODEX_AUTH_MODE,
      CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
    }
    const configDir = await mkdtemp(join(tmpdir(), 'codex-auth-test-'))
    let url = ''
    let authorization = ''
    let accountId = ''
    try {
      process.env.CLAUDE_CONFIG_DIR = configDir
      process.env.CODEX_AUTH_MODE = 'chatgpt'
      delete process.env.CODEX_API_KEY
      const accessToken = fakeJwt({
        exp: Math.floor(Date.now() / 1000) + 3600,
        'https://api.openai.com/auth': { chatgpt_account_id: 'acct_123' },
      })
      await writeFile(
        join(configDir, 'openai-chatgpt-auth.json'),
        JSON.stringify({
          auth_mode: 'chatgpt',
          tokens: {
            id_token: fakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }),
            access_token: accessToken,
            refresh_token: 'refresh-token',
          },
        }),
      )

      await createCodexResponsesStream({
        request,
        signal: new AbortController().signal,
        fetchOverride: (async (
          input: Parameters<typeof fetch>[0],
          init: Parameters<typeof fetch>[1],
        ) => {
          url = String(input)
          authorization =
            (init?.headers as Record<string, string> | undefined)
              ?.Authorization ?? ''
          accountId =
            (init?.headers as Record<string, string> | undefined)?.[
              'ChatGPT-Account-Id'
            ] ?? ''
          return new Response('data: [DONE]\n\n', {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          })
        }) as unknown as typeof fetch,
      })

      expect(url).toBe('https://chatgpt.com/backend-api/codex/responses')
      expect(authorization).toBe(`Bearer ${accessToken}`)
      expect(accountId).toBe('acct_123')
    } finally {
      restoreCodexEnv(env)
      await rm(configDir, { recursive: true, force: true })
    }
  })
})
