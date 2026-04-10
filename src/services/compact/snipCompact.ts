// Auto-generated stub — replace with real implementation
export {}

import type { Message } from 'src/types/message'

export const isSnipMarkerMessage: (message: Message) => boolean = () => false
export const snipCompactIfNeeded: (
  messages: Message[],
  options?: { force?: boolean },
) => {
  messages: Message[]
  executed: boolean
  tokensFreed: number
  boundaryMessage?: Message
} = messages => ({
  messages,
  executed: false,
  tokensFreed: 0,
})
export const isSnipRuntimeEnabled: () => boolean = () => false
export const shouldNudgeForSnips: (messages: Message[]) => boolean = () => false
export const SNIP_NUDGE_TEXT: string = ''
