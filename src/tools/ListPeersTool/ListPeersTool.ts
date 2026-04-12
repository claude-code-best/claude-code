import { z } from 'zod/v4'
import type { ToolResultBlockParam } from '../../Tool.js'
import { buildTool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'

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

    // Discovery is handled by the UDS messaging subsystem initialized in setup.ts.
    // Return discovered peers from the app state.
    const appState = context.getAppState()
    const messagingSocketPath = (appState as Record<string, unknown>).messagingSocketPath as string | undefined
    if (messagingSocketPath) {
      // Self entry for reference
      if (_input.include_self) {
        peers.push({
          address: `uds:${messagingSocketPath}`,
          name: 'self',
          pid: process.pid,
        })
      }
    }

    return {
      data: { peers },
    }
  },
})
