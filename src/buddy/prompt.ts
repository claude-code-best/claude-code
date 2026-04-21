import { feature } from 'bun:bundle'
import type { Message } from '../types/message.js'
import type { Attachment } from '../utils/attachments.js'
import { getGlobalConfig } from '../utils/config.js'
import {
  loadBuddyData,
  getActiveCreature,
  getCreatureName,
  getSpeciesData,
} from '@claude-code-best/pokemon'

export function companionIntroText(name: string, species: string): string {
  return `# Companion

A ${species} named ${name} sits beside the user's input box and occasionally comments in a speech bubble. You're not ${name} — it's a separate watcher.

When the user addresses ${name} directly (by name), its bubble will answer. Your job in that moment is to stay out of the way: respond in ONE line or less, or just answer any part of the message meant for you. Don't explain that you're not ${name} — they know. Don't narrate what ${name} might say — the bubble handles that.`
}

export function getCompanionIntroAttachment(
  messages: Message[] | undefined,
): Attachment[] {
  if (!feature('BUDDY')) return []
  const data = loadBuddyData()
  const creature = getActiveCreature(data)
  if (!creature || getGlobalConfig().companionMuted) return []

  const name = getCreatureName(creature)
  const species = getSpeciesData(creature.speciesId)

  // Skip if already announced for this companion.
  for (const msg of messages ?? []) {
    if (msg.type !== 'attachment') continue
    if ((msg as any).attachment?.type !== 'companion_intro') continue
    if ((msg as any).attachment?.name === name) return []
  }

  return [
    {
      type: 'companion_intro',
      name,
      species: species.names.zh ?? species.name,
    },
  ]
}
