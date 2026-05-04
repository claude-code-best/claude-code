import type { Command } from '../../commands.js'
import { isVoiceAvailable } from '../../voice/voiceModeEnabled.js'

const voice = {
  type: 'local',
  name: 'voice',
  description: 'Toggle voice mode. Use /voice doubao for Doubao ASR backend',
  isEnabled: () => isVoiceAvailable(),
  get isHidden() {
    return !isVoiceAvailable()
  },
  supportsNonInteractive: false,
  load: () => import('./voice.js'),
} satisfies Command

export default voice
