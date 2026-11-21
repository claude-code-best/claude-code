import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import type { ToolUseContext } from '../../Tool.js'
import { setFocusViewActive } from '../../utils/focusView.js'
import { isFullscreenEnvEnabled } from '../../utils/fullscreen.js'
import { updateSettingsForSource } from '../../utils/settings/settings.js'

/**
 * Interactive /focus implementation (official 2.1.330, strings L918597).
 *
 * Non-fullscreen sessions never toggle — focus filtering only applies to
 * the fullscreen renderer (official fWs, L936681), so instead of silently
 * flipping a no-op flag the command explains the situation:
 *
 *  - viewMode "focus" in settings.json → tell the user to remove it there
 *    (it re-seeds focus on every startup, so a runtime toggle can't win)
 *  - focus active via the runtime toggle → turn it off (both appState and
 *    the persisted settings) and explain how to get fullscreen
 *  - focus off → just explain how to get fullscreen
 */
export async function call(
  onDone: LocalJSXCommandOnDone,
  context: ToolUseContext & LocalJSXCommandContext,
): Promise<React.ReactNode> {
  const appState = context.getAppState()
  const settings = appState.settings

  if (!isFullscreenEnvEnabled()) {
    if (settings.viewMode === 'focus') {
      onDone(FOCUS_SET_BY_VIEW_MODE_MESSAGE, { display: 'system' })
      return null
    }
    if (appState.briefTranscript || settings.briefTranscript) {
      // Turn focus off in both places: the in-session state and the
      // persisted runtime toggle (only persisted when actually set —
      // avoids a pointless settings.json rewrite otherwise).
      context.setAppState(prev => {
        if (!prev.briefTranscript) return prev
        return { ...prev, briefTranscript: false }
      })
      setFocusViewActive(false)
      if (settings.briefTranscript) {
        // Errors are ignored on purpose: the in-session toggle above has
        // already applied, and the official message text is fixed.
        updateSettingsForSource('userSettings', { briefTranscript: false })
      }
      onDone(FOCUS_DISABLED_NEEDS_FULLSCREEN_MESSAGE, { display: 'system' })
      return null
    }
    onDone(FOCUS_NEEDS_FULLSCREEN_MESSAGE, { display: 'system' })
    return null
  }

  // Fullscreen: toggle. Persist the runtime toggle so the choice survives
  // restarts (official keeps viewMode as the startup default; this field is
  // the runtime-switch persistence — only written when it actually changes).
  const next = !appState.briefTranscript
  context.setAppState(prev => {
    if (prev.briefTranscript === next) return prev
    return { ...prev, briefTranscript: next }
  })
  setFocusViewActive(next)
  if (settings.briefTranscript !== next) {
    updateSettingsForSource('userSettings', { briefTranscript: next })
  }
  onDone(next ? 'Focus view enabled' : 'Focus view disabled', {
    display: 'system',
  })
  return null
}

export const FOCUS_NEEDS_FULLSCREEN_MESSAGE =
  'Focus view needs the fullscreen renderer. Run /tui fullscreen to switch (this restarts and resumes your session), or set CLAUDE_CODE_NO_FLICKER=1 and restart.'

export const FOCUS_DISABLED_NEEDS_FULLSCREEN_MESSAGE = `Focus view disabled. ${FOCUS_NEEDS_FULLSCREEN_MESSAGE}`

export const FOCUS_SET_BY_VIEW_MODE_MESSAGE = `Focus view is set by "viewMode": "focus" in settings.json — remove it there and restart Claude Code to turn it off. ${FOCUS_NEEDS_FULLSCREEN_MESSAGE}`
