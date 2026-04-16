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
import { toolInfoFromToolUse } from './bridge.js'

const IS_ROOT =
  typeof process.geteuid === 'function'
    ? process.geteuid() === 0
    : typeof process.getuid === 'function'
      ? process.getuid() === 0
      : false
const ALLOW_BYPASS = !IS_ROOT || !!process.env.IS_SANDBOX

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
): CanUseToolFn {
  return async (
    tool: ToolType,
    input: Record<string, unknown>,
    _context: ToolUseContext,
    _assistantMessage: AssistantMessage,
    toolUseID: string,
    _forceDecision?: PermissionAllowDecision | PermissionAskDecision | PermissionDenyDecision,
  ): Promise<PermissionAllowDecision | PermissionAskDecision | PermissionDenyDecision> => {
    const supportsTerminalOutput = checkTerminalOutput(clientCapabilities)

    // ── ExitPlanMode special handling ────────────────────────────
    if (tool.name === 'ExitPlanMode') {
      return handleExitPlanMode(conn, sessionId, toolUseID, input, supportsTerminalOutput, cwd)
    }

    // ── bypassPermissions mode ───────────────────────────────────
    if (getCurrentMode() === 'bypassPermissions') {
      return {
        behavior: 'allow',
        updatedInput: input,
      }
    }

    // ── Standard tool permission ─────────────────────────────────
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
    } catch {
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
): Promise<PermissionAllowDecision | PermissionDenyDecision> {
  const options: Array<PermissionOption> = [
    { kind: 'allow_always', name: 'Yes, and use "auto" mode', optionId: 'auto' },
    { kind: 'allow_always', name: 'Yes, and auto-accept edits', optionId: 'acceptEdits' },
    { kind: 'allow_once', name: 'Yes, and manually approve edits', optionId: 'default' },
    { kind: 'reject_once', name: 'No, keep planning', optionId: 'plan' },
  ]
  if (ALLOW_BYPASS) {
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
    if (
      selectedOption === 'default' ||
      selectedOption === 'acceptEdits' ||
      selectedOption === 'auto' ||
      selectedOption === 'bypassPermissions'
    ) {
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
