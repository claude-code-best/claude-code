import { afterEach, describe, expect, test } from 'bun:test'
import { HybridTransport } from '../HybridTransport.js'
import { SSETransport } from '../SSETransport.js'
import { getTransportForUrl } from '../transportUtils.js'

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('getTransportForUrl', () => {
  test('selects the CCR SSE endpoint when v2 is enabled', () => {
    process.env.CLAUDE_CODE_PRODUCT = 'code'
    process.env.CLAUDE_CODE_USE_CCR_V2 = '1'
    process.env.CLAUDE_CODE_POST_FOR_SESSION_INGRESS_V2 = '1'

    const transport = getTransportForUrl(
      new URL('ws://rcs.test/v1/code/sessions/cse_1'),
    )

    expect(transport).toBeInstanceOf(SSETransport)
    expect((transport as any).url.href).toBe(
      'http://rcs.test/v1/code/sessions/cse_1/worker/events/stream',
    )
  })

  test('fails closed instead of selecting a legacy WS transport for Code', () => {
    process.env.CLAUDE_CODE_PRODUCT = 'code'
    delete process.env.CLAUDE_CODE_USE_CCR_V2
    process.env.CLAUDE_CODE_POST_FOR_SESSION_INGRESS_V2 = '1'

    expect(() =>
      getTransportForUrl(
        new URL('ws://rcs.test/v2/session_ingress/ws/session_1'),
      ),
    ).toThrow(/Code sessions require CCR v2 SSE transport/)
  })

  test('keeps the legacy hybrid transport available to Chat', () => {
    process.env.CLAUDE_CODE_PRODUCT = 'chat'
    delete process.env.CLAUDE_CODE_USE_CCR_V2
    process.env.CLAUDE_CODE_POST_FOR_SESSION_INGRESS_V2 = '1'

    expect(
      getTransportForUrl(
        new URL('ws://rcs.test/v2/session_ingress/ws/session_chat'),
      ),
    ).toBeInstanceOf(HybridTransport)
  })
})
