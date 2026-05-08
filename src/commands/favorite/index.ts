import type { Command } from '../../commands.js'

const favorite = {
  type: 'local',
  name: 'favorite',
  description: 'Manage CoStrict cloud favorite items (skills, agents, commands, MCPs)',
  supportsNonInteractive: true,
  load: () => import('./favorite.js'),
} satisfies Command

export default favorite
