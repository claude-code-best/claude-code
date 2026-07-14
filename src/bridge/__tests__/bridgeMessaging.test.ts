import { describe, expect, test } from 'bun:test'

import {
  BoundedUUIDSet,
  handleIngressMessage,
  handleServerControlRequest,
  shouldReportRunningForMessage,
  shouldReportRunningForMessages,
} from '../bridgeMessaging.js'
import type { SDKControlRequest } from '../../entrypoints/sdk/controlTypes.js'
import type { ReplBridgeTransport } from '../replBridgeTransport.js'
import { createUserMessage } from '../../utils/messages.js'

describe('bridge running-state classification', () => {
  test('treats real user prompts as turn-starting work', () => {
    expect(
      shouldReportRunningForMessage(
        createUserMessage({ content: 'please inspect the repo' }),
      ),
    ).toBe(true)
  })

  test('keeps tool-result style user messages eligible during mid-turn attach', () => {
    expect(
      shouldReportRunningForMessage(
        createUserMessage({
          content: '<local-command-stdout>done</local-command-stdout>',
          toolUseResult: { ok: true },
        }),
      ),
    ).toBe(true)
  })

  test('ignores local slash-command scaffolding that should not reopen a turn', () => {
    expect(
      shouldReportRunningForMessage(
        createUserMessage({
          content:
            '<local-command-caveat>Caveat: hidden local command scaffolding</local-command-caveat>',
          isMeta: true,
        }),
      ),
    ).toBe(false)

    expect(
      shouldReportRunningForMessage(
        createUserMessage({
          content:
            '<system-reminder>\nProactive mode is now enabled. You will receive periodic <tick> prompts.\n</system-reminder>',
          isMeta: true,
        }),
      ),
    ).toBe(false)
  })

  test('still marks real automation triggers as running', () => {
    expect(
      shouldReportRunningForMessage(
        createUserMessage({
          content: '<tick>2:56:47 PM</tick>',
          isMeta: true,
        }),
      ),
    ).toBe(true)

    expect(
      shouldReportRunningForMessage(
        createUserMessage({
          content: 'scheduled job: refresh analytics cache',
          isMeta: true,
        }),
      ),
    ).toBe(true)
  })

  test('classifies batches by any work-starting message', () => {
    const scaffoldingOnly = [
      createUserMessage({
        content:
          '<local-command-caveat>Caveat: hidden local command scaffolding</local-command-caveat>',
        isMeta: true,
      }),
      createUserMessage({
        content:
          '<system-reminder>\nProactive mode is now enabled.\n</system-reminder>',
        isMeta: true,
      }),
    ]
    expect(shouldReportRunningForMessages(scaffoldingOnly)).toBe(false)

    expect(
      shouldReportRunningForMessages([
        ...scaffoldingOnly,
        createUserMessage({
          content: '<tick>2:57:17 PM</tick>',
          isMeta: true,
        }),
      ]),
    ).toBe(true)
  })
})

describe('handleIngressMessage control_request dedup', () => {
  function ingest(
    data: string,
    inbound: BoundedUUIDSet,
    received: SDKControlRequest[],
  ): void {
    handleIngressMessage(
      data,
      new BoundedUUIDSet(8),
      inbound,
      undefined,
      undefined,
      request => received.push(request),
    )
  }

  test('forwards a control_request once and drops replays of the same request_id', () => {
    const inbound = new BoundedUUIDSet(8)
    const received: SDKControlRequest[] = []
    const frame = JSON.stringify({
      type: 'control_request',
      request_id: 'req-1',
      request: { subtype: 'interrupt' },
    })

    ingest(frame, inbound, received)
    ingest(frame, inbound, received)

    expect(received).toHaveLength(1)
    expect(received[0]!.request_id).toBe('req-1')
  })

  test('forwards distinct request_ids independently', () => {
    const inbound = new BoundedUUIDSet(8)
    const received: SDKControlRequest[] = []
    for (const id of ['req-a', 'req-b']) {
      ingest(
        JSON.stringify({
          type: 'control_request',
          request_id: id,
          request: { subtype: 'set_permission_mode', mode: 'plan' },
        }),
        inbound,
        received,
      )
    }
    expect(received.map(r => r.request_id)).toEqual(['req-a', 'req-b'])
  })
})

describe('handleIngressMessage delivery lifecycle', () => {
  test('marks a durable user event processed only after the final handler resolves', async () => {
    let resolveHandler!: () => void
    const handled = new Promise<void>(resolve => {
      resolveHandler = resolve
    })
    const deliveries: Array<[string, 'processing' | 'processed']> = []

    handleIngressMessage(
      JSON.stringify({
        type: 'user',
        uuid: 'event-1',
        message: { role: 'user', content: 'hello' },
      }),
      new BoundedUUIDSet(8),
      new BoundedUUIDSet(8),
      () => handled,
      undefined,
      undefined,
      (eventId, status) => deliveries.push([eventId, status]),
    )

    expect(deliveries).toEqual([['event-1', 'processing']])
    resolveHandler()
    await handled
    await Promise.resolve()
    expect(deliveries).toEqual([
      ['event-1', 'processing'],
      ['event-1', 'processed'],
    ])
  })

  test('does not mark a failed final handler as processed', async () => {
    const deliveries: Array<[string, 'processing' | 'processed']> = []

    handleIngressMessage(
      JSON.stringify({
        type: 'user',
        uuid: 'event-failed',
        message: { role: 'user', content: 'hello' },
      }),
      new BoundedUUIDSet(8),
      new BoundedUUIDSet(8),
      async () => {
        throw new Error('not accepted')
      },
      undefined,
      undefined,
      (eventId, status) => deliveries.push([eventId, status]),
    )

    await Promise.resolve()
    await Promise.resolve()
    expect(deliveries).toEqual([['event-failed', 'processing']])
  })
})

describe('runtime center control requests', () => {
  test('routes supported Goal and Workflow controls through the host callback', () => {
    const writes: unknown[] = []
    const received: Array<{
      subtype: string
      params: Record<string, unknown>
    }> = []
    const transport = {
      write(event: unknown) {
        writes.push(event)
        return Promise.resolve()
      },
    } as unknown as ReplBridgeTransport

    handleServerControlRequest(
      {
        type: 'control_request',
        request_id: 'runtime-1',
        request: { subtype: 'workflow_kill', run_id: 'run-1' },
      } as unknown as SDKControlRequest,
      {
        transport,
        sessionId: 'session-1',
        onRuntimeControl(subtype, params) {
          received.push({ subtype, params })
          return { ok: true, response: { killed: true } }
        },
      },
    )

    expect(received).toEqual([
      {
        subtype: 'workflow_kill',
        params: { subtype: 'workflow_kill', run_id: 'run-1' },
      },
    ])
    expect(writes).toEqual([
      expect.objectContaining({
        session_id: 'session-1',
        response: expect.objectContaining({
          subtype: 'success',
          request_id: 'runtime-1',
          response: { killed: true },
        }),
      }),
    ])
  })
})
