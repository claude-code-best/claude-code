/**
 * /proactive — Toggle proactive (autonomous tick-driven) mode.
 *
 * When enabled, the model receives periodic <tick> prompts and works
 * autonomously between user inputs.  SleepTool controls pacing.
 */
import { feature } from 'bun:bundle'
import type { ToolUseContext } from '../Tool.js'
import type {
  Command,
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../types/command.js'

const proactive = {
  bridgeSafe: true,
  type: 'local-jsx',
  name: 'proactive',
  description: 'Toggle proactive (autonomous) mode',
  isEnabled: () => {
    if (feature('PROACTIVE') || feature('KAIROS')) {
      return true
    }
    return false
  },
  immediate: true,
  load: () =>
    Promise.resolve({
      async call(
        onDone: LocalJSXCommandOnDone,
        _context: ToolUseContext & LocalJSXCommandContext,
      ): Promise<React.ReactNode> {
        // Dynamic require to avoid pulling proactive into non-gated builds
        const mod =
          require('../proactive/index.js') as typeof import('../proactive/index.js')

        if (mod.isProactiveActive()) {
          mod.deactivateProactive()
          onDone('Proactive mode disabled', { display: 'system' })
        } else {
          mod.activateProactive('slash_command')
          onDone(
            'Proactive mode enabled — model will work autonomously between ticks',
            {
              display: 'system',
              metaMessages: [
                '<system-reminder>\nProactive mode is now enabled. You will receive periodic <tick> prompts. Do useful work on each tick, or call Sleep if there is nothing to do. Do not output "still waiting" — either act or sleep.\n</system-reminder>',
              ],
            },
          )
        }
        return null
      },
    }),
} satisfies Command

export default proactive
