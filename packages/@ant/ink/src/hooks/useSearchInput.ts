/**
 * Minimal stub of useSearchInput for the standalone @anthropic/ink package.
 *
 * Provides the same interface as the full implementation but without
 * kill-ring / yank support. Suitable for FuzzyPicker and other theme
 * components that need text input handling.
 */

import { useCallback, useState } from 'react'
import type { KeyboardEvent } from '../core/events/keyboard-event.js'
import useInput from './use-input.js'
import { useTerminalSize } from '../hooks/useTerminalSize.js'

type UseSearchInputOptions = {
  isActive: boolean
  onExit: () => void
  onCancel?: () => void
  onExitUp?: () => void
  columns?: number
  passthroughCtrlKeys?: string[]
  initialQuery?: string
  backspaceExitsOnEmpty?: boolean
}

type UseSearchInputReturn = {
  query: string
  setQuery: (q: string) => void
  cursorOffset: number
  handleKeyDown: (e: KeyboardEvent) => void
}

const UNHANDLED_SPECIAL_KEYS = new Set([
  'pageup',
  'pagedown',
  'insert',
  'wheelup',
  'wheeldown',
  'mouse',
  'f1',
  'f2',
  'f3',
  'f4',
  'f5',
  'f6',
  'f7',
  'f8',
  'f9',
  'f10',
  'f11',
  'f12',
])

export function useSearchInput({
  isActive,
  onExit,
  onCancel,
  onExitUp,
  columns,
  initialQuery = '',
  backspaceExitsOnEmpty = true,
}: UseSearchInputOptions): UseSearchInputReturn {
  const { columns: terminalColumns } = useTerminalSize()
  const _effectiveColumns = columns ?? terminalColumns
  const [query, setQueryState] = useState(initialQuery)
  const [cursorOffset, setCursorOffset] = useState(initialQuery.length)

  const setQuery = useCallback((q: string) => {
    setQueryState(q)
    setCursorOffset(q.length)
  }, [])

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (!isActive) return

    if (e.key === 'return' || e.key === 'down') {
      e.preventDefault()
      onExit()
      return
    }
    if (e.key === 'up') {
      e.preventDefault()
      onExitUp?.()
      return
    }
    if (e.key === 'escape') {
      e.preventDefault()
      if (onCancel) {
        onCancel()
      } else if (query.length > 0) {
        setQueryState('')
        setCursorOffset(0)
      } else {
        onExit()
      }
      return
    }
    if (e.key === 'backspace') {
      e.preventDefault()
      if (query.length === 0) {
        if (backspaceExitsOnEmpty) (onCancel ?? onExit)()
        return
      }
      const newOffset = Math.max(0, cursorOffset - 1)
      setQueryState(query.slice(0, newOffset) + query.slice(cursorOffset))
      setCursorOffset(newOffset)
      return
    }
    if (e.key === 'delete') {
      e.preventDefault()
      if (cursorOffset < query.length) {
        setQueryState(query.slice(0, cursorOffset) + query.slice(cursorOffset + 1))
      }
      return
    }
    if (e.key === 'left') {
      e.preventDefault()
      setCursorOffset(Math.max(0, cursorOffset - 1))
      return
    }
    if (e.key === 'right') {
      e.preventDefault()
      setCursorOffset(Math.min(query.length, cursorOffset + 1))
      return
    }
    if (e.key === 'home') {
      e.preventDefault()
      setCursorOffset(0)
      return
    }
    if (e.key === 'end') {
      e.preventDefault()
      setCursorOffset(query.length)
      return
    }
    if (e.ctrl) {
      switch (e.key.toLowerCase()) {
        case 'a':
          e.preventDefault()
          setCursorOffset(0)
          return
        case 'e':
          e.preventDefault()
          setCursorOffset(query.length)
          return
        case 'b':
          e.preventDefault()
          setCursorOffset(Math.max(0, cursorOffset - 1))
          return
        case 'f':
          e.preventDefault()
          setCursorOffset(Math.min(query.length, cursorOffset + 1))
          return
        case 'd': {
          e.preventDefault()
          if (query.length === 0) {
            ;(onCancel ?? onExit)()
            return
          }
          if (cursorOffset < query.length) {
            setQueryState(query.slice(0, cursorOffset) + query.slice(cursorOffset + 1))
          }
          return
        }
        case 'h': {
          e.preventDefault()
          if (query.length === 0) {
            if (backspaceExitsOnEmpty) (onCancel ?? onExit)()
            return
          }
          const newOffset = Math.max(0, cursorOffset - 1)
          setQueryState(query.slice(0, newOffset) + query.slice(cursorOffset))
          setCursorOffset(newOffset)
          return
        }
        case 'c':
          e.preventDefault()
          onCancel?.()
          return
        case 'u':
          e.preventDefault()
          setQueryState(query.slice(cursorOffset))
          setCursorOffset(0)
          return
        case 'k':
          e.preventDefault()
          setQueryState(query.slice(0, cursorOffset))
          return
        case 'w': {
          e.preventDefault()
          // Delete word before cursor
          const before = query.slice(0, cursorOffset)
          const after = query.slice(cursorOffset)
          const trimmed = before.replace(/\S+\s*$/, '')
          setQueryState(trimmed + after)
          setCursorOffset(trimmed.length)
          return
        }
      }
      return
    }
    if (e.key === 'tab') {
      return
    }

    // Regular character input
    if (e.key.length >= 1 && !UNHANDLED_SPECIAL_KEYS.has(e.key)) {
      e.preventDefault()
      setQueryState(query.slice(0, cursorOffset) + e.key + query.slice(cursorOffset))
      setCursorOffset(cursorOffset + 1)
    }
  }

  // Bridge: subscribe via useInput and adapt to KeyboardEvent
  useInput(
    (_input: string, _key: unknown, event: { keypress: string }) => {
      handleKeyDown(new KeyboardEvent(event.keypress))
    },
    { isActive },
  )

  return { query, setQuery, cursorOffset, handleKeyDown }
}
