import type { Command } from '../../commands.js'
import { isBuddyLive } from '../../buddy/useBuddyNotification.js'

const pokemonBattle = {
  type: 'local-jsx',
  name: 'pokemon-battle',
  description: 'Start a Pokémon battle',
  immediate: true,
  get isHidden() {
    return !isBuddyLive()
  },
  load: () => import('./pokemon-battle.js'),
} satisfies Command

export default pokemonBattle
