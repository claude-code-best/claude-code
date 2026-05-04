/**
 * Permission bridge: maps Claude Code's canUseTool / PermissionDecision
 * system to ACP's requestPermission() flow.
 *
 * Supports:
 *  - bypassPermissions mode (auto-allow all tools)
 *  - ExitPlanMode special handling (multi-option: Yes+auto/acceptEdits/default/No)
 *  - Always Allow
 *  - Standard allow_once/allow_always/reject_once
 */
import type {
  AgentSideConnection,
  PermissionOption,
  ToolCallUpdate,
  ClientCapabilities,
} from '@agentclientprotocol/sdk'
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js'
import type {
  PermissionAllowDecision,
  PermissionAskDecision,
  PermissionDenyDecision,
} from '../../types/permissions.js'
import type { Tool as ToolType, ToolUseContext } from '../../Tool.js'
import type { AssistantMessage } from '../../types/message.js'
import { hasPermissionsToUseTool } from '../../utils/permissions/permissions.js'
import { toolInfoFromToolUse } from './bridge.js'

/**
 * Creates a CanUseToolFn that delegates permission decisions to the
 * ACP client via requestPermission().
 */
export function createAcpCanUseTool(
  conn: AgentSideConnection,
  sessionId: string,
  getCurrentMode: () => string,
  clientCapabilities?: ClientCapabilities,
  cwd?: string,
  onModeChange?: (modeId: string) => void,
  isBypassModeAvailable?: () => boolean,
): CanUseToolFn {
  return async (
    tool: ToolType,
    input: Record<string, unknown>,
    context: ToolUseContext,
    assistantMessage: AssistantMessage,
    toolUseID: string,
    forceDecision?:
      | PermissionAllowDecision
      | PermissionAskDecision
      | PermissionDenyDecision,
  ): Promise<
    PermissionAllowDecision | PermissionAskDecision | PermissionDenyDecision
  > => {
    const supportsTerminalOutput = checkTerminalOutput(clientCapabilities)

    // ── ExitPlanMode special handling ────────────────────────────
    if (tool.name === 'ExitPlanMode') {
      return handleExitPlanMode(
        conn,
        sessionId,
        toolUseID,
        input,
        supportsTerminalOutput,
        cwd,
        onModeChange,
        isBypassModeAvailable,
      )
    }

    // ── Force decision bypass (used by coordinator/swarm workers) ──
    if (forceDecision !== undefined) {
      return forceDecision
    }

    // ── Run through the normal permission pipeline ────────────────
    // This handles: deny rules, allow rules, tool-specific checks,
    // bypassPermissions mode, dontAsk mode, acceptEdits mode, auto mode classifier
    try {
      const pipelineResult = await hasPermissionsToUseTool(
        tool,
        input,
        context,
        assistantMessage,
        toolUseID,
      )

      // If the pipeline resolved to allow or deny, return that
      if (pipelineResult.behavior === 'allow') {
        return pipelineResult as PermissionAllowDecision
      }
      if (pipelineResult.behavior === 'deny') {
        return pipelineResult as PermissionDenyDecision
      }
      // behavior === 'ask' → fall through to client delegation
    } catch (err) {
      console.error('[ACP Permissions] Pipeline error:', err)
      return {
        behavior: 'deny',
        message: 'Permission pipeline failed',
        decisionReason: {
          type: 'other',
          reason: 'Permission pipeline failed',
        },
        toolUseID,
      }
    }

    // ── Delegate to ACP client for interactive permission decision ──
    const info = toolInfoFromToolUse(
      { name: tool.name, id: toolUseID, input },
      supportsTerminalOutput,
      cwd,
    )

    const toolCall: ToolCallUpdate = {
      toolCallId: toolUseID,
      title: info.title,
      kind: info.kind,
      status: 'pending',
      rawInput: input,
    }

    const options: Array<PermissionOption> = [
      { kind: 'allow_always', name: 'Always Allow', optionId: 'allow_always' },
      { kind: 'allow_once', name: 'Allow', optionId: 'allow' },
      { kind: 'reject_once', name: 'Reject', optionId: 'reject' },
    ]

    try {
      const response = await conn.requestPermission({
        sessionId,
        toolCall,
        options,
      })

      if (response.outcome.outcome === 'cancelled') {
        return {
          behavior: 'deny',
          message: 'Permission request cancelled by client',
          decisionReason: { type: 'mode', mode: 'default' },
        }
      }

      if (
        response.outcome.outcome === 'selected' &&
        'optionId' in response.outcome &&
        response.outcome.optionId !== undefined
      ) {
        const optionId = response.outcome.optionId
        if (optionId === 'allow' || optionId === 'allow_always') {
          return {
            behavior: 'allow',
            updatedInput: input,
          }
        }
      }

      // Default: deny
      return {
        behavior: 'deny',
        message: 'Permission denied by client',
        decisionReason: { type: 'mode', mode: 'default' },
      }
    } catch (err) {
      console.error('[ACP Permissions] Client request error:', err)
      return {
        behavior: 'deny',
        message: 'Permission request failed',
        decisionReason: { type: 'mode', mode: 'default' },
      }
    }
  }
}

async function handleExitPlanMode(
  conn: AgentSideConnection,
  sessionId: string,
  toolUseID: string,
  input: Record<string, unknown>,
  supportsTerminalOutput: boolean,
  cwd?: string,
  onModeChange?: (modeId: string) => void,
  isBypassModeAvailable?: () => boolean,
): Promise<PermissionAllowDecision | PermissionDenyDecision> {
  const options: Array<PermissionOption> = [
    {
      kind: 'allow_always',
      name: 'Yes, and use "auto" mode',
      optionId: 'auto',
    },
    {
      kind: 'allow_always',
      name: 'Yes, and auto-accept edits',
      optionId: 'acceptEdits',
    },
    {
      kind: 'allow_once',
      name: 'Yes, and manually approve edits',
      optionId: 'default',
    },
    { kind: 'reject_once', name: 'No, keep planning', optionId: 'plan' },
  ]
  if (isBypassModeAvailable?.() === true) {
    options.unshift({
      kind: 'allow_always',
      name: 'Yes, and bypass permissions',
      optionId: 'bypassPermissions',
    })
  }

  const info = toolInfoFromToolUse(
    { name: 'ExitPlanMode', id: toolUseID, input },
    supportsTerminalOutput,
    cwd,
  )

  const toolCall: ToolCallUpdate = {
    toolCallId: toolUseID,
    title: info.title,
    kind: info.kind,
    status: 'pending',
    rawInput: input,
  }

  const response = await conn.requestPermission({
    sessionId,
    toolCall,
    options,
  })

  if (response.outcome.outcome === 'cancelled') {
    return {
      behavior: 'deny',
      message: 'Tool use aborted',
      decisionReason: { type: 'mode', mode: 'default' },
    }
  }

  if (
    response.outcome.outcome === 'selected' &&
    'optionId' in response.outcome &&
    response.outcome.optionId !== undefined
  ) {
    const selectedOption = response.outcome.optionId
    const isOfferedOption = options.some(
      option => option.optionId === selectedOption,
    )
    if (
      isOfferedOption &&
      (selectedOption === 'default' ||
        selectedOption === 'acceptEdits' ||
        selectedOption === 'auto' ||
        selectedOption === 'bypassPermissions')
    ) {
      // Sync mode to session state and appState
      onModeChange?.(selectedOption)

      await conn.sessionUpdate({
        sessionId,
        update: {
          sessionUpdate: 'current_mode_update',
          currentModeId: selectedOption,
        },
      })

      return {
        behavior: 'allow',
        updatedInput: input,
      }
    }
  }

  return {
    behavior: 'deny',
    message: 'User rejected request to exit plan mode.',
    decisionReason: { type: 'mode', mode: 'plan' },
  }
}

function checkTerminalOutput(clientCapabilities?: ClientCapabilities): boolean {
  if (!clientCapabilities) return false
  const meta = (clientCapabilities as unknown as Record<string, unknown>)._meta
  if (!meta || typeof meta !== 'object') return false
  return (meta as Record<string, unknown>)['terminal_output'] === true
}
