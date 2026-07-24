import type { Session } from '../types'

export type SessionIndicatorState = 'online' | 'working' | 'waiting'

/**
 * The worker state is authoritative for the session list indicator. A
 * session can exist before its worker connects, so falling back to the
 * session lifecycle status would incorrectly paint offline sessions.
 */
export function getSessionIndicatorState(
  session: Pick<Session, 'worker_status'>,
): SessionIndicatorState | null {
  switch (session.worker_status) {
    case 'idle':
    case 'online':
      return 'online'
    case 'running':
    case 'working':
    case 'busy':
      return 'working'
    case 'requires_action':
      return 'waiting'
    default:
      return null
  }
}
