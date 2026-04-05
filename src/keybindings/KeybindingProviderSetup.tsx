/**
 * Setup utilities for integrating KeybindingProvider into the app.
 *
 * This file provides the bindings and a composed provider that can be
 * added to the app's component tree. It loads both default bindings and
 * user-defined bindings from ~/.claude/keybindings.json, with hot-reload
 * support when the file changes.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNotifications } from '../context/notifications.js'
import type { InputEvent } from '../ink/events/input-event.js'
// ChordInterceptor intentionally uses useInput to intercept all keystrokes before
// other handlers process them - this is required for chord sequence support
// eslint-disable-next-line custom-rules/prefer-use-keybindings
import { type Key, useInput } from '../ink.js'
import { count } from '../utils/array.js'
import { logForDebugging } from '../utils/debug.js'
import { plural } from '../utils/stringUtils.js'
import { KeybindingProvider } from './KeybindingContext.js'
import {
  initializeKeybindingWatcher,
  type KeybindingsLoadResult,
  loadKeybindingsSyncWithWarnings,
  subscribeToKeybindingChanges,
} from './loadUserBindings.js'
import { resolveKeyWithChordState } from './resolver.js'
import type {
  KeybindingContextName,
  ParsedBinding,
  ParsedKeystroke,
} from './types.js'
import type { KeybindingWarning } from './validate.js'

/**
 * Timeout for chord sequences in milliseconds.
 * If the user doesn't complete the chord within this time, it's cancelled.
 */
const CHORD_TIMEOUT_MS = 1000

type Props = {
  children: React.ReactNode
}

/**
 * Keybinding provider with default + user bindings and hot-reload support.
 *
 * Usage: Wrap your app with this provider to enable keybinding support.
 *
 * ```tsx
 * <AppStateProvider>
 *   <KeybindingSetup>
 *     <REPL ... />
 *   </KeybindingSetup>
 * </AppStateProvider>
 * ```
 *
 * Features:
 * - Loads default bindings from code
 * - Merges with user bindings from ~/.claude/keybindings.json
 * - Watches for file changes and reloads automatically (hot-reload)
 * - User bindings override defaults (later entries win)
 * - Chord support with automatic timeout
 */
/**
 * Display keybinding warnings to the user via notifications.
 * Shows a brief message pointing to /doctor for details.
 */
function useKeybindingWarnings(
  warnings: KeybindingWarning[],
  isReload: boolean,
): void {
  const { addNotification, removeNotification } = useNotifications()

  useEffect(() => {
    const notificationKey = 'keybinding-config-warning'

    if (warnings.length === 0) {
      removeNotification(notificationKey)
      return
    }

    const errorCount = count(warnings, w => w.severity === 'error')
    const warnCount = count(warnings, w => w.severity === 'warning')

    let message: string
    if (errorCount > 0 && warnCount > 0) {
      message = `Found ${errorCount} keybinding ${plural(errorCount, 'error')} and ${warnCount} ${plural(warnCount, 'warning')}`
    } else if (errorCount > 0) {
      message = `Found ${errorCount} keybinding ${plural(errorCount, 'error')}`
    } else {
      message = `Found ${warnCount} keybinding ${plural(warnCount, 'warning')}`
    }
    message += ' · /doctor for details'

    addNotification({
      key: notificationKey,
      text: message,
      color: errorCount > 0 ? 'error' : 'warning',
      priority: errorCount > 0 ? 'immediate' : 'high',
      // Keep visible for 60 seconds like settings errors
      timeoutMs: 60000,
    })
  }, [warnings, isReload, addNotification, removeNotification])
}

export function KeybindingSetup({ children }: Props): React.ReactNode {
  // Load bindings synchronously for initial render
  const [{ bindings, warnings }, setLoadResult] =
    useState<KeybindingsLoadResult>(() => {
      const result = loadKeybindingsSyncWithWarnings()
      logForDebugging(
        `[keybindings] KeybindingSetup initialized with ${result.bindings.length} bindings, ${result.warnings.length} warnings`,
      )
      return result
    })

  // Track if this is a reload (not initial load)
  const [isReload, setIsReload] = useState(false)

  // Display warnings via notifications
  useKeybindingWarnings(warnings, isReload)

  // Chord state management - use ref for immediate access, state for re-renders
  // The ref is used by resolve() to get the current value without waiting for re-render
  // The state is used to trigger re-renders when needed (e.g., for UI updates)
  const pendingChordRef = useRef<ParsedKeystroke[] | null>(null)
  const [pendingChord, setPendingChordState] = useState<
    ParsedKeystroke[] | null
  >(null)
  const chordTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Handler registry for action callbacks (used by ChordInterceptor to invoke handlers)
  const handlerRegistryRef = useRef(
    new Map<
      string,
      Set<{
        action: string
        context: KeybindingContextName
        handler: () => void
      }>
    >(),
  )

  // Active context tracking for keybinding priority resolution
  // Using a ref instead of state for synchronous updates - input handlers need
  // to see the current value immediately, not after a React render cycle.
  const activeContextsRef = useRef<Set<KeybindingContextName>>(new Set())

  const registerActiveContext = useCallback(
    (context: KeybindingContextName) => {
      activeContextsRef.current.add(context)
    },
    [],
  )

  const unregisterActiveContext = useCallback(
    (context: KeybindingContextName) => {
      activeContextsRef.current.delete(context)
    },
    [],
  )

  // Clear chord timeout when component unmounts or chord changes
  const clearChordTimeout = useCallback(() => {
    if (chordTimeoutRef.current) {
      clearTimeout(chordTimeoutRef.current)
      chordTimeoutRef.current = null
    }
  }, [])

  // Wrapper for setPendingChord that manages timeout and syncs ref+state
  const setPendingChord = useCallback(
    (pending: ParsedKeystroke[] | null) => {
      clearChordTimeout()

      if (pending !== null) {
        // Set timeout to cancel chord if not completed
        chordTimeoutRef.current = setTimeout(
          (pendingChordRef, setPendingChordState) => {
            logForDebugging('[keybindings] Chord timeout - cancelling')
            pendingChordRef.current = null
            setPendingChordState(null)
          },
          CHORD_TIMEOUT_MS,
          pendingChordRef,
          setPendingChordState,
        )
      }

      // Update ref immediately for synchronous access in resolve()
      pendingChordRef.current = pending
      // Update state to trigger re-renders for UI updates
      setPendingChordState(pending)
    },
    [clearChordTimeout],
  )

  useEffect(() => {
    // Initialize file watcher (idempotent - only runs once)
    void initializeKeybindingWatcher()

    // Subscribe to changes
    const unsubscribe = subscribeToKeybindingChanges(result => {
      // Any callback invocation is a reload since initial load happens
      // synchronously in useState, not via this subscription
      setIsReload(true)

      setLoadResult(result)
      logForDebugging(
        `[keybindings] Reloaded: ${result.bindings.length} bindings, ${result.warnings.length} warnings`,
      )
    })

    return () => {
      unsubscribe()
      clearChordTimeout()
    }
  }, [clearChordTimeout])

  return (
    <KeybindingProvider
      bindings={bindings}
      pendingChordRef={pendingChordRef}
      pendingChord={pendingChord}
      setPendingChord={setPendingChord}
      activeContexts={activeContextsRef.current}
      registerActiveContext={registerActiveContext}
      unregisterActiveContext={unregisterActiveContext}
      handlerRegistryRef={handlerRegistryRef}
    >
      <ChordInterceptor
        bindings={bindings}
        pendingChordRef={pendingChordRef}
        setPendingChord={setPendingChord}
        activeContexts={activeContextsRef.current}
        handlerRegistryRef={handlerRegistryRef}
      />
      {children}
    </KeybindingProvider>
  )
}

/**
 * Global chord interceptor that registers useInput FIRST (before children).
 *
 * This component intercepts keystrokes that are part of chord sequences and
 * stops propagation before other handlers (like PromptInput) can see them.
 *
 * Without this, the second key of a chord (e.g., 'r' in "ctrl+c r") would be
 * captured by PromptInput and added to the input field before the keybinding
 * system could recognize it as completing a chord.
 */
type HandlerRegistration = {
  action: string
  context: KeybindingContextName
  handler: () => void
}

function ChordInterceptor({
  bindings,
  pendingChordRef,
  setPendingChord,
  activeContexts,
  handlerRegistryRef,
}: {
  bindings: ParsedBinding[]
  pendingChordRef: React.RefObject<ParsedKeystroke[] | null>
  setPendingChord: (pending: ParsedKeystroke[] | null) => void
  activeContexts: Set<KeybindingContextName>
  handlerRegistryRef: React.RefObject<Map<string, Set<HandlerRegistration>>>
}): null {
  const handleInput = useCallback(
    (input: string, key: Key, event: InputEvent) => {
      // Wheel events can never start chord sequences — scroll:lineUp/Down are
      // single-key bindings handled by per-component useKeybindings hooks, not
      // here. Skip the registry scan. Mid-chord wheel still falls through so
      // scrolling cancels the pending chord like any other non-matching key.
      if ((key.wheelUp || key.wheelDown) && pendingChordRef.current === null) {
        return
      }

      // Build context list from registered handlers + activeContexts + Global
      // This ensures we can resolve chords for all contexts that have handlers
      const registry = handlerRegistryRef.current
      const handlerContexts = new Set<KeybindingContextName>()
      if (registry) {
        for (const handlers of registry.values()) {
          for (const registration of handlers) {
            handlerContexts.add(registration.context)
          }
        }
      }
      const contexts: KeybindingContextName[] = [
        ...handlerContexts,
        ...activeContexts,
        'Global',
      ]

      // Track whether we're completing a chord (pending was non-null)
      const wasInChord = pendingChordRef.current !== null

      // Check if this keystroke is part of a chord sequence
      const result = resolveKeyWithChordState(
        input,
        key,
        contexts,
        bindings,
        pendingChordRef.current,
      )

      switch (result.type) {
        case 'chord_started':
          // This key starts a chord - store pending state and stop propagation
          setPendingChord(result.pending)
          event.stopImmediatePropagation()
          break

        case 'match': {
          // Clear pending state
          setPendingChord(null)

          // Only invoke handlers and stop propagation for chord completions
          // (multi-keystroke sequences). Single-keystroke matches should propagate
          // to per-hook handlers to avoid interfering with other input handling
          // (e.g., Enter needs to reach useTypeahead for autocomplete acceptance
          // before the submit handler fires).
          if (wasInChord) {
            // Find and invoke the handler for this action
            // We need to check that the handler's context is in our resolved contexts
            // (which includes handlerContexts + activeContexts + Global)
            const contextsSet = new Set(contexts)
            if (registry) {
              const handlers = registry.get(result.action)
              if (handlers && handlers.size > 0) {
                // Find handlers whose context is in our resolved contexts
                for (const registration of handlers) {
                  if (contextsSet.has(registration.context)) {
                    registration.handler()
                    event.stopImmediatePropagation()
                    break // Only invoke the first matching handler
                  }
                }
              }
            }
          }
          break
        }

        case 'chord_cancelled':
          // Invalid key during chord - clear pending state and swallow the
          // keystroke so it doesn't propagate as a standalone action
          // (e.g., ctrl+x ctrl+c should not fire app:interrupt).
          setPendingChord(null)
          event.stopImmediatePropagation()
          break

        case 'unbound':
          // Key is explicitly unbound - clear pending state and swallow
          // the keystroke (it was part of a chord sequence).
          setPendingChord(null)
          event.stopImmediatePropagation()
          break

        case 'none':
          // No chord involvement - let other handlers process
          break
      }
    },
    [
      bindings,
      pendingChordRef,
      setPendingChord,
      activeContexts,
      handlerRegistryRef,
    ],
  )

  useInput(handleInput)

  return null
}
