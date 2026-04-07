/**
 * Minimal stub of the keybinding system for the standalone @anthropic/ink package.
 *
 * The full keybinding system (src/keybindings/) depends on KeybindingContext,
 * KeybindingRegistry, and chord handling. This stub provides the same hook
 * interfaces (useKeybinding / useKeybindings) but routes directly through
 * useInput, matching common key sequences to action names.
 *
 * Only the keybindings used by theme components are mapped:
 *   - confirm:no     → Escape
 *   - tabs:next       → Tab / Right arrow
 *   - tabs:previous   → Shift+Tab / Left arrow
 */

import { useCallback } from 'react'
import useInput from '../hooks/use-input.js'
import type { Key } from '../core/events/input-event.js'

type Options = {
  context?: string
  isActive?: boolean
}

/** Maps action names to key matching logic. */
const ACTION_MATCHERS: Record<
  string,
  (input: string, key: Key) => boolean
> = {
  'confirm:no': (_input, key) => key.escape === true,
  'tabs:next': (input, key) =>
    (key.tab && !key.shift) || (key.rightArrow && !key.shift),
  'tabs:previous': (_input, key) =>
    (key.tab && key.shift) || (key.leftArrow && !key.shift),
}

/**
 * Register a single keybinding action handler.
 */
export function useKeybinding(
  action: string,
  handler: () => void | false | Promise<void>,
  options: Options = {},
): void {
  const { isActive = true } = options

  const handleInput = useCallback(
    (input: string, key: Key) => {
      if (!isActive) return
      const matcher = ACTION_MATCHERS[action]
      if (matcher && matcher(input, key)) {
        if (handler() !== false) {
          // consumed
        }
      }
    },
    [action, handler, isActive],
  )

  useInput(handleInput, { isActive })
}

/**
 * Register multiple keybinding action handlers in one hook.
 */
export function useKeybindings(
  handlers: Record<string, () => void | false | Promise<void>>,
  options: Options = {},
): void {
  const { isActive = true } = options

  const handleInput = useCallback(
    (input: string, key: Key) => {
      if (!isActive) return
      for (const [action, handler] of Object.entries(handlers)) {
        const matcher = ACTION_MATCHERS[action]
        if (matcher && matcher(input, key)) {
          if (handler() !== false) {
            break // consumed, stop checking other handlers
          }
        }
      }
    },
    [handlers, isActive],
  )

  useInput(handleInput, { isActive })
}
