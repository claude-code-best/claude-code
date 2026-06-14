import {
  createHostHandle,
  unwrapHostHandle,
  type HostHandle,
} from '@claude-code-best/workflow-engine'
import type { CanUseToolFn } from '../hooks/useCanUseTool.js'
import type { AssistantMessage } from '../types/message.js'
import type { AgentId } from '../types/ids.js'
import type { ToolUseContext } from '../Tool.js'

/** Opaque bundle held inside HostHandle (unpacked on the core side). */
export type WorkflowHostBundle = {
  toolUseContext: ToolUseContext
  canUseTool: CanUseToolFn
  parentMessage?: AssistantMessage
  agentId?: AgentId
}

/**
 * Shared: builds the host bundle from toolUseContext/canUseTool.
 * parentMessage is optional (absent on the panel launch path — claudeCodeBackend never reads it).
 */
export function buildHostBundle(
  toolUseContext: WorkflowHostBundle['toolUseContext'],
  canUseTool: WorkflowHostBundle['canUseTool'],
  parentMessage?: AssistantMessage,
): WorkflowHostBundle {
  return {
    toolUseContext,
    canUseTool,
    ...(parentMessage !== undefined ? { parentMessage } : {}),
    agentId: toolUseContext.agentId,
  }
}

export function makeHostHandle(bundle: WorkflowHostBundle): HostHandle {
  return createHostHandle(bundle)
}

export function readHostBundle(handle: HostHandle): WorkflowHostBundle {
  return unwrapHostHandle(handle) as WorkflowHostBundle
}
