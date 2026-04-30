import type { Command, LocalJSXCommandOnDone } from '../types/command.js'
import type { ReactNode } from 'react'

const call = async (onDone: LocalJSXCommandOnDone): Promise<ReactNode> => {
  onDone(
    'torch: Reserved internal debug command. No implementation is available in this build.',
    { display: 'system' },
  )
  return null
}

export default {
  type: 'local-jsx',
  name: 'torch',
  description: '[INTERNAL] Development debug command (reserved)',
  isEnabled: () => true,
  isHidden: true,
  load: () => Promise.resolve({ call }),
} satisfies Command
