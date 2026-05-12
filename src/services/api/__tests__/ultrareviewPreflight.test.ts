/**
 * Regression tests for fetchUltrareviewPreflight.
 * Verifies all three action enum states (proceed/confirm/blocked),
 * network/HTTP error handling, and Zod schema mismatch fallback.
 */
import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test'
import { debugMock } from '../../../../tests/mocks/debug.js'
import { logMock } from '../../../../tests/mocks/log.js'
import { setupAxiosMock } from '../../../../tests/mocks/axios.js'

// Mock dependency chain before any subject import
mock.module('src/utils/debug.ts', debugMock)
mock.module('src/utils/log.ts', logMock)
mock.module('src/services/analytics/index.js', () => ({
  logEvent: () => {},
}))

// Mock auth utilities
mock.module('src/utils/auth.js', () => ({
  isClaudeAISubscriber: () => true,
  isTeamSubscriber: () => false,
  isEnterpriseSubscriber: () => false,
}))

// Mock OAuth config
mock.module('src/constants/oauth.js', () => ({
  getOauthConfig: () => ({ BASE_API_URL: 'https://api.anthropic.com' }),
}))

// Mock prepareApiRequest and getOAuthHeaders
mock.module('src/utils/teleport/api.js', () => ({
  prepareApiRequest: async () => ({
    accessToken: 'test-token',
    orgUUID: 'org-uuid-test',
  }),
  getOAuthHeaders: (token: string) => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  }),
}))

// We'll mock axios at module level.
// Typed as any in test code (CLAUDE.md: mock data may use as any).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAxiosPost = mock(async (..._args: any[]): Promise<any> => {
  throw new Error('not configured')
})

const axiosHandle = setupAxiosMock()
axiosHandle.stubs.post = mockAxiosPost
axiosHandle.stubs.isAxiosError = (e: unknown) =>
  typeof e === 'object' &&
  e !== null &&
  (e as { isAxiosError?: boolean }).isAxiosError === true

beforeAll(() => {
  axiosHandle.useStubs = true
})

afterAll(() => {
  axiosHandle.useStubs = false
})

import {
  fetchUltrareviewPreflight,
  type UltrareviewPreflightResponse,
} from '../ultrareviewPreflight.js'

describe('fetchUltrareviewPreflight', () => {
  test('returns proceed action when server responds with proceed', async () => {
    const serverResponse: UltrareviewPreflightResponse = {
      action: 'proceed',
      billing_note: null,
    }
    mockAxiosPost.mockImplementationOnce(async () => ({
      status: 200,
      data: serverResponse,
    }))

    const result = await fetchUltrareviewPreflight({ repo: 'owner/repo' })
    expect(result).not.toBeNull()
    expect(result?.action).toBe('proceed')
    expect(result?.billing_note).toBeNull()
  })

  test('returns confirm action with billing_note when server responds with confirm', async () => {
    const serverResponse: UltrareviewPreflightResponse = {
      action: 'confirm',
      billing_note: 'This run will cost approximately $2.50.',
    }
    mockAxiosPost.mockImplementationOnce(async () => ({
      status: 200,
      data: serverResponse,
    }))

    const result = await fetchUltrareviewPreflight({ repo: 'owner/repo' })
    expect(result).not.toBeNull()
    expect(result?.action).toBe('confirm')
    expect(result?.billing_note).toBe('This run will cost approximately $2.50.')
  })

  test('returns blocked action when server responds with blocked', async () => {
    const serverResponse: UltrareviewPreflightResponse = {
      action: 'blocked',
      billing_note: null,
    }
    mockAxiosPost.mockImplementationOnce(async () => ({
      status: 200,
      data: serverResponse,
    }))

    const result = await fetchUltrareviewPreflight({ repo: 'owner/repo' })
    expect(result).not.toBeNull()
    expect(result?.action).toBe('blocked')
  })

  test('returns null on schema mismatch (invalid action value)', async () => {
    mockAxiosPost.mockImplementationOnce(async () => ({
      status: 200,
      data: { action: 'unknown_action', billing_note: null },
    }))

    const result = await fetchUltrareviewPreflight({ repo: 'owner/repo' })
    expect(result).toBeNull()
  })

  test('returns null on network error (no response)', async () => {
    const networkError = new Error('ECONNREFUSED')
    ;(networkError as unknown as { isAxiosError: boolean }).isAxiosError = true
    mockAxiosPost.mockImplementationOnce(async () => {
      throw networkError
    })

    const result = await fetchUltrareviewPreflight({ repo: 'owner/repo' })
    expect(result).toBeNull()
  })

  test('returns null on 401 Unauthorized', async () => {
    const authError = new Error('Unauthorized')
    ;(
      authError as unknown as {
        isAxiosError: boolean
        response: { status: number }
      }
    ).isAxiosError = true
    ;(authError as unknown as { response: { status: number } }).response = {
      status: 401,
    }
    mockAxiosPost.mockImplementationOnce(async () => {
      throw authError
    })

    const result = await fetchUltrareviewPreflight({ repo: 'owner/repo' })
    expect(result).toBeNull()
  })

  test('returns null on 403 Forbidden', async () => {
    const forbiddenError = new Error('Forbidden')
    ;(
      forbiddenError as unknown as {
        isAxiosError: boolean
        response: { status: number }
      }
    ).isAxiosError = true
    ;(forbiddenError as unknown as { response: { status: number } }).response =
      { status: 403 }
    mockAxiosPost.mockImplementationOnce(async () => {
      throw forbiddenError
    })

    const result = await fetchUltrareviewPreflight({ repo: 'owner/repo' })
    expect(result).toBeNull()
  })

  test('returns null on 5xx server error', async () => {
    const serverError = new Error('Internal Server Error')
    ;(
      serverError as unknown as {
        isAxiosError: boolean
        response: { status: number }
      }
    ).isAxiosError = true
    ;(serverError as unknown as { response: { status: number } }).response = {
      status: 500,
    }
    mockAxiosPost.mockImplementationOnce(async () => {
      throw serverError
    })

    const result = await fetchUltrareviewPreflight({ repo: 'owner/repo' })
    expect(result).toBeNull()
  })

  test('passes pr_number to request body when provided', async () => {
    mockAxiosPost.mockImplementationOnce(
      async (_url: unknown, body: unknown) => {
        const b = body as { pr_number: number }
        expect(b.pr_number).toBe(42)
        return { status: 200, data: { action: 'proceed', billing_note: null } }
      },
    )

    const result = await fetchUltrareviewPreflight({
      repo: 'owner/repo',
      pr_number: 42,
    })
    expect(result?.action).toBe('proceed')
  })

  test('passes confirm flag to request body when provided', async () => {
    mockAxiosPost.mockImplementationOnce(
      async (_url: unknown, body: unknown) => {
        const b = body as { confirm: boolean }
        expect(b.confirm).toBe(true)
        return { status: 200, data: { action: 'proceed', billing_note: null } }
      },
    )

    const result = await fetchUltrareviewPreflight({
      repo: 'owner/repo',
      confirm: true,
    })
    expect(result?.action).toBe('proceed')
  })
})
