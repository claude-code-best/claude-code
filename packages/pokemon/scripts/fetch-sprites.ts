/**
 * Script to pre-fetch all 10 MVP Pokémon sprites from GitHub.
 * Run: bun run packages/pokemon/scripts/fetch-sprites.ts
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/HRKings/pokemonsay-newgenerations/master/pokemons'

const COW_FILES: Record<string, string> = {
	bulbasaur: '001_bulbasaur',
	ivysaur: '002_ivysaur',
	venusaur: '003_venusaur',
	charmander: '004_charmander',
	charmeleon: '005_charmeleon',
	charizard: '006_charizard',
	squirtle: '007_squirtle',
	wartortle: '008_wartortle',
	blastoise: '009_blastoise',
	pikachu: '025_pikachu',
}

const SPRITES_DIR = join(homedir(), '.claude', 'buddy-sprites')

function convertCowToLines(cowContent: string): string[] {
	const startMarker = '$the_cow =<<EOC;'
	const endMarker = 'EOC'

	const startIdx = cowContent.indexOf(startMarker)
	if (startIdx === -1) return []

	const contentStart = startIdx + startMarker.length
	const endIdx = cowContent.indexOf(endMarker, contentStart)
	if (endIdx === -1) return []

	let content = cowContent.slice(contentStart, endIdx)

	// Convert \N{U+XXXX} to actual Unicode characters
	content = content.replace(/\\N\{U\+([0-9A-Fa-f]{4,6})\}/g, (_, hex) =>
		String.fromCodePoint(parseInt(hex, 16)),
	)

	// Convert \e to actual escape character (for ANSI sequences)
	content = content.replace(/\\e/g, '\x1b')

	// Split into lines
	let lines = content.split('\n')

	// Strip leading/trailing empty lines
	while (lines.length > 0 && lines[0].trim() === '') lines.shift()
	while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()

	// Remove first 4 lines (cowsay thought bubble guide - $thoughts lines)
	if (lines.length > 4) {
		lines = lines.slice(4)
	}

	// Trim trailing whitespace on each line
	lines = lines.map((line) => line.trimEnd())

	return lines
}

function stripAnsi(str: string): string {
	// eslint-disable-next-line no-control-regex
	return str.replace(/\x1b\[[0-9;]*m/g, '')
}

async function main() {
	// Ensure output directory
	if (!existsSync(SPRITES_DIR)) {
		mkdirSync(SPRITES_DIR, { recursive: true })
	}

	for (const [speciesId, cowPrefix] of Object.entries(COW_FILES)) {
		const url = `${GITHUB_RAW_BASE}/${cowPrefix}.cow`
		console.log(`Fetching ${speciesId} from ${url}...`)

		try {
			const response = await fetch(url)
			if (!response.ok) {
				console.error(`  FAILED: HTTP ${response.status}`)
				continue
			}

			const cowContent = await response.text()
			const lines = convertCowToLines(cowContent)

			if (lines.length === 0) {
				console.error(`  FAILED: No lines after conversion`)
				continue
			}

			// Calculate visible width (strip ANSI for measurement)
			const widths = lines.map((l) => stripAnsi(l).length)

			const sprite = {
				speciesId,
				lines,
				width: Math.max(...widths),
				height: lines.length,
				fetchedAt: Date.now(),
			}

			const outPath = join(SPRITES_DIR, `${speciesId}.json`)
			writeFileSync(outPath, JSON.stringify(sprite, null, 2))

			console.log(`  OK: ${lines.length} lines, ${sprite.width} cols wide`)

			// Also print first line for visual check
			console.log(`  Preview line 1: ${stripAnsi(lines[0]!)}`)
		} catch (err) {
			console.error(`  FAILED: ${err}`)
		}

		// Small delay to be nice to GitHub
		await new Promise((r) => setTimeout(r, 200))
	}

	console.log('\nDone! Sprites cached to ~/.claude/buddy-sprites/')
}

main().catch(console.error)
