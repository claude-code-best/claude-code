import { describe, expect, test } from 'bun:test'

import { parseBridgePermissionResponse } from '../bridgePermissionCallbacks.js'
import type { SDKControlResponse } from '../../entrypoints/sdk/controlTypes.js'

describe('parseBridgePermissionResponse', () => {
  test('passes through allow responses', () => {
    const message: SDKControlResponse = {
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: 'req-1',
        response: {
          behavior: 'allow',
          updatedPermissions: [
            { type: 'setMode', mode: 'acceptEdits', destination: 'session' },
          ],
        },
      },
    }

    expect(parseBridgePermissionResponse(message)).toEqual({
      behavior: 'allow',
      updatedPermissions: [
        { type: 'setMode', mode: 'acceptEdits', destination: 'session' },
      ],
    })
  })

  test('maps error responses with feedback to deny', () => {
    const message = {
      type: 'control_response',
      response: {
        subtype: 'error',
        request_id: 'req-2',
        error: 'Permission denied by user',
        response: { behavior: 'deny' },
        message: 'Need more detail',
      },
    } as unknown as SDKControlResponse

    expect(parseBridgePermissionResponse(message)).toEqual({
      behavior: 'deny',
      message: 'Need more detail',
    })
  })

  test('falls back to error text when deny feedback is absent', () => {
    const message = {
      type: 'control_response',
      response: {
        subtype: 'error',
        request_id: 'req-3',
        error: 'Permission denied by user',
      },
    } as unknown as SDKControlResponse

    expect(parseBridgePermissionResponse(message)).toEqual({
      behavior: 'deny',
      message: 'Permission denied by user',
    })
  })

  test('returns null for unrelated control responses', () => {
    const message = {
      type: 'control_response',
      response: {
        subtype: 'error',
        request_id: 'req-4',
        error: '',
      },
    } as unknown as SDKControlResponse

    expect(parseBridgePermissionResponse(message)).toBeNull()
  })
})
