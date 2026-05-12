/**
 * launchCommand — generic factory for local-jsx command implementations.
 *
 * Encapsulates the repeated boilerplate across the 6 command launch files:
 *   - args parsing + invalid-args handling
 *   - dispatch error capture + onDone error message
 *   - errorView rendering
 *   - React.createElement call for the happy-path View
 *
 * Usage (H2 finding — cuts boilerplate ~50%):
 *
 *   export const callMyCmd: LocalJSXCommandCall = launchCommand<MyParsed, MyViewProps>({
 *     commandName: 'my-cmd',
 *     parseArgs: parseMyArgs,
 *     dispatch: async (parsed, onDone, context) => { ... return viewProps },
 *     View: MyCmdView,
 *     errorView: (msg) => React.createElement(MyCmdView, { mode: 'error', message: msg }),
 *   })
 */

import React from 'react'
import type {
  LocalJSXCommandCall,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import type { ToolUseContext } from '../../Tool.js'

/** Shape returned by parseArgs when args are invalid. */
export interface InvalidParsed {
  action: 'invalid'
  reason: string
}

export interface LaunchCommandOptions<TParsed, TViewProps> {
  /**
   * Command name used in error messages (e.g. "local-vault").
   * Appears in the onDone text when dispatch throws.
   */
  commandName: string

  /**
   * Parse raw args string into a typed action union or an invalid sentinel.
   * Must return `{ action: 'invalid'; reason: string }` when args are bad.
   */
  parseArgs: (rawArgs: string) => TParsed | InvalidParsed

  /**
   * Perform the command operation.
   * - Call onDone with the user-visible summary text.
   * - Return the View props to render, or null to render nothing.
   * - Throw to trigger the error path.
   */
  dispatch: (
    parsed: TParsed,
    onDone: LocalJSXCommandOnDone,
    context: ToolUseContext,
  ) => Promise<TViewProps | null>

  /**
   * React component rendered with the props returned by dispatch.
   */
  View: React.FC<TViewProps>

  /**
   * Render an error node when parseArgs returns invalid or dispatch throws.
   * Receives the human-readable error message string.
   */
  errorView: (message: string) => React.ReactNode

  /**
   * Optional hook called when dispatch throws, before the error is surfaced.
   * Useful for analytics logEvent calls.
   * Default: no-op.
   */
  onDispatchError?: (err: unknown) => void
}

/**
 * Returns a LocalJSXCommandCall that wraps the provided parse / dispatch / View
 * triple with uniform error handling.
 */
export function launchCommand<TParsed, TViewProps>(
  opts: LaunchCommandOptions<TParsed, TViewProps>,
): LocalJSXCommandCall {
  return async (
    onDone: LocalJSXCommandOnDone,
    context: ToolUseContext,
    args: string,
  ): Promise<React.ReactNode> => {
    // ── Parse args ────────────────────────────────────────────────────────────
    const parsed = opts.parseArgs(args ?? '')

    if (isInvalid(parsed)) {
      onDone(`Invalid args: ${parsed.reason}`, { display: 'system' })
      return opts.errorView(parsed.reason)
    }

    // ── Dispatch ──────────────────────────────────────────────────────────────
    try {
      const viewProps = await opts.dispatch(parsed as TParsed, onDone, context)
      if (viewProps === null) return null
      return React.createElement(
        opts.View as React.ComponentType<object>,
        viewProps as object,
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      opts.onDispatchError?.(err)
      onDone(`${opts.commandName} failed: ${msg}`, { display: 'system' })
      return opts.errorView(msg)
    }
  }
}

function isInvalid(parsed: unknown): parsed is InvalidParsed {
  return (
    typeof parsed === 'object' &&
    parsed !== null &&
    'action' in parsed &&
    (parsed as InvalidParsed).action === 'invalid'
  )
}
