import { describe, expect, test } from 'bun:test'
import { getOpenAIDefaultHeaders } from '../client.js'

describe('getOpenAIDefaultHeaders', () => {
  test('returns ylsagi codex headers for /codex responses endpoint', () => {
    const headers = getOpenAIDefaultHeaders('https://code.ylsagi.com/codex')
    expect(headers).toEqual({
      originator: 'Codex Desktop',
      session_id: 'openclaw',
      'User-Agent':
        'Codex Desktop/0.120.0 (Windows 10.0.26200; x86_64) unknown (codex-exec; 0.120.0)',
      Accept: 'text/event-stream',
    })
  })

  test('returns undefined for non-ylsagi endpoints', () => {
    expect(getOpenAIDefaultHeaders('https://api.openai.com/v1')).toBeUndefined()
  })
})
