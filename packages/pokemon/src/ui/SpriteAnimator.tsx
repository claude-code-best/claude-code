import React, { useEffect, useState } from 'react'
import { Box, Text, type Color } from '@anthropic/ink'
import type { AnimMode } from '../types'
import { renderAnimatedSprite, getIdleAnimMode, getPetOverlay } from '../sprites/renderer'

/** Vertical padding — bounce shifts within this space */
const V_PAD = 4

interface SpriteAnimatorProps {
	/** Base sprite lines (ANSI is preserved) */
	lines: string[]
	/** Text color for the sprite */
	color?: Color
	/** Tick interval in ms (default 250) */
	tickMs?: number
	/** Single mode; omit for idle auto-play */
	mode?: AnimMode
	/** Center horizontally (default true) */
	centered?: boolean
	/** Show pet hearts overlay */
	petting?: boolean
}

/**
 * Animated sprite renderer with built-in tick loop.
 *
 * - Keeps ANSI intact (parse → pixel grid → transform → render)
 * - Pads vertically so bounce never shifts layout
 * - Grid transforms guarantee fixed output height
 */
export function SpriteAnimator({
	lines,
	color,
	tickMs = 100,
	mode,
	centered = true,
	petting,
}: SpriteAnimatorProps) {
	const [tick, setTick] = useState(0)

	useEffect(() => {
		const timer = setInterval(() => setTick(t => t + 1), tickMs)
		return () => clearInterval(timer)
	}, [tickMs])

	// Add vertical padding — bounce shifts within this space
	const padded = [...Array(V_PAD).fill(''), ...lines, ...Array(V_PAD).fill('')]

	// Apply animation (renderer parses to pixels, transforms, renders back)
	const currentMode = mode ?? getIdleAnimMode(tick)
	const animated = renderAnimatedSprite(padded, tick, currentMode)

	// Pet hearts overlay
	const overlay = petting ? getPetOverlay(tick) : null
	const displayLines = overlay ? [...overlay, ...animated] : animated

	const spriteBlock = (
		<Box flexDirection="column">
			{displayLines.map((line, i) => (
				<Text key={i} color={color}>{line || ' '}</Text>
			))}
		</Box>
	)

	if (!centered) return spriteBlock

	return (
		<Box flexDirection="row" justifyContent="center" width="100%">
			{spriteBlock}
		</Box>
	)
}
