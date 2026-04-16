import { storeListActiveEnvironments, storeUpdateEnvironment } from "../store";
import { storeListSessions } from "../store";
import { config } from "../config";
import { updateSessionStatus } from "./session";

export function runDisconnectMonitorSweep(now = Date.now()) {
  const timeoutMs = config.disconnectTimeout * 1000;

  // Check environment heartbeat timeout
  const envs = storeListActiveEnvironments();
  for (const env of envs) {
    if (env.lastPollAt && now - env.lastPollAt.getTime() > timeoutMs) {
      console.log(`[RCS] Environment ${env.id} timed out (no poll for ${Math.round((now - env.lastPollAt.getTime()) / 1000)}s)`);
      storeUpdateEnvironment(env.id, { status: "disconnected" });
    }
  }

  // Check session timeout (2x disconnect timeout with no update)
  const sessions = storeListSessions();
  for (const session of sessions) {
    if (session.status === "running" || session.status === "idle") {
      const elapsed = now - session.updatedAt.getTime();
      if (elapsed > timeoutMs * 2) {
        console.log(`[RCS] Session ${session.id} marked inactive (no update for ${Math.round(elapsed / 1000)}s)`);
        updateSessionStatus(session.id, "inactive");
      }
    }
  }
}

export function startDisconnectMonitor() {
  setInterval(() => {
    runDisconnectMonitorSweep();
  }, 60_000); // Check every minute
}
