import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { logMock } from '../../../../../tests/mocks/log'
import { debugMock } from '../../../../../tests/mocks/debug'

mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)

import { clearOpenAIClientCache, getOpenAIClient } from '../client.js'

const ENV_KEY = 'OPENAI_MAX_RETRIES'
let savedEnv: string | undefined

beforeEach(() => {
  savedEnv = process.env[ENV_KEY]
  clearOpenAIClientCache()
})

afterEach(() => {
  if (savedEnv === undefined) {
    delete process.env[ENV_KEY]
  } else {
    process.env[ENV_KEY] = savedEnv
  }
  clearOpenAIClientCache()
})

describe('getOpenAIClient maxRetries', () => {
  test('defaults to 10 when OPENAI_MAX_RETRIES is unset', () => {
    delete process.env[ENV_KEY]
    expect(getOpenAIClient().maxRetries).toBe(10)
  })

  test('uses OPENAI_MAX_RETRIES when set', () => {
    process.env[ENV_KEY] = '5'
    expect(getOpenAIClient().maxRetries).toBe(5)
  })

  test('allows OPENAI_MAX_RETRIES=0 to disable retries', () => {
    process.env[ENV_KEY] = '0'
    expect(getOpenAIClient().maxRetries).toBe(0)
  })

  test('falls back to default for unparseable values', () => {
    process.env[ENV_KEY] = 'abc'
    expect(getOpenAIClient().maxRetries).toBe(10)
  })

  test('falls back to default for negative values', () => {
    process.env[ENV_KEY] = '-1'
    expect(getOpenAIClient().maxRetries).toBe(10)
  })

  test('explicit maxRetries option overrides env and default', () => {
    delete process.env[ENV_KEY]
    expect(getOpenAIClient({ maxRetries: 0 }).maxRetries).toBe(0)
  })
})
