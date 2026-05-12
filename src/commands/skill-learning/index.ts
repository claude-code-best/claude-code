import type { Command } from '../../commands.js'
import { isSkillLearningCompiledIn } from '../../services/skillLearning/featureCheck.js'

const skillLearning = {
  type: 'local-jsx',
  name: 'skill-learning',
  description: 'Manage skill learning (observe, analyze, evolve)',
  argumentHint:
    '[start|stop|about|status|ingest|evolve|export|import|prune|promote|projects]',
  // The slash command is visible whenever the subsystem is compiled in.
  // Whether the runtime feature is actually doing work is a separate
  // concern controlled by `/skill-learning start` (see featureCheck.ts).
  isEnabled: () => isSkillLearningCompiledIn(),
  isHidden: false,
  load: () => import('./skillPanel.js'),
} satisfies Command

export default skillLearning
