import { randomUUID } from 'crypto'
import type { Command, LocalCommandCall } from '../types/command.js'
import type { Message } from '../types/message.js'

/**
 * Insert a snip boundary into the message array.
 *
 * A snip boundary is a system message that marks everything before it as
 * "snipped". During the next query cycle, `snipCompactIfNeeded` (in
 * services/compact/snipCompact.ts) detects this boundary and removes — or
 * collapses — the older messages so they no longer consume context-window
 * tokens. The REPL keeps the full history for UI scrollback; the boundary
 * only affects model-facing projections.
 *
 * The `snipMetadata.removedUuids` field tells downstream consumers
 * (sessionStorage persistence, snipProjection) which messages were removed.
 */
const call: LocalCommandCall = async (_args, context) => {
  const { messages, setMessages } = context

  if (messages.length === 0) {
    return { type: 'text', value: 'No messages to snip.' }
  }

  // Collect UUIDs of every message that will be snipped (everything currently
  // in the conversation). The next call to `snipCompactIfNeeded` will honour
  // the boundary and strip these from the model-facing view.
  const removedUuids = messages.map((m) => m.uuid)

  const boundaryMessage: Message = {
    type: 'system',
    subtype: 'snip_boundary',
    content: '[snip] Conversation history before this point has been snipped.',
    isMeta: true,
    timestamp: new Date().toISOString(),
    uuid: randomUUID(),
    snipMetadata: {
      removedUuids,
    },
  } as Message // subtype is feature-gated; cast through Message

  setMessages((prev) => [...prev, boundaryMessage])

  return {
    type: 'text',
    value: `Snipped ${removedUuids.length} message(s). Older history will be excluded from the next model query.`,
  }
}

const forceSnip = {
  type: 'local',
  name: 'force-snip',
  description: 'Force snip conversation history at current point',
  supportsNonInteractive: true,
  isHidden: true,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default forceSnip
