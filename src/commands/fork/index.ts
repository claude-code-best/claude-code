import type { Command } from '../../commands.js'

const fork = {
  type: 'local-jsx',
  name: 'fork',
  description: 'Create a fork of the current conversation at this point',
  argumentHint: '[name]',
  isEnabled: () => true,
  isHidden: false,
  load: () => import('./fork.js'),
} satisfies Command

export default fork
