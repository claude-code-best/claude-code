import type { Command } from '../../commands.js'

const peers = {
  type: 'local',
  name: 'peers',
  aliases: ['who'],
  description: 'List connected Claude Code peers',
  supportsNonInteractive: true,
  load: () => import('./peers.js'),
} satisfies Command

export default peers
