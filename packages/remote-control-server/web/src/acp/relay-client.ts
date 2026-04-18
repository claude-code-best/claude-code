import { ACPClient } from "./client";
import type { ACPSettings } from "./types";

/**
 * Build the RCS relay WebSocket URL for a given agent.
 * Uses the current page's host to determine ws:// or wss://.
 */
export function buildRelayUrl(agentId: string, token?: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  let url = `${protocol}//${window.location.host}/acp/relay/${agentId}`;
  if (token) {
    url += `?token=${encodeURIComponent(token)}`;
  }
  return url;
}

/**
 * Create an ACPClient that connects to an agent through the RCS relay.
 * The relay transparently forwards ACP protocol messages between
 * the frontend and the target acp-link instance.
 */
export function createRelayClient(agentId: string, token?: string): ACPClient {
  const relayUrl = buildRelayUrl(agentId, token);
  const settings: ACPSettings = { proxyUrl: relayUrl, token };
  return new ACPClient(settings);
}

/**
 * Get token from the page URL (for pre-filled links from RCS).
 */
export function getTokenFromAcpUrl(): string | undefined {
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get("token") || undefined;
  } catch {
    return undefined;
  }
}
