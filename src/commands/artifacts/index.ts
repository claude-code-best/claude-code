import type { Command } from '../../commands.js'

const artifacts = {
  type: 'local-jsx',
  name: 'artifacts',
  description:
    'List HTML artifacts uploaded to cloud-artifacts in this session',
  isEnabled: () => true,
  load: () => import('./artifacts.js'),
} satisfies Command

export default artifacts
