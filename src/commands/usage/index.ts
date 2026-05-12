import type { Command } from '../../commands.js'

export default {
  type: 'local-jsx',
  name: 'usage',
  aliases: ['cost', 'stats'],
  description: 'Show session cost, plan usage, and activity stats',
  load: () => import('./usage.js'),
} satisfies Command
