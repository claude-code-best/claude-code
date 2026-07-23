import type { Command } from '../../commands.js'

const push = {
  description:
    'Open a discussion branch that inherits the current context (use /pop to distill it back)',
  name: 'push',
  aliases: ['stack'],
  argumentHint: '[note] | --list',
  type: 'local',
  supportsNonInteractive: false,
  load: () => import('./push.js'),
} satisfies Command

export default push
