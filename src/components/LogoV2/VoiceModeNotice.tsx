import { feature } from 'bun:bundle'
import * as React from 'react'
import { useEffect, useState } from 'react'
import { Box, Text } from '../../ink.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { getInitialSettings } from '../../utils/settings/settings.js'
import { isVoiceModeEnabled } from '../../voice/voiceModeEnabled.js'
import { AnimatedAsterisk } from './AnimatedAsterisk.js'
import { shouldShowOpus1mMergeNotice } from './Opus1mMergeNotice.js'

const MAX_SHOW_COUNT = 3

export function VoiceModeNotice(): React.ReactNode {
  // Positive ternary pattern — see docs/feature-gating.md.
  // All strings must be inside the guarded branch for dead-code elimination.
  return feature('VOICE_MODE') ? <VoiceModeNoticeInner /> : null
}

function VoiceModeNoticeInner(): React.ReactNode {
  // Capture eligibility once at mount — no reactive subscriptions. This sits
  // at the top of the message list and enters scrollback quickly; any
  // re-render after it's in scrollback would force a full terminal reset.
  // If the user runs /voice this session, the notice stays visible; it won't
  // show next session since voiceEnabled will be true on disk.
  const [show] = useState(
    () =>
      isVoiceModeEnabled() &&
      getInitialSettings().voiceEnabled !== true &&
      (getGlobalConfig().voiceNoticeSeenCount ?? 0) < MAX_SHOW_COUNT &&
      !shouldShowOpus1mMergeNotice(),
  )

  useEffect(() => {
    if (!show) return
    // Capture outside the updater so StrictMode's second invocation is a no-op.
    const newCount = (getGlobalConfig().voiceNoticeSeenCount ?? 0) + 1
    saveGlobalConfig(prev => {
      if ((prev.voiceNoticeSeenCount ?? 0) >= newCount) return prev
      return { ...prev, voiceNoticeSeenCount: newCount }
    })
  }, [show])

  if (!show) return null

  return (
    <Box paddingLeft={2}>
      <AnimatedAsterisk />
      <Text dimColor> Voice mode is now available · /voice to enable</Text>
    </Box>
  )
}
