import React, { createContext, useMemo, useSyncExternalStore } from 'react'
import {
  getTerminalFocused,
  getTerminalFocusState,
  subscribeTerminalFocus,
  type TerminalFocusState,
} from '../terminal-focus-state.js'

export type { TerminalFocusState }

export type TerminalFocusContextProps = {
  readonly isTerminalFocused: boolean
  readonly terminalFocusState: TerminalFocusState
}

const TerminalFocusContext = createContext<TerminalFocusContextProps>({
  isTerminalFocused: true,
  terminalFocusState: 'unknown',
})

// eslint-disable-next-line custom-rules/no-top-level-side-effects
TerminalFocusContext.displayName = 'TerminalFocusContext'

// Separate component so App.tsx doesn't re-render on focus changes.
// Children are a stable prop reference, so they don't re-render either —
// only components that consume the context will re-render.
export function TerminalFocusProvider({
  children,
}: {
  children: React.ReactNode
}): React.ReactNode {
  const isTerminalFocused = useSyncExternalStore(
    subscribeTerminalFocus,
    getTerminalFocused,
  )
  const terminalFocusState = useSyncExternalStore(
    subscribeTerminalFocus,
    getTerminalFocusState,
  )

  const value = useMemo(
    () => ({ isTerminalFocused, terminalFocusState }),
    [isTerminalFocused, terminalFocusState],
  )

  return (
    <TerminalFocusContext.Provider value={value}>
      {children}
    </TerminalFocusContext.Provider>
  )
}

export default TerminalFocusContext
