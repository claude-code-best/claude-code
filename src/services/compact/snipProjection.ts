/**
 * Snip Projection — read-time view filtering for snipped messages.
 *
 * projectSnippedView filters out messages that were marked for removal
 * by a snip boundary's removedUuids list. Used by getMessagesForQuery()
 * and /context to show the model-facing view.
 */
import type { Message } from 'src/types/message'

/**
 * Check if a message is a snip boundary (the summary/marker message).
 */
export function isSnipBoundaryMessage(message: Message): boolean {
  const msg = message as Record<string, unknown>
  return msg.subtype === 'snip_boundary' || msg.type === 'snip_boundary'
}

/**
 * Project the snipped view: remove messages whose UUIDs appear in any
 * snip boundary's removedUuids list.
 *
 * The boundary message itself is kept (it serves as a visual marker
 * in the conversation and may contain summary text).
 */
export function projectSnippedView(messages: Message[]): Message[] {
  // Collect all removedUuids from snip boundaries
  const removedUuids = new Set<string>()

  for (const msg of messages) {
    if (isSnipBoundaryMessage(msg)) {
      const metadata = (msg as Record<string, unknown>).snipMetadata as
        | { removedUuids?: string[] }
        | undefined
      if (metadata?.removedUuids) {
        for (const uuid of metadata.removedUuids) {
          removedUuids.add(uuid)
        }
      }
    }
  }

  if (removedUuids.size === 0) return messages

  // Filter: keep messages not in the removed set
  return messages.filter(msg => {
    // Always keep snip boundaries themselves
    if (isSnipBoundaryMessage(msg)) return true
    return !removedUuids.has(msg.uuid)
  })
}
