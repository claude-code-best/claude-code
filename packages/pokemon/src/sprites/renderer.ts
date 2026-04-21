import type { AnimMode } from '../types'

/** Heart particle frames for pet animation */
const PET_HEARTS = [
	['   ♥    ', '        '],
	['  ♥ ♥   ', '   ♥    '],
	[' ♥   ♥  ', '  ♥ ♥   '],
	['  ♥ ♥   ', ' ♥   ♥  '],
	['   ♥    ', '  ♥ ♥   '],
]

/**
 * Render animated sprite by applying mode-specific transformations.
 * All species share the same animation logic - only the base sprite differs.
 */
export function renderAnimatedSprite(lines: string[], tick: number, mode: AnimMode): string[] {
	switch (mode) {
		case 'idle':
			return lines
		case 'fidget':
			return shiftLines(lines, tick % 2 === 0 ? 0 : 1)
		case 'blink':
			return blinkEyes(lines)
		case 'excited':
			return shiftLines(lines, tick % 2 === 0 ? -1 : 1)
		case 'pet':
			return addPetParticles(lines, tick)
		default:
			return lines
	}
}

/**
 * Shift all lines left or right by offset columns.
 */
function shiftLines(lines: string[], offset: number): string[] {
	if (offset === 0) return lines
	if (offset > 0) {
		return lines.map((line) => ' '.repeat(offset) + line)
	}
	// Shift left: remove leading characters
	const absOffset = Math.abs(offset)
	return lines.map((line) => line.slice(absOffset))
}

/**
 * Replace eye characters with blink indicator.
 */
function blinkEyes(lines: string[]): string[] {
	// Eye characters that should be replaced for blink
	return lines.map((line) =>
		line.replace(/[·✦×◉@°oO]/g, '—'),
	)
}

/**
 * Add heart particle frames above the sprite for pet animation.
 */
function addPetParticles(lines: string[], tick: number): string[] {
	const hearts = PET_HEARTS[tick % PET_HEARTS.length]
	return [...hearts, ...lines]
}

/**
 * Get the animation mode for a given tick in the idle sequence.
 * IDLE_SEQUENCE replicates the original buddy design pattern.
 */
const IDLE_SEQUENCE: AnimMode[] = [
	'idle', 'idle', 'idle', 'idle',
	'fidget', 'idle', 'idle', 'idle',
	'blink', 'idle', 'idle', 'idle', 'idle',
]

export function getIdleAnimMode(tick: number): AnimMode {
	return IDLE_SEQUENCE[tick % IDLE_SEQUENCE.length]
}
