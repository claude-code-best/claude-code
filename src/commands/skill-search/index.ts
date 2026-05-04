import type { Command } from '../../commands.js'
import { isSkillSearchCompiledIn } from '../../services/skillSearch/featureCheck.js'

const skillSearch = {
  type: 'local-jsx',
  name: 'skill-search',
  description: '控制对话过程中的自动技能匹配',
  argumentHint: '[start|stop|about|status]',
  // Visible whenever the subsystem is compiled in (build flag); runtime
  // activation is separate and operator-controlled via /skill-search start.
  isEnabled: () => isSkillSearchCompiledIn(),
  isHidden: false,
  load: () => import('./skillSearchPanel.js'),
} satisfies Command

export default skillSearch
