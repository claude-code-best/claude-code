import { getIsNonInteractiveSession } from '../../bootstrap/state.js'
import type { Command } from '../../commands.js'

/**
 * /focus — Focus View (official Claude Code 2.1.330, strings L918597/L929934).
 *
 * Interactive form (local-jsx): toggles focus view — each turn renders as
 * just the user's prompt and the turn's final response. Requires the
 * fullscreen renderer (official fWs: focus filtering only applies when the
 * presentation is fullscreen); in classic mode the command explains how to
 * switch renderers instead of toggling.
 *
 * Non-interactive form (local): `/focus [on|off]` for headless/SDK sessions.
 *
 * State: flips `AppState.briefTranscript` (official kept the legacy field
 * name) and persists it to settings.json so it survives restarts. See
 * utils/focusView.ts for the full state model.
 */
const focus: Command = {
  type: 'local-jsx',
  name: 'focus',
  description: 'Toggle focus view: just your prompt, summary, and response',
  immediate: true,
  requires: { ink: true },
  terminalOriented: true,
  isEnabled: () => !getIsNonInteractiveSession(),
  load: () => import('./focus.js'),
}

export const focusNonInteractive: Command = {
  type: 'local',
  name: 'focus',
  description: 'Toggle focus view: just your prompt, summary, and response',
  terminalOriented: true,
  supportsNonInteractive: true,
  argumentHint: '[on|off]',
  isEnabled: () => getIsNonInteractiveSession(),
  load: async () => ({
    call: (await import('./focusNonInteractive.js')).callFocusNonInteractive,
  }),
}

export default focus
