import { afterEach, describe, expect, test } from 'bun:test'
import {
  clearPendingPipePermissions,
  resolvePipePermissionResponse,
  tryRelayPipePermissionRequest,
  setPipeRelay,
} from '../pipePermissionRelay.js'

afterEach(() => {
  setPipeRelay(null)
  clearPendingPipePermissions()
})

function makeToolUseConfirm(overrides: Record<string, unknown> = {}) {
  return {
    assistantMessage: { message: { id: 'msg-1' } },
    tool: { name: 'Bash' },
    description: 'Run command',
    input: { command: 'echo hello' },
    toolUseID: 'tool-1',
    permissionResult: { behavior: 'ask', message: 'Approve?' },
    permissionPromptStartTimeMs: 1,
    ...overrides,
  } as any
}

describe('pipe permission relay', () => {
  test('serializes permission requests through the active pipe sender', () => {
    const sent: any[] = []
    setPipeRelay((message: any) => {
      sent.push(message)
    })

    const requestId = tryRelayPipePermissionRequest(
      makeToolUseConfirm(),
      () => {},
    )

    expect(requestId).toBeString()
    expect(sent).toHaveLength(1)
    expect(sent[0].type).toBe('permission_request')
    const payload = JSON.parse(sent[0].data)
    expect(payload.requestId).toBe(requestId)
    expect(payload.toolName).toBe('Bash')
    expect(payload.input).toEqual({ command: 'echo hello' })
  })

  test('dispatches permission responses to the pending request handler', () => {
    setPipeRelay(() => {})
    const seen: any[] = []
    const requestId = tryRelayPipePermissionRequest(
      makeToolUseConfirm(),
      payload => {
        seen.push(payload)
      },
    )

    expect(requestId).toBeString()
    const resolved = resolvePipePermissionResponse({
      requestId: requestId!,
      behavior: 'allow',
      updatedInput: { command: 'echo ok' },
      permissionUpdates: [],
    })

    expect(resolved).toBe(true)
    expect(seen).toEqual([
      {
        requestId,
        behavior: 'allow',
        updatedInput: { command: 'echo ok' },
        permissionUpdates: [],
      },
    ])
  })
})
