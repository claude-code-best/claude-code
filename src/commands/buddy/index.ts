import type { Command } from '../../commands.js'
import { isBuddyLive } from '../../buddy/useBuddyNotification.js'

const buddy = {
  type: 'local-jsx',
  name: 'buddy',
  description: 'Coding companion · pet, rehatch, mute, unmute',
  argumentHint: '[pet|rehatch|mute|unmute]',
  immediate: true,
  get isHidden() {
    return !isBuddyLive()
  },
  load: () => import('./buddy.js'),
} satisfies Command

export default buddy
