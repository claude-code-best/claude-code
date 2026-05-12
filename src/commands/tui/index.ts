import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getIsNonInteractiveSession } from '../../bootstrap/state.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import type { Command, LocalCommandResult } from '../../types/command.js'

/**
 * Path to the TUI-mode marker file.
 *
 * When this file exists, the user has opted in to flicker-free TUI mode
 * (alternate screen buffer via CLAUDE_CODE_NO_FLICKER=1). The marker is
 * session-independent: it persists across restarts so the user only needs to
 * run `/tui on` once.
 *
 * Shell-profile integration: add the following to ~/.bashrc / ~/.zshrc to
 * auto-enable TUI mode when the marker is present:
 *
 *   [ -f "$HOME/.claude/.tui-mode" ] && export CLAUDE_CODE_NO_FLICKER=1
 *
 * Note: setting CLAUDE_CODE_NO_FLICKER at runtime cannot retroactively enter
 * the alternate screen buffer — the Ink render tree is already mounted. The
 * change takes effect on the NEXT session start.
 */
export function getTuiMarkerPath(): string {
  return join(getClaudeConfigHomeDir(), '.tui-mode')
}

/**
 * Returns true when the TUI-mode marker file is present, meaning the user has
 * opted in to flicker-free alternate-screen rendering.
 */
export function isTuiModeEnabled(): boolean {
  return existsSync(getTuiMarkerPath())
}

const USAGE_TEXT = [
  'Usage: /tui [subcommand]',
  '',
  '  (no args)   Toggle flicker-free TUI mode (alternate screen buffer)',
  '  on          Enable TUI mode',
  '  off         Disable TUI mode',
  '  status      Show current TUI mode state',
  '',
  'TUI mode uses the ANSI alternate screen buffer (\\x1b[?1049h) so the',
  'Claude Code UI occupies a clean full-screen area with no scroll-back',
  'flicker.  The setting is stored in ~/.claude/.tui-mode and takes effect',
  'on the next session start.',
  '',
  'Shell-profile integration (auto-enable on every start):',
  '  [ -f "$HOME/.claude/.tui-mode" ] && export CLAUDE_CODE_NO_FLICKER=1',
  '',
  'Environment override:',
  '  CLAUDE_CODE_NO_FLICKER=1   force on (overrides marker)',
  '  CLAUDE_CODE_NO_FLICKER=0   force off (overrides marker)',
].join('\n')

function enableTui(): LocalCommandResult {
  const markerPath = getTuiMarkerPath()
  mkdirSync(getClaudeConfigHomeDir(), { recursive: true })
  writeFileSync(markerPath, new Date().toISOString(), 'utf8')
  return {
    type: 'text',
    value: [
      '## TUI mode enabled',
      '',
      `Marker written: \`${markerPath}\``,
      '',
      'Flicker-free alternate-screen rendering will be active on the next',
      'session start.  Add this to your shell profile to make it permanent:',
      '',
      '  [ -f "$HOME/.claude/.tui-mode" ] && export CLAUDE_CODE_NO_FLICKER=1',
      '',
      'To disable: `/tui off`',
    ].join('\n'),
  }
}

function disableTui(): LocalCommandResult {
  const markerPath = getTuiMarkerPath()
  if (!existsSync(markerPath)) {
    return {
      type: 'text',
      value: 'TUI mode was not active.',
    }
  }
  unlinkSync(markerPath)
  return {
    type: 'text',
    value: [
      '## TUI mode disabled',
      '',
      `Marker removed: \`${markerPath}\``,
      '',
      'Standard (non-alternate-screen) rendering will be used on the next',
      'session start.',
      '',
      'To re-enable: `/tui on`',
    ].join('\n'),
  }
}

export async function callTui(args: string): Promise<LocalCommandResult> {
  const sub = args.trim().toLowerCase()

  // ── status ──────────────────────────────────────────────────────────
  if (sub === 'status') {
    const enabled = isTuiModeEnabled()
    const markerPath = getTuiMarkerPath()
    const envVal = process.env.CLAUDE_CODE_NO_FLICKER
    let envLine: string
    if (envVal === '1' || envVal === 'true') {
      envLine = 'CLAUDE_CODE_NO_FLICKER=1 (forced on via env var)'
    } else if (envVal === '0' || envVal === 'false') {
      envLine = 'CLAUDE_CODE_NO_FLICKER=0 (forced off via env var)'
    } else {
      envLine = 'CLAUDE_CODE_NO_FLICKER not set'
    }
    return {
      type: 'text',
      value: [
        '## TUI Mode Status',
        '',
        `  Marker file:  ${enabled ? 'present' : 'absent'} (\`${markerPath}\`)`,
        `  Mode:         ${enabled ? 'enabled' : 'disabled'}`,
        `  Env var:      ${envLine}`,
        '',
        'Note: changes take effect on the next session start.',
      ].join('\n'),
    }
  }

  // ── on ───────────────────────────────────────────────────────────────
  if (sub === 'on') {
    return enableTui()
  }

  // ── off ──────────────────────────────────────────────────────────────
  if (sub === 'off') {
    return disableTui()
  }

  // ── toggle (legacy default) ──────────────────────────────────────────
  if (sub === '' || sub === 'toggle') {
    return isTuiModeEnabled() ? disableTui() : enableTui()
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
    'Manage flicker-free TUI mode. Open actions or run: status, on, off, toggle',
  isHidden: false,
  isEnabled: () => !getIsNonInteractiveSession(),
  argumentHint: '[status|on|off|toggle]',
  bridgeSafe: true,
  getBridgeInvocationError: args =>
    args.trim()
      ? undefined
      : 'Use /tui status/on/off/toggle over Remote Control.',
  load: () => import('./panel.js'),
}

export const tuiNonInteractive: Command = {
  type: 'local',
  name: 'tui',
  description:
    'Toggle flicker-free TUI mode (alternate screen buffer). Subcommands: on, off, status',
  isHidden: false,
  isEnabled: () => getIsNonInteractiveSession(),
  supportsNonInteractive: true,
  bridgeSafe: true,
  load: async () => ({
    call: callTui,
  }),
}

export default tuiCommand
