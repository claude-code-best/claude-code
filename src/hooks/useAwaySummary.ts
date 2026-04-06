import { feature } from 'bun:bundle'
import { useEffect, useRef } from 'react'
import {
  getTerminalFocusState,
  subscribeTerminalFocus,
} from '../ink/terminal-focus-state.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { generateAwaySummary } from '../services/awaySummary.js'
import type { Message } from '../types/message.js'
import { createAwaySummaryMessage } from '../utils/messages.js'

const BLUR_DELAY_MS = 5 * 60_000

type SetMessages = (updater: (prev: Message[]) => Message[]) => void

function hasSummarySinceLastUserTurn(messages: readonly Message[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!
    if (m.type === 'user' && !m.isMeta && !m.isCompactSummary) return false
    if (m.type === 'system' && m.subtype === 'away_summary') return true
  }
  return false
}

/**
 * Appends a "while you were away" summary message after the terminal has been
 * blurred for 5 minutes. Fires only when (a) 5min since blur, (b) no turn in
 * progress, and (c) no existing away_summary since the last user message.
 *
 * For terminals that don't support DECSET 1004 focus events (CMD, PowerShell),
 * falls back to idle-based detection: starts an idle timer after each turn
 * ends, resets it when the user starts a new turn.
 */
export function useAwaySummary(
  messages: readonly Message[],
  setMessages: SetMessages,
  isLoading: boolean,
): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const messagesRef = useRef(messages)
  const isLoadingRef = useRef(isLoading)
  const pendingRef = useRef(false)
  const generateRef = useRef<(() => Promise<void>) | null>(null)

  messagesRef.current = messages
  isLoadingRef.current = isLoading

  // 3P default: false
  const gbEnabled = getFeatureValue_CACHED_MAY_BE_STALE(
    'tengu_sedge_lantern',
    false,
  )

  useEffect(() => {
    if (!feature('AWAY_SUMMARY')) return
    if (!gbEnabled) return

    function clearTimer(): void {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    function abortInFlight(): void {
      abortRef.current?.abort()
      abortRef.current = null
    }

    async function generate(): Promise<void> {
      pendingRef.current = false
      if (hasSummarySinceLastUserTurn(messagesRef.current)) return
      abortInFlight()
      const controller = new AbortController()
      abortRef.current = controller
      const text = await generateAwaySummary(
        messagesRef.current,
        controller.signal,
      )
      if (controller.signal.aborted || text === null) return
      setMessages(prev => [...prev, createAwaySummaryMessage(text)])
    }

    function onBlurTimerFire(): void {
      timerRef.current = null
      if (isLoadingRef.current) {
        pendingRef.current = true
        return
      }
      void generate()
    }

    function onFocusChange(): void {
      const state = getTerminalFocusState()
      if (state === 'blurred' || state === 'unknown') {
        // For 'unknown' terminals (CMD, PowerShell), treat mount as
        // potentially away — start idle timer. The isLoading effect
        // below resets the timer on each turn transition.
        clearTimer()
        timerRef.current = setTimeout(onBlurTimerFire, BLUR_DELAY_MS)
      } else if (state === 'focused') {
        clearTimer()
        abortInFlight()
        pendingRef.current = false
      }
    }

    const unsubscribe = subscribeTerminalFocus(onFocusChange)
    // Handle the case where we're already blurred when the effect mounts
    onFocusChange()
    generateRef.current = generate

    return () => {
      unsubscribe()
      clearTimer()
      abortInFlight()
      generateRef.current = null
    }
  }, [gbEnabled, setMessages])

  // Timer fired mid-turn → fire when turn ends (if still away)
  useEffect(() => {
    if (isLoading) return
    if (!pendingRef.current) return
    const state = getTerminalFocusState()
    if (state !== 'blurred' && state !== 'unknown') return
    void generateRef.current?.()
  }, [isLoading])

  // For 'unknown' terminals: use isLoading transitions as presence signal.
  // User starts a turn → they're present, cancel idle timer.
  // Turn ends → restart idle timer.
  useEffect(() => {
    if (getTerminalFocusState() !== 'unknown') return
    if (!feature('AWAY_SUMMARY')) return
    if (!gbEnabled) return

    if (isLoading) {
      // User is actively using — cancel idle timer
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      abortRef.current?.abort()
      abortRef.current = null
      pendingRef.current = false
    } else {
      // Turn ended — restart idle timer
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        if (isLoadingRef.current) {
          pendingRef.current = true
          return
        }
        void generateRef.current?.()
      }, BLUR_DELAY_MS)
    }
  }, [isLoading, gbEnabled])
}
