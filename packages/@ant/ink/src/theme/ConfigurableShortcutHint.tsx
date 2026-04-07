/**
 * Simplified ConfigurableShortcutHint for the standalone @anthropic/ink package.
 *
 * The full version reads user-configured keybindings via useShortcutDisplay.
 * This stub just renders the fallback shortcut — sufficient for the package's
 * internal theme components.
 */

import React from 'react'
import { KeyboardShortcutHint } from './KeyboardShortcutHint.js'

type Props = {
  action: string
  context: string
  fallback: string
  description: string
  parens?: boolean
  bold?: boolean
}

export function ConfigurableShortcutHint({
  fallback,
  description,
  parens,
  bold,
}: Props): React.ReactNode {
  return (
    <KeyboardShortcutHint
      shortcut={fallback}
      action={description}
      parens={parens}
      bold={bold}
    />
  )
}
