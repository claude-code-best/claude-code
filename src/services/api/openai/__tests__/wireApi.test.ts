import { afterEach, describe, expect, test } from 'bun:test'
import { getOpenAIWireAPI } from '../wireApi.js'

const originalWireAPI = process.env.OPENAI_WIRE_API

afterEach(() => {
  if (originalWireAPI === undefined) {
    delete process.env.OPENAI_WIRE_API
  } else {
    process.env.OPENAI_WIRE_API = originalWireAPI
  }
})

describe('getOpenAIWireAPI', () => {
  test('uses explicit env var when set', () => {
    process.env.OPENAI_WIRE_API = 'responses'
    expect(getOpenAIWireAPI('https://api.example.com/v1')).toBe('responses')
  })

  test('auto-detects responses for /codex base URL', () => {
    delete process.env.OPENAI_WIRE_API
    expect(getOpenAIWireAPI('https://code.ylsagi.com/codex')).toBe('responses')
  })

  test('keeps chat completions for /v1 base URL', () => {
    delete process.env.OPENAI_WIRE_API
    expect(getOpenAIWireAPI('https://code3.ylsagi.io/openai/v1')).toBe('chat_completions')
  })
})
