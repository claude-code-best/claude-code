// Auto-generated stub — replace with real implementation
import type { SDKMessage } from '../entrypoints/sdk/coreTypes.js'
import type { PermissionUpdate } from '../types/permissions.js'
import type { RemoteMessageContent } from '../utils/teleport/api.js'

export interface SSHSessionManagerOptions {
  onMessage: (sdkMessage: SDKMessage) => void
  onPermissionRequest: (
    request: SSHPermissionRequest,
    requestId: string,
  ) => void
  onConnected: () => void
  onReconnecting: (attempt: number, max: number) => void
  onDisconnected: () => void
  onError: (error: Error) => void
}

export interface SSHPermissionRequest {
  tool_name: string
  tool_use_id: string
  description?: string
  permission_suggestions?: PermissionUpdate[]
  blocked_path?: string
  input: { [key: string]: unknown }
}

export interface SSHSessionManager {
  connect(): void
  disconnect(): void
  sendMessage(content: RemoteMessageContent): Promise<boolean>
  sendInterrupt(): void
  respondToPermissionRequest(
    requestId: string,
    response: { behavior: string; message?: string; updatedInput?: unknown },
  ): void
}
