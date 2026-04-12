import type { Command } from '../../commands.js'

const claimMain = {
  type: 'local',
  name: 'claim-main',
  description:
    'Claim main role for this machine (overrides current main machine)',
  supportsNonInteractive: false,
  load: () => import('./claim-main.js'),
} satisfies Command

export default claimMain
