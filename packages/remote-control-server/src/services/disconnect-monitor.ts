import { log, error as logError } from '../logger'
import {
  storeListActiveEnvironments,
  storeUpdateEnvironment,
  storeMarkAcpAgentOffline,
} from '../store'
import { storeListSessions } from '../store'
import { config } from '../config'
import { hasActiveSessionConnection } from '../transport/ws-handler'
import { updateSessionStatus, updateSessionWorkerStatus } from './session'
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
      if (hasActiveSessionConnection(session.id)) continue
      const elapsed = now - session.updatedAt.getTime()
      if (elapsed > timeoutMs * 2) {
        log(
          `[RCS] Session ${session.id} worker marked offline (no update for ${Math.round(elapsed / 1000)}s)`,
        )
        if (session.status === 'running') {
          updateSessionStatus(session.id, 'idle')
        }
        updateSessionWorkerStatus(session.id, 'offline')
      }
    }
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
