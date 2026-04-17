import type { PermissionUpdate } from '../utils/permissions/PermissionUpdateSchema.js'
import type { SDKControlResponse } from '../entrypoints/sdk/controlTypes.js'

type BridgePermissionResponse = {
  behavior: 'allow' | 'deny'
  updatedInput?: Record<string, unknown>
  updatedPermissions?: PermissionUpdate[]
  message?: string
}

type BridgePermissionCallbacks = {
  sendRequest(
    requestId: string,
    toolName: string,
    input: Record<string, unknown>,
    toolUseId: string,
    description: string,
    permissionSuggestions?: PermissionUpdate[],
    blockedPath?: string,
  ): void
  sendResponse(requestId: string, response: BridgePermissionResponse): void
  /** Cancel a pending control_request so the web app can dismiss its prompt. */
  cancelRequest(requestId: string): void
  onResponse(
    requestId: string,
    handler: (response: BridgePermissionResponse) => void,
  ): () => void // returns unsubscribe
}

/** Type predicate for validating a parsed control_response payload
 *  as a BridgePermissionResponse. Checks the required `behavior`
 *  discriminant rather than using an unsafe `as` cast. */
function isBridgePermissionResponse(
  value: unknown,
): value is BridgePermissionResponse {
  if (!value || typeof value !== 'object') return false
  return (
    'behavior' in value &&
    (value.behavior === 'allow' || value.behavior === 'deny')
  )
}

function toBridgePermissionMessage(
  controlResponse: Record<string, unknown>,
  parsed: BridgePermissionResponse | undefined,
): string | undefined {
  if (typeof controlResponse.message === 'string' && controlResponse.message) {
    return controlResponse.message
  }
  if (typeof parsed?.message === 'string' && parsed.message) {
    return parsed.message
  }
  if (typeof controlResponse.error === 'string' && controlResponse.error) {
    return controlResponse.error
  }
  return undefined
}

/**
 * Normalize a control_response from the bridge transport into the simplified
 * allow/deny shape used by interactive permission handlers.
 */
function parseBridgePermissionResponse(
  message: SDKControlResponse,
): BridgePermissionResponse | null {
  const controlResponse = message.response
  if (!controlResponse || typeof controlResponse !== 'object') return null

  if (
    controlResponse.subtype === 'success' &&
    'response' in controlResponse &&
    isBridgePermissionResponse(controlResponse.response)
  ) {
    return controlResponse.response
  }

  if (controlResponse.subtype !== 'error') {
    return null
  }

  const nested =
    'response' in controlResponse &&
    isBridgePermissionResponse(controlResponse.response)
      ? controlResponse.response
      : undefined

  const messageText = toBridgePermissionMessage(controlResponse, nested)

  if (nested) {
    return messageText ? { ...nested, message: messageText } : nested
  }

  if (messageText) {
    return {
      behavior: 'deny',
      message: messageText,
    }
  }

  return null
}

export { isBridgePermissionResponse, parseBridgePermissionResponse }
export type { BridgePermissionCallbacks, BridgePermissionResponse }
