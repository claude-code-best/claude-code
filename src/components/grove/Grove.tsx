import React, { useEffect, useState } from 'react'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'
import { Box, Link, Text, useInput } from '../../ink.js'
import {
  type AccountSettings,
  calculateShouldShowGrove,
  type GroveConfig,
  getGroveNoticeConfig,
  getGroveSettings,
  markGroveNoticeViewed,
  updateGroveSettings,
} from '../../services/api/grove.js'
import { Select } from '../CustomSelect/index.js'
import { Byline } from '../design-system/Byline.js'
import { Dialog } from '../design-system/Dialog.js'
import { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.js'

export type GroveDecision =
  | 'accept_opt_in'
  | 'accept_opt_out'
  | 'defer'
  | 'escape'
  | 'skip_rendering'

type Props = {
  showIfAlreadyViewed: boolean
  location: 'settings' | 'policy_update_modal' | 'onboarding'
  onDone(decision: GroveDecision): void
}

const NEW_TERMS_ASCII = ` _____________
 |          \\  \\
 | NEW TERMS \\__\\
 |              |
 |  ----------  |
 |  ----------  |
 |  ----------  |
 |  ----------  |
 |  ----------  |
 |              |
 |______________|`

function GracePeriodContentBody(): React.ReactNode {
  return (
    <>
      <Text>
        An update to our Consumer Terms and Privacy Policy will take effect on{' '}
        <Text bold>October 8, 2025</Text>. You can accept the updated terms
        today.
      </Text>

      <Box flexDirection="column">
        <Text>What&apos;s changing?</Text>

        <Box paddingLeft={1}>
          <Text>
            <Text>· </Text>
            <Text bold>You can help improve Claude </Text>
            <Text>
              — Allow the use of your chats and coding sessions to train and
              improve Anthropic AI models. Change anytime in your Privacy
              Settings (
              <Link
                url={'https://claude.ai/settings/data-privacy-controls'}
              ></Link>
              ).
            </Text>
          </Text>
        </Box>
        <Box paddingLeft={1}>
          <Text>
            <Text>· </Text>
            <Text bold>Updates to data retention </Text>
            <Text>
              — To help us improve our AI models and safety protections,
              we&apos;re extending data retention to 5 years.
            </Text>
          </Text>
        </Box>
      </Box>

      <Text>
        Learn more (
        <Link
          url={'https://www.anthropic.com/news/updates-to-our-consumer-terms'}
        ></Link>
        ) or read the updated Consumer Terms (
        <Link url={'https://anthropic.com/legal/terms'}></Link>) and Privacy
        Policy (<Link url={'https://anthropic.com/legal/privacy'}></Link>)
      </Text>
    </>
  )
}

function PostGracePeriodContentBody(): React.ReactNode {
  return (
    <>
      <Text>We&apos;ve updated our Consumer Terms and Privacy Policy.</Text>

      <Box flexDirection="column" gap={1}>
        <Text>What&apos;s changing?</Text>

        <Box flexDirection="column">
          <Text bold>Help improve Claude</Text>
          <Text>
            Allow the use of your chats and coding sessions to train and improve
            Anthropic AI models. You can change this anytime in Privacy Settings
          </Text>
          <Link url={'https://claude.ai/settings/data-privacy-controls'}></Link>
        </Box>

        <Box flexDirection="column">
          <Text bold>How this affects data retention</Text>
          <Text>
            Turning ON the improve Claude setting extends data retention from 30
            days to 5 years. Turning it OFF keeps the default 30-day data
            retention. Delete data anytime.
          </Text>
        </Box>
      </Box>

      <Text>
        Learn more (
        <Link
          url={'https://www.anthropic.com/news/updates-to-our-consumer-terms'}
        ></Link>
        ) or read the updated Consumer Terms (
        <Link url={'https://anthropic.com/legal/terms'}></Link>) and Privacy
        Policy (<Link url={'https://anthropic.com/legal/privacy'}></Link>)
      </Text>
    </>
  )
}

export function GroveDialog({
  showIfAlreadyViewed,
  location,
  onDone,
}: Props): React.ReactNode {
  const [shouldShowDialog, setShouldShowDialog] = useState<boolean | null>(null)
  const [groveConfig, setGroveConfig] = useState<GroveConfig | null>(null)

  useEffect(() => {
    async function checkGroveSettings() {
      const [settingsResult, configResult] = await Promise.all([
        getGroveSettings(),
        getGroveNoticeConfig(),
      ])

      // Extract config data if successful, otherwise null
      const config = configResult.success ? configResult.data : null
      setGroveConfig(config)

      // Determine if we should show the dialog (returns false on API failure)
      const shouldShow = calculateShouldShowGrove(
        settingsResult,
        configResult,
        showIfAlreadyViewed,
      )

      setShouldShowDialog(shouldShow)
      // If we shouldn't show the dialog, immediately call onDone
      if (!shouldShow) {
        onDone('skip_rendering')
        return
      }
      // Mark as viewed every time we show the dialog (for reminder frequency tracking)
      void markGroveNoticeViewed()
      // Log that the Grove policy dialog was shown
      logEvent('tengu_grove_policy_viewed', {
        location:
          location as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        dismissable:
          config?.notice_is_grace_period as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
    }

    void checkGroveSettings()
  }, [showIfAlreadyViewed, location, onDone])

  // Loading state
  if (shouldShowDialog === null) {
    return null
  }

  // User has already set preferences, don't show dialog
  if (!shouldShowDialog) {
    return null
  }

  async function onChange(
    value: 'accept_opt_in' | 'accept_opt_out' | 'defer' | 'escape',
  ) {
    switch (value) {
      case 'accept_opt_in': {
        await updateGroveSettings(true)
        logEvent('tengu_grove_policy_submitted', {
          state: true,
          dismissable:
            groveConfig?.notice_is_grace_period as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
        break
      }
      case 'accept_opt_out': {
        await updateGroveSettings(false)
        logEvent('tengu_grove_policy_submitted', {
          state: false,
          dismissable:
            groveConfig?.notice_is_grace_period as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
        break
      }
      case 'defer':
        logEvent('tengu_grove_policy_dismissed', {
          state: true,
        })
        break
      case 'escape':
        logEvent('tengu_grove_policy_escaped', {})
        break
    }

    onDone(value)
  }

  const acceptOptions = groveConfig?.domain_excluded
    ? [
        {
          label:
            'Accept terms · Help improve Claude: OFF (for emails with your domain)',
          value: 'accept_opt_out',
        },
      ]
    : [
        {
          label: 'Accept terms · Help improve Claude: ON',
          value: 'accept_opt_in',
        },
        {
          label: 'Accept terms · Help improve Claude: OFF',
          value: 'accept_opt_out',
        },
      ]

  function handleCancel(): void {
    if (groveConfig?.notice_is_grace_period) {
      void onChange('defer')
      return
    }
    void onChange('escape')
  }

  return (
    <Dialog
      title="Updates to Consumer Terms and Policies"
      color="professionalBlue"
      onCancel={handleCancel}
      inputGuide={exitState =>
        exitState.pending ? (
          <Text>Press {exitState.keyName} again to exit</Text>
        ) : (
          <Byline>
            <KeyboardShortcutHint shortcut="Enter" action="confirm" />
            <KeyboardShortcutHint shortcut="Esc" action="cancel" />
          </Byline>
        )
      }
    >
      <Box flexDirection="row">
        <Box flexDirection="column" gap={1} flexGrow={1}>
          {groveConfig?.notice_is_grace_period ? (
            <GracePeriodContentBody />
          ) : (
            <PostGracePeriodContentBody />
          )}
        </Box>
        <Box flexShrink={0}>
          <Text color="professionalBlue">{NEW_TERMS_ASCII}</Text>
        </Box>
      </Box>

      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold>Please select how you&apos;d like to continue</Text>
          <Text>Your choice takes effect immediately upon confirmation.</Text>
        </Box>

        <Select
          options={[
            ...acceptOptions,
            // Only show "Not now" if in grace period
            ...(groveConfig?.notice_is_grace_period
              ? [{ label: 'Not now', value: 'defer' }]
              : []),
          ]}
          onChange={value =>
            onChange(value as 'accept_opt_in' | 'accept_opt_out' | 'defer')
          }
          onCancel={handleCancel}
        />
      </Box>
    </Dialog>
  )
}

type PrivacySettingsDialogProps = {
  settings: AccountSettings
  domainExcluded?: boolean
  onDone(): void
}

export function PrivacySettingsDialog({
  settings,
  domainExcluded,
  onDone,
}: PrivacySettingsDialogProps): React.ReactNode {
  const [groveEnabled, setGroveEnabled] = useState(settings.grove_enabled)

  React.useEffect(() => {
    logEvent('tengu_grove_privacy_settings_viewed', {})
  }, [])

  useInput(async (input, key) => {
    // Toggle the setting when enter/tab/space is pressed
    if (!domainExcluded && (key.tab || key.return || input === ' ')) {
      const newValue = !groveEnabled
      setGroveEnabled(newValue)
      await updateGroveSettings(newValue)
    }
  })

  let valueComponent = <Text color="error">false</Text>
  if (domainExcluded) {
    valueComponent = (
      <Text color="error">false (for emails with your domain)</Text>
    )
  } else if (groveEnabled) {
    valueComponent = <Text color="success">true</Text>
  }

  return (
    <Dialog
      title="Data Privacy"
      color="professionalBlue"
      onCancel={onDone}
      inputGuide={exitState =>
        exitState.pending ? (
          <Text>Press {exitState.keyName} again to exit</Text>
        ) : domainExcluded ? (
          <KeyboardShortcutHint shortcut="Esc" action="cancel" />
        ) : (
          <Byline>
            <KeyboardShortcutHint shortcut="Enter/Tab/Space" action="toggle" />
            <KeyboardShortcutHint shortcut="Esc" action="cancel" />
          </Byline>
        )
      }
    >
      <Text>
        Review and manage your privacy settings at{' '}
        <Link url={'https://claude.ai/settings/data-privacy-controls'}></Link>
      </Text>

      <Box>
        <Box width={44}>
          <Text bold>Help improve Claude</Text>
        </Box>
        <Box>{valueComponent}</Box>
      </Box>
    </Dialog>
  )
}
