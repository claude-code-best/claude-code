import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isFeedbackSurveyDisabled } from 'src/services/analytics/config.js'
import { checkStatsigFeatureGate_CACHED_MAY_BE_STALE } from 'src/services/analytics/growthbook.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'
import { shouldUseSessionMemoryCompaction } from '../../services/compact/sessionMemoryCompact.js'
import type { Message } from '../../types/message.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { isCompactBoundaryMessage } from '../../utils/messages.js'
import { logOTelEvent } from '../../utils/telemetry/events.js'
import { useSurveyState } from './useSurveyState.js'
import type { FeedbackSurveyResponse } from './utils.js'

const HIDE_THANKS_AFTER_MS = 3000
const POST_COMPACT_SURVEY_GATE = 'tengu_post_compact_survey'
const SURVEY_PROBABILITY = 0.2 // Show survey 20% of the time after compaction

function hasMessageAfterBoundary(
  messages: Message[],
  boundaryUuid: string,
): boolean {
  const boundaryIndex = messages.findIndex(msg => msg.uuid === boundaryUuid)
  if (boundaryIndex === -1) {
    return false
  }

  // Check if there's a user or assistant message after the boundary
  for (let i = boundaryIndex + 1; i < messages.length; i++) {
    const msg = messages[i]
    if (msg && (msg.type === 'user' || msg.type === 'assistant')) {
      return true
    }
  }
  return false
}

export function usePostCompactSurvey(
  messages: Message[],
  isLoading: boolean,
  hasActivePrompt = false,
  { enabled = true }: { enabled?: boolean } = {},
): {
  state:
    | 'closed'
    | 'open'
    | 'thanks'
    | 'transcript_prompt'
    | 'submitting'
    | 'submitted'
  lastResponse: FeedbackSurveyResponse | null
  handleSelect: (selected: FeedbackSurveyResponse) => void
} {
  const [gateEnabled, setGateEnabled] = useState<boolean | null>(null)
  const seenCompactBoundaries = useRef<Set<string>>(new Set())
  // Track the compact boundary we're waiting on (to show survey after next message)
  const pendingCompactBoundaryUuid = useRef<string | null>(null)

  const onOpen = useCallback((appearanceId: string) => {
    const smCompactionEnabled = shouldUseSessionMemoryCompaction()
    logEvent('tengu_post_compact_survey_event', {
      event_type:
        'appeared' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      appearance_id:
        appearanceId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      session_memory_compaction_enabled:
        smCompactionEnabled as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    void logOTelEvent('feedback_survey', {
      event_type: 'appeared',
      appearance_id: appearanceId,
      survey_type: 'post_compact',
    })
  }, [])

  const onSelect = useCallback(
    (appearanceId: string, selected: FeedbackSurveyResponse) => {
      const smCompactionEnabled = shouldUseSessionMemoryCompaction()
      logEvent('tengu_post_compact_survey_event', {
        event_type:
          'responded' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        appearance_id:
          appearanceId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        response:
          selected as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        session_memory_compaction_enabled:
          smCompactionEnabled as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
      void logOTelEvent('feedback_survey', {
        event_type: 'responded',
        appearance_id: appearanceId,
        response: selected,
        survey_type: 'post_compact',
      })
    },
    [],
  )

  const { state, lastResponse, open, handleSelect } = useSurveyState({
    hideThanksAfterMs: HIDE_THANKS_AFTER_MS,
    onOpen,
    onSelect,
  })

  // Check the feature gate on mount
  useEffect(() => {
    if (!enabled) return
    setGateEnabled(
      checkStatsigFeatureGate_CACHED_MAY_BE_STALE(POST_COMPACT_SURVEY_GATE),
    )
  }, [enabled])

  // Find compact boundary messages
  const currentCompactBoundaries = useMemo(
    () =>
      new Set(
        messages
          .filter(msg => isCompactBoundaryMessage(msg))
          .map(msg => msg.uuid),
      ),
    [messages],
  )

  // Detect new compact boundaries and defer showing survey until next message
  useEffect(() => {
    if (!enabled) return

    // Don't process if already showing
    if (state !== 'closed' || isLoading) {
      return
    }

    // Don't show survey when permission or ask question prompts are visible
    if (hasActivePrompt) {
      return
    }

    // Check if the gate is enabled
    if (gateEnabled !== true) {
      return
    }

    if (isFeedbackSurveyDisabled()) {
      return
    }

    // Check if survey is explicitly disabled
    if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY)) {
      return
    }

    // First, check if we have a pending compact and a new message has arrived
    if (pendingCompactBoundaryUuid.current !== null) {
      if (
        hasMessageAfterBoundary(messages, pendingCompactBoundaryUuid.current)
      ) {
        // A new message arrived after the compact - decide whether to show survey
        pendingCompactBoundaryUuid.current = null

        // Only show survey 20% of the time
        if (Math.random() < SURVEY_PROBABILITY) {
          open()
        }
        return
      }
    }

    // Find new compact boundaries that we haven't seen yet
    const newBoundaries = Array.from(currentCompactBoundaries).filter(
      uuid => !seenCompactBoundaries.current.has(uuid),
    )

    if (newBoundaries.length > 0) {
      // Mark these boundaries as seen
      seenCompactBoundaries.current = new Set(currentCompactBoundaries)

      // Don't show survey immediately - wait for next message
      // Store the most recent new boundary UUID
      pendingCompactBoundaryUuid.current =
        newBoundaries[newBoundaries.length - 1]!
    }
  }, [
    enabled,
    currentCompactBoundaries,
    state,
    isLoading,
    hasActivePrompt,
    gateEnabled,
    messages,
    open,
  ])

  return { state, lastResponse, handleSelect }
}
