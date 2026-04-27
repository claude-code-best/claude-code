import { z } from 'zod/v4'
import type { ToolResultBlockParam } from 'src/Tool.js'
import { buildTool } from 'src/Tool.js'
import { lazySchema } from 'src/utils/lazySchema.js'

const LIST_PEERS_TOOL_NAME = 'ListPeers'

const inputSchema = lazySchema(() =>
  z.strictObject({
    include_self: z
      .boolean()
      .optional()
      .describe('Whether to include the current session in the list. Defaults to false.'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>
type ListPeersInput = z.infer<InputSchema>

type PeerInfo = {
  address: string
  name?: string
  cwd?: string
  pid?: number
}
type ListPeersOutput = { peers: PeerInfo[] }

export const ListPeersTool = buildTool({
  name: LIST_PEERS_TOOL_NAME,
  searchHint: 'list peers sessions discover uds socket messaging',
  maxResultSizeChars: 50_000,
  strict: true,

  get inputSchema(): InputSchema {
    return inputSchema()
  },

  async description() {
    return 'Discover other Claude Code sessions for cross-session messaging'
  },
  async prompt() {
    return `List active Claude Code sessions that can receive messages via SendMessage.

Returns an array of peers with their addresses. Use these addresses as the \`to\` field in SendMessage:
- \`"uds:/path/to.sock"\` — local sessions on the same machine (Unix Domain Socket)
- \`"bridge:session_..."\` — remote sessions via Remote Control

Use this tool to discover messaging targets before sending cross-session messages. Only running sessions with active messaging sockets are returned.`
  },

  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },

  userFacingName() {
    return LIST_PEERS_TOOL_NAME
  },

  renderToolUseMessage() {
    return 'ListPeers'
  },

  mapToolResultToToolResultBlockParam(
    content: ListPeersOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    const lines = content.peers.map(
      p => `${p.address}${p.name ? ` (${p.name})` : ''}${p.cwd ? ` @ ${p.cwd}` : ''}`,
    )
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content:
        lines.length > 0
          ? `Found ${lines.length} peer(s):\n${lines.join('\n')}`
          : 'No peers found.',
    }
  },

  async call(_input: ListPeersInput, context) {
    // Peer discovery uses the concurrent sessions PID registry and
    // UDS socket directory. The implementation scans for live sockets
    // and optionally includes Remote Control bridge peers.
    const peers: PeerInfo[] = []
    const seen = new Set<string>()
    const addPeer = (peer: PeerInfo): void => {
      if (seen.has(peer.address)) return
      seen.add(peer.address)
      peers.push(peer)
    }

    /* eslint-disable @typescript-eslint/no-require-imports */
    const udsMessaging =
      require('src/utils/udsMessaging.js') as typeof import('src/utils/udsMessaging.js')
    const udsClient =
      require('src/utils/udsClient.js') as typeof import('src/utils/udsClient.js')
    const bridgePeers =
      require('src/bridge/peerSessions.js') as typeof import('src/bridge/peerSessions.js')
    /* eslint-enable @typescript-eslint/no-require-imports */

    const messagingSocketPath = udsMessaging.getUdsMessagingSocketPath()
    if (messagingSocketPath) {
      // Self entry for reference
      if (_input.include_self) {
        addPeer({
          address: udsMessaging.formatUdsAddress(messagingSocketPath),
          name: 'self',
          pid: process.pid,
        })
      }
    }

    for (const peer of await udsClient.listPeers()) {
      if (!peer.messagingSocketPath) continue
      addPeer({
        address: udsMessaging.formatUdsAddress(peer.messagingSocketPath),
        name: peer.name ?? peer.kind,
        cwd: peer.cwd,
        pid: peer.pid,
      })
    }

    for (const peer of await bridgePeers.listBridgePeers()) {
      addPeer(peer)
    }

    return {
      data: { peers },
    }
  },
})
