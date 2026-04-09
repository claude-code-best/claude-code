import {
  storeCreateWorkItem,
  storeGetWorkItem,
  storeGetPendingWorkItem,
  storeUpdateWorkItem,
  storeListSessionsByEnvironment,
  storeGetEnvironment,
} from "../store";
import { config } from "../config";
import { getBaseUrl } from "../config";
import type { WorkResponse } from "../types/api";

/** Encode work secret as base64 JSON (no JWT — just API key as token) */
function encodeWorkSecret(): string {
  const payload = {
    version: 1,
    session_ingress_token: config.apiKeys[0] || "",
    api_base_url: getBaseUrl(),
    sources: [] as string[],
    auth: [] as string[],
    use_code_sessions: false,
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export async function createWorkItem(environmentId: string, sessionId: string): Promise<string> {
  // Validate environment exists and is active
  const env = storeGetEnvironment(environmentId);
  if (!env) {
    throw new Error(`Environment ${environmentId} not found`);
  }
  if (env.status !== "active") {
    throw new Error(`Environment ${environmentId} is not active (status: ${env.status})`);
  }

  const secret = encodeWorkSecret();
  const record = storeCreateWorkItem({ environmentId, sessionId, secret });
  console.log(`[RCS] Work item created: ${record.id} for env=${environmentId} session=${sessionId}`);
  return record.id;
}

/** Long-poll for work — blocks until work is available or timeout.
 *  Returns null when no work is available, matching the CLI bridge client protocol. */
export async function pollWork(environmentId: string, timeoutSeconds = config.pollTimeout): Promise<WorkResponse | null> {
  const deadline = Date.now() + timeoutSeconds * 1000;

  while (Date.now() < deadline) {
    const item = storeGetPendingWorkItem(environmentId);

    if (item) {
      storeUpdateWorkItem(item.id, { state: "dispatched" });

      return {
        id: item.id,
        type: "work",
        environment_id: environmentId,
        state: "dispatched",
        data: {
          type: "session",
          id: item.sessionId,
        },
        secret: item.secret,
        created_at: item.createdAt.toISOString(),
      };
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  return null;
}

export function ackWork(workId: string) {
  storeUpdateWorkItem(workId, { state: "acked" });
}

export function stopWork(workId: string) {
  storeUpdateWorkItem(workId, { state: "completed" });
}

export function heartbeatWork(workId: string): { lease_extended: boolean; state: string; last_heartbeat: string; ttl_seconds: number } {
  storeUpdateWorkItem(workId, {} as any); // just bump updatedAt
  const item = storeGetWorkItem(workId);
  const now = new Date();
  return {
    lease_extended: true,
    state: item?.state ?? "acked",
    last_heartbeat: now.toISOString(),
    ttl_seconds: config.heartbeatInterval * 2,
  };
}

/** Reconnect: re-queue sessions associated with an environment */
export function reconnectWorkForEnvironment(envId: string) {
  const activeSessions = storeListSessionsByEnvironment(envId).filter((s) => s.status === "idle");
  const promises = activeSessions.map((s) => createWorkItem(envId, s.id));
  return Promise.all(promises);
}
