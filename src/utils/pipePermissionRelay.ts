import { randomUUID } from 'crypto'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import type { ToolUseConfirm } from '../components/permissions/PermissionRequest.js'
import type {
  PipeMessage,
  PipePermissionRequestPayload,
  PipePermissionResponsePayload,
} from './pipeTransport.js'
import type { PermissionUpdate } from './permissions/PermissionUpdateSchema.js'

type PendingPipePermission = {
  onResponse: (payload: PipePermissionResponsePayload) => void
}

const pendingPipePermissions = new Map<string, PendingPipePermission>()

// Module-level singleton for the relay function to master.
// Replaces the old (globalThis as any).__pipeSendToMaster pattern.
type PipeRelayFn = (message: PipeMessage) => void
let _pipeRelay: PipeRelayFn | null = null

// Slave-side mute flag: when true, relayPipeMessage() and permission
// relay functions will short-circuit. Set by relay_mute / relay_unmute
// control messages from master.
let _relayMuted = false

export function setRelayMuted(muted: boolean): void {
  _relayMuted = muted
}

export function isRelayMuted(): boolean {
  return _relayMuted
}

export function setPipeRelay(fn: PipeRelayFn | null): void {
  _pipeRelay = fn
  if (!fn) _relayMuted = false // reset on disconnect
}

export function getPipeRelay(): PipeRelayFn | null {
  return _pipeRelay
}

function getPipeSender(): ((message: PipeMessage) => void) | null {
  return _pipeRelay ?? null
}

export function tryRelayPipePermissionRequest(
  toolUseConfirm: ToolUseConfirm,
  onResponse: (payload: PipePermissionResponsePayload) => void,
): string | null {
  if (_relayMuted) return null
  const send = getPipeSender()
  if (!send) return null

  const requestId = randomUUID()
  const payload: PipePermissionRequestPayload = {
    requestId,
    toolName: toolUseConfirm.tool.name,
    toolUseID: toolUseConfirm.toolUseID,
    description: toolUseConfirm.description,
    input: toolUseConfirm.input as Record<string, unknown>,
    permissionResult: toolUseConfirm.permissionResult,
    permissionPromptStartTimeMs: toolUseConfirm.permissionPromptStartTimeMs,
  }

  pendingPipePermissions.set(requestId, { onResponse })
  send({ type: 'permission_request', data: JSON.stringify(payload) })
  return requestId
}

export function resolvePipePermissionResponse(
  payload: PipePermissionResponsePayload,
): boolean {
  const pending = pendingPipePermissions.get(payload.requestId)
  if (!pending) return false
  pendingPipePermissions.delete(payload.requestId)
  pending.onResponse(payload)
  return true
}

export function cancelPipePermissionRequest(
  requestId: string,
  reason?: string,
): boolean {
  const pending = pendingPipePermissions.get(requestId)
  if (!pending) return false
  pendingPipePermissions.delete(requestId)
  pending.onResponse({
    requestId,
    behavior: 'deny',
    feedback: reason ?? 'Permission request was cancelled by main.',
  })
  return true
}

export function forgetPipePermissionRequest(
  requestId: string | null | undefined,
): void {
  if (!requestId) return
  pendingPipePermissions.delete(requestId)
}

export function notifyPipePermissionCancel(
  requestId: string | null | undefined,
  reason?: string,
): void {
  if (!requestId) return
  if (_relayMuted) return
  const send = getPipeSender()
  if (!send) return
  send({
    type: 'permission_cancel',
    data: JSON.stringify({ requestId, reason }),
  })
}

export function clearPendingPipePermissions(
  reason = 'Pipe permission relay was disconnected.',
): void {
  for (const requestId of [...pendingPipePermissions.keys()]) {
    cancelPipePermissionRequest(requestId, reason)
  }
}

export function makePipePermissionResponsePayload(
  requestId: string,
  behavior: 'allow',
  updatedInput: Record<string, unknown>,
  permissionUpdates: PermissionUpdate[],
  feedback?: string,
  contentBlocks?: ContentBlockParam[],
): PipePermissionResponsePayload
export function makePipePermissionResponsePayload(
  requestId: string,
  behavior: 'deny',
  feedback?: string,
  contentBlocks?: ContentBlockParam[],
): PipePermissionResponsePayload
export function makePipePermissionResponsePayload(
  requestId: string,
  behavior: 'allow' | 'deny',
  updatedInputOrFeedback?: Record<string, unknown> | string,
  permissionUpdatesOrContentBlocks?: PermissionUpdate[] | ContentBlockParam[],
  feedback?: string,
  contentBlocks?: ContentBlockParam[],
): PipePermissionResponsePayload {
  if (behavior === 'allow') {
    return {
      requestId,
      behavior,
      updatedInput:
        (updatedInputOrFeedback as Record<string, unknown> | undefined) ?? {},
      permissionUpdates:
        (permissionUpdatesOrContentBlocks as PermissionUpdate[] | undefined) ??
        [],
      feedback,
      contentBlocks,
    }
  }

  return {
    requestId,
    behavior,
    feedback: updatedInputOrFeedback as string | undefined,
    contentBlocks: permissionUpdatesOrContentBlocks as
      | ContentBlockParam[]
      | undefined,
  }
}
