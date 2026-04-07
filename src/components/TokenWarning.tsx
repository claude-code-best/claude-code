import { feature } from 'bun:bundle'
import * as React from 'react'
import { useSyncExternalStore } from 'react'
import { Box, Text } from '../ink.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import {
  calculateTokenWarningState,
  getEffectiveContextWindowSize,
  isAutoCompactEnabled,
} from '../services/compact/autoCompact.js'
import { useCompactWarningSuppression } from '../services/compact/compactWarningHook.js'
import { getUpgradeMessage } from '../utils/model/contextWindowUpgradeCheck.js'

type Props = {
  tokenUsage: number
  model: string
}

/**
 * Live collapse progress: "x / y summarized". Sub-component so
 * useSyncExternalStore can subscribe to store mutations unconditionally
 * (hooks-in-conditionals would violate React rules). The parent only
 * renders this when feature('CONTEXT_COLLAPSE') + isContextCollapseEnabled().
 */
function CollapseLabel({
  upgradeMessage,
}: {
  upgradeMessage: string | null
}): React.ReactNode {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { getStats, subscribe } =
    require('../services/contextCollapse/index.js') as typeof import('../services/contextCollapse/index.js')
  /* eslint-enable @typescript-eslint/no-require-imports */

  // Snapshot must be referentially stable across calls when the
  // underlying counts haven't changed — returning a fresh object every
  // time would infinite-loop useSyncExternalStore. Encode as a string.
  const snapshot = useSyncExternalStore(subscribe, () => {
    const s = getStats()
    const idleWarn = s.health.emptySpawnWarningEmitted ? 1 : 0
    return `${s.collapsedSpans}|${s.stagedSpans}|${s.health.totalErrors}|${s.health.totalEmptySpawns}|${idleWarn}`
  })

  const [collapsed, staged, errors, emptySpawns, idleWarn] = snapshot
    .split('|')
    .map(Number) as [number, number, number, number, number]
  const total = collapsed + staged

  // Show error indicator when ctx-agent is failing silently
  if (errors > 0 || idleWarn) {
    const problem =
      errors > 0
        ? `collapse errors: ${errors}`
        : `collapse idle (${emptySpawns} empty runs)`
    return (
      <Text color="warning" wrap="truncate">
        {total > 0
          ? `${collapsed} / ${total} summarized \u00b7 ${problem}`
          : problem}
      </Text>
    )
  }

  if (total === 0) return null

  const label = `${collapsed} / ${total} summarized`
  return (
    <Text dimColor wrap="truncate">
      {upgradeMessage ? `${label} \u00b7 ${upgradeMessage}` : label}
    </Text>
  )
}

export function TokenWarning({ tokenUsage, model }: Props): React.ReactNode {
  const { percentLeft, isAboveWarningThreshold, isAboveErrorThreshold } =
    calculateTokenWarningState(tokenUsage, model)

  // Use reactive hook to check if warning should be suppressed
  const suppressWarning = useCompactWarningSuppression()

  if (!isAboveWarningThreshold || suppressWarning) {
    return null
  }

  const showAutoCompactWarning = isAutoCompactEnabled()
  const upgradeMessage = getUpgradeMessage('warning')

  // Reactive-only or context-collapse mode: proactive autocompact never
  // fires, so percentLeft's normal calculation (against the autocompact
  // threshold) counts down to an event that won't happen. Recompute
  // against the effective window so the percentage is honest.
  //
  // Each feature() block stands alone so the flag strings DCE from
  // external builds independently.
  let displayPercentLeft = percentLeft
  let reactiveOnlyMode = false
  let collapseMode = false
  if (feature('REACTIVE_COMPACT')) {
    if (getFeatureValue_CACHED_MAY_BE_STALE('tengu_cobalt_raccoon', false)) {
      reactiveOnlyMode = true
    }
  }
  if (feature('CONTEXT_COLLAPSE')) {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { isContextCollapseEnabled } =
      require('../services/contextCollapse/index.js') as typeof import('../services/contextCollapse/index.js')
    /* eslint-enable @typescript-eslint/no-require-imports */
    if (isContextCollapseEnabled()) {
      collapseMode = true
    }
  }
  if (reactiveOnlyMode || collapseMode) {
    const effectiveWindow = getEffectiveContextWindowSize(model)
    displayPercentLeft = Math.max(
      0,
      Math.round(((effectiveWindow - tokenUsage) / effectiveWindow) * 100),
    )
  }

  // Collapse mode: delegate to the subscribing sub-component so the
  // indicator updates live as the ctx-agent stages and commits fire, not
  // just when the next API response re-renders TokenWarning.
  if (collapseMode && feature('CONTEXT_COLLAPSE')) {
    return (
      <Box flexDirection="row">
        <CollapseLabel upgradeMessage={upgradeMessage} />
      </Box>
    )
  }

  const autocompactLabel = reactiveOnlyMode
    ? `${100 - displayPercentLeft}% context used`
    : `${displayPercentLeft}% until auto-compact`

  return (
    <Box flexDirection="row">
      {showAutoCompactWarning ? (
        <Text dimColor wrap="truncate">
          {upgradeMessage
            ? `${autocompactLabel} \u00b7 ${upgradeMessage}`
            : autocompactLabel}
        </Text>
      ) : (
        <Text
          color={isAboveErrorThreshold ? 'error' : 'warning'}
          wrap="truncate"
        >
          {upgradeMessage
            ? `Context low (${percentLeft}% remaining) \u00b7 ${upgradeMessage}`
            : `Context low (${percentLeft}% remaining) \u00b7 Run /compact to compact & continue`}
        </Text>
      )}
    </Box>
  )
}
