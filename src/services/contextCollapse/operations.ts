/**
 * Context Collapse operations — read-time projection of collapsed spans.
 *
 * projectView() is the core function: it takes the REPL's full message array
 * and returns a view with committed collapse spans replaced by their summaries.
 * Called from /context command and context-noninteractive to show what the
 * model actually sees.
 */
import type { Message } from 'src/types/message.js'
import { _getCommitLog, isContextCollapseEnabled } from './index.js'

/**
 * Project the collapsed context view onto a message array.
 *
 * Replaces committed collapse spans with their summary placeholder messages.
 * This is a pure read-time projection — the input messages are not modified.
 */
export function projectView(messages: Message[]): Message[] {
  if (!isContextCollapseEnabled()) return messages

  const commits = _getCommitLog()
  if (commits.length === 0) return messages

  // Build lookup: uuid → commit that starts at this uuid
  const startMap = new Map<
    string,
    { summaryUuid: string; summaryContent: string; lastArchivedUuid: string }
  >()
  for (const c of commits) {
    startMap.set(c.firstArchivedUuid, {
      summaryUuid: c.summaryUuid,
      summaryContent: c.summaryContent,
      lastArchivedUuid: c.lastArchivedUuid,
    })
  }

  const result: Message[] = []
  let skipUntil: string | null = null

  for (const msg of messages) {
    const uuid = (msg as Record<string, unknown>).uuid as string | undefined

    // Currently skipping a collapsed span
    if (skipUntil !== null) {
      if (uuid === skipUntil) {
        skipUntil = null // End of span — skip this message too
      }
      continue
    }

    // Check if this message starts a collapsed span
    if (uuid && startMap.has(uuid)) {
      const info = startMap.get(uuid)!
      // Insert summary placeholder
      result.push({
        type: 'assistant',
        uuid: info.summaryUuid,
        content: [{ type: 'text', text: info.summaryContent }],
        role: 'assistant',
        costUSD: 0,
        durationMs: 0,
        model: '',
      } as unknown as Message)

      // Skip all messages until the end of this span
      if (uuid === info.lastArchivedUuid) {
        // Single-message span — already skipped by inserting summary
        continue
      }
      skipUntil = info.lastArchivedUuid
      continue
    }

    result.push(msg)
  }

  return result
}
