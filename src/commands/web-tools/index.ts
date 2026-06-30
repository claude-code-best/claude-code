import type { Command } from '../../commands.js'

const webTools = {
  type: 'local-jsx',
  name: 'web-tools',
  description: 'Configure web search and web fetch backends',
  load: () => import('./web-tools.js'),
} satisfies Command

export default webTools
