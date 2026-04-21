import React from 'react'
import { Box, Text, type Color } from '@anthropic/ink'
import type { BuddyData, Creature, SpeciesId } from '../types'
import { STAT_NAMES, STAT_LABELS } from '../types'
import { getSpeciesData } from '../data/species'
import { SPECIES_PERSONALITY } from '../data/names'
import { calculateStats, getCreatureName, getTotalEV } from '../core/creature'
import { getXpProgress } from '../core/experience'
import { getEVSummary } from '../core/effort'
import { getGenderSymbol } from '../core/gender'
import { getStatColor } from './shared'
import { getNextEvolution } from '../data/evolution'
import { StatBar } from './StatBar'

interface CompanionCardProps {
	creature: Creature
	buddyData: BuddyData
	spriteLines?: string[]
}

// ANSI color constants
const CYAN: Color = 'ansi:cyan'
const YELLOW: Color = 'ansi:yellow'
const GREEN: Color = 'ansi:green'
const BLUE: Color = 'ansi:blue'
const RED: Color = 'ansi:red'
const MAGENTA: Color = 'ansi:magenta'
const WHITE: Color = 'ansi:whiteBright'
const GRAY: Color = 'ansi:white'

/** Type → display color mapping */
const TYPE_COLORS: Record<string, Color> = {
	grass: 'ansi:green',
	poison: 'ansi:magenta',
	fire: 'ansi:red',
	flying: 'ansi:cyan',
	water: 'ansi:blue',
	electric: 'ansi:yellow',
	normal: 'ansi:white',
}

/**
 * Redesigned companion card with Pokémon-style stats display.
 */
export function CompanionCard({ creature, buddyData, spriteLines }: CompanionCardProps) {
	const species = getSpeciesData(creature.speciesId)
	const stats = calculateStats(creature)
	const xp = getXpProgress(creature)
	const genderSymbol = getGenderSymbol(creature.gender)
	const name = getCreatureName(creature)
	const evSummary = getEVSummary(creature)
	const totalEV = getTotalEV(creature)
	const nextEvo = getNextEvolution(creature.speciesId)

	// Type badges
	const typeBadges = species.types.filter((t): t is string => Boolean(t)).map((t, i) => (
		<Text key={t} color={TYPE_COLORS[t] ?? GRAY}>
			{i > 0 ? '/' : ''}{t.toUpperCase()}
		</Text>
	))

	// Friendship color
	const friendshipColor: Color = creature.friendship > 200 ? GREEN : creature.friendship > 100 ? YELLOW : RED

	// Shiny badge
	const shinyBadge = creature.isShiny ? <Text color={YELLOW}> ★SHINY★</Text> : null

	// Evolution hint
	const evoHint = nextEvo ? (
		<Text color={GRAY}> → <Text color={CYAN}>{getSpeciesData(nextEvo.to).names.zh ?? getSpeciesData(nextEvo.to).name}</Text> Lv.{nextEvo.minLevel}</Text>
	) : null

	return (
		<Box flexDirection="column" borderStyle="round" paddingX={1}>
			{/* Header row */}
			<Box justifyContent="space-between">
				<Box>
					<Text bold color={CYAN}>{name}</Text>
					<Text color={GRAY}> #{String(species.dexNumber).padStart(3, '0')}</Text>
					{shinyBadge}
				</Box>
				<Text bold>Lv.{creature.level}</Text>
			</Box>

			{/* Species + type + gender */}
			<Box>
				<Text color={GRAY}>{species.names.zh ?? species.name}</Text>
				<Text> </Text>
				{typeBadges}
				{genderSymbol && <Text> {genderSymbol}</Text>}
			</Box>

			{/* Sprite */}
			<Box flexDirection="column" alignItems="center" marginY={0}>
				{spriteLines ? (
					spriteLines.map((line, i) => <Text key={i}>{line}</Text>)
				) : (
					<Text color={GRAY}>[Loading sprite...]</Text>
				)}
			</Box>

			{/* Personality */}
			<Box>
				<Text color={GRAY} italic>"{SPECIES_PERSONALITY[creature.speciesId] ?? species.personality}"</Text>
			</Box>

			{/* Stats section */}
			<Box flexDirection="column" marginTop={0}>
				<Text color={GRAY}>─── Base Stats ───</Text>
				{STAT_NAMES.map((stat) => (
					<StatBar
						key={stat}
						label={STAT_LABELS[stat]}
						value={stats[stat]}
						maxValue={255}
						color={getStatColor(stat)}
					/>
				))}
			</Box>

			{/* XP progress */}
			<Box marginTop={0}>
				<Text color={GRAY}>XP </Text>
				<Text color={BLUE}>
					{'█'.repeat(Math.round(xp.percentage / 10))}
					{'░'.repeat(10 - Math.round(xp.percentage / 10))}
				</Text>
				<Text> {xp.current}/{xp.needed}</Text>
			</Box>

			{/* EV + Friendship */}
			<Box flexDirection="column">
				<Box>
					<Text color={GRAY}>EV </Text>
					<Text color={totalEV >= 510 ? GREEN : GRAY}>{evSummary}</Text>
					<Text color={GRAY}> ({totalEV}/510)</Text>
				</Box>
				<Box>
					<Text color={GRAY}>♥  </Text>
					<Text color={friendshipColor}>
						{'█'.repeat(Math.round((creature.friendship / 255) * 10))}
						{'░'.repeat(10 - Math.round((creature.friendship / 255) * 10))}
					</Text>
					<Text> {creature.friendship}/255</Text>
				</Box>
			</Box>

			{/* Evolution hint */}
			{evoHint && (
				<Box marginTop={0}>
					<Text color={GRAY}>Next: </Text>
					{evoHint}
				</Box>
			)}


		</Box>
	)
}
