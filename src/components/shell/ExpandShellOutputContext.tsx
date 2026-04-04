import * as React from 'react'
import { useContext } from 'react'

/**
 * Context to indicate that shell output should be shown in full (not truncated).
 * Used to auto-expand the most recent user `!` command output.
 *
 * This follows the same pattern as MessageResponseContext and SubAgentContext -
 * a boolean context that child components can check to modify their behavior.
 */
const ExpandShellOutputContext = React.createContext(false)

export function ExpandShellOutputProvider({
  children,
}: {
  children: React.ReactNode
}): React.ReactNode {
  return (
    <ExpandShellOutputContext.Provider value={true}>
      {children}
    </ExpandShellOutputContext.Provider>
  )
}

/**
 * Returns true if this component is rendered inside an ExpandShellOutputProvider,
 * indicating the shell output should be shown in full rather than truncated.
 */
export function useExpandShellOutput(): boolean {
  return useContext(ExpandShellOutputContext)
}
