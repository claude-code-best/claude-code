import { ACPClient } from "./client";
import type { ACPSettings } from "./types";
import { getUuid } from "../api/client";

/**
 * Build the RCS relay WebSocket URL for a given agent.
 * Uses UUID auth (same as /code/ pages).
 */
export function buildRelayUrl(agentId: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const uuid = getUuid();
  return `${protocol}//${window.location.host}/acp/relay/${agentId}?uuid=${encodeURIComponent(uuid)}`;
}

/**
 * Create an ACPClient that connects to an agent through the RCS relay.
 * The relay transparently forwards ACP protocol messages between
 * the frontend and the target acp-link instance.
 */
export function createRelayClient(agentId: string): ACPClient {
  const relayUrl = buildRelayUrl(agentId);
  const settings: ACPSettings = { proxyUrl: relayUrl };
  return new ACPClient(settings);
}
