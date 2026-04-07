import { useContext } from 'react'
import { type TerminalSize, TerminalSizeContext } from '@anthropic/ink'

export function useTerminalSize(): TerminalSize {
  const size = useContext(TerminalSizeContext)

  if (!size) {
    throw new Error('useTerminalSize must be used within an Ink App component')
  }

  return size
}
