import { useState } from 'react'
import type { Message } from '../../types/message.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { isPolicyAllowed } from '../../services/policyLimits/index.js'
import { submitTranscriptShare } from './submitTranscriptShare.js'

type FrustrationState = 'closed' | 'transcript_prompt' | 'submitted'

export type FrustrationDetectionResult = {
  state: FrustrationState
  handleTranscriptSelect: (choice: string) => void
}

function detectFrustration(messages: Message[]): boolean {
  const apiErrors = messages.filter(m => (m as any).isApiErrorMessage)
  return apiErrors.length >= 2
}

export function useFrustrationDetection(
  messages: Message[],
  isLoading: boolean,
  hasActivePrompt: boolean,
  otherSurveyOpen: boolean,
): FrustrationDetectionResult {
  const [state, setState] = useState<FrustrationState>('closed')

  const config = getGlobalConfig() as { transcriptShareDismissed?: boolean }
  const policyAllowed = isPolicyAllowed('product_feedback' as any)
  const shouldSkip =
    config.transcriptShareDismissed ||
    !policyAllowed ||
    isLoading ||
    hasActivePrompt ||
    otherSurveyOpen

  const frustrated = detectFrustration(messages)

  const effectiveState = shouldSkip
    ? 'closed'
    : frustrated && state === 'closed'
      ? 'transcript_prompt'
      : state

  const handleTranscriptSelect = (choice: string) => {
    if (shouldSkip) return
    if (choice === 'yes') {
      void submitTranscriptShare(messages, 'frustration', crypto.randomUUID())
      setState('submitted')
    } else {
      saveGlobalConfig((current: any) => ({
        ...current,
        transcriptShareDismissed: true,
      }))
      setState('closed')
    }
  }

  return { state: effectiveState, handleTranscriptSelect }
}
