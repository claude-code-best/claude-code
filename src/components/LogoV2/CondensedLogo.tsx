import * as React from 'react'
import { type ReactNode, useEffect } from 'react'
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import { stringWidth } from '../../ink/stringWidth.js'
import { Box, Text } from '../../ink.js'
import { useAppState } from '../../state/AppState.js'
import { getEffortSuffix } from '../../utils/effort.js'
import { truncate } from '../../utils/format.js'
import { isFullscreenEnvEnabled } from '../../utils/fullscreen.js'
import {
  formatModelAndBilling,
  getLogoDisplayData,
  truncatePath,
} from '../../utils/logoV2Utils.js'
import { renderModelSetting } from '../../utils/model/model.js'
import { OffscreenFreeze } from '../OffscreenFreeze.js'
import { AnimatedClawd } from './AnimatedClawd.js'
import { Clawd } from './Clawd.js'
import {
  GuestPassesUpsell,
  incrementGuestPassesSeenCount,
  useShowGuestPassesUpsell,
} from './GuestPassesUpsell.js'
import {
  incrementOverageCreditUpsellSeenCount,
  OverageCreditUpsell,
  useShowOverageCreditUpsell,
} from './OverageCreditUpsell.js'

export function CondensedLogo(): ReactNode {
  const { columns } = useTerminalSize()
  const agent = useAppState(s => s.agent)
  const effortValue = useAppState(s => s.effortValue)
  const model = useMainLoopModel()
  const modelDisplayName = renderModelSetting(model)
  const { version, cwd, billingType, agentName: agentNameFromSettings } = getLogoDisplayData()

  // Prefer AppState.agent (set from --agent CLI flag) over settings
  const agentName = agent ?? agentNameFromSettings
  const showGuestPassesUpsell = useShowGuestPassesUpsell()
  const showOverageCreditUpsell = useShowOverageCreditUpsell()

  useEffect(() => {
    if (showGuestPassesUpsell) {
      incrementGuestPassesSeenCount()
    }
  }, [showGuestPassesUpsell])

  useEffect(() => {
    if (showOverageCreditUpsell && !showGuestPassesUpsell) {
      incrementOverageCreditUpsellSeenCount()
    }
  }, [showOverageCreditUpsell, showGuestPassesUpsell])

  // Calculate available width for text content
  // Account for: condensed clawd width (11 chars) + gap (2) + padding (2) = 15 chars
  const textWidth = Math.max(columns - 15, 20)

  // Truncate version to fit within available width, accounting for "Claude Code v" prefix
  const versionPrefix = 'Claude Code v'
  const truncatedVersion = truncate(
    version,
    Math.max(textWidth - versionPrefix.length, 6),
  )

  const effortSuffix = getEffortSuffix(model, effortValue)
  const { shouldSplit, truncatedModel, truncatedBilling } =
    formatModelAndBilling(
      modelDisplayName + effortSuffix,
      billingType,
      textWidth,
    )

  // Truncate path, accounting for agent name if present
  const separator = ' · '
  const atPrefix = '@'
  const cwdAvailableWidth = agentName
    ? textWidth - atPrefix.length - stringWidth(agentName) - separator.length
    : textWidth
  const truncatedCwd = truncatePath(cwd, Math.max(cwdAvailableWidth, 10))

  // OffscreenFreeze: the logo sits at the top of the message list and is the
  // first thing to enter scrollback. useMainLoopModel() subscribes to model
  // changes and getLogoDisplayData() reads getCwd()/subscription state — any
  // of which changing while in scrollback would force a full terminal reset.
  return (
    <OffscreenFreeze>
      <Box flexDirection="row" gap={2} alignItems="center">
      {isFullscreenEnvEnabled() ? <AnimatedClawd /> : <Clawd />}

      {/* Info */}
      <Box flexDirection="column">
        <Text>
          <Text bold>Claude Code</Text>{' '}
          <Text dimColor>v{truncatedVersion}</Text>
        </Text>
        {shouldSplit ? (
          <>
            <Text dimColor>{truncatedModel}</Text>
            <Text dimColor>{truncatedBilling}</Text>
          </>
        ) : (
          <Text dimColor>
            {truncatedModel} · {truncatedBilling}
          </Text>
        )}
        <Text dimColor>
          {agentName ? `@${agentName} · ${truncatedCwd}` : truncatedCwd}
        </Text>
        {showGuestPassesUpsell && <GuestPassesUpsell />}
        {!showGuestPassesUpsell && showOverageCreditUpsell && (
          <OverageCreditUpsell maxWidth={textWidth} twoLine />
        )}
      </Box>
      </Box>
    </OffscreenFreeze>
  )
}
