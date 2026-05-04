/**
 * usePipeRelay — Pipe message relay utilities for slave → master communication.
 *
 * Provides `relayPipeMessage` and `pipeReturnHadErrorRef` for use in
 * onQuery callbacks. The relay function reads from the module-level
 * `getPipeRelay()` singleton set by usePipeIpc's attach handler.
 */
import { useRef, useCallback } from 'react'
import { getPipeRelay, isRelayMuted } from '../utils/pipePermissionRelay.js'
import type { PipeMessage } from '../utils/pipeTransport.js'

export type PipeRelayHandle = {
  /** Send a relay message to the master. Returns false if no relay is active. */
  relayPipeMessage: (message: PipeMessage) => boolean
  /** Tracks whether an error was already relayed for this query turn. */
  pipeReturnHadErrorRef: React.MutableRefObject<boolean>
}

/**
 * Hook that provides pipe relay utilities. Safe to call unconditionally —
 * when UDS_INBOX is off, the relay function is a no-op that returns false.
 */
export function usePipeRelay(): PipeRelayHandle {
  const pipeReturnHadErrorRef = useRef(false)

  const relayPipeMessage = useCallback((message: PipeMessage): boolean => {
    const relay = getPipeRelay()
    if (typeof relay !== 'function') {
      return false
    }
    if (isRelayMuted()) {
      return false
    }
    relay(message)
    return true
  }, [])

  return { relayPipeMessage, pipeReturnHadErrorRef }
}
