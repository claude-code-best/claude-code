import type { LocalJSXCommandContext } from '../../commands.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'

/**
 * /assistant command implementation.
 *
 * Opens the Kairos assistant panel. In the current build the panel is
 * rendered by the REPL layer when kairosActive is true; the slash command
 * simply toggles visibility and prints a confirmation line.
 */
export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  _args: string,
): Promise<React.ReactNode> {
  const { setAppState, getAppState } = context

  const current = getAppState()
  const isVisible = (current as Record<string, unknown>).assistantPanelVisible

  if (isVisible) {
    setAppState((prev: Record<string, unknown>) => ({
      ...prev,
      assistantPanelVisible: false,
    }))
    onDone('Assistant panel hidden.', { display: 'system' })
  } else {
    setAppState((prev: Record<string, unknown>) => ({
      ...prev,
      assistantPanelVisible: true,
    }))
    onDone('Assistant panel opened.', { display: 'system' })
  }

  return null
}
