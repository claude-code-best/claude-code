/**
 * useProactive — React hook that drives tick generation for proactive mode.
 *
 * Mounted inside REPL.tsx when feature('PROACTIVE') || feature('KAIROS').
 * Generates <tick>HH:MM:SS</tick> prompts at a fixed interval while
 * proactive mode is active and not blocked.
 */
import { useEffect, useRef } from 'react'
import type { QueuedCommand } from '../types/textInputTypes.js'
import { TICK_TAG } from '../constants/xml.js'
import { getCwd } from '../utils/cwd.js'
import { createProactiveAutonomyCommands } from '../utils/autonomyRuns.js'
import {
  isProactiveActive,
  isProactivePaused,
  isContextBlocked,
  setNextTickAt,
  shouldTick,
} from './index.js'

/** Default interval between ticks (ms). Prompt cache TTL is ~5 min so we
 *  stay well under that to keep the cache warm. */
const TICK_INTERVAL_MS = 30_000

type UseProactiveOpts = {
  isLoading: boolean
  queuedCommandsLength: number
  hasActiveLocalJsxUI: boolean
  isInPlanMode: boolean
  onQueueTick: (command: QueuedCommand) => void
}

export function useProactive(opts: UseProactiveOpts): void {
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => {
    if (!isProactiveActive()) return

    let timer: ReturnType<typeof setTimeout> | null = null

    function scheduleTick(): void {
      const nextTs = Date.now() + TICK_INTERVAL_MS
      setNextTickAt(nextTs)

      timer = setTimeout(() => {
        timer = null

        // Guard: skip tick if any blocking condition is met
        if (!shouldTick()) {
          // Reschedule — conditions may clear later
          scheduleTick()
          return
        }

        const {
          isLoading,
          queuedCommandsLength,
          hasActiveLocalJsxUI,
          isInPlanMode,
        } = optsRef.current

        // Don't fire while a query is in-flight, plan mode is active,
        // a local JSX UI is showing, or commands are queued
        if (
          isLoading ||
          isInPlanMode ||
          hasActiveLocalJsxUI ||
          queuedCommandsLength > 0
        ) {
          scheduleTick()
          return
        }

        void (async () => {
          const commands = await createProactiveAutonomyCommands({
            basePrompt: `<${TICK_TAG}>${new Date().toLocaleTimeString()}</${TICK_TAG}>`,
            currentDir: getCwd(),
          })
          for (const command of commands) {
            // Always queue proactive turns. This avoids races where the prompt
            // is built asynchronously, a user turn starts meanwhile, and a
            // direct-submit path would silently drop the autonomy turn after
            // consuming its heartbeat due-state.
            optsRef.current.onQueueTick(command)
          }
        })()

        // Schedule next tick
        scheduleTick()
      }, TICK_INTERVAL_MS)
    }

    scheduleTick()

    return () => {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      setNextTickAt(null)
    }
  }, [
    // Re-mount when proactive state changes
    isProactiveActive(),
    isProactivePaused(),
    isContextBlocked(),
  ])
}
