import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import { v4 as uuidv4 } from "uuid";
import { getUuid } from "../api/client";
import type { SessionEvent, EventPayload } from "../types";

// ============================================================
// SSE Event Bus — shared between SSE listener and transport
// ============================================================

type SSEEventHandler = (event: SessionEvent) => void;

class SSEEventBus {
  private listeners: Set<SSEEventHandler> = new Set();
  private eventSource: EventSource | null = null;
  private _lastSeqNum = 0;

  get lastSeqNum() {
    return this._lastSeqNum;
  }

  /** Register a listener for SSE events */
  onEvent(handler: SSEEventHandler): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  /** Connect to the SSE stream for a session */
  connect(sessionId: string): void {
    this.disconnect();
    const uuid = getUuid();
    const url = `/web/sessions/${sessionId}/events?uuid=${encodeURIComponent(uuid)}`;
    const es = new EventSource(url);
    this.eventSource = es;

    es.addEventListener("message", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as SessionEvent;
        if (data.seqNum !== undefined && data.seqNum <= this._lastSeqNum) return;
        if (data.seqNum !== undefined) this._lastSeqNum = data.seqNum;
        for (const handler of this.listeners) {
          handler(data);
        }
      } catch {
        // ignore parse errors
      }
    });
  }

  /** Disconnect the SSE stream */
  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this._lastSeqNum = 0;
  }
}

// Singleton event bus
export const sseBus = new SSEEventBus();

// ============================================================
// RCS ChatTransport — bridges RCS SSE to AI SDK UIMessageChunk
// ============================================================

interface RCSTransportOptions {
  sessionId: string;
  onPermissionRequest?: (event: SessionEvent) => void;
  onSessionStatus?: (status: string) => void;
  onError?: (error: string) => void;
}

export class RCSTransport implements ChatTransport<UIMessage> {
  private sessionId: string;
  private onPermissionRequest?: (event: SessionEvent) => void;
  private onSessionStatus?: (status: string) => void;
  private onError?: (error: string) => void;
  private unsub: (() => void) | null = null;

  constructor(options: RCSTransportOptions) {
    this.sessionId = options.sessionId;
    this.onPermissionRequest = options.onPermissionRequest;
    this.onSessionStatus = options.onSessionStatus;
    this.onError = options.onError;
  }

  async sendMessages({
    messages,
    abortSignal,
  }: Parameters<ChatTransport<UIMessage>["sendMessages"]>[0]): Promise<ReadableStream<UIMessageChunk>> {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== "user") {
      // Return empty stream if no user message
      return new ReadableStream({ start: (c) => c.close() });
    }

    // Extract text from the user message parts
    const text = lastMessage.parts
      .filter((p: UIMessage["parts"][number]): p is Extract<typeof p, { type: "text" }> => p.type === "text")
      .map((p: { text: string }) => p.text)
      .join("");

    if (!text.trim()) {
      return new ReadableStream({ start: (c) => c.close() });
    }

    // POST user message to the RCS backend
    const uuid = getUuid();
    const response = await fetch(
      `/web/sessions/${this.sessionId}/events?uuid=${encodeURIComponent(uuid)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "user",
          uuid: uuidv4(),
          content: text,
          message: { content: text },
        }),
        signal: abortSignal,
      },
    );

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(data.error?.message || "Failed to send message");
    }

    // Create a ReadableStream from the SSE event bus
    // Collects events until the assistant turn is complete
    return new ReadableStream<UIMessageChunk>({
      start: (controller) => {
        let textId = `text-${Date.now()}`;
        let started = false;

        const ensureStarted = () => {
          if (!started) {
            started = true;
            controller.enqueue({ type: "start", messageId: `msg-${Date.now()}` });
          }
        };

        const handler = (event: SessionEvent) => {
          const type = event.type;
          const payload = event.payload || ({} as EventPayload);

          // Skip bridge init noise
          const serialized = JSON.stringify(event);
          if (/Remote Control connecting/i.test(serialized)) return;

          switch (type) {
            // ---- Assistant text ----
            case "assistant": {
              const content =
                typeof payload.content === "string"
                  ? payload.content
                  : "";
              if (content && content.trim()) {
                ensureStarted();
                controller.enqueue({ type: "text-start", id: textId });
                controller.enqueue({ type: "text-delta", id: textId, delta: content });
                controller.enqueue({ type: "text-end", id: textId });
              }

              // Check for embedded tool_use blocks
              const msg = payload.message as Record<string, unknown> | undefined;
              if (msg && typeof msg === "object" && Array.isArray(msg.content)) {
                const toolBlocks = (msg.content as Array<Record<string, unknown>>).filter(
                  (b) => b.type === "tool_use",
                );
                for (const block of toolBlocks) {
                  ensureStarted();
                  const toolCallId = (block.id as string) || `call-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
                  controller.enqueue({
                    type: "tool-input-available",
                    toolCallId,
                    toolName: (block.name as string) || "tool",
                    input: block.input || {},
                  });
                }
              }

              // Finish after assistant message
              ensureStarted();
              controller.enqueue({ type: "finish", finishReason: "stop" });
              controller.close();
              cleanup();
              break;
            }

            // ---- Tool use events ----
            case "tool_use": {
              ensureStarted();
              const toolCallId =
                (payload as Record<string, unknown>).tool_call_id as string ||
                `call-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
              controller.enqueue({
                type: "tool-input-available",
                toolCallId,
                toolName: (payload as Record<string, unknown>).tool_name as string || "tool",
                input: (payload as Record<string, unknown>).tool_input || {},
              });
              break;
            }

            // ---- Tool result events ----
            case "tool_result": {
              ensureStarted();
              const resultCallId =
                (payload as Record<string, unknown>).tool_call_id as string ||
                `call-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
              const output =
                typeof (payload as Record<string, unknown>).output === "string"
                  ? (payload as Record<string, unknown>).output
                  : (payload as Record<string, unknown>).content || "";
              controller.enqueue({
                type: "tool-output-available",
                toolCallId: resultCallId,
                output: output as string,
              });
              break;
            }

            // ---- Permission / control requests ----
            case "control_request":
            case "permission_request": {
              const req = payload.request as Record<string, unknown> | undefined;
              if (req && req.subtype === "can_use_tool") {
                // Forward to the UI layer for handling
                this.onPermissionRequest?.(event);
              }
              // Don't close the stream — wait for the response
              break;
            }

            // ---- Status events ----
            case "status": {
              const msg =
                (typeof payload.message === "string" ? payload.message : "") ||
                payload.content ||
                "";
              if (/connecting|waiting|initializing|Remote Control/i.test(msg)) return;
              break;
            }

            // ---- Session status ----
            case "session_status": {
              if (typeof payload.status === "string") {
                this.onSessionStatus?.(payload.status);
                if (
                  payload.status === "archived" ||
                  payload.status === "inactive"
                ) {
                  ensureStarted();
                  controller.enqueue({ type: "finish", finishReason: "stop" });
                  controller.close();
                  cleanup();
                }
              }
              break;
            }

            // ---- Errors ----
            case "error": {
              ensureStarted();
              controller.enqueue({
                type: "error",
                errorText: String(payload.message || payload.content || "Unknown error"),
              });
              controller.enqueue({ type: "finish", finishReason: "error" });
              controller.close();
              cleanup();
              break;
            }

            // ---- Interrupt ----
            case "interrupt": {
              ensureStarted();
              controller.enqueue({ type: "abort", reason: "Session interrupted" });
              controller.close();
              cleanup();
              break;
            }

            // ---- Skip noise ----
            case "partial_assistant":
            case "result":
            case "result_success":
            case "control_response":
            case "permission_response":
            case "system":
            case "task_state":
            case "automation_state":
              return;

            default:
              return;
          }
        };

        const cleanup = () => {
          if (this.unsub) {
            this.unsub();
            this.unsub = null;
          }
        };

        this.unsub = sseBus.onEvent(handler);

        // Handle abort
        if (abortSignal) {
          const onAbort = () => {
            controller.enqueue({ type: "abort", reason: "Aborted" });
            controller.close();
            cleanup();
            abortSignal.removeEventListener("abort", onAbort);
          };
          abortSignal.addEventListener("abort", onAbort);
        }
      },
    });
  }

  /** Not supported — RCS doesn't have stream resumption */
  reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return Promise.resolve(null);
  }

  /** Clean up listeners */
  destroy(): void {
    if (this.unsub) {
      this.unsub();
      this.unsub = null;
    }
  }
}
