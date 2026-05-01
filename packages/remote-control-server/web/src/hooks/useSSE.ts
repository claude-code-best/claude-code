import { useEffect, useRef, useCallback } from 'react'
import { connectSSE, disconnectSSE } from '../api/sse'
import type { SessionEvent } from '../types'

export function useSSE(
  sessionId: string | null,
  onEvent: (event: SessionEvent) => void,
) {
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  const stableCallback = useCallback((event: SessionEvent) => {
    onEventRef.current(event)
  }, [])

  useEffect(() => {
    if (!sessionId) return

    connectSSE(sessionId, stableCallback)

    return () => {
      disconnectSSE()
    }
  }, [sessionId, stableCallback])
}
