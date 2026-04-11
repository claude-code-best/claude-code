import type { Command } from '../../commands.js'
import { isAssistantEnabled } from './gate.js'

const assistant = {
  type: 'local-jsx',
  name: 'assistant',
  description: 'Open the Kairos assistant panel',
  isEnabled: isAssistantEnabled,
  get isHidden() {
    return !isAssistantEnabled()
  },
  immediate: true,
  load: () => import('./assistant.js'),
} satisfies Command

export default assistant
