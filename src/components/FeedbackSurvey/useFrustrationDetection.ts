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
  if (config.transcriptShareDismissed) {
    return { state: 'closed', handleTranscriptSelect: () => {} }
  }

  if (!isPolicyAllowed('product_feedback' as any)) {
    return { state: 'closed', handleTranscriptSelect: () => {} }
  }

  if (isLoading || hasActivePrompt || otherSurveyOpen) {
    return { state: 'closed', handleTranscriptSelect: () => {} }
  }

  const frustrated = detectFrustration(messages)

  const effectiveState =
    frustrated && state === 'closed' ? 'transcript_prompt' : state

  function handleTranscriptSelect(choice: string) {
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
