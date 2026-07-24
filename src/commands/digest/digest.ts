import type { LocalCommandResult } from '../../commands.js'
import type { ToolUseContext } from '../../Tool.js'

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
