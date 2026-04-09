/**
 * Remote Control — SSE Connection Manager (UUID-based auth)
 */
import { getUuid } from "./api.js";
import { refreshLoadingActivity } from "./render.js";

let currentEventSource = null;
let currentSSESessionId = null;
let onEventCallback = null;

export function connectSSE(sessionId, onEvent, fromSeqNum = 0) {
  disconnectSSE();
  currentSSESessionId = sessionId;
  onEventCallback = onEvent;

  const uuid = getUuid();
  let url = `/web/sessions/${sessionId}/events?uuid=${encodeURIComponent(uuid)}`;

  const es = new EventSource(url);
  currentEventSource = es;

  // Track the last sequence number we've seen to avoid duplicates
  let lastSeenSeq = fromSeqNum;

  es.addEventListener("message", (e) => {
    try {
      const data = JSON.parse(e.data);
      // Skip events we've already rendered from history
      if (data.seqNum !== undefined && data.seqNum <= lastSeenSeq) return;
      if (data.seqNum !== undefined) lastSeenSeq = data.seqNum;
      onEventCallback?.(data);
      refreshLoadingActivity();
    } catch {
      // ignore parse errors
    }
  });

  es.addEventListener("error", () => {
    // EventSource auto-reconnects
  });
}

export function disconnectSSE() {
  if (currentEventSource) {
    currentEventSource.close();
    currentEventSource = null;
    currentSSESessionId = null;
  }
}

export function getCurrentSSESessionId() {
  return currentSSESessionId;
}
