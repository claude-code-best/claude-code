import { getUuid } from "./client";
import type { SessionEvent } from "../types";

let currentEventSource: EventSource | null = null;

export function connectSSE(
  sessionId: string,
  onEvent: (event: SessionEvent) => void,
  fromSeqNum = 0,
): void {
  disconnectSSE();

  const uuid = getUuid();
  const url = `/web/sessions/${sessionId}/events?uuid=${encodeURIComponent(uuid)}`;
  const es = new EventSource(url);
  currentEventSource = es;

  let lastSeenSeq = fromSeqNum;

  es.addEventListener("message", (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data) as SessionEvent;
      if (data.seqNum !== undefined && data.seqNum <= lastSeenSeq) return;
      if (data.seqNum !== undefined) lastSeenSeq = data.seqNum;
      onEvent(data);
    } catch {
      // ignore parse errors
    }
  });

  es.addEventListener("error", () => {
    // EventSource auto-reconnects
  });
}

export function disconnectSSE(): void {
  if (currentEventSource) {
    currentEventSource.close();
    currentEventSource = null;
  }
}
