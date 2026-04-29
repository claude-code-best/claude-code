// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered
import React, { useMemo } from 'react'
import { Ansi, Box, Text } from '@anthropic/ink'
import { FilePathLink } from '../FilePathLink.js'
import { toInkColor } from '../../utils/ink.js'
import type { Attachment } from 'src/utils/attachments.js'
import type { NullRenderingAttachmentType } from './nullRenderingAttachments.js'
import { useAppState } from '../../state/AppState.js'
import { getDisplayPath } from 'src/utils/file.js'
import { formatFileSize } from 'src/utils/format.js'
import { MessageResponse } from '../MessageResponse.js'
import { basename, sep } from 'path'
import { UserTextMessage } from './UserTextMessage.js'
import { DiagnosticsDisplay } from '../DiagnosticsDisplay.js'
import { getContentText } from 'src/utils/messages.js'
import type { Theme } from 'src/utils/theme.js'
import { UserImageMessage } from './UserImageMessage.js'

import { jsonParse } from '../../utils/slowOperations.js'
import { plural } from '../../utils/stringUtils.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { isAgentSwarmsEnabled } from '../../utils/agentSwarmsEnabled.js'
import {
  tryRenderPlanApprovalMessage,
  formatTeammateMessageContent,
} from './PlanApprovalMessage.js'
import { BLACK_CIRCLE } from '../../constants/figures.js'
import { TeammateMessageContent } from './UserTeammateMessage.js'
import { isShutdownApproved } from '../../utils/teammateMailbox.js'
import { CtrlOToExpand } from '../CtrlOToExpand.js'

import { feature } from 'bun:bundle'
import { useSelectedMessageBg } from '../messageActions.js'

type Props = {
  addMargin: boolean
  attachment: Attachment
  verbose: boolean
  isTranscriptMode?: boolean
}

export function AttachmentMessage({
  attachment,
  addMargin,
  verbose,
  isTranscriptMode,
}: Props): React.ReactNode {
  const bg = useSelectedMessageBg()
  // Hoisted to mount-time — per-message component, re-renders on every scroll.
  const isDemoEnv = feature('EXPERIMENTAL_SKILL_SEARCH')
    ?
      useMemo(() => isEnvTruthy(process.env.IS_DEMO), [])
    : false
  // Handle teammate_mailbox BEFORE switch
  if (isAgentSwarmsEnabled() && attachment.type === 'teammate_mailbox') {
    // Filter out idle notifications BEFORE counting - they are hidden in the UI
    // so showing them in the count would be confusing ("2 messages in mailbox:" with nothing shown)
    const visibleMessages = attachment.messages.filter(msg => {
      if (isShutdownApproved(msg.text)) {
        return false
      }
      try {
        const parsed = jsonParse(msg.text)
        return (
          parsed?.type !== 'idle_notification' &&
          parsed?.type !== 'teammate_terminated'
        )
      } catch {
        return true // Non-JSON messages are visible
      }
    })

    if (visibleMessages.length === 0) {
      return null
    }
    return (
      <Box flexDirection="column">
        {visibleMessages.map((msg, idx) => {
          // Try to parse as JSON for task_assignment messages
          let parsedMsg: {
            type?: string
            taskId?: string
            subject?: string
            assignedBy?: string
          } | null = null
          try {
            parsedMsg = jsonParse(msg.text)
          } catch {
            // Not JSON, treat as plain text
          }

          if (parsedMsg?.type === 'task_assignment') {
            return (
              <Box key={idx} paddingLeft={2}>
                <Text>{BLACK_CIRCLE} </Text>
                <Text>Task assigned: </Text>
                <Text bold>#{parsedMsg.taskId}</Text>
                <Text> - {parsedMsg.subject}</Text>
                <Text dimColor> (from {parsedMsg.assignedBy || msg.from})</Text>
              </Box>
            )
          }

          // Note: idle_notification messages already filtered out above

          // Try to render as plan approval message (request or response)
          const planApprovalElement = tryRenderPlanApprovalMessage(
            msg.text,
            msg.from,
          )
          if (planApprovalElement) {
            return (
              <React.Fragment key={idx}>{planApprovalElement}</React.Fragment>
            )
          }

          // Plain text message - sender header with chevron, truncated content
          const inkColor = toInkColor(msg.color)
          const formattedContent =
            formatTeammateMessageContent(msg.text) ?? msg.text
          return (
            <TeammateMessageContent
              key={idx}
              displayName={msg.from}
              inkColor={inkColor}
              content={formattedContent}
              summary={msg.summary}
              isTranscriptMode={isTranscriptMode}
            />
          )
        })}
      </Box>
    )
  }

  // skill_discovery rendered here (not in the switch) so the 'skill_discovery'
  // string literal stays inside a feature()-guarded block. A case label can't
  // be conditionally eliminated; an if-body can.
  if (feature('EXPERIMENTAL_SKILL_SEARCH')) {
    if (attachment.type === 'skill_discovery') {
      if (attachment.skills.length === 0) return null
      // Ant users get shortIds inline so they can /skill-feedback while the
      // turn is still fresh. External users (when this un-gates) just see
      // names — shortId is undefined outside ant builds anyway.
      const names = attachment.skills
        .map(s => (s.shortId ? `${s.name} [${s.shortId}]` : s.name))
        .join(', ')
      const firstId = attachment.skills[0]?.shortId
      const hint =
        process.env.USER_TYPE === 'ant' && !isDemoEnv && firstId
          ? ` · /skill-feedback ${firstId} 1=wrong 2=noisy 3=good [comment]`
          : ''
      return (
        <Line>
          <Text bold>{attachment.skills.length}</Text> relevant{' '}
          {plural(attachment.skills.length, 'skill')}: {names}
          {hint && <Text dimColor>{hint}</Text>}
        </Line>
      )
    }
  }

  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- teammate_mailbox/skill_discovery handled before switch
  switch (attachment.type) {
    case 'directory':
      return (
        <Line>
          Listed directory <Text bold>{attachment.displayPath + sep}</Text>
        </Line>
      )
    case 'file':
    case 'already_read_file':
      if (attachment.content.type === 'notebook') {
        return (
          <Line>
            Read <Text bold>{attachment.displayPath}</Text> (
            {attachment.content.file.cells.length} cells)
          </Line>
        )
      }
      if (attachment.content.type === 'file_unchanged') {
        return (
          <Line>
            Read <Text bold>{attachment.displayPath}</Text> (unchanged)
          </Line>
        )
      }
      return (
        <Line>
          Read <Text bold>{attachment.displayPath}</Text> (
          {attachment.content.type === 'text'
            ? `${attachment.content.file.numLines}${attachment.truncated ? '+' : ''} lines`
            : formatFileSize(attachment.content.file.originalSize)}
          )
        </Line>
      )
    case 'compact_file_reference':
      return (
        <Line>
          Referenced file <Text bold>{attachment.displayPath}</Text>
        </Line>
      )
    case 'pdf_reference':
      return (
        <Line>
          Referenced PDF <Text bold>{attachment.displayPath}</Text> (
          {attachment.pageCount} pages)
        </Line>
      )
    case 'selected_lines_in_ide':
      return (
        <Line>
          ⧉ Selected{' '}
          <Text bold>{attachment.lineEnd - attachment.lineStart + 1}</Text>{' '}
          lines from <Text bold>{attachment.displayPath}</Text> in{' '}
          {attachment.ideName}
        </Line>
      )
    case 'nested_memory':
      return (
        <Line>
          Loaded <Text bold>{attachment.displayPath}</Text>
        </Line>
      )
    case 'relevant_memories':
      // Usually absorbed into a CollapsedReadSearchGroup (collapseReadSearch.ts)
      // so this only renders when the preceding tool was non-collapsible (Edit,
      // Write) and no group was open. Match CollapsedReadSearchContent's style:
      // 2-space gutter, dim text, count only — filenames/content in ctrl+o.
      return (
        <Box
          flexDirection="column"
          marginTop={addMargin ? 1 : 0}
          backgroundColor={bg}
        >
          <Box flexDirection="row">
            <Box minWidth={2} />
            <Text dimColor>
              Recalled <Text bold>{attachment.memories.length}</Text>{' '}
              {attachment.memories.length === 1 ? 'memory' : 'memories'}
              {!isTranscriptMode && (
                <>
                  {' '}
                  <CtrlOToExpand />
                </>
              )}
            </Text>
          </Box>
          {(verbose || isTranscriptMode) &&
            attachment.memories.map(m => (
              <Box key={m.path} flexDirection="column">
                <MessageResponse>
                  <Text dimColor>
                    <FilePathLink filePath={m.path}>
                      {basename(m.path)}
                    </FilePathLink>
                  </Text>
                </MessageResponse>
                {isTranscriptMode && (
                  <Box paddingLeft={5}>
                    <Text>
                      <Ansi>{m.content}</Ansi>
                    </Text>
                  </Box>
                )}
              </Box>
            ))}
        </Box>
      )
    case 'dynamic_skill': {
      const skillCount = attachment.skillNames.length
      return (
        <Line>
          Loaded{' '}
          <Text bold>
            {skillCount} {plural(skillCount, 'skill')}
          </Text>{' '}
          from <Text bold>{attachment.displayPath}</Text>
        </Line>
      )
    }
    case 'skill_listing': {
      if (attachment.isInitial) {
        return null
      }
      return (
        <Line>
          <Text bold>{attachment.skillCount}</Text>{' '}
          {plural(attachment.skillCount, 'skill')} available
        </Line>
      )
    }
    case 'agent_listing_delta': {
      if (attachment.isInitial || attachment.addedTypes.length === 0) {
        return null
      }
      const count = attachment.addedTypes.length
      return (
        <Line>
          <Text bold>{count}</Text> agent {plural(count, 'type')} available
        </Line>
      )
    }
    case 'queued_command': {
      const text =
        typeof attachment.prompt === 'string'
          ? attachment.prompt
          : getContentText(attachment.prompt) || ''
      const hasImages =
        attachment.imagePasteIds && attachment.imagePasteIds.length > 0
      return (
        <Box flexDirection="column">
          <UserTextMessage
            addMargin={addMargin}
            param={{ text, type: 'text' }}
            verbose={verbose}
            isTranscriptMode={isTranscriptMode}
          />
          {hasImages &&
            attachment.imagePasteIds?.map(id => (
              <UserImageMessage key={id} imageId={id} />
            ))}
        </Box>
      )
    }
    case 'plan_file_reference':
      return (
        <Line>
          Plan file referenced ({getDisplayPath(attachment.planFilePath)})
        </Line>
      )
    case 'invoked_skills': {
      if (attachment.skills.length === 0) {
        return null
      }
      const skillNames = attachment.skills.map(s => s.name).join(', ')
      return <Line>Skills restored ({skillNames})</Line>
    }
    case 'diagnostics':
      return <DiagnosticsDisplay attachment={attachment} verbose={verbose} />
    case 'mcp_resource':
      return (
        <Line>
          Read MCP resource <Text bold>{attachment.name}</Text> from{' '}
          {attachment.server}
        </Line>
      )
    case 'command_permissions':
      // The skill success message is rendered by SkillTool's renderToolResultMessage,
      // so we don't render anything here to avoid duplicate messages.
      return null
    case 'async_hook_response': {
      // SessionStart hook completions are only shown in verbose mode
      if (attachment.hookEvent === 'SessionStart' && !verbose) {
        return null
      }
      // Generally hide async hook completion messages unless in verbose mode
      if (!verbose && !isTranscriptMode) {
        return null
      }
      return (
        <Line>
          Async hook <Text bold>{attachment.hookEvent}</Text> completed
        </Line>
      )
    }
    case 'hook_blocking_error': {
      // Stop hooks are rendered as a summary in SystemStopHookSummaryMessage
      if (
        attachment.hookEvent === 'Stop' ||
        attachment.hookEvent === 'SubagentStop'
      ) {
        return null
      }
      // Show stderr to the user so they can understand why the hook blocked
      const stderr = attachment.blockingError.blockingError.trim()
      return (
        <>
          <Line color="error">
            {attachment.hookName} hook returned blocking error
          </Line>
          {stderr ? <Line color="error">{stderr}</Line> : null}
        </>
      )
    }
    case 'hook_non_blocking_error': {
      // Stop hooks are rendered as a summary in SystemStopHookSummaryMessage
      if (
        attachment.hookEvent === 'Stop' ||
        attachment.hookEvent === 'SubagentStop'
      ) {
        return null
      }
      // Full hook output is logged to debug log via hookEvents.ts
      return <Line color="error">{attachment.hookName} hook error</Line>
    }
    case 'hook_error_during_execution':
      // Stop hooks are rendered as a summary in SystemStopHookSummaryMessage
      if (
        attachment.hookEvent === 'Stop' ||
        attachment.hookEvent === 'SubagentStop'
      ) {
        return null
      }
      // Full hook output is logged to debug log via hookEvents.ts
      return <Line>{attachment.hookName} hook warning</Line>
    case 'hook_success':
      // Full hook output is logged to debug log via hookEvents.ts
      return null
    case 'hook_stopped_continuation':
      // Stop hooks are rendered as a summary in SystemStopHookSummaryMessage
      if (
        attachment.hookEvent === 'Stop' ||
        attachment.hookEvent === 'SubagentStop'
      ) {
        return null
      }
      return (
        <Line color="warning">
          {attachment.hookName} hook stopped continuation: {attachment.message}
        </Line>
      )
    case 'hook_system_message':
      return (
        <Line>
          {attachment.hookName} says: {attachment.content}
        </Line>
      )
    case 'hook_permission_decision': {
      const action = attachment.decision === 'allow' ? 'Allowed' : 'Denied'
      return (
        <Line>
          {action} by <Text bold>{attachment.hookEvent}</Text> hook
        </Line>
      )
    }
    case 'task_status':
      return <TaskStatusMessage attachment={attachment} />
    case 'teammate_shutdown_batch':
      return (
        <Box
          flexDirection="row"
          width="100%"
          marginTop={1}
          backgroundColor={bg}
        >
          <Text dimColor>{BLACK_CIRCLE} </Text>
          <Text dimColor>
            {attachment.count} {plural(attachment.count, 'teammate')} shut down
            gracefully
          </Text>
        </Box>
      )
    default:
      // Exhaustiveness: every type reaching here must be in NULL_RENDERING_TYPES.
      // If TS errors, a new Attachment type was added without a case above AND
      // without an entry in NULL_RENDERING_TYPES — decide: render something (add
      // a case) or render nothing (add to the array). Messages.tsx pre-filters
      // these so this branch is defense-in-depth for other render paths.
      //
      // skill_discovery and teammate_mailbox are handled BEFORE the switch in
      // runtime-gated blocks (feature() / isAgentSwarmsEnabled()) that TS can't
      // narrow through — excluded here via type union (compile-time only, no emit).
      attachment.type satisfies
        | NullRenderingAttachmentType
        | 'skill_discovery'
        | 'teammate_mailbox'
        | 'bagel_console'
      return null
  }
}

type TaskStatusAttachment = Extract<Attachment, { type: 'task_status' }>

function TaskStatusMessage({
  attachment,
}: {
  attachment: TaskStatusAttachment
}): React.ReactNode {
  // For ants, killed task status is shown in the CoordinatorTaskPanel.
  // Don't render it again in the chat.
  if (process.env.USER_TYPE === 'ant' && attachment.status === 'killed') {
    return null
  }

  // Only access teammate-specific code when swarms are enabled.
  // TeammateTaskStatus subscribes to AppState; by gating the mount we
  // avoid adding a store listener for every non-teammate attachment.
  if (isAgentSwarmsEnabled() && attachment.taskType === 'in_process_teammate') {
    return <TeammateTaskStatus attachment={attachment} />
  }

  return <GenericTaskStatus attachment={attachment} />
}

function GenericTaskStatus({
  attachment,
}: {
  attachment: TaskStatusAttachment
}): React.ReactNode {
  const bg = useSelectedMessageBg()
  const statusText =
    attachment.status === 'completed'
      ? 'completed in background'
      : attachment.status === 'killed'
        ? 'stopped'
        : attachment.status === 'running'
          ? 'still running in background'
          : attachment.status
  return (
    <Box flexDirection="row" width="100%" marginTop={1} backgroundColor={bg}>
      <Text dimColor>{BLACK_CIRCLE} </Text>
      <Text dimColor>
        Task &quot;<Text bold>{attachment.description}</Text>&quot; {statusText}
      </Text>
    </Box>
  )
}

function TeammateTaskStatus({
  attachment,
}: {
  attachment: TaskStatusAttachment
}): React.ReactNode {
  const bg = useSelectedMessageBg()
  // Narrow selector: only re-render when this specific task changes.
  const task = useAppState(s => s.tasks[attachment.taskId])
  if (task?.type !== 'in_process_teammate') {
    // Fall through to generic rendering (task not yet in store, or wrong type)
    return <GenericTaskStatus attachment={attachment} />
  }
  const agentColor = toInkColor(task.identity.color)
  const statusText =
    attachment.status === 'completed'
      ? 'shut down gracefully'
      : attachment.status
  return (
    <Box flexDirection="row" width="100%" marginTop={1} backgroundColor={bg}>
      <Text dimColor>{BLACK_CIRCLE} </Text>
      <Text dimColor>
        Teammate{' '}
        <Text color={agentColor} bold dimColor={false}>
          @{task.identity.agentName}
        </Text>{' '}
        {statusText}
      </Text>
    </Box>
  )
}
// We allow setting dimColor to false here to help work around the dim-bold bug.
// https://github.com/chalk/chalk/issues/290
function Line({
  dimColor = true,
  children,
  color,
}: {
  dimColor?: boolean
  children: React.ReactNode
  color?: keyof Theme
}): React.ReactNode {
  const bg = useSelectedMessageBg()
  return (
    <Box backgroundColor={bg}>
      <MessageResponse>
        <Text color={color} dimColor={dimColor} wrap="wrap">
          {children}
        </Text>
      </MessageResponse>
    </Box>
  )
}
