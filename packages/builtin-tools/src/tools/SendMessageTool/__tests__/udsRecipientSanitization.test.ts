import { describe, expect, test } from 'bun:test'
import { SendMessageTool } from '../SendMessageTool.js'

describe('SendMessageTool UDS recipient handling', () => {
  test('redacts inline UDS tokens before classifier and observable paths', async () => {
    const tokenAddress = 'uds:/tmp/peer.sock#token=secret-token'

    const observableInput = {
      to: tokenAddress,
      message: 'hello',
    } as Record<string, unknown>
    SendMessageTool.backfillObservableInput!(observableInput)

    expect(observableInput.recipient).toBe('uds:/tmp/peer.sock')
    expect(observableInput.to).toBe('uds:/tmp/peer.sock#token=')
    expect(JSON.stringify(observableInput)).not.toContain('secret-token')
    expect(
      SendMessageTool.toAutoClassifierInput({
        to: tokenAddress,
        message: 'hello',
      }),
    ).toBe('to uds:/tmp/peer.sock: hello')
  })

  test('keeps redacted UDS token rejection through observable backfill', async () => {
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

    expect(observableInput.to).toBe('uds:/tmp/peer.sock#token=')
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

  test('keeps inline-token rejection when observable input is cloned', async () => {
    const observableInput = {
      to: 'uds:/tmp/peer.sock#token=secret-token',
      message: 'hello',
    } as Record<string, unknown>

    SendMessageTool.backfillObservableInput!(observableInput)
    const clonedInput = {
      to: observableInput.to,
      message: observableInput.message,
      summary: 'hello peer',
    }

    const validation = await SendMessageTool.validateInput!(
      clonedInput as never,
      {} as never,
    )
    const result = await SendMessageTool.call(
      clonedInput as never,
      {} as never,
      undefined as never,
      undefined as never,
    )

    expect(validation.result).toBe(false)
    expect(result.data.success).toBe(false)
    expect(JSON.stringify(clonedInput)).not.toContain('secret-token')
    expect(JSON.stringify(result)).not.toContain('secret-token')
  })

  test('redacts UDS tokens in structured classifier text', async () => {
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
    expect(
      SendMessageTool.toAutoClassifierInput({
        to,
        message: {
          type: 'plan_approval_response',
          request_id: 'req-2',
          approve: false,
        },
      }),
    ).toBe('plan_approval reject to uds:/tmp/peer.sock')
    expect(
      SendMessageTool.toAutoClassifierInput({
        to,
        message: {
          type: 'shutdown_response',
          request_id: 'shutdown-1',
          approve: false,
        },
      }),
    ).toBe('shutdown_response reject shutdown-1')
  })

  test('redacts from the first inline UDS token marker', async () => {
    const tokenAddress = 'uds:/tmp/peer.sock#token=first#token=second'

    const observableInput = {
      to: tokenAddress,
      message: 'hello',
    } as Record<string, unknown>
    SendMessageTool.backfillObservableInput!(observableInput)

    expect(observableInput.to).toBe('uds:/tmp/peer.sock#token=')
    expect(observableInput.recipient).toBe('uds:/tmp/peer.sock')
    expect(JSON.stringify(observableInput)).not.toContain('first')
    expect(JSON.stringify(observableInput)).not.toContain('second')
    expect(
      SendMessageTool.toAutoClassifierInput({
        to: tokenAddress,
        message: 'hello',
      }),
    ).toBe('to uds:/tmp/peer.sock: hello')
  })

  test('rejects inline UDS tokens during validation', async () => {
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
