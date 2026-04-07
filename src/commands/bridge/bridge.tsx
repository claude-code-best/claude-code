import { feature } from 'bun:bundle'
import { toString as qrToString } from 'qrcode'
import * as React from 'react'
import { useEffect, useState } from 'react'
import { getBridgeAccessToken } from '../../bridge/bridgeConfig.js'
import {
  checkBridgeMinVersion,
  getBridgeDisabledReason,
  isEnvLessBridgeEnabled,
} from '../../bridge/bridgeEnabled.js'
import { checkEnvLessBridgeMinVersion } from '../../bridge/envLessBridgeConfig.js'
import {
  BRIDGE_LOGIN_INSTRUCTION,
  REMOTE_CONTROL_DISCONNECTED_MSG,
} from '../../bridge/types.js'
import { Dialog, ListItem } from '@anthropic/ink'
import { shouldShowRemoteCallout } from '../../components/RemoteCallout.js'
import { useRegisterOverlay } from '../../context/overlayContext.js'
import { Box, Text } from '@anthropic/ink'
import { useKeybindings } from '../../keybindings/useKeybinding.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import { useAppState, useSetAppState } from '../../state/AppState.js'
import type { ToolUseContext } from '../../Tool.js'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import { logForDebugging } from '../../utils/debug.js'

type Props = {
  onDone: LocalJSXCommandOnDone
  name?: string
}

/**
 * /remote-control command — manages the bidirectional bridge connection.
 *
 * When enabled, sets replBridgeEnabled in AppState, which triggers
 * useReplBridge in REPL.tsx to initialize the bridge connection.
 * The bridge registers an environment, creates a session with the current
 * conversation, polls for work, and connects an ingress WebSocket for
 * bidirectional messaging between the CLI and claude.ai.
 *
 * Running /remote-control when already connected shows a dialog with the session
 * URL and options to disconnect or continue.
 */
function BridgeToggle({ onDone, name }: Props): React.ReactNode {
  const setAppState = useSetAppState()
  const replBridgeConnected = useAppState(s => s.replBridgeConnected)
  const replBridgeEnabled = useAppState(s => s.replBridgeEnabled)
  const replBridgeOutboundOnly = useAppState(s => s.replBridgeOutboundOnly)
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: bridge starts once, should not restart on state changes
  useEffect(() => {
    // If already connected or enabled in full bidirectional mode, show
    // disconnect confirmation. Outbound-only (CCR mirror) doesn't count —
    // /remote-control upgrades it to full RC instead.
    if ((replBridgeConnected || replBridgeEnabled) && !replBridgeOutboundOnly) {
      setShowDisconnectDialog(true)
      return
    }

    let cancelled = false
    void (async () => {
      // Pre-flight checks before enabling (awaits GrowthBook init if disk
      // cache is stale — so Max users don't get a false "not enabled" error)
      const error = await checkBridgePrerequisites()
      if (cancelled) return
      if (error) {
        logEvent('tengu_bridge_command', {
          action:
            'preflight_failed' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
        onDone(error, { display: 'system' })
        return
      }

      // Show first-time remote dialog if not yet seen.
      // Store the name now so it's in AppState when the callout handler later
      // enables the bridge (the handler only sets replBridgeEnabled, not the name).
      if (shouldShowRemoteCallout()) {
        setAppState(prev => {
          if (prev.showRemoteCallout) return prev
          return {
            ...prev,
            showRemoteCallout: true,
            replBridgeInitialName: name,
          }
        })
        onDone('', { display: 'system' })
        return
      }

      // Enable the bridge — useReplBridge in REPL.tsx handles the rest:
      // registers environment, creates session with conversation, connects WebSocket
      logEvent('tengu_bridge_command', {
        action:
          'connect' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
      setAppState(prev => {
        if (prev.replBridgeEnabled && !prev.replBridgeOutboundOnly) return prev
        return {
          ...prev,
          replBridgeEnabled: true,
          replBridgeExplicit: true,
          replBridgeOutboundOnly: false,
          replBridgeInitialName: name,
        }
      })
      onDone('Remote Control connecting\u2026', {
        display: 'system',
      })
    })()

    return () => {
      cancelled = true
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- run once on mount

  if (showDisconnectDialog) {
    return <BridgeDisconnectDialog onDone={onDone} />
  }

  return null
}

/**
 * Dialog shown when /remote-control is used while the bridge is already connected.
 * Shows the session URL and lets the user disconnect or continue.
 */
function BridgeDisconnectDialog({ onDone }: Props): React.ReactNode {
  useRegisterOverlay('bridge-disconnect-dialog')
  const setAppState = useSetAppState()
  const sessionUrl = useAppState(s => s.replBridgeSessionUrl)
  const connectUrl = useAppState(s => s.replBridgeConnectUrl)
  const sessionActive = useAppState(s => s.replBridgeSessionActive)
  const [focusIndex, setFocusIndex] = useState(2)
  const [showQR, setShowQR] = useState(false)
  const [qrText, setQrText] = useState('')

  const displayUrl = sessionActive ? sessionUrl : connectUrl

  // Generate QR code when URL changes or QR is toggled on
  useEffect(() => {
    if (!showQR || !displayUrl) {
      setQrText('')
      return
    }
    qrToString(displayUrl, {
      type: 'utf8',
      errorCorrectionLevel: 'L',
      small: true,
    })
      .then(setQrText)
      .catch(() => setQrText(''))
  }, [showQR, displayUrl])

  function handleDisconnect(): void {
    setAppState(prev => {
      if (!prev.replBridgeEnabled) return prev
      return {
        ...prev,
        replBridgeEnabled: false,
        replBridgeExplicit: false,
        replBridgeOutboundOnly: false,
      }
    })
    logEvent('tengu_bridge_command', {
      action:
        'disconnect' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    onDone(REMOTE_CONTROL_DISCONNECTED_MSG, { display: 'system' })
  }

  function handleShowQR(): void {
    setShowQR(prev => !prev)
  }

  function handleContinue(): void {
    onDone(undefined, { display: 'skip' })
  }

  const ITEM_COUNT = 3

  useKeybindings(
    {
      'select:next': () => setFocusIndex(i => (i + 1) % ITEM_COUNT),
      'select:previous': () =>
        setFocusIndex(i => (i - 1 + ITEM_COUNT) % ITEM_COUNT),
      'select:accept': () => {
        if (focusIndex === 0) {
          handleDisconnect()
        } else if (focusIndex === 1) {
          handleShowQR()
        } else {
          handleContinue()
        }
      },
    },
    { context: 'Select' },
  )

  const qrLines = qrText ? qrText.split('\n').filter(l => l.length > 0) : []

  return (
    <Dialog title="Remote Control" onCancel={handleContinue} hideInputGuide>
      <Box flexDirection="column" gap={1}>
        <Text>
          This session is available via Remote Control
          {displayUrl ? ` at ${displayUrl}` : ''}.
        </Text>
        {showQR && qrLines.length > 0 && (
          <Box flexDirection="column">
            {qrLines.map((line, i) => (
              <Text key={i}>{line}</Text>
            ))}
          </Box>
        )}
        <Box flexDirection="column">
          <ListItem isFocused={focusIndex === 0}>
            <Text>Disconnect this session</Text>
          </ListItem>
          <ListItem isFocused={focusIndex === 1}>
            <Text>{showQR ? 'Hide QR code' : 'Show QR code'}</Text>
          </ListItem>
          <ListItem isFocused={focusIndex === 2}>
            <Text>Continue</Text>
          </ListItem>
        </Box>
        <Text dimColor>Enter to select · Esc to continue</Text>
      </Box>
    </Dialog>
  )
}

/**
 * Check bridge prerequisites. Returns an error message if a precondition
 * fails, or null if all checks pass. Awaits GrowthBook init if the disk
 * cache is stale, so a user who just became entitled (e.g. upgraded to Max,
 * or the flag just launched) gets an accurate result on the first try.
 */
async function checkBridgePrerequisites(): Promise<string | null> {
  // Check organization policy — remote control may be disabled
  const { waitForPolicyLimitsToLoad, isPolicyAllowed } = await import(
    '../../services/policyLimits/index.js'
  )
  await waitForPolicyLimitsToLoad()
  if (!isPolicyAllowed('allow_remote_control')) {
    return "Remote Control is disabled by your organization's policy."
  }

  const disabledReason = await getBridgeDisabledReason()
  if (disabledReason) {
    return disabledReason
  }

  // Mirror the v1/v2 branching logic in initReplBridge: env-less (v2) is used
  // only when the flag is on AND the session is not perpetual.  In assistant
  // mode (KAIROS) useReplBridge sets perpetual=true, which forces
  // initReplBridge onto the v1 path — so the prerequisite check must match.
  let useV2 = isEnvLessBridgeEnabled()
  if (feature('KAIROS') && useV2) {
    const { isAssistantMode } = await import('../../assistant/index.js')
    if (isAssistantMode()) {
      useV2 = false
    }
  }
  const versionError = useV2
    ? await checkEnvLessBridgeMinVersion()
    : checkBridgeMinVersion()
  if (versionError) {
    return versionError
  }

  if (!getBridgeAccessToken()) {
    return BRIDGE_LOGIN_INSTRUCTION
  }

  logForDebugging('[bridge] Prerequisites passed, enabling bridge')
  return null
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> {
  const name = args.trim() || undefined
  return <BridgeToggle onDone={onDone} name={name} />
}
