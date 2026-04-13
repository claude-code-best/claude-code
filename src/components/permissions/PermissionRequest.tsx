import { feature } from 'bun:bundle'
import * as React from 'react'
import { EnterPlanModeTool } from '@claude-code-best/builtin-tools/tools/EnterPlanModeTool/EnterPlanModeTool.js'
import { ExitPlanModeV2Tool } from '@claude-code-best/builtin-tools/tools/ExitPlanModeTool/ExitPlanModeV2Tool.js'
import { useNotifyAfterTimeout } from '../../hooks/useNotifyAfterTimeout.js'
import { useKeybinding } from '../../keybindings/useKeybinding.js'
import type { AnyObject, Tool, ToolUseContext } from '../../Tool.js'
import { AskUserQuestionTool } from '@claude-code-best/builtin-tools/tools/AskUserQuestionTool/AskUserQuestionTool.js'
import { BashTool } from '@claude-code-best/builtin-tools/tools/BashTool/BashTool.js'
import { FileEditTool } from '@claude-code-best/builtin-tools/tools/FileEditTool/FileEditTool.js'
import { FileReadTool } from '@claude-code-best/builtin-tools/tools/FileReadTool/FileReadTool.js'
import { FileWriteTool } from '@claude-code-best/builtin-tools/tools/FileWriteTool/FileWriteTool.js'
import { GlobTool } from '@claude-code-best/builtin-tools/tools/GlobTool/GlobTool.js'
import { GrepTool } from '@claude-code-best/builtin-tools/tools/GrepTool/GrepTool.js'
import { NotebookEditTool } from '@claude-code-best/builtin-tools/tools/NotebookEditTool/NotebookEditTool.js'
import { PowerShellTool } from '@claude-code-best/builtin-tools/tools/PowerShellTool/PowerShellTool.js'
import { SkillTool } from '@claude-code-best/builtin-tools/tools/SkillTool/SkillTool.js'
import { WebFetchTool } from '@claude-code-best/builtin-tools/tools/WebFetchTool/WebFetchTool.js'
import type { AssistantMessage } from '../../types/message.js'
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js'
import { AskUserQuestionPermissionRequest } from './AskUserQuestionPermissionRequest/AskUserQuestionPermissionRequest.js'
import { BashPermissionRequest } from './BashPermissionRequest/BashPermissionRequest.js'
import { EnterPlanModePermissionRequest } from './EnterPlanModePermissionRequest/EnterPlanModePermissionRequest.js'
import { ExitPlanModePermissionRequest } from './ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.js'
import { FallbackPermissionRequest } from './FallbackPermissionRequest.js'
import { FileEditPermissionRequest } from './FileEditPermissionRequest/FileEditPermissionRequest.js'
import { FilesystemPermissionRequest } from './FilesystemPermissionRequest/FilesystemPermissionRequest.js'
import { FileWritePermissionRequest } from './FileWritePermissionRequest/FileWritePermissionRequest.js'
import { NotebookEditPermissionRequest } from './NotebookEditPermissionRequest/NotebookEditPermissionRequest.js'
import { PowerShellPermissionRequest } from './PowerShellPermissionRequest/PowerShellPermissionRequest.js'
import { SkillPermissionRequest } from './SkillPermissionRequest/SkillPermissionRequest.js'
import { WebFetchPermissionRequest } from './WebFetchPermissionRequest/WebFetchPermissionRequest.js'

/* eslint-disable @typescript-eslint/no-require-imports */
const ReviewArtifactTool = feature('REVIEW_ARTIFACT')
  ? (
      require('@claude-code-best/builtin-tools/tools/ReviewArtifactTool/ReviewArtifactTool.js') as typeof import('@claude-code-best/builtin-tools/tools/ReviewArtifactTool/ReviewArtifactTool.js')
    ).ReviewArtifactTool
  : null

const ReviewArtifactPermissionRequest = feature('REVIEW_ARTIFACT')
  ? (
      require('./ReviewArtifactPermissionRequest/ReviewArtifactPermissionRequest.js') as typeof import('./ReviewArtifactPermissionRequest/ReviewArtifactPermissionRequest.js')
    ).ReviewArtifactPermissionRequest
  : null

const WorkflowTool = feature('WORKFLOW_SCRIPTS')
  ? (
      require('@claude-code-best/builtin-tools/tools/WorkflowTool/WorkflowTool.js') as typeof import('@claude-code-best/builtin-tools/tools/WorkflowTool/WorkflowTool.js')
    ).WorkflowTool
  : null

const WorkflowPermissionRequest = feature('WORKFLOW_SCRIPTS')
  ? (
      require('@claude-code-best/builtin-tools/tools/WorkflowTool/WorkflowPermissionRequest.js') as typeof import('@claude-code-best/builtin-tools/tools/WorkflowTool/WorkflowPermissionRequest.js')
    ).WorkflowPermissionRequest
  : null

const MonitorTool = feature('MONITOR_TOOL')
  ? (
      require('@claude-code-best/builtin-tools/tools/MonitorTool/MonitorTool.js') as typeof import('@claude-code-best/builtin-tools/tools/MonitorTool/MonitorTool.js')
    ).MonitorTool
  : null

const MonitorPermissionRequest = feature('MONITOR_TOOL')
  ? (
      require('./MonitorPermissionRequest/MonitorPermissionRequest.js') as typeof import('./MonitorPermissionRequest/MonitorPermissionRequest.js')
    ).MonitorPermissionRequest
  : null

import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'
/* eslint-enable @typescript-eslint/no-require-imports */
import type { z } from 'zod/v4'
import type { PermissionUpdate } from '../../utils/permissions/PermissionUpdateSchema.js'
import type { WorkerBadgeProps } from './WorkerBadge.js'

function permissionComponentForTool(
  tool: Tool,
): React.ComponentType<PermissionRequestProps> {
  switch (tool) {
    case FileEditTool:
      return FileEditPermissionRequest
    case FileWriteTool:
      return FileWritePermissionRequest
    case BashTool:
      return BashPermissionRequest
    case PowerShellTool:
      return PowerShellPermissionRequest
    case ReviewArtifactTool:
      return ReviewArtifactPermissionRequest ?? FallbackPermissionRequest
    case WebFetchTool:
      return WebFetchPermissionRequest
    case NotebookEditTool:
      return NotebookEditPermissionRequest
    case ExitPlanModeV2Tool:
      return ExitPlanModePermissionRequest
    case EnterPlanModeTool:
      return EnterPlanModePermissionRequest
    case SkillTool:
      return SkillPermissionRequest
    case AskUserQuestionTool:
      return AskUserQuestionPermissionRequest
    case WorkflowTool:
      return WorkflowPermissionRequest ?? FallbackPermissionRequest
    case MonitorTool:
      return MonitorPermissionRequest ?? FallbackPermissionRequest
    case GlobTool:
    case GrepTool:
    case FileReadTool:
      return FilesystemPermissionRequest
    default:
      return FallbackPermissionRequest
  }
}

export type PermissionRequestProps<Input extends AnyObject = AnyObject> = {
  toolUseConfirm: ToolUseConfirm<Input>
  toolUseContext: ToolUseContext
  onDone(): void
  onReject(): void
  verbose: boolean
  workerBadge: WorkerBadgeProps | undefined
  /**
   * Register JSX to render in a sticky footer below the scrollable area.
   * Fullscreen mode only (non-fullscreen has no sticky area — terminal
   * scrollback moves everything together). Call with null to clear.
   *
   * Used by ExitPlanModePermissionRequest to keep response options visible
   * while the user scrolls through a long plan. The callback is stable —
   * JSX passed should use refs for callbacks that close over component state
   * to avoid stale closures (React reconciles the JSX, preserving Select's
   * internal focus/input state).
   */
  setStickyFooter?: (jsx: React.ReactNode | null) => void
}

export type ToolUseConfirm<Input extends AnyObject = AnyObject> = {
  assistantMessage: AssistantMessage
  tool: Tool<Input>
  description: string
  input: z.infer<Input>
  toolUseContext: ToolUseContext
  toolUseID: string
  permissionResult: PermissionDecision
  permissionPromptStartTimeMs: number
  /**
   * Called when user interacts with the permission dialog (e.g., arrow keys, tab, typing).
   * This prevents async auto-approval mechanisms (like the bash classifier) from
   * dismissing the dialog while the user is actively engaging with it.
   */
  classifierCheckInProgress?: boolean
  classifierAutoApproved?: boolean
  classifierMatchedRule?: string
  workerBadge?: WorkerBadgeProps
  onUserInteraction(): void
  onAbort(): void
  onDismissCheckmark?(): void
  onAllow(
    updatedInput: z.infer<Input>,
    permissionUpdates: PermissionUpdate[],
    feedback?: string,
    contentBlocks?: ContentBlockParam[],
  ): void
  onReject(feedback?: string, contentBlocks?: ContentBlockParam[]): void
  recheckPermission(): Promise<void>
}

function getNotificationMessage(toolUseConfirm: ToolUseConfirm): string {
  const toolName = toolUseConfirm.tool.userFacingName(
    toolUseConfirm.input as never,
  )

  if (toolUseConfirm.tool === ExitPlanModeV2Tool) {
    return 'Claude Code needs your approval for the plan'
  }

  if (toolUseConfirm.tool === EnterPlanModeTool) {
    return 'Claude Code wants to enter plan mode'
  }

  if (
    feature('REVIEW_ARTIFACT') &&
    toolUseConfirm.tool === ReviewArtifactTool
  ) {
    return 'Claude needs your approval for a review artifact'
  }

  if (!toolName || toolName.trim() === '') {
    return 'Claude Code needs your attention'
  }

  return `Claude needs your permission to use ${toolName}`
}

// TODO: Move this to Tool.renderPermissionRequest
export function PermissionRequest({
  toolUseConfirm,
  toolUseContext,
  onDone,
  onReject,
  verbose,
  workerBadge,
  setStickyFooter,
}: PermissionRequestProps): React.ReactNode {
  // Handle Ctrl+C (app:interrupt) to reject
  useKeybinding(
    'app:interrupt',
    () => {
      onDone()
      onReject()
      toolUseConfirm.onReject()
    },
    { context: 'Confirmation' },
  )

  const notificationMessage = getNotificationMessage(toolUseConfirm)
  useNotifyAfterTimeout(notificationMessage, 'permission_prompt')

  const PermissionComponent = permissionComponentForTool(toolUseConfirm.tool)

  return (
    <PermissionComponent
      toolUseContext={toolUseContext}
      toolUseConfirm={toolUseConfirm}
      onDone={onDone}
      onReject={onReject}
      verbose={verbose}
      workerBadge={workerBadge}
      setStickyFooter={setStickyFooter}
    />
  )
}
