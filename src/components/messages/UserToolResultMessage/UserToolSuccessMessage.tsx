import { feature } from 'bun:bundle'
import figures from 'figures'
import * as React from 'react'
import { SentryErrorBoundary } from 'src/components/SentryErrorBoundary.js'
import { Box, Text, useTheme } from '@anthropic/ink'
import { useAppState } from '../../../state/AppState.js'
import {
  filterToolProgressMessages,
  type Tool,
  type Tools,
} from '../../../Tool.js'
import type {
  NormalizedUserMessage,
  ProgressMessage,
} from '../../../types/message.js'
import {
  deleteClassifierApproval,
  getClassifierApproval,
  getYoloClassifierApproval,
} from '../../../utils/classifierApprovals.js'
import type { buildMessageLookups } from '../../../utils/messages.js'
import { MessageResponse } from '../../MessageResponse.js'
import { HookProgressMessage } from '../HookProgressMessage.js'

type Props = {
  message: NormalizedUserMessage
  lookups: ReturnType<typeof buildMessageLookups>
  toolUseID: string
  progressMessagesForMessage: ProgressMessage[]
  style?: 'condensed'
  tool?: Tool
  tools: Tools
  verbose: boolean
  width: number | string
  isTranscriptMode?: boolean
  shouldCollapseDiffs?: boolean
}

export function UserToolSuccessMessage({
  message,
  lookups,
  toolUseID,
  progressMessagesForMessage,
  style,
  tool,
  tools,
  verbose,
  width,
  isTranscriptMode,
  shouldCollapseDiffs,
}: Props): React.ReactNode {
  const [theme] = useTheme()
  // Hook stays inside feature() ternary so external builds don't pay a
  // per-scrollback-message store subscription — same pattern as
  // UserPromptMessage.tsx.
  const isBriefOnly =
    feature('KAIROS') || feature('KAIROS_BRIEF')
      ?
        useAppState(s => s.isBriefOnly)
      : false

  // Capture classifier approval once on mount, then delete from Map to prevent linear growth.
  // useState lazy initializer ensures the value persists across re-renders.
  const [classifierRule] = React.useState(() =>
    getClassifierApproval(toolUseID),
  )
  const [yoloReason] = React.useState(() =>
    getYoloClassifierApproval(toolUseID),
  )
  React.useEffect(() => {
    deleteClassifierApproval(toolUseID)
  }, [toolUseID])

  if (!message.toolUseResult || !tool) {
    return null
  }

  // Resumed transcripts deserialize toolUseResult via raw JSON.parse with no
  // validation (parseJSONL). A partial/corrupt/old-format result crashes
  // renderToolResultMessage on first field access (anthropics/claude-code#39817).
  // Validate against outputSchema before rendering — mirrors CollapsedReadSearchContent.
  const parsedOutput = tool.outputSchema?.safeParse(message.toolUseResult)
  if (parsedOutput && !parsedOutput.success) {
    return null
  }
  const toolResult = parsedOutput?.data ?? message.toolUseResult

  // Collapse diff display for old messages (verbose/ctrl+o overrides)
  const effectiveStyle =
    shouldCollapseDiffs && !verbose ? 'condensed' : style

  const renderedMessage =
    tool.renderToolResultMessage?.(
      toolResult as never,
      filterToolProgressMessages(progressMessagesForMessage),
      {
        style: effectiveStyle,
        theme,
        tools,
        verbose,
        isTranscriptMode,
        isBriefOnly,
        input: lookups.toolUseByToolUseID.get(toolUseID)?.input,
      },
    ) ?? null

  // Don't render anything if the tool result message is null
  if (renderedMessage === null) {
    return null
  }

  // Tools that return '' from userFacingName opt out of tool chrome and
  // render like plain assistant text. Skip the tool-result width constraint
  // so MarkdownTable's SAFETY_MARGIN=4 (tuned for the assistant-text 2-col
  // dot gutter) holds — otherwise tables wrap their box-drawing chars.
  const rendersAsAssistantText = tool.userFacingName(undefined) === ''

  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        width={rendersAsAssistantText ? undefined : width}
      >
        {renderedMessage}
        {feature('BASH_CLASSIFIER')
          ? classifierRule && (
              <MessageResponse height={1}>
                <Text dimColor>
                  <Text color="success">{figures.tick}</Text>
                  {' Auto-approved \u00b7 matched '}
                  {`"${classifierRule}"`}
                </Text>
              </MessageResponse>
            )
          : null}
        {feature('TRANSCRIPT_CLASSIFIER')
          ? yoloReason && (
              <MessageResponse height={1}>
                <Text dimColor>Allowed by auto mode classifier</Text>
              </MessageResponse>
            )
          : null}
      </Box>
      <SentryErrorBoundary>
        <HookProgressMessage
          hookEvent="PostToolUse"
          lookups={lookups}
          toolUseID={toolUseID}
          verbose={verbose}
          isTranscriptMode={isTranscriptMode}
        />
      </SentryErrorBoundary>
    </Box>
  )
}
