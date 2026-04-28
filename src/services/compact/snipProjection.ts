import type { Message } from 'src/types/message.js'

/**
 * Check whether a message is a snip boundary marker.
 *
 * A snip boundary is a system message with `subtype === 'snip_boundary'`
 * and an optional `snipMetadata.removedUuids` array recording which
 * messages were removed by the snip operation.
 *
 * Used by:
 * - `Message.tsx` — render SnipBoundaryMessage component.
 * - `QueryEngine.ts` `snipReplay` — decide whether to replay the snip
 *   on the mutableMessages store.
 */
export function isSnipBoundaryMessage(message: Message): boolean {
  if (message.type !== 'system') return false
  return (message as Record<string, unknown>).subtype === 'snip_boundary'
}

/**
 * Project a "snipped view" of the message array suitable for sending to
 * the model. Messages whose UUIDs appear in any snip boundary's
 * `removedUuids` are filtered out; all others (including the boundary
 * messages themselves) are preserved.
 *
 * Used by:
 * - `getMessagesAfterCompactBoundary()` in messages.ts — after slicing
 *   at the compact boundary, further filters out snipped messages so the
 *   model-facing array does not include stale history.
 *
 * @param messages  Message array that may contain one or more snip
 *                  boundaries.
 * @returns         New array with removed messages stripped out.
 */
export function projectSnippedView(messages: Message[]): Message[] {
  // Collect all UUIDs that have been removed by any snip boundary
  const removedSet = new Set<string>()

  for (const msg of messages) {
    if (
      msg.type === 'system' &&
      (msg as Record<string, unknown>).subtype === 'snip_boundary'
    ) {
      const meta = (msg as Record<string, unknown>).snipMetadata as
        | { removedUuids?: string[] }
        | undefined
      if (meta?.removedUuids) {
        for (const uuid of meta.removedUuids) {
          removedSet.add(uuid)
        }
      }
    }
  }

  if (removedSet.size === 0) {
    return messages
  }

  return messages.filter((msg) => !removedSet.has(msg.uuid))
}
