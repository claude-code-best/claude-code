import { createLogger } from "./logger.js";
import { decodeJsonWsMessage, WsPayloadTooLargeError } from "./ws-message.js";
import { encodeWebSocketAuthProtocol } from "./ws-auth.js";

export interface RcsUpstreamConfig {
  rcsUrl: string;     // e.g. "http://localhost:3000"
  apiToken: string;
  agentName: string;
  channelGroupId?: string;
  capabilities?: Record<string, unknown>;
  maxSessions?: number;
}

export function buildRcsWsUrl(rcsUrl: string): string {
  let raw = rcsUrl;
  raw = raw.replace(/^http:\/\//, "ws://").replace(/^https:\/\//, "wss://");
  const url = new URL(raw);
  const path = url.pathname.replace(/\/+$/, "");
  if (!path || path === "/") {
    url.pathname = "/acp/ws";
  }
  url.searchParams.delete("token");
  return url.toString();
}

/**
 * RCS upstream client — connects acp-link to a Remote Control Server.
 *
 * Lifecycle:
 * 1. connect() — opens WS to RCS
 * 2. Sends register message
 * 3. Waits for registered response
 * 4. Forwards all ACP events via send()
 * 5. Reconnects with exponential backoff on failure
 */
export class RcsUpstreamClient {
  private static log = createLogger("rcs-upstream");
  private ws: WebSocket | null = null;
  private registered = false;
  private reconnectAttempts = 0;
  private closed = false;
  private readonly maxReconnectDelay = 30_000;
  private readonly baseReconnectDelay = 1_000;
  /** Agent ID obtained from REST registration */
  private agentId: string | null = null;
  /** Session ID from REST registration (ACP agents auto-create a session) */
  private sessionId: string | undefined;

  /** Handler for incoming ACP messages from RCS relay */
  private messageHandler: ((message: Record<string, unknown>) => void) | null = null;

  constructor(private config: RcsUpstreamConfig) {}

  /** Get the agent ID from REST registration */
  getAgentId(): string | null {
    return this.agentId;
  }

  /** Set handler for incoming ACP messages from RCS relay */
  setMessageHandler(handler: (message: Record<string, unknown>) => void): void {
    this.messageHandler = handler;
  }

  /** Register via REST API before establishing WS connection */
  private async registerViaRest(): Promise<string> {
    const baseUrl = this.config.rcsUrl
      .replace(/^ws:\/\//, "http://")
      .replace(/^wss:\/\//, "https://")
      .replace(/\/acp\/ws.*$/, "")
      .replace(/\/$/, "");

    const url = `${baseUrl}/v1/environments/bridge`;
    RcsUpstreamClient.log.info({ url }, "REST register");

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.config.apiToken}`,
      },
      body: JSON.stringify({
        machine_name: this.config.agentName,
        worker_type: "acp",
        bridge_id: this.config.channelGroupId || undefined,
        max_sessions: this.config.maxSessions,
        capabilities: this.config.capabilities,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`REST register failed (${resp.status}): ${text}`);
    }

    const data = await resp.json() as { environment_id: string; environment_secret: string; status: string; session_id?: string };
    this.agentId = data.environment_id;
    this.sessionId = data.session_id;
    RcsUpstreamClient.log.info({ agentId: this.agentId, sessionId: this.sessionId }, "REST register success");
    return data.environment_id;
  }

  /** Normalize RCS URL: accept http(s) base URL and convert to ws(s) + /acp/ws path */
  private buildWsUrl(): string {
    return buildRcsWsUrl(this.config.rcsUrl);
  }

  /** Open connection to RCS: REST register → WS identify */
  async connect(): Promise<void> {
    if (this.closed) return;

    // Step 1: REST registration
    try {
      await this.registerViaRest();
    } catch (err) {
      RcsUpstreamClient.log.error({ err }, "REST registration failed");
      if (!this.closed) {
        this.scheduleReconnect();
      }
      return;
    }

    // Step 2: WebSocket connection with identify
    const wsUrl = this.buildWsUrl();
    RcsUpstreamClient.log.info({ url: wsUrl }, "connecting WS");

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl, [
          encodeWebSocketAuthProtocol(this.config.apiToken),
        ]);

        this.ws.onopen = () => {
          RcsUpstreamClient.log.debug("ws open — sending identify");
          this.ws!.send(
            JSON.stringify({
              type: "identify",
              agent_id: this.agentId,
            }),
          );
        };

        this.ws.onmessage = (event) => {
          let data: Record<string, unknown>;
          try {
            data = decodeJsonWsMessage(event.data);
          } catch (err) {
            if (err instanceof WsPayloadTooLargeError) {
              RcsUpstreamClient.log.warn({ error: err.message }, "server message too large");
              this.ws?.close(1009, "message too large");
              return;
            }
            RcsUpstreamClient.log.warn({ raw: String(event.data).slice(0, 200) }, "invalid JSON from server");
            return;
          }

          if (data.type === "identified") {
            RcsUpstreamClient.log.info({ agent_id: data.agent_id, channel_group_id: data.channel_group_id }, "identified");
            this.registered = true;
            this.reconnectAttempts = 0;
            const webBase = this.config.rcsUrl
              .replace(/^ws:\/\//, "http://")
              .replace(/^wss:\/\//, "https://")
              .replace(/\/acp\/ws.*$/, "")
              .replace(/\/$/, "");
            console.log();
            console.log(`  🔗 Dashboard: ${webBase}/code/`);
            if (this.agentId) {
              console.log(`     Agent ID: ${this.agentId}`);
            }
            console.log();
            resolve();
          } else if (data.type === "registered") {
            // Legacy fallback: server still uses old register flow
            RcsUpstreamClient.log.info({ agent_id: data.agent_id }, "registered (legacy)");
            this.agentId = (data.agent_id as string) || this.agentId;
            this.registered = true;
            this.reconnectAttempts = 0;
            resolve();
          } else if (data.type === "error") {
            RcsUpstreamClient.log.error({ message: data.message }, "server error");
            if (!this.registered) {
              reject(new Error(data.message as string));
            }
          } else if (data.type === "keep_alive") {
            // ignore keepalive
          } else {
            // Forward ACP protocol messages to handler (for RCS relay support)
            RcsUpstreamClient.log.debug({ type: data.type }, "forwarding to relay handler");
            this.messageHandler?.(data);
          }
        };

        this.ws.onerror = () => {
          // onclose fires after onerror with the actual close code, so we log there
          if (!this.registered) {
            reject(new Error("WebSocket connection failed"));
          }
        };

        this.ws.onclose = (event) => {
          RcsUpstreamClient.log.info({ code: event.code, reason: event.reason || undefined }, "ws closed");
          this.registered = false;
          this.ws = null;
          if (!this.closed) {
            this.scheduleReconnect();
          }
        };
      } catch (err) {
        RcsUpstreamClient.log.error({ err }, "connect threw");
        reject(err);
      }
    });
  }

  /** Send an ACP message to RCS for broadcast */
  send(message: object): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.registered) {
      return;
    }
    try {
      this.ws.send(JSON.stringify(message));
    } catch (err) {
      RcsUpstreamClient.log.error({ err }, "send failed");
    }
  }

  /** Check if registered with RCS */
  isRegistered(): boolean {
    return this.registered && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /** Close the RCS connection permanently */
  async close(): Promise<void> {
    this.closed = true;
    this.registered = false;
    if (this.ws) {
      this.ws.close(1000, "client shutdown");
      this.ws = null;
    }
    RcsUpstreamClient.log.info("closed");
  }

  private scheduleReconnect(): void {
    if (this.closed) return;

    const delay = Math.min(
      this.baseReconnectDelay * 2 ** this.reconnectAttempts,
      this.maxReconnectDelay,
    );
    const jitter = delay * Math.random() * 0.2;
    const actualDelay = delay + jitter;
    this.reconnectAttempts++;

    RcsUpstreamClient.log.warn({ attempt: this.reconnectAttempts, delayMs: Math.round(actualDelay) }, "reconnecting");

    setTimeout(async () => {
      if (this.closed) return;
      try {
        await this.connect();
      } catch {
        // connect() itself logs the error; nothing to add here
      }
    }, actualDelay);
  }
}
