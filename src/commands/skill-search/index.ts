import type { Command } from '../../commands.js'

const skillSearch = {
  type: 'local-jsx',
  name: 'skill-search',
  description: 'Control automatic skill matching during conversations',
  argumentHint: '[start|stop|about|status]',
  isHidden: false,
  load: () => import('./skillSearchPanel.js'),
} satisfies Command

export default skillSearch
