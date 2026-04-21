import React from 'react'
import { Box, Text, type Color } from '@anthropic/ink'
import type { Egg } from '../types'

const CYAN: Color = 'ansi:cyan'
const YELLOW: Color = 'ansi:yellow'
const GRAY: Color = 'ansi:white'

interface EggViewProps {
	egg: Egg
}

/**
 * Egg status view showing hatch progress.
 */
export function EggView({ egg }: EggViewProps) {
	const percentage = Math.floor(((egg.totalSteps - egg.stepsRemaining) / egg.totalSteps) * 100)
	const filled = Math.round(percentage / 10)
	const empty = 10 - filled

	return (
		<Box flexDirection="column" borderStyle="round" paddingX={1} alignItems="center">
			<Text bold color={CYAN}>
				Egg Status
			</Text>

			{/* ASCII egg */}
			<Box flexDirection="column" alignItems="center" marginY={1}>
				<Text>       .       </Text>
				<Text>      / \      </Text>
				<Text>     |   |     </Text>
				<Text>      \_/      </Text>
			</Box>

			{/* Progress */}
			<Box flexDirection="column" alignItems="center">
				<Text>
					Steps: {egg.totalSteps - egg.stepsRemaining} / {egg.totalSteps}
				</Text>
				<Text color={YELLOW}>
					{'█'.repeat(filled)}
					{'░'.repeat(empty)}
				</Text>
				<Text>{percentage}%</Text>
			</Box>

			{/* Tips */}
			<Box marginTop={1} flexDirection="column" alignItems="center">
				<Text color={GRAY}>Pet (+5) · Chat (+3) · Cmd (+1)</Text>
				<Text color={GRAY}>Hatch: ~{egg.stepsRemaining} more interactions</Text>
			</Box>
		</Box>
	)
}
