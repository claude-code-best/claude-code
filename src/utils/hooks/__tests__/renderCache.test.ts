import { describe, expect, test } from 'bun:test'
import { randomUUID } from 'crypto'
import type { AssistantMessage } from 'src/types/message.js'
import {
  clearRenderCache,
  getCachedRenderedText,
  setMessageRenderCache,
} from 'src/utils/hooks/renderCache.js'

function assistantMessage(text: string): AssistantMessage {
  return {
    type: 'assistant',
    uuid: randomUUID(),
    message: {
      role: 'assistant',
      content: [{ type: 'text', text }],
    },
  } as AssistantMessage
}

describe('renderCache', () => {
  test('set/get roundtrip', () => {
    clearRenderCache()
    setMessageRenderCache('original', 'rendered')
    expect(getCachedRenderedText('original')).toBe('rendered')
  })

  test('miss returns undefined', () => {
    clearRenderCache()
    expect(getCachedRenderedText('not-cached')).toBeUndefined()
  })

  test('identical content shares one entry (content-addressed)', () => {
    clearRenderCache()
    setMessageRenderCache('same-text', 'A')
    // 同内容再次写入覆盖同一条目
    setMessageRenderCache('same-text', 'B')
    expect(getCachedRenderedText('same-text')).toBe('B')
  })

  test('clearRenderCache empties the cache', () => {
    clearRenderCache()
    setMessageRenderCache('x', 'y')
    clearRenderCache()
    expect(getCachedRenderedText('x')).toBeUndefined()
  })
})
