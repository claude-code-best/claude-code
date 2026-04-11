/**
 * Peer address parsing — kept separate from peerRegistry.ts so that
 * SendMessageTool can import parseAddress without transitively loading
 * the bridge (axios) and UDS (fs, net) modules at tool-enumeration time.
 */

/** Parse a URI-style address into scheme + target. */
export function parseAddress(to: string): {
  scheme: 'uds' | 'bridge' | 'tcp' | 'other'
  target: string
} {
  if (to.startsWith('uds:')) return { scheme: 'uds', target: to.slice(4) }
  if (to.startsWith('bridge:')) return { scheme: 'bridge', target: to.slice(7) }
  if (to.startsWith('tcp:')) return { scheme: 'tcp', target: to.slice(4) }
  // Legacy: old-code UDS senders emit bare socket paths in from=; route them
  // through the UDS branch so replies aren't silently dropped into teammate
  // routing. (No bare-session-ID fallback — bridge messaging is new enough
  // that no old senders exist, and the prefix would hijack teammate names
  // like session_manager.)
  if (to.startsWith('/')) return { scheme: 'uds', target: to }
  return { scheme: 'other', target: to }
}

/** Parse a tcp: target string into host and port. */
export function parseTcpTarget(
  target: string,
): { host: string; port: number } | null {
  const match = target.match(/^([^:]+):(\d+)$/)
  if (!match) return null
  const port = parseInt(match[2]!, 10)
  if (port < 1 || port > 65535) return null
  return { host: match[1]!, port }
}
