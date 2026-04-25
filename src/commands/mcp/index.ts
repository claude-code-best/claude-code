import type { Command } from '../../commands.js'

const mcp = {
  type: 'local-jsx',
  name: 'mcp',
  description: 'Manage MCP servers',
  immediate: true,
  argumentHint:
    '[server-name|status <server-name>|tools <server-name>|enable [server-name]|disable [server-name]|reconnect <server-name>]',
  load: () => import('./mcp.js'),
} satisfies Command

export default mcp
