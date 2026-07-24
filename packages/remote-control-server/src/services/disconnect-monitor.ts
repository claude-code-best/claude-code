import { log, error as logError } from '../logger'
import {
  storeListActiveEnvironments,
  storeUpdateEnvironment,
  storeMarkAcpAgentOffline,
  storeGetSessionWorker,
  storeGetOpenWorkItemForSession,
  storeUpdateWorkItem,
} from '../store'
import { storeListSessions } from '../store'
import { config } from '../config'
import { hasActiveSessionConnection } from '../transport/ws-handler'
import {
  updateSessionStatus,
  updateSessionWorkerStatus,
  incrementEpoch,
} from './session'
import { probeArchivedCodeProjects } from './code-project-lifecycle'
import { retryChatCleanupTombstones } from './chat-cleanup'

export function runDisconnectMonitorSweep(now = Date.now()) {
  const timeoutMs = config.disconnectTimeout * 1000

  // Check environment heartbeat timeout
  const envs = storeListActiveEnvironments()
  for (const env of envs) {
    // Skip ACP agents — they use WS keepalive, not polling
    if (env.workerType === 'acp') {
      if (env.lastPollAt && now - env.lastPollAt.getTime() > timeoutMs) {
        log(
          `[RCS] ACP agent ${env.id} timed out (no activity for ${Math.round((now - env.lastPollAt.getTime()) / 1000)}s)`,
        )
        storeMarkAcpAgentOffline(env.id)
      }
      continue
    }
    if (env.lastPollAt && now - env.lastPollAt.getTime() > timeoutMs) {
      log(
        `[RCS] Environment ${env.id} timed out (no poll for ${Math.round((now - env.lastPollAt.getTime()) / 1000)}s)`,
      )
      storeUpdateEnvironment(env.id, { status: 'offline' })
    }
  }

  // Check session timeout (2x disconnect timeout with no update)
  const sessions = storeListSessions()
  for (const session of sessions) {
    if (session.status === 'running' || session.status === 'idle') {
      // A live bridge WS is definitive liveness — the updatedAt clock can
      // lag behind it (v1 sessions only refresh it on inbound frames).
      // CCR v2 workers keep updatedAt fresh via heartbeat→touchSession, so a
      // stale updatedAt below means genuinely no worker traffic (WS or SSE).
      if (hasActiveSessionConnection(session.id)) continue
      // Already reaped on an earlier sweep: skip so a long-dead session isn't
      // re-logged every 60s (the "worker marked offline" flood) or re-fenced.
      // A fresh worker re-arms workerStatus (register/heartbeat) and lifts this.
      if (storeGetSessionWorker(session.id)?.workerStatus === 'offline')
        continue
      const elapsed = now - session.updatedAt.getTime()
      if (elapsed > timeoutMs * 2) {
        log(
          `[RCS] Session ${session.id} worker marked offline (no update for ${Math.round(elapsed / 1000)}s)`,
        )
        if (session.status === 'running') {
          updateSessionStatus(session.id, 'idle')
        }
        updateSessionWorkerStatus(session.id, 'offline')
        reapStaleSessionWorker(session.id)
      }
    }
  }
}

/**
 * Reap a worker that stopped updating without a clean stopWork. Two things
 * leak in that case and wedge the session until a full RCS/bridge restart:
 *
 *  1. The open work item stays dispatched/acked, so ensureWorkItem
 *     short-circuits on it and the next user message never gets a fresh
 *     worker. Completing it (pending work is left alone — it was never taken)
 *     lets dispatchWorkForUserInput queue new work.
 *  2. A still-alive-but-disconnected zombie worker holds the bridge's session
 *     slot. Bumping the epoch fences it: its next epoch-checked request (SSE
 *     reconnect or heartbeat) returns 409 and it exits, freeing the slot so
 *     the next message respawns cleanly.
 *
 * Best-effort: a throw here must not abort the rest of the sweep.
 */
function reapStaleSessionWorker(sessionId: string): void {
  try {
    const openWork = storeGetOpenWorkItemForSession(sessionId)
    if (openWork && openWork.state !== 'pending') {
      storeUpdateWorkItem(openWork.id, { state: 'completed' })
    }
    incrementEpoch(sessionId)
  } catch (err) {
    logError(
      `[RCS] Failed to reap stale worker for session ${sessionId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
  }
}

export function startDisconnectMonitor() {
  let projectProbeRunning = false
  setInterval(() => {
    runDisconnectMonitorSweep()
    if (!projectProbeRunning) {
      projectProbeRunning = true
      void probeArchivedCodeProjects().finally(() => {
        void retryChatCleanupTombstones().finally(() => {
          projectProbeRunning = false
        })
      })
    }
  }, 60_000) // Check every minute
}
