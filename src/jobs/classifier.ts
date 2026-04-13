import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { AssistantMessage } from '../types/message.js'

/**
 * Classify the job status from the turn's assistant messages and update state.json.
 *
 * Called by stopHooks.ts after each repl_main_thread turn when CLAUDE_JOB_DIR is set.
 * Only the main thread calls this (not subagents).
 *
 * @param jobDir - Path to the job directory (from CLAUDE_JOB_DIR env)
 * @param assistantMessages - Assistant messages from this turn
 */
export async function classifyAndWriteState(
  jobDir: string,
  assistantMessages: AssistantMessage[],
): Promise<void> {
  const stateFile = join(jobDir, 'state.json')

  let state: Record<string, unknown>
  try {
    state = JSON.parse(readFileSync(stateFile, 'utf-8'))
  } catch {
    // No state file or corrupt — not a valid job directory
    return
  }

  const newStatus = classifyStatus(assistantMessages)
  state.status = newStatus
  state.updatedAt = new Date().toISOString()

  writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf-8')
}

/**
 * Determine job status from assistant messages.
 *
 * - Has tool_use blocks → still running (tools executing)
 * - stop_reason === 'end_turn' → completed (model finished)
 * - Otherwise → running
 */
function classifyStatus(messages: AssistantMessage[]): string {
  if (messages.length === 0) return 'running'

  const lastMessage = messages[messages.length - 1]!
  const content = lastMessage.message?.content

  // Check if the last message has tool_use blocks (still executing)
  if (Array.isArray(content)) {
    const hasToolUse = content.some(
      block =>
        typeof block === 'object' &&
        block !== null &&
        'type' in block &&
        block.type === 'tool_use',
    )
    if (hasToolUse) return 'running'
  }

  // Check stop_reason via index signature
  const stopReason = (lastMessage.message as Record<string, unknown>)
    ?.stop_reason
  if (stopReason === 'end_turn') return 'completed'
  if (stopReason === 'max_tokens') return 'running'

  return 'running'
}
