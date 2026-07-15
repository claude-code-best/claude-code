import { describe, expect, test } from 'bun:test'
import {
  buildCCRWorkerEventRequest,
  resolveDeliveryEventId,
  flushWithTimeout,
} from '../ccrClient.js'

describe('CCRClient worker event routing', () => {
  test('routes terminal protocol output to a one-shot live request', () => {
    expect(
      buildCCRWorkerEventRequest({
        type: 'terminal_output',
        uuid: 'output-1',
        term_id: 'main',
        data: 'hello',
      }),
    ).toEqual({
      delivery: 'live',
      path: '/worker/live-events',
      body: {
        event_id: 'output-1',
        type: 'terminal_output',
        payload: {
          type: 'terminal_output',
          uuid: 'output-1',
          term_id: 'main',
          data: 'hello',
        },
      },
    })
  })

  test('keeps ordinary worker output on the durable uploader', () => {
    expect(buildCCRWorkerEventRequest({ type: 'assistant' })).toEqual({
      delivery: 'durable',
    })
  })

  test('resolves lifecycle delivery acknowledgements to the server event ID', () => {
    const eventIds = new Map([['payload-user-1', 'server-event-1']])

    expect(resolveDeliveryEventId(eventIds, 'payload-user-1')).toBe(
      'server-event-1',
    )
    expect(resolveDeliveryEventId(eventIds, 'unknown-payload')).toBe(
      'unknown-payload',
    )
  })

  test('does not block forever when internal event flush never settles', async () => {
    const flushed = await flushWithTimeout(() => new Promise<void>(() => {}), 5)

    expect(flushed).toBe(false)
  })
})
