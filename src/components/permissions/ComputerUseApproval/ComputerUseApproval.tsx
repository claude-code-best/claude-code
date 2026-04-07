import { getSentinelCategory } from '@ant/computer-use-mcp/sentinelApps'
import type {
  CuPermissionRequest,
  CuPermissionResponse,
} from '@ant/computer-use-mcp/types'
import { DEFAULT_GRANT_FLAGS } from '@ant/computer-use-mcp/types'
import figures from 'figures'
import * as React from 'react'
import { useMemo, useState } from 'react'
import { Box, Text } from '../../../ink.js'
import { execFileNoThrow } from '../../../utils/execFileNoThrow.js'
import { plural } from '../../../utils/stringUtils.js'
import type { OptionWithDescription } from '../../CustomSelect/select.js'
import { Select } from '../../CustomSelect/select.js'
import { Dialog } from '../../design-system/Dialog.js'

type ComputerUseApprovalProps = {
  request: CuPermissionRequest
  onDone: (response: CuPermissionResponse) => void
}

const DENY_ALL_RESPONSE: CuPermissionResponse = {
  granted: [],
  denied: [],
  flags: DEFAULT_GRANT_FLAGS,
}

/**
 * Two-panel dispatcher. When `request.tccState` is present, macOS permissions
 * (Accessibility / Screen Recording) are missing and the app list is
 * irrelevant — show a TCC panel that opens System Settings. Otherwise show the
 * app allowlist + grant-flags panel.
 */
export function ComputerUseApproval({
  request,
  onDone,
}: ComputerUseApprovalProps): React.ReactNode {
  return request.tccState ? (
    <ComputerUseTccPanel
      tccState={request.tccState}
      onDone={() => onDone(DENY_ALL_RESPONSE)}
    />
  ) : (
    <ComputerUseAppListPanel request={request} onDone={onDone} />
  )
}

// ── TCC panel ─────────────────────────────────────────────────────────────

type TccOption = 'open_accessibility' | 'open_screen_recording' | 'retry'

function ComputerUseTccPanel({
  tccState,
  onDone,
}: {
  tccState: NonNullable<CuPermissionRequest['tccState']>
  onDone: () => void
}): React.ReactNode {
  const options = useMemo<OptionWithDescription<TccOption>[]>(() => {
    const opts: OptionWithDescription<TccOption>[] = []
    if (!tccState.accessibility) {
      opts.push({
        label: 'Open System Settings → Accessibility',
        value: 'open_accessibility',
      })
    }
    if (!tccState.screenRecording) {
      opts.push({
        label: 'Open System Settings → Screen Recording',
        value: 'open_screen_recording',
      })
    }
    opts.push({ label: 'Try again', value: 'retry' })
    return opts
  }, [tccState.accessibility, tccState.screenRecording])

  function onChange(value: TccOption): void {
    switch (value) {
      case 'open_accessibility':
        void execFileNoThrow(
          'open',
          [
            'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
          ],
          { useCwd: false },
        )
        return
      case 'open_screen_recording':
        void execFileNoThrow(
          'open',
          [
            'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
          ],
          { useCwd: false },
        )
        return
      case 'retry':
        // Resolve with deny-all — the model re-calls request_access, which
        // re-checks TCC and renders the app list if now granted.
        onDone()
        return
    }
  }

  return (
    <Dialog title="Computer Use needs macOS permissions" onCancel={onDone}>
      <Box flexDirection="column" paddingX={1} paddingY={1} gap={1}>
        <Box flexDirection="column">
          <Text>
            Accessibility:{' '}
            {tccState.accessibility
              ? `${figures.tick} granted`
              : `${figures.cross} not granted`}
          </Text>
          <Text>
            Screen Recording:{' '}
            {tccState.screenRecording
              ? `${figures.tick} granted`
              : `${figures.cross} not granted`}
          </Text>
        </Box>
        <Text dimColor>
          Grant the missing permissions in System Settings, then select
          &quot;Try again&quot;. macOS may require you to restart Claude Code
          after granting Screen Recording.
        </Text>
        <Select options={options} onChange={onChange} onCancel={onDone} />
      </Box>
    </Dialog>
  )
}

// ── App allowlist panel ───────────────────────────────────────────────────

type AppListOption = 'allow_all' | 'deny'

const SENTINEL_WARNING: Record<
  NonNullable<ReturnType<typeof getSentinelCategory>>,
  string
> = {
  shell: 'equivalent to shell access',
  filesystem: 'can read/write any file',
  system_settings: 'can change system settings',
}

function ComputerUseAppListPanel({
  request,
  onDone,
}: ComputerUseApprovalProps): React.ReactNode {
  // Pre-check every resolved, not-yet-granted app. Sentinels stay checked
  // too — the warning text is the signal, not an unchecked box.
  // Per-item toggles are a follow-up; for now every resolved app is granted
  // when the user accepts. `setChecked` is unused until then.
  const [checked] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        request.apps.flatMap(a =>
          a.resolved && !a.alreadyGranted ? [a.resolved.bundleId] : [],
        ),
      ),
  )

  type FlagKey = keyof typeof DEFAULT_GRANT_FLAGS
  const ALL_FLAG_KEYS: FlagKey[] = [
    'clipboardRead',
    'clipboardWrite',
    'systemKeyCombos',
  ]
  const requestedFlagKeys = useMemo(
    (): FlagKey[] => ALL_FLAG_KEYS.filter(k => request.requestedFlags[k]),
    [request.requestedFlags],
  )

  const options = useMemo<OptionWithDescription<AppListOption>[]>(
    () => [
      {
        label: `Allow for this session (${checked.size} ${plural(checked.size, 'app')})`,
        value: 'allow_all',
      },
      {
        label: (
          <Text>
            Deny, and tell Claude what to do differently <Text bold>(esc)</Text>
          </Text>
        ),
        value: 'deny',
      },
    ],
    [checked.size],
  )

  function respond(allow: boolean): void {
    if (!allow) {
      onDone(DENY_ALL_RESPONSE)
      return
    }
    const now = Date.now()
    const granted = request.apps.flatMap(a =>
      a.resolved && checked.has(a.resolved.bundleId)
        ? [
            {
              bundleId: a.resolved.bundleId,
              displayName: a.resolved.displayName,
              grantedAt: now,
            },
          ]
        : [],
    )
    const denied = request.apps
      .filter(a => !a.resolved || !checked.has(a.resolved.bundleId))
      .map(a => ({
        bundleId: a.resolved?.bundleId ?? a.requestedName,
        reason: a.resolved
          ? ('user_denied' as const)
          : ('not_installed' as const),
      }))
    // Grant all requested flags on allow — per-flag toggles are a follow-up.
    const flags = {
      ...DEFAULT_GRANT_FLAGS,
      ...Object.fromEntries(requestedFlagKeys.map(k => [k, true] as const)),
    }
    onDone({ granted, denied, flags })
  }

  return (
    <Dialog
      title="Computer Use wants to control these apps"
      onCancel={() => respond(false)}
    >
      <Box flexDirection="column" paddingX={1} paddingY={1} gap={1}>
        {request.reason ? <Text dimColor>{request.reason}</Text> : null}

        <Box flexDirection="column">
          {request.apps.map(a => {
            const resolved = a.resolved
            if (!resolved) {
              return (
                <Text key={a.requestedName} dimColor>
                  {'  '}
                  {figures.circle} {a.requestedName}{' '}
                  <Text dimColor>(not installed)</Text>
                </Text>
              )
            }
            if (a.alreadyGranted) {
              return (
                <Text key={resolved.bundleId} dimColor>
                  {'  '}
                  {figures.tick} {resolved.displayName}{' '}
                  <Text dimColor>(already granted)</Text>
                </Text>
              )
            }
            const sentinel = getSentinelCategory(resolved.bundleId)
            const isChecked = checked.has(resolved.bundleId)
            return (
              <Box key={resolved.bundleId} flexDirection="column">
                <Text>
                  {'  '}
                  {isChecked ? figures.circleFilled : figures.circle}{' '}
                  {resolved.displayName}
                </Text>
                {sentinel ? (
                  <Text bold>
                    {'    '}
                    {figures.warning} {SENTINEL_WARNING[sentinel]}
                  </Text>
                ) : null}
              </Box>
            )
          })}
        </Box>

        {requestedFlagKeys.length > 0 ? (
          <Box flexDirection="column">
            <Text dimColor>Also requested:</Text>
            {requestedFlagKeys.map(flag => (
              <Text key={flag} dimColor>
                {'  '}· {flag}
              </Text>
            ))}
          </Box>
        ) : null}

        {request.willHide && request.willHide.length > 0 ? (
          <Text dimColor>
            {request.willHide.length} other{' '}
            {plural(request.willHide.length, 'app')} will be hidden while Claude
            works.
          </Text>
        ) : null}

        <Select
          options={options}
          onChange={v => respond(v === 'allow_all')}
          onCancel={() => respond(false)}
        />
      </Box>
    </Dialog>
  )
}
