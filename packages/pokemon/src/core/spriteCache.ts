import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SpeciesId, SpriteCache } from '../types'
import { getSpeciesData } from '../data/species'
import { getSpritesDir } from './storage'

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/HRKings/pokemonsay-newgenerations/master/pokemons'

/** Mapping of speciesId to cow file prefix */
const COW_FILE_MAP: Record<SpeciesId, string> = {
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

/**
 * Load sprite from local cache. Returns null if not cached.
 */
export function loadSprite(speciesId: SpeciesId): SpriteCache | null {
	const spritesDir = getSpritesDir()
	const filePath = join(spritesDir, `${speciesId}.json`)

	if (!existsSync(filePath)) return null

	try {
		const raw = readFileSync(filePath, 'utf-8')
		return JSON.parse(raw) as SpriteCache
	} catch {
		return null
	}
}

/**
 * Fetch sprite from GitHub, convert from .cow format, and cache locally.
 * Returns the cached sprite data, or null if fetch failed.
 */
export async function fetchAndCacheSprite(speciesId: SpeciesId): Promise<SpriteCache | null> {
	// Try local cache first
	const cached = loadSprite(speciesId)
	if (cached) return cached

	const cowFileName = COW_FILE_MAP[speciesId]
	if (!cowFileName) return null

	const url = `${GITHUB_RAW_BASE}/${cowFileName}.cow`

	try {
		const response = await fetch(url)
		if (!response.ok) return null

		const cowContent = await response.text()
		const lines = convertCowToLines(cowContent)
		if (lines.length === 0) return null

		const sprite: SpriteCache = {
			speciesId,
			lines,
			width: Math.max(...lines.map((l) => stripAnsi(l).length)),
			height: lines.length,
			fetchedAt: Date.now(),
		}

		// Cache to disk
		const spritesDir = getSpritesDir()
		const filePath = join(spritesDir, `${speciesId}.json`)
		writeFileSync(filePath, JSON.stringify(sprite, null, 2))

		return sprite
	} catch {
		return null
	}
}

/**
 * Convert .cow file content to displayable lines.
 * Extracts heredoc content, converts Unicode escapes, strips thought lines.
 */
function convertCowToLines(cowContent: string): string[] {
	// Extract content between $the_cow =<<EOC; and EOC
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

	// Remove first 4 lines (cowsay thought bubble guide)
	if (lines.length > 4) {
		lines = lines.slice(4)
	}

	// Trim trailing whitespace on each line (preserve leading for alignment)
	lines = lines.map((line) => line.trimEnd())

	return lines
}

/**
 * Strip ANSI escape sequences from a string.
 */
function stripAnsi(str: string): string {
	// eslint-disable-next-line no-control-regex
	return str.replace(/\x1b\[[0-9;]*m/g, '')
}

/**
 * Get species name with dex number for display.
 */
export function getSpeciesDisplay(speciesId: SpeciesId): string {
	const data = getSpeciesData(speciesId)
	return `#${String(data.dexNumber).padStart(3, '0')} ${data.name}`
}
