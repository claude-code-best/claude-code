// Keybinding type definitions
export type ParsedBinding = {
  chord: ParsedKeystroke[]
  action: string | null
  context: KeybindingContextName
}

export type ParsedKeystroke = {
  key: string
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
  super: boolean
}

export type KeybindingContextName = string
export type KeybindingBlock = {
  context: KeybindingContextName
  bindings: Record<string, string | null>
}
export type Chord = ParsedKeystroke[]
export type KeybindingAction = string

/**
 * Types of validation issues that can occur with keybindings.
 */
export type KeybindingWarningType =
  | 'parse_error'
  | 'duplicate'
  | 'reserved'
  | 'invalid_context'
  | 'invalid_action'

/**
 * A warning or error about a keybinding configuration issue.
 */
export type KeybindingWarning = {
  type: KeybindingWarningType
  severity: 'error' | 'warning'
  message: string
  key?: string
  context?: string
  action?: string
  suggestion?: string
}

/**
 * Result of loading keybindings, including any validation warnings.
 */
export type KeybindingsLoadResult = {
  bindings: ParsedBinding[]
  warnings: KeybindingWarning[]
}
