import type { Command } from '../types/command.js'

const autonomy = {
  type: 'local-jsx',
  name: 'autonomy',
  description:
    'Inspect automatic autonomy runs recorded for proactive ticks and scheduled tasks',
  argumentHint:
    '[status [--deep]|runs [limit]|flows [limit]|flow <id>|flow cancel <id>|flow resume <id>]',
  load: () => import('./autonomyPanel.js'),
} satisfies Command

export default autonomy
