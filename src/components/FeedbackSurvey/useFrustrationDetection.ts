import { randomUUID } from 'crypto'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isPolicyAllowed } from '../../services/policyLimits/index.js'
import type { Message } from '../../types/message.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { submitTranscriptShare } from './submitTranscriptShare.js'
import type { TranscriptShareResponse } from './TranscriptSharePrompt.js'

type FrustrationState =
  | 'closed'
  | 'transcript_prompt'
  | 'submitting'
  | 'submitted'

function stringifyContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map(block => {
      if (typeof block === 'string') return block
      if (!block || typeof block !== 'object') return ''
      const record = block as unknown as Record<string, unknown>
      return [record.text, record.content, record.error]
        .filter((value): value is string => typeof value === 'string')
        .join(' ')
    })
    .join(' ')
}

function isApiError(message: Message): boolean {
  if (message.isApiErrorMessage === true) return true
  const text = stringifyContent(message.message?.content).toLowerCase()
  return text.includes('api error') || text.includes('rate limit')
}

function isInterruption(message: Message): boolean {
  const text = stringifyContent(message.message?.content).toLowerCase()
  return (
    text.includes('interrupted by user') ||
    text.includes('cancelled by user') ||
    text.includes('user interrupted')
  )
}

function isToolError(message: Message): boolean {
  const content = message.message?.content
  if (!Array.isArray(content)) return false
  return content.some(block => {
    if (!block || typeof block !== 'object') return false
    const record = block as unknown as Record<string, unknown>
    return record.type === 'tool_result' && record.is_error === true
  })
}

function getFrustrationKey(messages: Message[]): string | null {
  const recent = messages.slice(-8)
  const apiErrors = recent.filter(isApiError)
  const interruptions = recent.filter(isInterruption)
  const toolErrors = recent.filter(isToolError)

  if (
    apiErrors.length < 2 &&
    interruptions.length < 2 &&
    toolErrors.length < 3
  ) {
    return null
  }

  const last = recent[recent.length - 1]
  return `${last?.uuid ?? messages.length}:${apiErrors.length}:${interruptions.length}:${toolErrors.length}`
}

export function useFrustrationDetection(
  messages: Message[],
  isLoading: boolean,
  hasActivePrompt: boolean,
  otherSurveyOpen: boolean,
): {
  state: FrustrationState
  handleTranscriptSelect: (selected: TranscriptShareResponse) => void
} {
  const [transientState, setTransientState] =
    useState<FrustrationState>('closed')
  const dismissedKey = useRef<string | null>(null)
  // Stable per hook mount — intentionally shared across re-prompts within the
  // same component lifecycle so the server can correlate them.
  const appearanceId = useRef(randomUUID())
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const frustrationKey = useMemo(() => getFrustrationKey(messages), [messages])
  const configDismissed = useMemo(
    () => getGlobalConfig().transcriptShareDismissed,
    // Re-check config when frustration key changes (avoids per-render I/O)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [frustrationKey],
  )
  const blocked =
    isLoading ||
    hasActivePrompt ||
    otherSurveyOpen ||
    configDismissed ||
    !isPolicyAllowed('allow_product_feedback')

  const shouldPrompt =
    !blocked &&
    transientState === 'closed' &&
    frustrationKey !== null &&
    frustrationKey !== dismissedKey.current

  const handleTranscriptSelect = useCallback(
    (selected: TranscriptShareResponse): void => {
      if (frustrationKey) {
        dismissedKey.current = frustrationKey
      }

      if (selected === 'dont_ask_again') {
        saveGlobalConfig(current => ({
          ...current,
          transcriptShareDismissed: true,
        }))
      }

      if (selected !== 'yes') {
        setTransientState('closed')
        return
      }

      setTransientState('submitting')
      void submitTranscriptShare(
        messagesRef.current,
        'frustration',
        appearanceId.current,
      )
        .then(result => {
          setTransientState(result.success ? 'submitted' : 'closed')
        })
        .catch(() => {
          setTransientState('closed')
        })
    },
    [frustrationKey],
  )

  return {
    state: shouldPrompt ? 'transcript_prompt' : transientState,
    handleTranscriptSelect,
  }
}
