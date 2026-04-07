// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered
import * as React from 'react'
import { Box, Text, color } from '../../ink.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import { stringWidth } from '../../ink/stringWidth.js'
import {
  getLayoutMode,
  calculateLayoutDimensions,
  calculateOptimalLeftWidth,
  formatWelcomeMessage,
  truncatePath,
  getRecentActivitySync,
  getRecentReleaseNotesSync,
  getLogoDisplayData,
} from '../../utils/logoV2Utils.js'
import { truncate } from '../../utils/format.js'
import { getDisplayPath } from '../../utils/file.js'
import { Clawd } from './Clawd.js'
import { FeedColumn } from './FeedColumn.js'
import {
  createRecentActivityFeed,
  createWhatsNewFeed,
  createProjectOnboardingFeed,
  createGuestPassesFeed,
} from './feedConfigs.js'
import { getGlobalConfig, saveGlobalConfig } from 'src/utils/config.js'
import { resolveThemeSetting } from 'src/utils/systemTheme.js'
import { getInitialSettings } from 'src/utils/settings/settings.js'
import {
  isDebugMode,
  isDebugToStdErr,
  getDebugLogPath,
} from 'src/utils/debug.js'
import { useEffect, useState } from 'react'
import {
  getSteps,
  shouldShowProjectOnboarding,
  incrementProjectOnboardingSeenCount,
} from '../../projectOnboardingState.js'
import { CondensedLogo } from './CondensedLogo.js'
import { OffscreenFreeze } from '../OffscreenFreeze.js'
import { checkForReleaseNotesSync } from '../../utils/releaseNotes.js'
import { getDumpPromptsPath } from 'src/services/api/dumpPrompts.js'
import { isEnvTruthy } from 'src/utils/envUtils.js'
import {
  getStartupPerfLogPath,
  isDetailedProfilingEnabled,
} from 'src/utils/startupProfiler.js'
import { EmergencyTip } from './EmergencyTip.js'
import { VoiceModeNotice } from './VoiceModeNotice.js'
import { Opus1mMergeNotice } from './Opus1mMergeNotice.js'
import { feature } from 'bun:bundle'

// Conditional require so ChannelsNotice.tsx tree-shakes when both flags are
// false. A module-scope helper component inside a feature() ternary does NOT
// tree-shake (docs/feature-gating.md); the require pattern eliminates the
// whole file. VoiceModeNotice uses the unsafe helper pattern but VOICE_MODE
// is external: true so it's moot there.
/* eslint-disable @typescript-eslint/no-require-imports */
const ChannelsNoticeModule =
  feature('KAIROS') || feature('KAIROS_CHANNELS')
    ? (require('./ChannelsNotice.js') as typeof import('./ChannelsNotice.js'))
    : null
/* eslint-enable @typescript-eslint/no-require-imports */
import { SandboxManager } from 'src/utils/sandbox/sandbox-adapter.js'
import {
  useShowGuestPassesUpsell,
  incrementGuestPassesSeenCount,
} from './GuestPassesUpsell.js'
import {
  useShowOverageCreditUpsell,
  incrementOverageCreditUpsellSeenCount,
  createOverageCreditFeed,
} from './OverageCreditUpsell.js'
import { plural } from '../../utils/stringUtils.js'
import { useAppState } from '../../state/AppState.js'
import { getEffortSuffix } from '../../utils/effort.js'
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js'
import { renderModelSetting } from '../../utils/model/model.js'

const LEFT_PANEL_MAX_WIDTH = 50

export function LogoV2(): React.ReactNode {
  const activities = getRecentActivitySync()
  const username = getGlobalConfig().oauthAccount?.displayName ?? ''

  const { columns } = useTerminalSize()
  const showOnboarding = shouldShowProjectOnboarding()
  const showSandboxStatus = SandboxManager.isSandboxingEnabled()
  const showGuestPassesUpsell = useShowGuestPassesUpsell()
  const showOverageCreditUpsell = useShowOverageCreditUpsell()
  const agent = useAppState(s => s.agent)
  const effortValue = useAppState(s => s.effortValue)

  const config = getGlobalConfig()

  let changelog: string[]
  try {
    changelog = getRecentReleaseNotesSync(3)
  } catch {
    changelog = []
  }

  // Get company announcements and select one:
  // - First startup (numStartups === 1): show first announcement
  // - All other startups: randomly select from announcements
  const [announcement] = useState(() => {
    const announcements = getInitialSettings().companyAnnouncements
    if (!announcements || announcements.length === 0) return undefined
    return config.numStartups === 1
      ? announcements[0]
      : announcements[Math.floor(Math.random() * announcements.length)]
  })
  const { hasReleaseNotes } = checkForReleaseNotesSync(
    config.lastReleaseNotesSeen,
  )

  useEffect(() => {
    const currentConfig = getGlobalConfig()
    if (currentConfig.lastReleaseNotesSeen === MACRO.VERSION) {
      return
    }
    saveGlobalConfig(current => {
      if (current.lastReleaseNotesSeen === MACRO.VERSION) return current
      return { ...current, lastReleaseNotesSeen: MACRO.VERSION }
    })
    if (showOnboarding) {
      incrementProjectOnboardingSeenCount()
    }
  }, [config, showOnboarding])

  // In condensed mode (early-return below renders <CondensedLogo/>),
  // CondensedLogo's own useEffect handles the impression count. Skipping
  // here avoids double-counting since hooks fire before the early return.
  const isCondensedMode =
    !hasReleaseNotes &&
    !showOnboarding &&
    !isEnvTruthy(process.env.CLAUDE_CODE_FORCE_FULL_LOGO)

  useEffect(() => {
    if (showGuestPassesUpsell && !showOnboarding && !isCondensedMode) {
      incrementGuestPassesSeenCount()
    }
  }, [showGuestPassesUpsell, showOnboarding, isCondensedMode])

  useEffect(() => {
    if (
      showOverageCreditUpsell &&
      !showOnboarding &&
      !showGuestPassesUpsell &&
      !isCondensedMode
    ) {
      incrementOverageCreditUpsellSeenCount()
    }
  }, [
    showOverageCreditUpsell,
    showOnboarding,
    showGuestPassesUpsell,
    isCondensedMode,
  ])

  const model = useMainLoopModel()
  const fullModelDisplayName = renderModelSetting(model)
  const {
    version,
    cwd,
    billingType,
    agentName: agentNameFromSettings,
  } = getLogoDisplayData()
  // Prefer AppState.agent (set from --agent CLI flag) over settings
  const agentName = agent ?? agentNameFromSettings
  // -20 to account for the max length of subscription name " · Claude Enterprise".
  const effortSuffix = getEffortSuffix(model, effortValue)
  const modelDisplayName = truncate(
    fullModelDisplayName + effortSuffix,
    LEFT_PANEL_MAX_WIDTH - 20,
  )

  // Show condensed logo if no new changelog and not showing onboarding and not forcing full logo
  if (
    !hasReleaseNotes &&
    !showOnboarding &&
    !isEnvTruthy(process.env.CLAUDE_CODE_FORCE_FULL_LOGO)
  ) {
    return (
      <>
        <CondensedLogo />
        <VoiceModeNotice />
        <Opus1mMergeNotice />
        {ChannelsNoticeModule && <ChannelsNoticeModule.ChannelsNotice />}
        {isDebugMode() && (
          <Box paddingLeft={2} flexDirection="column">
            <Text color="warning">Debug mode enabled</Text>
            <Text dimColor>
              Logging to: {isDebugToStdErr() ? 'stderr' : getDebugLogPath()}
            </Text>
          </Box>
        )}
        <EmergencyTip />
        {process.env.CLAUDE_CODE_TMUX_SESSION && (
          <Box paddingLeft={2} flexDirection="column">
            <Text dimColor>
              tmux session: {process.env.CLAUDE_CODE_TMUX_SESSION}
            </Text>
            <Text dimColor>
              {process.env.CLAUDE_CODE_TMUX_PREFIX_CONFLICTS
                ? `Detach: ${process.env.CLAUDE_CODE_TMUX_PREFIX} ${process.env.CLAUDE_CODE_TMUX_PREFIX} d (press prefix twice - Claude uses ${process.env.CLAUDE_CODE_TMUX_PREFIX})`
                : `Detach: ${process.env.CLAUDE_CODE_TMUX_PREFIX} d`}
            </Text>
          </Box>
        )}
        {announcement && (
          <Box paddingLeft={2} flexDirection="column">
            {!process.env.IS_DEMO && config.oauthAccount?.organizationName && (
              <Text dimColor>
                Message from {config.oauthAccount.organizationName}:
              </Text>
            )}
            <Text>{announcement}</Text>
          </Box>
        )}
        {process.env.USER_TYPE === 'ant' && !process.env.DEMO_VERSION && (
          <Box paddingLeft={2} flexDirection="column">
            <Text dimColor>Use /issue to report model behavior issues</Text>
          </Box>
        )}
        {process.env.USER_TYPE === 'ant' && !process.env.DEMO_VERSION && (
          <Box paddingLeft={2} flexDirection="column">
            <Text color="warning">[ANT-ONLY] Logs:</Text>
            <Text dimColor>
              API calls: {getDisplayPath(getDumpPromptsPath())}
            </Text>
            <Text dimColor>
              Debug logs: {getDisplayPath(getDebugLogPath())}
            </Text>
            {isDetailedProfilingEnabled() && (
              <Text dimColor>
                Startup Perf: {getDisplayPath(getStartupPerfLogPath())}
              </Text>
            )}
          </Box>
        )}
        {process.env.USER_TYPE === 'ant' && <GateOverridesWarning />}
        {process.env.USER_TYPE === 'ant' && <ExperimentEnrollmentNotice />}
      </>
    )
  }

  // Calculate layout and display values
  const layoutMode = getLayoutMode(columns)

  const userTheme = resolveThemeSetting(getGlobalConfig().theme)
  const borderTitle = ` ${color('claude', userTheme)('Claude Code')} ${color('inactive', userTheme)(`v${version}`)} `
  const compactBorderTitle = color('claude', userTheme)(' Claude Code ')

  // Early return for compact mode
  if (layoutMode === 'compact') {
    const layoutWidth = 4 // border + padding
    let welcomeMessage = formatWelcomeMessage(username)
    if (stringWidth(welcomeMessage) > columns - layoutWidth) {
      welcomeMessage = formatWelcomeMessage(null)
    }

    // Calculate cwd width accounting for agent name if present
    const separator = ' · '
    const atPrefix = '@'
    const cwdAvailableWidth = agentName
      ? columns -
        layoutWidth -
        atPrefix.length -
        stringWidth(agentName) -
        separator.length
      : columns - layoutWidth
    const truncatedCwd = truncatePath(cwd, Math.max(cwdAvailableWidth, 10))
    // OffscreenFreeze: logo is the first thing to enter scrollback; useMainLoopModel()
    // subscribes to model changes and getLogoDisplayData() reads cwd/subscription —
    // any change while in scrollback forces a full reset.
    return (
      <>
        <OffscreenFreeze>
          <Box
            flexDirection="column"
            borderStyle="round"
            borderColor="claude"
            borderText={{
              content: compactBorderTitle,
              position: 'top',
              align: 'start',
              offset: 1,
            }}
            paddingX={1}
            paddingY={1}
            alignItems="center"
            width={columns}
          >
            <Text bold>{welcomeMessage}</Text>
            <Box marginY={1}>
              <Clawd />
            </Box>
            <Text dimColor>{modelDisplayName}</Text>
            <Text dimColor>{billingType}</Text>
            <Text dimColor>
              {agentName ? `@${agentName} · ${truncatedCwd}` : truncatedCwd}
            </Text>
          </Box>
        </OffscreenFreeze>
        <VoiceModeNotice />
        <Opus1mMergeNotice />
        {ChannelsNoticeModule && <ChannelsNoticeModule.ChannelsNotice />}
        {showSandboxStatus && (
          <Box marginTop={1} flexDirection="column">
            <Text color="warning">
              Your bash commands will be sandboxed. Disable with /sandbox.
            </Text>
          </Box>
        )}
        {process.env.USER_TYPE === 'ant' && <GateOverridesWarning />}
        {process.env.USER_TYPE === 'ant' && <ExperimentEnrollmentNotice />}
      </>
    )
  }

  const welcomeMessage = formatWelcomeMessage(username)
  const modelLine =
    !process.env.IS_DEMO && config.oauthAccount?.organizationName
      ? `${modelDisplayName} · ${billingType} · ${config.oauthAccount.organizationName}`
      : `${modelDisplayName} · ${billingType}`
  // Calculate cwd width accounting for agent name if present
  const cwdSeparator = ' · '
  const cwdAtPrefix = '@'
  const cwdAvailableWidth = agentName
    ? LEFT_PANEL_MAX_WIDTH -
      cwdAtPrefix.length -
      stringWidth(agentName) -
      cwdSeparator.length
    : LEFT_PANEL_MAX_WIDTH
  const truncatedCwd = truncatePath(cwd, Math.max(cwdAvailableWidth, 10))
  const cwdLine = agentName ? `@${agentName} · ${truncatedCwd}` : truncatedCwd
  const optimalLeftWidth = calculateOptimalLeftWidth(
    welcomeMessage,
    cwdLine,
    modelLine,
  )

  // Calculate layout dimensions
  const { leftWidth, rightWidth } = calculateLayoutDimensions(
    columns,
    layoutMode,
    optimalLeftWidth,
  )

  return (
    <>
      <OffscreenFreeze>
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="claude"
          borderText={{
            content: borderTitle,
            position: 'top',
            align: 'start',
            offset: 3,
          }}
        >
          {/* Main content */}
          <Box
            flexDirection={layoutMode === 'horizontal' ? 'row' : 'column'}
            paddingX={1}
            gap={1}
          >
            {/* Left Panel */}
            <Box
              flexDirection="column"
              width={leftWidth}
              justifyContent="space-between"
              alignItems="center"
              minHeight={9}
            >
              <Box marginTop={1}>
                <Text bold>{welcomeMessage}</Text>
              </Box>

              <Clawd />

              <Box flexDirection="column" alignItems="center">
                <Text dimColor>{modelLine}</Text>
                <Text dimColor>{cwdLine}</Text>
              </Box>
            </Box>

            {/* Vertical divider */}
            {layoutMode === 'horizontal' && (
              <Box
                height="100%"
                borderStyle="single"
                borderColor="claude"
                borderDimColor
                borderTop={false}
                borderBottom={false}
                borderLeft={false}
              />
            )}

            {/* Right Panel - Project Onboarding or Recent Activity and What's New */}
            {layoutMode === 'horizontal' && (
              <FeedColumn
                feeds={
                  showOnboarding
                    ? [
                        createProjectOnboardingFeed(getSteps()),
                        createRecentActivityFeed(activities),
                      ]
                    : showGuestPassesUpsell
                      ? [
                          createRecentActivityFeed(activities),
                          createGuestPassesFeed(),
                        ]
                      : showOverageCreditUpsell
                        ? [
                            createRecentActivityFeed(activities),
                            createOverageCreditFeed(),
                          ]
                        : [
                            createRecentActivityFeed(activities),
                            createWhatsNewFeed(changelog),
                          ]
                }
                maxWidth={rightWidth}
              />
            )}
          </Box>
        </Box>
      </OffscreenFreeze>
      <VoiceModeNotice />
      <Opus1mMergeNotice />
      {ChannelsNoticeModule && <ChannelsNoticeModule.ChannelsNotice />}
      {isDebugMode() && (
        <Box paddingLeft={2} flexDirection="column">
          <Text color="warning">Debug mode enabled</Text>
          <Text dimColor>
            Logging to: {isDebugToStdErr() ? 'stderr' : getDebugLogPath()}
          </Text>
        </Box>
      )}
      <EmergencyTip />
      {process.env.CLAUDE_CODE_TMUX_SESSION && (
        <Box paddingLeft={2} flexDirection="column">
          <Text dimColor>
            tmux session: {process.env.CLAUDE_CODE_TMUX_SESSION}
          </Text>
          <Text dimColor>
            {process.env.CLAUDE_CODE_TMUX_PREFIX_CONFLICTS
              ? `Detach: ${process.env.CLAUDE_CODE_TMUX_PREFIX} ${process.env.CLAUDE_CODE_TMUX_PREFIX} d (press prefix twice - Claude uses ${process.env.CLAUDE_CODE_TMUX_PREFIX})`
              : `Detach: ${process.env.CLAUDE_CODE_TMUX_PREFIX} d`}
          </Text>
        </Box>
      )}
      {announcement && (
        <Box paddingLeft={2} flexDirection="column">
          {!process.env.IS_DEMO && config.oauthAccount?.organizationName && (
            <Text dimColor>
              Message from {config.oauthAccount.organizationName}:
            </Text>
          )}
          <Text>{announcement}</Text>
        </Box>
      )}
      {showSandboxStatus && (
        <Box paddingLeft={2} flexDirection="column">
          <Text color="warning">
            Your bash commands will be sandboxed. Disable with /sandbox.
          </Text>
        </Box>
      )}
      {process.env.USER_TYPE === 'ant' && !process.env.DEMO_VERSION && (
        <Box paddingLeft={2} flexDirection="column">
          <Text dimColor>Use /issue to report model behavior issues</Text>
        </Box>
      )}
      {process.env.USER_TYPE === 'ant' && !process.env.DEMO_VERSION && (
        <Box paddingLeft={2} flexDirection="column">
          <Text color="warning">[ANT-ONLY] Logs:</Text>
          <Text dimColor>
            API calls: {getDisplayPath(getDumpPromptsPath())}
          </Text>
          <Text dimColor>Debug logs: {getDisplayPath(getDebugLogPath())}</Text>
          {isDetailedProfilingEnabled() && (
            <Text dimColor>
              Startup Perf: {getDisplayPath(getStartupPerfLogPath())}
            </Text>
          )}
        </Box>
      )}
      {process.env.USER_TYPE === 'ant' && <GateOverridesWarning />}
      {process.env.USER_TYPE === 'ant' && <ExperimentEnrollmentNotice />}
    </>
  )
}

