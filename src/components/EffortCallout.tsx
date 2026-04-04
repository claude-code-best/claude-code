import React, { useCallback, useEffect, useRef } from 'react'
import { Box, Text } from '../ink.js'
import {
  isMaxSubscriber,
  isProSubscriber,
  isTeamSubscriber,
} from '../utils/auth.js'
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js'
import type { EffortLevel } from '../utils/effort.js'
import {
  convertEffortValueToLevel,
  getDefaultEffortForModel,
  getOpusDefaultEffortConfig,
  toPersistableEffort,
} from '../utils/effort.js'
import { parseUserSpecifiedModel } from '../utils/model/model.js'
import { updateSettingsForSource } from '../utils/settings/settings.js'
import type { OptionWithDescription } from './CustomSelect/select.js'
import { Select } from './CustomSelect/select.js'
import { effortLevelToSymbol } from './EffortIndicator.js'
import { PermissionDialog } from './permissions/PermissionDialog.js'

type EffortCalloutSelection = EffortLevel | undefined | 'dismiss'

type Props = {
  model: string
  onDone: (selection: EffortCalloutSelection) => void
}

const AUTO_DISMISS_MS = 30_000

export function EffortCallout({ model, onDone }: Props): React.ReactNode {
  const defaultEffortConfig = getOpusDefaultEffortConfig()
  // Latest-ref pattern — write via effect so React Compiler can memoize.
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  })

  const handleCancel = useCallback((): void => {
    onDoneRef.current('dismiss')
  }, [])

  // Permanently dismiss on mount so it only shows once
  useEffect(() => {
    markV2Dismissed()
  }, [])

  // 30-second auto-dismiss timer
  useEffect(() => {
    const timeoutId = setTimeout(handleCancel, AUTO_DISMISS_MS)
    return () => clearTimeout(timeoutId)
  }, [handleCancel])

  const defaultEffort = getDefaultEffortForModel(model)
  const defaultLevel = defaultEffort
    ? convertEffortValueToLevel(defaultEffort)
    : 'high'

  const handleSelect = useCallback(
    (value: EffortLevel): void => {
      const effortLevel = value === defaultLevel ? undefined : value
      updateSettingsForSource('userSettings', {
        effortLevel: toPersistableEffort(effortLevel),
      })
      onDoneRef.current(value)
    },
    [defaultLevel],
  )

  const options: OptionWithDescription<EffortLevel>[] = [
    {
      label: <EffortOptionLabel level="medium" text="Medium (recommended)" />,
      value: 'medium',
    },
    { label: <EffortOptionLabel level="high" text="High" />, value: 'high' },
    { label: <EffortOptionLabel level="low" text="Low" />, value: 'low' },
  ]

  return (
    <PermissionDialog title={defaultEffortConfig.dialogTitle}>
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box marginBottom={1} flexDirection="column">
          <Text>{defaultEffortConfig.dialogDescription}</Text>
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>
            <EffortIndicatorSymbol level="low" /> low {'·'}{' '}
            <EffortIndicatorSymbol level="medium" /> medium {'·'}{' '}
            <EffortIndicatorSymbol level="high" /> high
          </Text>
        </Box>
        <Select
          options={options}
          onChange={handleSelect}
          onCancel={handleCancel}
        />
      </Box>
    </PermissionDialog>
  )
}

function EffortIndicatorSymbol({
  level,
}: {
  level: EffortLevel
}): React.ReactNode {
  return <Text color="suggestion">{effortLevelToSymbol(level)}</Text>
}

function EffortOptionLabel({
  level,
  text,
}: {
  level: EffortLevel
  text: string
}): React.ReactNode {
  return (
    <>
      <EffortIndicatorSymbol level={level} /> {text}
    </>
  )
}

/**
 * Check whether to show the effort callout.
 *
 * Audience:
 * - Pro: already had medium default; show unless they saw v1 (effortCalloutDismissed)
 * - Max/Team: getting medium via tengu_grey_step2 config; show when enabled
 * - Everyone else: mark as dismissed so it never shows
 */
export function shouldShowEffortCallout(model: string): boolean {
  // Only show for Opus 4.6 for now
  const parsed = parseUserSpecifiedModel(model)
  if (!parsed.toLowerCase().includes('opus-4-6')) {
    return false
  }

  const config = getGlobalConfig()
  if (config.effortCalloutV2Dismissed) return false

  // Don't show to brand-new users — they never knew the old default, so this
  // isn't a change for them. Mark as dismissed so it stays suppressed.
  if (config.numStartups <= 1) {
    markV2Dismissed()
    return false
  }

  // Pro users already had medium default before this PR. Show the new copy,
  // but skip if they already saw the v1 dialog — no point nagging twice.
  if (isProSubscriber()) {
    if (config.effortCalloutDismissed) {
      markV2Dismissed()
      return false
    }
    return getOpusDefaultEffortConfig().enabled
  }

  // Max/Team are the target of the tengu_grey_step2 config.
  // Don't mark dismissed when config is disabled — they should see the dialog
  // once it's enabled for them.
  if (isMaxSubscriber() || isTeamSubscriber()) {
    return getOpusDefaultEffortConfig().enabled
  }

  // Everyone else (free tier, API key, non-subscribers): not in scope.
  markV2Dismissed()
  return false
}

function markV2Dismissed(): void {
  saveGlobalConfig(current => {
    if (current.effortCalloutV2Dismissed) return current
    return { ...current, effortCalloutV2Dismissed: true }
  })
}
