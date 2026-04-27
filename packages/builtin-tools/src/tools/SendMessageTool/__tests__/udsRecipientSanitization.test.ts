import { describe, expect, test } from 'bun:test'

describe('SendMessageTool UDS recipient handling', () => {
  test('redacts inline UDS tokens before classifier and observable paths', async () => {
    const { SendMessageTool } = await import('../SendMessageTool.js')
    const tokenAddress = 'uds:/tmp/peer.sock#token=secret-token'

    const observableInput = {
      to: tokenAddress,
      message: 'hello',
    } as Record<string, unknown>
    SendMessageTool.backfillObservableInput!(observableInput)

    expect(observableInput.recipient).toBe('uds:/tmp/peer.sock')
    expect(JSON.stringify(observableInput)).not.toContain('secret-token')
    expect(
      SendMessageTool.toAutoClassifierInput({
        to: tokenAddress,
        message: 'hello',
      }),
    ).toBe('to uds:/tmp/peer.sock: hello')
  })

  test('keeps redacted UDS token rejection through observable backfill', async () => {
    const { SendMessageTool } = await import('../SendMessageTool.js')
    const observableInput = {
      to: 'uds:/tmp/peer.sock#token=secret-token',
      message: {
        type: 'plan_approval_response',
        request_id: 'req-1',
        approve: false,
        reason: 'needs tests',
      },
    } as Record<string, unknown>

    SendMessageTool.backfillObservableInput!(observableInput)

    expect(observableInput.to).toBe('uds:/tmp/peer.sock')
    expect(observableInput.recipient).toBe('uds:/tmp/peer.sock')
    expect(observableInput.type).toBe('plan_approval_response')
    expect(observableInput.request_id).toBe('req-1')
    expect(observableInput.approve).toBe(false)
    expect(observableInput.content).toBe('needs tests')
    expect(JSON.stringify(observableInput)).not.toContain('secret-token')

    const result = await SendMessageTool.validateInput!(
      observableInput as never,
      {} as never,
    )

    expect(result.result).toBe(false)
    if (result.result !== false) {
      throw new Error('expected validation to reject redacted inline UDS token')
    }
    expect(result.message).toContain('inline auth tokens')
  })

  test('redacts UDS tokens in structured classifier text', async () => {
    const { SendMessageTool } = await import('../SendMessageTool.js')
    const to = 'uds:/tmp/peer.sock#token=secret-token'

    expect(
      SendMessageTool.toAutoClassifierInput({
        to,
        message: { type: 'shutdown_request' },
      }),
    ).toBe('shutdown_request to uds:/tmp/peer.sock')
    expect(
      SendMessageTool.toAutoClassifierInput({
        to,
        message: {
          type: 'plan_approval_response',
          request_id: 'req-1',
          approve: true,
        },
      }),
    ).toBe('plan_approval approve to uds:/tmp/peer.sock')
  })

  test('rejects inline UDS tokens during validation', async () => {
    const { SendMessageTool } = await import('../SendMessageTool.js')
    const result = await SendMessageTool.validateInput!(
      {
        to: 'uds:/tmp/peer.sock#token=secret-token',
        message: 'hello',
      },
      {} as never,
    )

    expect(result.result).toBe(false)
    if (result.result !== false) {
      throw new Error('expected validation to reject inline UDS token')
    }
    expect(result.message).toContain('inline auth tokens')
    expect(JSON.stringify(result)).not.toContain('secret-token')
  })

  test('rejects inline UDS tokens during execution without leaking them', async () => {
    const { SendMessageTool } = await import('../SendMessageTool.js')
    const result = await SendMessageTool.call(
      {
        to: 'uds:/tmp/peer.sock#token=secret-token',
        message: 'hello',
      },
      {} as never,
      undefined as never,
      undefined as never,
    )

    expect(result.data.success).toBe(false)
    expect(JSON.stringify(result)).not.toContain('secret-token')
  })
})
