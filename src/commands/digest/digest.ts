import type { LocalCommandResult } from '../../commands.js'
import type { ToolUseContext } from '../../Tool.js'

/**
 * `/digest` handler. Opens the message selector in 'digest' mode so the user
 * picks a start message; everything from there to the end is distilled into a
 * digest (a retroactive `/push`+`/pop`). Interactive-only.
 */
export async function call(
  _args: string,
  context: ToolUseContext,
): Promise<LocalCommandResult> {
  if (!context.openMessageSelector) {
    return {
      type: 'text',
      value: '/digest is only available in an interactive session.',
    }
  }
  context.openMessageSelector('digest')
  // Return a skip message to not append any messages.
  return { type: 'skip' }
}
