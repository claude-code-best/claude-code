import { describe, expect, test } from 'bun:test'
import { getLatestChannelContextHint } from '../interactiveHandler.js'

describe('getLatestChannelContextHint', () => {
  test('extracts source server and chat id from latest channel user message', () => {
    expect(
      getLatestChannelContextHint([
        {
          type: 'user',
          origin: { kind: 'channel', server: 'plugin:weixin:weixin' },
          message: {
            content: [
              {
                type: 'text',
                text: '<channel source="plugin:weixin:weixin" chat_id="user-1" sender_id="user-1">\nhello\n</channel>',
              },
            ],
          },
        },
      ]),
    ).toEqual({
      sourceServer: 'plugin:weixin:weixin',
      chatId: 'user-1',
    })
  })

  test('returns null when there is no channel-origin user message', () => {
    expect(
      getLatestChannelContextHint([
        {
          type: 'user',
          origin: { kind: 'manual' },
          message: { content: [{ type: 'text', text: 'hello' }] },
        },
      ]),
    ).toBeNull()
  })
})
