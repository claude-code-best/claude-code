import { describe, expect, test } from 'bun:test'
import { renderAnimatedSprite } from '../sprites/renderer'

describe('renderAnimatedSprite', () => {
	test('flip preserves sprite width alignment across rows', () => {
		const lines = [
			'  AB',
			' C',
		]

		const flipped = renderAnimatedSprite(lines, 0, 'flip')

		expect(flipped).toEqual([
			'\x1b[0mBA  \x1b[0m',
			'\x1b[0m  C \x1b[0m',
		])
	})
})
