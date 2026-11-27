import type { AppState } from '../../state/AppStateStore.js'
import type {
  LocalCommandResult,
  LocalJSXCommandContext,
} from '../../types/command.js'
import type { ToolUseContext } from '../../Tool.js'
import { setFocusViewActive } from '../../utils/focusView.js'

/**
 * Non-interactive /focus implementation (official 2.1.330, strings L929934).
 *
 * `/focus on|off` sets focus view explicitly; `/focus` with no argument
 * toggles. Flips `AppState.briefTranscript` (kept in sync with the
 * system-prompt-facing mirror in utils/focusView.ts).
 */
export async function callFocusNonInteractive(
  args: string,
  context: ToolUseContext & LocalJSXCommandContext,
): Promise<LocalCommandResult> {
  const t = args.trim()
  let next: boolean
  if (t === 'on') {
    next = true
  } else if (t === 'off') {
    next = false
  } else if (t === '') {
    next = !context.getAppState().briefTranscript
  } else {
    return {
      type: 'text',
      value: `Unknown argument "${t}". Use: /focus [on|off]`,
    }
  }

  context.setAppState((prev: AppState) => {
    if (prev.briefTranscript === next) return prev
    return { ...prev, briefTranscript: next }
  })
  setFocusViewActive(next)

  return {
    type: 'text',
    value: next ? 'Focus view enabled' : 'Focus view disabled',
  }
}
