import { describe, expect, mock, test } from 'bun:test'

mock.module('bun:bundle', () => ({
  feature: (name: string) => name === 'UDS_INBOX',
}))

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
    expect(JSON.stringify(result)).not.toContain('secret-token')
  })
})
