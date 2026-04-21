import type { BattlePokemon } from './types'

/**
 * Simple AI: pick a random usable move.
 */
export function chooseAIMove(pokemon: BattlePokemon): number {
	const usable = pokemon.moves
		.map((m, i) => ({ move: m, index: i }))
		.filter(({ move }) => move.pp > 0 && !move.disabled)

	if (usable.length === 0) return 0 // Struggle
	return usable[Math.floor(Math.random() * usable.length)]!.index
}
