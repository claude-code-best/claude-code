import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { getIsNonInteractiveSession } from '../../bootstrap/state.js'
import {
  getTuiMarkerPath,
  isFullscreenEnvEnabled,
  resolveFullscreenMode,
  type FullscreenResolveReason,
} from '../../utils/fullscreen.js'
import {
  getRendererHealthSummary,
  resetRendererFailures,
  RENDERER_OVERRIDE_HINT,
  wasFullscreenDegradedThisSession,
} from '../../utils/rendererHealth.js'
import { updateSettingsForSource } from '../../utils/settings/settings.js'
import type { Command, LocalCommandResult } from '../../types/command.js'

export { getTuiMarkerPath } from '../../utils/fullscreen.js'

/**
 * Returns true when the TUI-mode marker file is present, meaning the user has
 * opted in to flicker-free alternate-screen rendering via the legacy `/tui on`
 * (or the marker written by `/tui fullscreen` for shell-profile compat).
 */
export function isTuiModeEnabled(): boolean {
  return existsSync(getTuiMarkerPath())
}

const USAGE_TEXT = [
  'Usage: /tui <classic|fullscreen>',
  '',
  '  (no args)    Show current renderer state',
  '  classic      Use the classic renderer (main terminal buffer)',
  '  fullscreen   Use the fullscreen renderer (alternate screen buffer)',
  '',
  'Aliases (legacy): on = fullscreen, off = classic, status, toggle.',
  '',
  'The fullscreen renderer draws the UI in the ANSI alternate screen buffer',
  '(\\x1b[?1049h) so Claude Code occupies a clean full-screen area with no',
  'scrollback flicker. The setting is persisted to the `tui` field of',
  'settings.json and takes effect on the next session start.',
  '',
  'If the fullscreen renderer repeatedly fails to start, Claude Code',
  'automatically falls back to the classic renderer (and says so). Run',
  '`/tui fullscreen` to retry; the failure count also resets after an update.',
  '',
  'Shell-profile integration (auto-enable on every start):',
  '  [ -f "$HOME/.claude/.tui-mode" ] && export CLAUDE_CODE_NO_FLICKER=1',
  '',
  'Environment override:',
  '  CLAUDE_CODE_NO_FLICKER=1   force fullscreen (also overrides auto-fallback)',
  '  CLAUDE_CODE_NO_FLICKER=0   force classic',
].join('\n')

const REASON_EXPLANATIONS: Record<FullscreenResolveReason, string> = {
  'env-forced-off': 'CLAUDE_CODE_NO_FLICKER=0 is forcing the classic renderer',
  'env-forced-on':
    'CLAUDE_CODE_NO_FLICKER=1 is forcing the fullscreen renderer',
  'tmux-control-mode':
    'tmux -CC (iTerm2 integration mode) is keeping the classic renderer — alt-screen + mouse tracking are unrecoverable there',
  'settings-classic': 'settings.json `tui: "classic"` (set by /tui classic)',
  'settings-fullscreen':
    'settings.json `tui: "fullscreen"` (set by /tui fullscreen)',
  'legacy-marker': '~/.claude/.tui-mode marker file (legacy /tui on)',
  'default-ant': 'default for internal users (set tui: "classic" to opt out)',
  'default-external': 'default (set tui: "fullscreen" to opt in)',
}

function describeEnvVar(): string {
  const envVal = process.env.CLAUDE_CODE_NO_FLICKER
  if (envVal === '1' || envVal === 'true') {
    return 'CLAUDE_CODE_NO_FLICKER=1 (forced fullscreen via env var)'
  }
  if (envVal === '0' || envVal === 'false') {
    return 'CLAUDE_CODE_NO_FLICKER=0 (forced classic via env var)'
  }
  return 'CLAUDE_CODE_NO_FLICKER not set'
}

function setTuiRenderer(
  renderer: 'classic' | 'fullscreen',
): LocalCommandResult {
  const markerPath = getTuiMarkerPath()
  const { error } = updateSettingsForSource('userSettings', { tui: renderer })
  if (error) {
    return {
      type: 'text',
      value: [
        `## Failed to switch TUI renderer to ${renderer}`,
        '',
        String(error),
      ].join('\n'),
    }
  }

  if (renderer === 'classic') {
    // Remove the legacy marker too — otherwise a shell-profile
    // `[ -f ~/.claude/.tui-mode ] && export CLAUDE_CODE_NO_FLICKER=1` would
    // force fullscreen back on via the env var.
    if (existsSync(markerPath)) {
      unlinkSync(markerPath)
    }
    const degraded = wasFullscreenDegradedThisSession()
    const lines = [
      '## Classic renderer enabled',
      '',
      'Saved `tui: "classic"` to settings.json.',
    ]
    if (degraded) {
      lines.push(
        '',
        'This session was already using the classic renderer — fullscreen had',
        'fallen back after startup failures.',
      )
    } else {
      lines.push(
        '',
        'The next session will render in the main terminal buffer.',
      )
    }
    lines.push('', 'To switch back: `/tui fullscreen`')
    return { type: 'text', value: lines.join('\n') }
  }

  // fullscreen: persist the legacy marker as well (shell-profile compat) and
  // clear any recorded renderer failures so fullscreen gets a fresh chance.
  mkdirSync(dirname(markerPath), { recursive: true })
  writeFileSync(markerPath, new Date().toISOString(), 'utf8')
  resetRendererFailures()
  const degraded = wasFullscreenDegradedThisSession()
  return {
    type: 'text',
    value: [
      '## Fullscreen renderer enabled',
      '',
      'Saved `tui: "fullscreen"` to settings.json (failure count reset).',
      degraded
        ? 'This session keeps the classic renderer — the switch applies to the next session start.'
        : 'The next session will render in the alternate screen buffer.',
      '',
      'Shell-profile integration (auto-enable on every start):',
      '  [ -f "$HOME/.claude/.tui-mode" ] && export CLAUDE_CODE_NO_FLICKER=1',
      '',
      'To switch back: `/tui classic`',
    ].join('\n'),
  }
}

function getStatus(): LocalCommandResult {
  const resolved = resolveFullscreenMode()
  const health = getRendererHealthSummary()
  const markerPath = getTuiMarkerPath()
  const lines = [
    '## TUI Renderer Status',
    '',
    `  Renderer:     ${resolved.fullscreen ? 'fullscreen' : 'classic'}`,
    `  Kept by:      ${REASON_EXPLANATIONS[resolved.reason]}`,
    `  Env var:      ${describeEnvVar()}`,
    `  Marker file:  ${existsSync(markerPath) ? 'present' : 'absent'} (\`${markerPath}\`)`,
    `  Startup fails: ${health.failureCount}/${health.threshold} (last ok on version ${health.lastVersion || 'never'})`,
  ]

  if (resolved.degraded) {
    // Official 2.1.330 behavior: explain what kept the current renderer.
    lines.push(
      '',
      'This session fell back to the classic renderer because the fullscreen',
      'renderer failed to start. Run `/tui fullscreen` to retry now (resets',
      'the failure count; also resets automatically after an update).',
    )
  } else if (!resolved.fullscreen && resolved.reason !== 'env-forced-off') {
    // Official hint for how to switch the renderer on.
    lines.push('', RENDERER_OVERRIDE_HINT)
  }

  lines.push(
    '',
    'Note: renderer switches take effect on the next session start.',
  )
  return { type: 'text', value: lines.join('\n') }
}

export async function callTui(args: string): Promise<LocalCommandResult> {
  const sub = args.trim().toLowerCase()

  // ── status / (no args) ───────────────────────────────────────────────
  if (sub === '' || sub === 'status') {
    return getStatus()
  }

  // ── classic / fullscreen (official 2.1.330 arguments) ────────────────
  if (sub === 'classic' || sub === 'off') {
    return setTuiRenderer('classic')
  }
  if (sub === 'fullscreen' || sub === 'on') {
    return setTuiRenderer('fullscreen')
  }

  // ── toggle (legacy) ──────────────────────────────────────────────────
  if (sub === 'toggle') {
    return isFullscreenEnvEnabled()
      ? setTuiRenderer('classic')
      : setTuiRenderer('fullscreen')
  }

  // ── unknown subcommand ───────────────────────────────────────────────
  return {
    type: 'text',
    value: [`Unknown subcommand: "${sub}"`, '', USAGE_TEXT].join('\n'),
  }
}

const tuiCommand: Command = {
  type: 'local-jsx',
  name: 'tui',
  description:
    'Switch between the classic and fullscreen TUI renderers. Open actions or run: /tui classic|fullscreen',
  isHidden: false,
  isEnabled: () => !getIsNonInteractiveSession(),
  argumentHint: '[classic|fullscreen]',
  bridgeSafe: true,
  getBridgeInvocationError: args =>
    args.trim()
      ? undefined
      : 'Use /tui classic/fullscreen over Remote Control.',
  load: () => import('./panel.js'),
}

export const tuiNonInteractive: Command = {
  type: 'local',
  name: 'tui',
  description:
    'Switch between the classic and fullscreen TUI renderers. Subcommands: classic, fullscreen, status',
  isHidden: false,
  isEnabled: () => getIsNonInteractiveSession(),
  supportsNonInteractive: true,
  bridgeSafe: true,
  load: async () => ({
    call: callTui,
  }),
}

export default tuiCommand
