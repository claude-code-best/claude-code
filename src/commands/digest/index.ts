import type { Command } from '../../commands.js'

const digest = {
  description:
    'Distill everything from a selected message to the end into a digest (retroactive /push+/pop)',
  name: 'digest',
  argumentHint: '',
  type: 'local',
  supportsNonInteractive: false,
  load: () => import('./digest.js'),
} satisfies Command

export default digest
