import type { Command } from '../../commands.js'

const scrollSpeed: Command = {
  type: 'local-jsx',
  name: 'scroll-speed',
  description:
    'Adjust wheel scroll speed with a slider. Open it or run: /scroll-speed <1-20|default>',
  argumentHint: '[1-20|default]',
  load: () => import('./scrollSpeed.js'),
}

export default scrollSpeed
