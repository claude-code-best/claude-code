import type { Command } from '../../commands.js'
import { shouldInferenceConfigCommandBeImmediate } from '../../utils/immediateCommand.js'

export default {
  type: 'local-jsx',
  name: 'approval',
  aliases: ['approvals', 'permission-mode'],
  description: 'Choose how tool approval prompts are handled',
  argumentHint: '[default|accept-edits|plan|auto|dont-ask|full-access]',
  get immediate() {
    return shouldInferenceConfigCommandBeImmediate()
  },
  load: () => import('./approval.js'),
} satisfies Command
