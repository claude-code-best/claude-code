import type { Command } from '../../commands.js'

const autocompact: Command = {
  type: 'local-jsx',
  name: 'autocompact',
  description:
    'Toggle auto-compact with a slider. Open it or run: /autocompact on|off|status',
  argumentHint: '[on|off|status]',
  load: () => import('./autocompact.js'),
}

export default autocompact
