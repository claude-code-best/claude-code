import React, { createContext, useEffect, useState } from 'react'
import { FRAME_INTERVAL_MS } from '../core/constants.js'
import { useTerminalFocus } from '../hooks/use-terminal-focus.js'

export type Clock = {
  subscribe: (onChange: () => void, keepAlive: boolean) => () => void
  now: () => number
  setTickInterval: (ms: number) => void
}

export function createClock(tickIntervalMs: number): Clock {
  const subscribers = new Map<() => void, boolean>()
  let interval: ReturnType<typeof setInterval> | null = null
  let currentTickIntervalMs = tickIntervalMs
  let startTime = 0
  // Snapshot of the current tick's time, ensuring all subscribers in the same
  // tick see the same value (keeps animations synchronized)
  let tickTime = 0

  function tick(): void {
    tickTime = Date.now() - startTime
    for (const onChange of subscribers.keys()) {
      onChange()
    }
  }

  function updateInterval(): void {
    const anyKeepAlive = [...subscribers.values()].some(Boolean)

    if (anyKeepAlive) {
      if (interval) {
        clearInterval(interval)
        interval = null
      }
      if (startTime === 0) {
        startTime = Date.now()
      }
      interval = setInterval(tick, currentTickIntervalMs)
    } else if (interval) {
      clearInterval(interval)
      interval = null
    }
  }

  return {
    subscribe(onChange, keepAlive) {
      subscribers.set(onChange, keepAlive)
      updateInterval()
      return () => {
        subscribers.delete(onChange)
        updateInterval()
      }
    },

    now() {
      if (startTime === 0) {
        startTime = Date.now()
      }
      // When the clock interval is running, return the synchronized tickTime
      // so all subscribers in the same tick see the same value.
      // When paused (no keepAlive subscribers), return real-time to avoid
      // returning a stale tickTime from the last tick before the pause.
      if (interval && tickTime) {
        return tickTime
      }
      return Date.now() - startTime
    },

    setTickInterval(ms) {
      if (ms === currentTickIntervalMs) return
      currentTickIntervalMs = ms
      updateInterval()
    },
  }
}

export const ClockContext = createContext<Clock | null>(null)

const BLURRED_TICK_INTERVAL_MS = FRAME_INTERVAL_MS * 2

// Own component so App.tsx doesn't re-render when the clock is created.
// The clock value is stable (created once via useState), so the provider
// never causes consumer re-renders on its own.
export function ClockProvider({
  children,
}: {
  children: React.ReactNode
}): React.ReactNode {
  const [clock] = useState(() => createClock(FRAME_INTERVAL_MS))
  const focused = useTerminalFocus()

  useEffect(() => {
    clock.setTickInterval(
      focused ? FRAME_INTERVAL_MS : BLURRED_TICK_INTERVAL_MS,
    )
  }, [clock, focused])

  return <ClockContext.Provider value={clock}>{children}</ClockContext.Provider>
}
