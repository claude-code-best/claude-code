import type { Command } from '../../commands.js'

const detach = {
  type: 'local',
  name: 'detach',
  description: 'Detach from a sub CLI (or all connected subs)',
  supportsNonInteractive: false,
  load: () => import('./detach.js'),
} satisfies Command

export default detach
