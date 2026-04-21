import React from 'react'
import { Box, Text, type Color } from '@anthropic/ink'
import type { BuddyData, SpeciesId } from '../types'
import { ALL_SPECIES_IDS } from '../types'
import { SPECIES_DATA } from '../data/species'
import { getNextEvolution } from '../data/evolution'

const CYAN: Color = 'ansi:cyan'
const GREEN: Color = 'ansi:green'
const GRAY: Color = 'ansi:white'
const YELLOW: Color = 'ansi:yellow'
const WHITE: Color = 'ansi:whiteBright'
const RED: Color = 'ansi:red'
const BLUE: Color = 'ansi:blue'

interface PokedexViewProps {
	buddyData: BuddyData
}

/**
 * Pokédex view — shows all species with collection status,
 * evolution chains, and active creature indicator.
 */
export function PokedexView({ buddyData }: PokedexViewProps) {
	const dexMap = new Map(buddyData.dex.map((d) => [d.speciesId, d]))
	const collected = buddyData.dex.length
	const total = ALL_SPECIES_IDS.length

	// Group species by evolution chain
	const chains = groupByChain()

	return (
		<Box flexDirection="column" borderStyle="round" paddingX={1}>
			{/* Header */}
			<Box justifyContent="space-between" marginBottom={0}>
				<Text bold color={CYAN}>Pokédex</Text>
				<Text>
					<Text bold color={collected === total ? GREEN : WHITE}>{collected}</Text>
					<Text color={GRAY}>/{total} </Text>
					<Text color={GRAY}>collected</Text>
				</Text>
			</Box>

			{/* Progress bar */}
			<Box>
				<Text color={GREEN}>{'█'.repeat(collected)}</Text>
				<Text color={GRAY}>{'░'.repeat(total - collected)}</Text>
				<Text> {Math.floor((collected / total) * 100)}%</Text>
			</Box>

			{/* Species list grouped by evolution chains */}
			{chains.map((chain, ci) => (
				<Box key={ci} flexDirection="column" marginTop={ci > 0 ? 0 : 0}>
					{chain.map((speciesId, si) => {
						const species = SPECIES_DATA[speciesId]
						const entry = dexMap.get(speciesId)
						const discovered = !!entry
						const isActive = buddyData.activeCreatureId
							? buddyData.creatures.some((c) => c.id === buddyData.activeCreatureId && c.speciesId === speciesId)
							: false
						const nextEvo = getNextEvolution(speciesId)

						return (
							<Box key={speciesId} flexDirection="column">
								<Box>
									{/* Chain connector */}
									<Text color={GRAY}>{si === 0 ? ' ' : '├'}</Text>
									{/* Active indicator */}
									<Text>{isActive ? <Text color={YELLOW}>▶</Text> : ' '}</Text>
									{/* Dex number */}
									<Text color={GRAY}>#{String(species.dexNumber).padStart(3, '0')} </Text>
									{/* Name */}
									<Text color={discovered ? WHITE : GRAY} bold={isActive}>
										{discovered
											? (species.names.zh ?? species.name)
											: '???'}
									</Text>
									{/* Type badges */}
									{discovered && (
										<Text>
											{' '}
											{species.types.filter((t): t is string => Boolean(t)).map((t, ti) => (
												<Text key={t} color={getTypeColor(t)}>
													{ti > 0 ? '/' : ''}{t.slice(0, 3).toUpperCase()}
												</Text>
											))}
										</Text>
									)}
									{/* Level / unknown indicator */}
									{discovered && entry ? (
										<Text color={GREEN}> Lv.{entry.bestLevel}</Text>
									) : (
										<Text color={GRAY}>  ───</Text>
									)}
									{/* Evolution arrow */}
									{nextEvo && (
										<Text color={GRAY}> →<Text color={CYAN}>Lv.{nextEvo.minLevel}</Text></Text>
									)}
								</Box>
							</Box>
						)
					})}
				</Box>
			))}

			{/* Stats row */}
			<Box marginTop={0} flexDirection="column">
				<Text color={GRAY}>─── Stats ───</Text>
				<Box>
					<Text color={GRAY}>Turns: </Text>
					<Text>{buddyData.stats.totalTurns}</Text>
					<Text color={GRAY}>  Days: </Text>
					<Text>{buddyData.stats.consecutiveDays}</Text>
				</Box>
				<Box>
					<Text color={GRAY}>Eggs: </Text>
					<Text>{buddyData.stats.totalEggsObtained}</Text>
					<Text color={GRAY}>  Evolutions: </Text>
					<Text>{buddyData.stats.totalEvolutions}</Text>
				</Box>
			</Box>

			{/* Egg info */}
			{buddyData.eggs.length > 0 && (
				<Box marginTop={0}>
					<Text color={YELLOW}>🥚 Egg: </Text>
					<Text>{buddyData.eggs[0].stepsRemaining}/{buddyData.eggs[0].totalSteps}</Text>
					<Text color={GRAY}> steps</Text>
				</Box>
			)}

			{buddyData.stats.consecutiveDays < 7 && (
				<Box>
					<Text color={GRAY}>Next egg: {7 - buddyData.stats.consecutiveDays} more days</Text>
				</Box>
			)}
		</Box>
	)
}

/** Type → color mapping */
function getTypeColor(type: string): Color {
	const colors: Record<string, Color> = {
		grass: 'ansi:green',
		poison: 'ansi:magenta',
		fire: 'ansi:red',
		flying: 'ansi:cyan',
		water: 'ansi:blue',
		electric: 'ansi:yellow',
		normal: 'ansi:white',
	}
	return colors[type] ?? 'ansi:white'
}

/** Group species by evolution chain for visual display */
function groupByChain(): SpeciesId[][] {
	return [
		['bulbasaur', 'ivysaur', 'venusaur'],
		['charmander', 'charmeleon', 'charizard'],
		['squirtle', 'wartortle', 'blastoise'],
		['pikachu'],
	]
}
