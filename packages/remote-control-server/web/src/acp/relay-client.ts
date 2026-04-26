import { ACPClient } from "./client";
import type { ACPSettings } from "./types";
import { getActiveApiToken } from "../api/client";

/**
 * Build the RCS relay WebSocket URL for a given agent.
 * Uses UUID auth (same as /code/ pages).
 */
export function buildRelayUrl(agentId: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/acp/relay/${agentId}`;
}

/**
 * Create an ACPClient that connects to an agent through the RCS relay.
 * The relay transparently forwards ACP protocol messages between
 * the frontend and the target acp-link instance.
 */
export function createRelayClient(agentId: string): ACPClient {
  const relayUrl = buildRelayUrl(agentId);
  const token = getActiveApiToken();
  const settings: ACPSettings = token
    ? { proxyUrl: relayUrl, token }
    : { proxyUrl: relayUrl };
  return new ACPClient(settings);
}
