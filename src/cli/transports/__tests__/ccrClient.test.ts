import { describe, expect, test } from 'bun:test'
import { buildCCRWorkerEventRequest } from '../ccrClient.js'

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
})
