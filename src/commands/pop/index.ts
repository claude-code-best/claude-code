import type { Command } from '../../commands.js'

const pop = {
  description:
    'Close the current discussion branch: distill it into a digest and rewind to the push point',
  name: 'pop',
  argumentHint: '[--to #N] [--discard] [--keep-code]',
  type: 'local',
  supportsNonInteractive: false,
  load: () => import('./pop.js'),
} satisfies Command

export default pop
