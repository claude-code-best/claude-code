import { spawnSync } from 'child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { getIsInteractive } from '../bootstrap/state.js'
import { logForDebugging } from './debug.js'
import {
  getClaudeConfigHomeDir,
  isEnvDefinedFalsy,
  isEnvTruthy,
} from './envUtils.js'
import { execFileNoThrow } from './execFileNoThrow.js'
import { shouldDegradeFullscreenForHealth } from './rendererHealth.js'
import { getInitialSettings } from './settings/settings.js'

let loggedTmuxCcDisable = false
let checkedTmuxMouseHint = false

/**
 * Cached result from `tmux display-message -p '#{client_control_mode}'`.
 * undefined = not yet queried (or probe failed) — env heuristic stays authoritative.
 */
let tmuxControlModeProbed: boolean | undefined

/**
 * Env-var heuristic for iTerm2's tmux integration mode (`tmux -CC` / `tmux -2CC`).
 *
 * In `-CC` mode, iTerm2 renders tmux panes as native splits — tmux runs
 * as a server (TMUX is set) but iTerm2 is the actual terminal emulator
 * for each pane, so TERM_PROGRAM stays `iTerm.app` and TERM is iTerm2's
 * default (xterm-*). Contrast with regular tmux-inside-iTerm2, where tmux
 * overwrites TERM_PROGRAM to `tmux` and sets TERM to screen-* or tmux-*.
 *
 * This heuristic has known holes (SSH often doesn't propagate TERM_PROGRAM;
 * .tmux.conf can override TERM) — probeTmuxControlModeSync() is the
 * authoritative backstop. Kept as a zero-subprocess fast path.
 */
function isTmuxControlModeEnvHeuristic(): boolean {
  if (!process.env.TMUX) return false
  if (process.env.TERM_PROGRAM !== 'iTerm.app') return false
  // Belt-and-suspenders: in regular tmux TERM is screen-* or tmux-*;
  // in -CC mode iTerm2 sets its own TERM (xterm-*).
  const term = process.env.TERM ?? ''
  return !term.startsWith('screen') && !term.startsWith('tmux')
}

/**
 * Sync one-shot probe: asks tmux directly whether this client is in control
 * mode via `#{client_control_mode}`. Runs on first isTmuxControlMode() call
 * when the env heuristic can't decide; result is cached.
 *
 * Sync (spawnSync) because the answer gates whether we enter fullscreen — an
 * async probe raced against React render and lost: coder-tmux (ssh → tmux -CC
 * on a remote box) doesn't propagate TERM_PROGRAM, so the env heuristic missed,
 * and by the time the async probe resolved we'd already entered alt-screen with
 * mouse tracking enabled. Mouse wheel is dead in iTerm2's -CC integration, so
 * users couldn't scroll at all.
 *
 * Cost: one ~5ms subprocess, only when $TMUX is set AND $TERM_PROGRAM is unset
 * (the SSH-into-tmux case). Local iTerm2 -CC and non-tmux paths skip the spawn.
 *
 * The TMUX env check MUST come first — without it, display-message would
 * query whatever tmux server happens to be running rather than our client.
 */
function probeTmuxControlModeSync(): void {
  // Seed cache with heuristic result so early returns below don't leave it
  // undefined — isTmuxControlMode() is called 15+ times per render, and an
  // undefined cache would re-enter this function (re-spawning tmux in the
  // failure case) on every call.
  tmuxControlModeProbed = isTmuxControlModeEnvHeuristic()
  if (tmuxControlModeProbed) return
  if (!process.env.TMUX) return
  // Only probe when iTerm might be involved: TERM_PROGRAM is iTerm.app
  // (covered above) or not set (SSH often doesn't propagate it). When
  // TERM_PROGRAM is explicitly a non-iTerm terminal, skip — tmux -CC is
  // an iTerm-only feature, so the subprocess would be wasted.
  if (process.env.TERM_PROGRAM) return
  let result
  try {
    result = spawnSync(
      'tmux',
      ['display-message', '-p', '#{client_control_mode}'],
      { encoding: 'utf8', timeout: 2000 },
    )
  } catch {
    // spawnSync can throw on some platforms (e.g. ENOENT on Windows if tmux
    // is absent and the runtime surfaces it as an exception rather than in
    // result.error). Treat the same as a non-zero exit.
    return
  }
  // Non-zero exit / spawn error: tmux too old (format var added in 2.4) or
  // unavailable. Keep the heuristic result cached.
  if (result.status !== 0) return
  tmuxControlModeProbed = result.stdout.trim() === '1'
}

/**
 * True when running under `tmux -CC` (iTerm2 integration mode).
 *
 * The alt-screen / mouse-tracking path in fullscreen mode is unrecoverable
 * in -CC mode (double-click corrupts terminal state; mouse wheel is dead),
 * so callers auto-disable fullscreen.
 *
 * Lazily probes tmux on first call when the env heuristic can't decide.
 */
export function isTmuxControlMode(): boolean {
  if (tmuxControlModeProbed === undefined) probeTmuxControlModeSync()
  return tmuxControlModeProbed ?? false
}

export function _resetTmuxControlModeProbeForTesting(): void {
  tmuxControlModeProbed = undefined
  loggedTmuxCcDisable = false
}

/**
 * Path of the legacy TUI-mode marker file (pre-2.1.330 persistence).
 *
 * When this file exists, the user opted in to flicker-free TUI mode via the
 * old `/tui on`. Superseded by the settings.json `tui` field ("classic" |
 * "fullscreen") but still honored — and still written by `/tui fullscreen` —
 * so shell-profile integrations keep working:
 *
 *   [ -f "$HOME/.claude/.tui-mode" ] && export CLAUDE_CODE_NO_FLICKER=1
 *
 * Lives here (not in the /tui command) so the resolver below can read it
 * without importing the command module (which imports this file).
 */
export function getTuiMarkerPath(): string {
  return join(getClaudeConfigHomeDir(), '.tui-mode')
}

/**
 * Why fullscreen resolved on or off for this session. Surfaced by /tui so
 * it can explain what is keeping the current renderer (official 2.1.330:
 * switching failures explain what kept the renderer as-is).
 */
export type FullscreenResolveReason =
  | 'env-forced-off'
  | 'env-forced-on'
  | 'tmux-control-mode'
  | 'settings-classic'
  | 'settings-fullscreen'
  | 'legacy-marker'
  | 'default-ant'
  | 'default-external'

export type FullscreenResolveInfo = {
  /** Resolved renderer for this session: true = fullscreen (alt-screen). */
  fullscreen: boolean
  /** What decided it — env var, settings, marker, tmux, or the default. */
  reason: FullscreenResolveReason
  /** True when renderer-health degradation turned fullscreen off this session. */
  degraded: boolean
}

let resolvedFullscreenInfo: FullscreenResolveInfo | undefined

/**
 * One-shot, module-cached fullscreen resolution for the whole session.
 *
 * Official 2.1.330 semantics, in priority order:
 *
 *  1. `CLAUDE_CODE_NO_FLICKER` env var — explicit opt-out (0) / opt-in (1).
 *     The explicit opt-in also SKIPS renderer-health degradation (official:
 *     "/tui fullscreen or CLAUDE_CODE_NO_FLICKER=1 to override").
 *  2. tmux -CC (iTerm2 integration) — auto-disable (unrecoverable there).
 *  3. settings.json `tui` field — "classic" | "fullscreen" (set by
 *     `/tui classic` / `/tui fullscreen`).
 *  4. Legacy `~/.claude/.tui-mode` marker file (old `/tui on`).
 *  5. Default: on for ants, off for external users.
 *
 * Steps 3–5 go through the renderer-health check: if the fullscreen
 * renderer failed to start last launch (or repeatedly), this session uses
 * the classic renderer instead. See rendererHealth.ts.
 *
 * Cached because the resolution has side effects (health-state file
 * updates) and is queried 15+ times per render — and because the renderer
 * must not change mid-session anyway (switching takes effect next launch).
 */
export function resolveFullscreenMode(): FullscreenResolveInfo {
  if (resolvedFullscreenInfo === undefined) {
    resolvedFullscreenInfo = computeFullscreenMode()
  }
  return resolvedFullscreenInfo
}

function computeFullscreenMode(): FullscreenResolveInfo {
  // Explicit user opt-out always wins.
  if (isEnvDefinedFalsy(process.env.CLAUDE_CODE_NO_FLICKER)) {
    return { fullscreen: false, reason: 'env-forced-off', degraded: false }
  }
  // Explicit opt-in overrides auto-detection AND renderer-health
  // degradation (official escape hatch).
  if (isEnvTruthy(process.env.CLAUDE_CODE_NO_FLICKER)) {
    return { fullscreen: true, reason: 'env-forced-on', degraded: false }
  }
  // Auto-disable under tmux -CC: alt-screen + mouse tracking corrupts
  // terminal state on double-click and mouse wheel is dead.
  if (isTmuxControlMode()) {
    if (!loggedTmuxCcDisable) {
      loggedTmuxCcDisable = true
      logForDebugging(
        'fullscreen disabled: tmux -CC (iTerm2 integration mode) detected · set CLAUDE_CODE_NO_FLICKER=1 to override',
      )
    }
    return { fullscreen: false, reason: 'tmux-control-mode', degraded: false }
  }
  // settings.json `tui` field — the official 2.1.330 persistence for
  // `/tui classic` | `/tui fullscreen`.
  const tuiSetting = getInitialSettings().tui
  if (tuiSetting === 'classic') {
    return { fullscreen: false, reason: 'settings-classic', degraded: false }
  }
  if (tuiSetting === 'fullscreen') {
    return applyRendererHealth('settings-fullscreen')
  }
  // Legacy marker file from the old `/tui on` — still honored so existing
  // shell-profile integrations keep working.
  if (existsSync(getTuiMarkerPath())) {
    return applyRendererHealth('legacy-marker')
  }
  if (process.env.USER_TYPE === 'ant') {
    return applyRendererHealth('default-ant')
  }
  return { fullscreen: false, reason: 'default-external', degraded: false }
}

/**
 * Renderer-health gate for every non-env fullscreen source: if the
 * fullscreen renderer didn't finish starting last launch (or repeatedly
 * failed), degrade to classic for this session. See rendererHealth.ts.
 */
function applyRendererHealth(
  reason: FullscreenResolveReason,
): FullscreenResolveInfo {
  if (shouldDegradeFullscreenForHealth()) {
    return { fullscreen: false, reason, degraded: true }
  }
  return { fullscreen: true, reason, degraded: false }
}

/**
 * Runtime env-var / settings / renderer-health check. Ants default to on
 * (CLAUDE_CODE_NO_FLICKER=0 to opt out); external users default to off
 * (CLAUDE_CODE_NO_FLICKER=1 to opt in). `/tui classic|fullscreen` persists
 * to settings.json and takes effect on the next launch. See
 * resolveFullscreenMode() for the full priority order.
 */
export function isFullscreenEnvEnabled(): boolean {
  return resolveFullscreenMode().fullscreen
}

/**
 * Whether fullscreen mode should enable SGR mouse tracking (DEC 1000/1002/1006).
 * Set CLAUDE_CODE_DISABLE_MOUSE=1 to keep alt-screen + virtualized scroll
 * (keyboard PgUp/PgDn/Ctrl+Home/End still work) but skip mouse capture,
 * so tmux/kitty/terminal-native copy-on-select keeps working.
 *
 * Compare with CLAUDE_CODE_NO_FLICKER=0 which is all-or-nothing — it also
 * disables alt-screen and virtualized scrollback.
 */
export function isMouseTrackingEnabled(): boolean {
  return !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_MOUSE)
}

/**
 * Whether mouse click handling is disabled (clicks/drags ignored, wheel still
 * works). Set CLAUDE_CODE_DISABLE_MOUSE_CLICKS=1 to prevent accidental clicks
 * from triggering cursor positioning, text selection, or message expansion.
 *
 * Fullscreen-specific — only reachable when CLAUDE_CODE_NO_FLICKER is active.
 */
export function isMouseClicksDisabled(): boolean {
  return isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_MOUSE_CLICKS)
}

/**
 * True when the fullscreen alt-screen layout is actually rendering —
 * requires an interactive REPL session AND the env var not explicitly
 * set falsy. Headless paths (--print, SDK, in-process teammates) never
 * enter fullscreen, so features that depend on alt-screen re-rendering
 * should gate on this.
 */
export function isFullscreenActive(): boolean {
  return getIsInteractive() && isFullscreenEnvEnabled()
}

/**
 * One-time hint for tmux users in fullscreen with `mouse off`.
 *
 * tmux's `mouse` option is session-scoped by design — there is no
 * pane-level equivalent. We used to `tmux set mouse on` when entering
 * alt-screen so wheel scrolling worked, but that changed mouse behavior
 * for every sibling pane (vim, less, shell) and leaked on kill-pane or
 * when multiple CC instances raced on restore. Now we leave tmux state
 * alone — same as vim/less/htop — and just tell the user their options.
 *
 * Fire-and-forget from REPL startup. Returns the hint text once per
 * session if TMUX is set, fullscreen is active, and tmux's current
 * `mouse` option is off; null otherwise.
 */
export async function maybeGetTmuxMouseHint(): Promise<string | null> {
  if (!process.env.TMUX) return null
  // tmux -CC auto-disables fullscreen above, but belt-and-suspenders.
  if (!isFullscreenActive() || isTmuxControlMode()) return null
  if (checkedTmuxMouseHint) return null
  checkedTmuxMouseHint = true
  // -A includes inherited values: `show -v mouse` returns empty when the
  // option is set globally (`set -g mouse on` in .tmux.conf) but not at
  // session level — which is the common case. -A gives the effective value.
  const { stdout, code } = await execFileNoThrow(
    'tmux',
    ['show', '-Av', 'mouse'],
    { useCwd: false, timeout: 2000 },
  )
  if (code !== 0 || stdout.trim() === 'on') return null
  return "tmux detected · scroll with PgUp/PgDn · or add 'set -g mouse on' to ~/.tmux.conf for wheel scroll"
}

/** Test-only: reset module-level once-per-session flags. */
export function _resetForTesting(): void {
  loggedTmuxCcDisable = false
  checkedTmuxMouseHint = false
  resolvedFullscreenInfo = undefined
}
