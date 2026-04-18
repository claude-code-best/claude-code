import type { Command } from '../../commands.js'
import { isSkillLearningEnabled } from '../../services/skillLearning/featureCheck.js'

const skillLearning = {
  type: 'local',
  name: 'skill-learning',
  description: 'Manage learned instincts and generated skills',
  argumentHint: '[status|ingest|evolve|export|import|prune|promote|projects]',
  isEnabled: () => isSkillLearningEnabled(),
  supportsNonInteractive: true,
  isHidden: false,
  load: () => import('./skill-learning.js'),
} satisfies Command

export default skillLearning
