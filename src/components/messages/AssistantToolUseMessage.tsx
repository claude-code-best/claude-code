import type { ToolUseBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import React, { useMemo } from 'react'
import { useTerminalSize } from 'src/hooks/useTerminalSize.js'
import type { ThemeName } from 'src/utils/theme.js'
import type { Command } from '../../commands.js'
import { BLACK_CIRCLE } from '../../constants/figures.js'
import { Box, Text, stringWidth, useTheme } from '@anthropic/ink'
import { useAppStateMaybeOutsideOfProvider } from '../../state/AppState.js'
import {
  findToolByName,
  type Tool,
  type ToolProgressData,
  type Tools,
} from '../../Tool.js'
import type { ProgressMessage } from '../../types/message.js'
import { useIsClassifierChecking } from '../../utils/classifierApprovalsHook.js'
import { logError } from '../../utils/log.js'
import type { buildMessageLookups } from '../../utils/messages.js'
import { MessageResponse } from '../MessageResponse.js'
import { useSelectedMessageBg } from '../messageActions.js'
import { SentryErrorBoundary } from '../SentryErrorBoundary.js'
import { ToolUseLoader } from '../ToolUseLoader.js'
import { HookProgressMessage } from './HookProgressMessage.js'

type Props = {
  param: ToolUseBlockParam
  addMargin: boolean
  tools: Tools
  commands: Command[]
  verbose: boolean
  inProgressToolUseIDs: Set<string>
  progressMessagesForMessage: ProgressMessage[]
  shouldAnimate: boolean
  shouldShowDot: boolean
  inProgressToolCallCount?: number
  lookups: ReturnType<typeof buildMessageLookups>
  isTranscriptMode?: boolean
}

export function AssistantToolUseMessage({
  param,
  addMargin,
  tools,
  commands,
  verbose,
  inProgressToolUseIDs,
  progressMessagesForMessage,
  shouldAnimate,
  shouldShowDot,
  inProgressToolCallCount,
  lookups,
  isTranscriptMode,
}: Props): React.ReactNode {
  const terminalSize = useTerminalSize()
  const [theme] = useTheme()
  const bg = useSelectedMessageBg()
  const pendingWorkerRequest = useAppStateMaybeOutsideOfProvider(
    state => state.pendingWorkerRequest,
  )
  const isClassifierCheckingRaw = useIsClassifierChecking(param.id)
  const permissionMode = useAppStateMaybeOutsideOfProvider(
    state => state.toolPermissionContext.mode,
  )
  // strippedDangerousRules is set by stripDangerousPermissionsForAutoMode
  // (even to {}) whenever auto is active, and cleared by restoreDangerousPermissions
  // on deactivation — a reliable proxy for isAutoModeActive() during plan.
  // prePlanMode would be stale after transitionPlanAutoMode deactivates mid-plan.
  const hasStrippedRules = useAppStateMaybeOutsideOfProvider(
    state => !!state.toolPermissionContext.strippedDangerousRules,
  )
  const isAutoClassifier =
    permissionMode === 'auto' || (permissionMode === 'plan' && hasStrippedRules)
  const isClassifierChecking =
    process.env.USER_TYPE === 'ant' &&
    isClassifierCheckingRaw &&
    permissionMode !== 'auto'

  // Memoize on param identity (stable — from the persisted message object).
  // Zod safeParse allocates per call, and some tools' userFacingName()
  // (BashTool → shouldUseSandbox → shell-quote parse) are expensive. Without
  // this, ~50 bash messages × shell-quote-per-render pushed transition
  // render past the shimmer tick → abort → infinite retry (#21605).
  const parsed = useMemo(() => {
    if (!tools) return null
    const tool = findToolByName(tools, param.name)
    if (!tool) return null
    const input = tool.inputSchema.safeParse(param.input)
    const data = input.success ? input.data : undefined
    return {
      tool,
      input,
      userFacingToolName: tool.userFacingName(data),
      userFacingToolNameBackgroundColor:
        tool.userFacingNameBackgroundColor?.(data),
      isTransparentWrapper: tool.isTransparentWrapper?.() ?? false,
    }
  }, [tools, param])

  if (!parsed) {
    // Guard against undefined tools (required prop) or unknown tool name
    logError(
      new Error(
        tools
          ? `Tool ${param.name} not found`
          : `Tools array is undefined for tool ${param.name}`,
      ),
    )
    return null
  }

  const {
    tool,
    input,
    userFacingToolName,
    userFacingToolNameBackgroundColor,
    isTransparentWrapper,
  } = parsed

  const isResolved = lookups.resolvedToolUseIDs.has(param.id)
  const isQueued = !inProgressToolUseIDs.has(param.id) && !isResolved
  const isWaitingForPermission = pendingWorkerRequest?.toolUseId === param.id

  if (isTransparentWrapper) {
    if (isQueued || isResolved) return null
    return (
      <Box flexDirection="column" width="100%" backgroundColor={bg}>
        {renderToolUseProgressMessage(
          tool,
          tools,
          lookups,
          param.id,
          progressMessagesForMessage,
          { verbose, inProgressToolCallCount, isTranscriptMode },
          terminalSize,
        )}
      </Box>
    )
  }

  if (userFacingToolName === '') {
    return null
  }

  const renderedToolUseMessage = input.success
    ? renderToolUseMessage(tool, input.data, { theme, verbose, commands })
    : null
  if (renderedToolUseMessage === null) {
    return null
  }

  return (
    <Box
      flexDirection="row"
      justifyContent="space-between"
      marginTop={addMargin ? 1 : 0}
      width="100%"
      backgroundColor={bg}
    >
      <Box flexDirection="column">
        <Box
          flexDirection="row"
          flexWrap="nowrap"
          minWidth={stringWidth(userFacingToolName) + (shouldShowDot ? 2 : 0)}
        >
          {shouldShowDot &&
            (isQueued ? (
              <Box minWidth={2}>
                <Text dimColor={isQueued}>{BLACK_CIRCLE}</Text>
              </Box>
            ) : (
              // WARNING: The code here and in ToolUseLoader is particularly
              // sensitive to what *should* just be trivial refactorings. See
              // the comment in ToolUseLoader for more details.
              <ToolUseLoader
                shouldAnimate={shouldAnimate}
                isUnresolved={!isResolved}
                isError={lookups.erroredToolUseIDs.has(param.id)}
              />
            ))}
          <Box flexShrink={0}>
            <Text
              bold
              wrap="truncate-end"
              backgroundColor={userFacingToolNameBackgroundColor}
              color={
                userFacingToolNameBackgroundColor ? 'inverseText' : undefined
              }
            >
              {userFacingToolName}
            </Text>
          </Box>
          {renderedToolUseMessage !== '' && (
            <Box flexWrap="nowrap">
              <Text>({renderedToolUseMessage})</Text>
            </Box>
          )}
          {/* Render tool-specific tags (timeout, model, resume ID, etc.) */}
          {input.success &&
            tool.renderToolUseTag &&
            tool.renderToolUseTag(input.data)}
        </Box>
        {!isResolved &&
          !isQueued &&
          (isClassifierChecking ? (
            <MessageResponse height={1}>
              <Text dimColor>
                {isAutoClassifier
                  ? 'Auto classifier checking\u2026'
                  : 'Bash classifier checking\u2026'}
              </Text>
            </MessageResponse>
          ) : isWaitingForPermission ? (
            <MessageResponse height={1}>
              <Text dimColor>Waiting for permission…</Text>
            </MessageResponse>
          ) : (
            renderToolUseProgressMessage(
              tool,
              tools,
              lookups,
              param.id,
              progressMessagesForMessage,
              {
                verbose,
                inProgressToolCallCount,
                isTranscriptMode,
              },
              terminalSize,
            )
          ))}
        {!isResolved && isQueued && renderToolUseQueuedMessage(tool)}
      </Box>
    </Box>
  )
}

function renderToolUseMessage(
  tool: Tool,
  input: unknown,
  {
    theme,
    verbose,
    commands,
  }: { theme: ThemeName; verbose: boolean; commands: Command[] },
): React.ReactNode {
  try {
    const parsed = tool.inputSchema.safeParse(input)
    if (!parsed.success) {
      return ''
    }
    return tool.renderToolUseMessage(parsed.data, { theme, verbose, commands })
  } catch (error) {
    logError(
      new Error(`Error rendering tool use message for ${tool.name}: ${error}`),
    )
    return ''
  }
}

function renderToolUseProgressMessage(
  tool: Tool,
  tools: Tools,
  lookups: ReturnType<typeof buildMessageLookups>,
  toolUseID: string,
  progressMessagesForMessage: ProgressMessage[],
  {
    verbose,
    inProgressToolCallCount,
    isTranscriptMode,
  }: {
    verbose: boolean
    inProgressToolCallCount?: number
    isTranscriptMode?: boolean
  },
  terminalSize: { columns: number; rows: number },
): React.ReactNode {
  const toolProgressMessages = progressMessagesForMessage.filter(
    (msg): msg is ProgressMessage<ToolProgressData> =>
      (msg.data as Record<string, unknown>).type !== 'hook_progress',
  )
  try {
    const toolMessages =
      tool.renderToolUseProgressMessage?.(toolProgressMessages, {
        tools,
        verbose,
        terminalSize,
        inProgressToolCallCount: inProgressToolCallCount ?? 1,
        isTranscriptMode,
      }) ?? null
    return (
      <>
        <SentryErrorBoundary>
          <HookProgressMessage
            hookEvent="PreToolUse"
            lookups={lookups}
            toolUseID={toolUseID}
            verbose={verbose}
            isTranscriptMode={isTranscriptMode}
          />
        </SentryErrorBoundary>
        {toolMessages}
      </>
    )
  } catch (error) {
    logError(
      new Error(
        `Error rendering tool use progress message for ${tool.name}: ${error}`,
      ),
    )
    return null
  }
}

function renderToolUseQueuedMessage(tool: Tool): React.ReactNode {
  try {
    return tool.renderToolUseQueuedMessage?.()
  } catch (error) {
    logError(
      new Error(
        `Error rendering tool use queued message for ${tool.name}: ${error}`,
      ),
    )
    return null
  }
}
