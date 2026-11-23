import { feature } from 'bun:bundle'
import { useMemo } from 'react'
import { useCommandQueue } from 'src/hooks/useCommandQueue.js'
import { useAppState } from 'src/state/AppState.js'
import { getGlobalConfig } from 'src/utils/config.js'
import { getExampleCommandFromCache } from 'src/utils/exampleCommands.js'
import { isQueuedCommandEditable } from 'src/utils/messageQueueManager.js'
import type { QueuedCommand } from 'src/types/textInputTypes.js'

// Dead code elimination: conditional import for proactive mode
/* eslint-disable @typescript-eslint/no-require-imports */
const proactiveModule =
  feature('PROACTIVE') || feature('KAIROS')
    ? require('../../proactive/index.js')
    : null

type Props = {
  input: string
  submitCount: number
  viewingAgentName?: string
}

const NUM_TIMES_QUEUE_HINT_SHOWN = 3
const MAX_TEAMMATE_NAME_LENGTH = 20

/**
 * Pure placeholder chain (official 2.1.330 priority order):
 * 1. `Message @${truncate(agentName, 20)}…` while viewing an agent —
 *    in-process teammate OR background local agent (agentType, e.g.
 *    "general-purpose"). Highest priority: the input box routes to that
 *    agent, so every other hint is irrelevant.
 * 2. Queue hint ("Press up to edit queued messages") until seen 3 times.
 * 3. Example command before the first submit (when suggestions enabled).
 * Extracted from usePromptInputPlaceholder so the priority chain is
 * unit-testable without React.
 */
export function computePromptInputPlaceholder({
  input,
  viewingAgentName,
  queuedCommands,
  submitCount,
  promptSuggestionEnabled,
  queuedCommandUpHintCount,
  isProactiveActive,
  getExampleCommand,
}: {
  input: string
  viewingAgentName?: string
  queuedCommands: readonly QueuedCommand[]
  submitCount: number
  promptSuggestionEnabled: boolean
  queuedCommandUpHintCount: number
  isProactiveActive?: () => boolean
  getExampleCommand: () => string | undefined
}): string | undefined {
  if (input !== '') {
    return
  }

  // Show agent hint when viewing an agent (teammate or background local agent)
  if (viewingAgentName) {
    const displayName =
      viewingAgentName.length > MAX_TEAMMATE_NAME_LENGTH
        ? viewingAgentName.slice(0, MAX_TEAMMATE_NAME_LENGTH - 3) + '...'
        : viewingAgentName
    return `Message @${displayName}…`
  }

  // Show queue hint if user has not seen it yet.
  // Only count user-editable commands — task-notification and isMeta
  // are hidden from the prompt area (see PromptInputQueuedCommands)
  if (
    queuedCommands.some(isQueuedCommandEditable) &&
    queuedCommandUpHintCount < NUM_TIMES_QUEUE_HINT_SHOWN
  ) {
    return 'Press up to edit queued messages'
  }

  // Show example command if user has not submitted yet and suggestions are enabled.
  // Skip in proactive mode — the model drives the conversation so onboarding
  // examples are irrelevant and block prompt suggestions from showing.
  if (submitCount < 1 && promptSuggestionEnabled && !isProactiveActive?.()) {
    return getExampleCommand()
  }
}

export function usePromptInputPlaceholder({
  input,
  submitCount,
  viewingAgentName,
}: Props): string | undefined {
  const queuedCommands = useCommandQueue()
  const promptSuggestionEnabled = useAppState(s => s.promptSuggestionEnabled)
  const placeholder = useMemo(
    () =>
      computePromptInputPlaceholder({
        input,
        viewingAgentName,
        queuedCommands,
        submitCount,
        promptSuggestionEnabled,
        queuedCommandUpHintCount:
          getGlobalConfig().queuedCommandUpHintCount || 0,
        isProactiveActive: proactiveModule?.isProactiveActive,
        getExampleCommand: getExampleCommandFromCache,
      }),
    [
      input,
      queuedCommands,
      submitCount,
      promptSuggestionEnabled,
      viewingAgentName,
    ],
  )

  return placeholder
}
