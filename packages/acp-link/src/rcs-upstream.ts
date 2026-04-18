import { createLogger } from "./logger.js";

export interface RcsUpstreamConfig {
  rcsUrl: string;     // e.g. "ws://localhost:3000/acp/ws"
  apiToken: string;
  agentName: string;
  channelGroupId?: string;
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

  /** Handler for incoming ACP messages from RCS relay */
  private messageHandler: ((message: Record<string, unknown>) => void) | null = null;

  constructor(private config: RcsUpstreamConfig) {}

  /** Set handler for incoming ACP messages from RCS relay */
  setMessageHandler(handler: (message: Record<string, unknown>) => void): void {
    this.messageHandler = handler;
  }

  /** Normalize RCS URL: accept http(s) base URL and convert to ws(s) + /acp/ws path */
  private buildWsUrl(): string {
    let raw = this.config.rcsUrl;
    raw = raw.replace(/^http:\/\//, "ws://").replace(/^https:\/\//, "wss://");
    const url = new URL(raw);
    const path = url.pathname.replace(/\/+$/, "");
    if (!path || path === "/") {
      url.pathname = "/acp/ws";
    }
    if (this.config.apiToken) {
      url.searchParams.set("token", this.config.apiToken);
    }
    return url.toString();
  }

  /** Open connection to RCS and register */
  async connect(): Promise<void> {
    if (this.closed) return;

    const wsUrl = this.buildWsUrl();
    RcsUpstreamClient.log.info({ url: wsUrl }, "connecting");

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          RcsUpstreamClient.log.debug("ws open — sending register");
          this.ws!.send(
            JSON.stringify({
              type: "register",
              agent_name: this.config.agentName,
              channel_group_id: this.config.channelGroupId || undefined,
              acp_link_version: "1.0.0",
            }),
          );
        };

        this.ws.onmessage = (event) => {
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(event.data as string);
          } catch {
            RcsUpstreamClient.log.warn({ raw: String(event.data).slice(0, 200) }, "invalid JSON from server");
            return;
          }

          if (data.type === "registered") {
            RcsUpstreamClient.log.info({ agent_id: data.agent_id, channel_group_id: data.channel_group_id }, "registered");
            this.registered = true;
            this.reconnectAttempts = 0;
            const webBase = this.config.rcsUrl
              .replace(/^ws:\/\//, "http://")
              .replace(/^wss:\/\//, "https://")
              .replace(/\/acp\/ws.*$/, "")
              .replace(/\/$/, "");
            console.log();
            console.log(`  🔗 ACP Dashboard: ${webBase}/acp/?token=${encodeURIComponent(this.config.apiToken)}`);
            if (data.agent_id) {
              console.log(`     Agent ID: ${data.agent_id}`);
            }
            console.log();
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
