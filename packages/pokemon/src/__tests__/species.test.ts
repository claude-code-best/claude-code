import { describe, test, expect } from 'bun:test'
import { getSpeciesData, getAllSpeciesData, DEX_TO_SPECIES, ensureSpeciesData } from '../dex/species'
import { ALL_SPECIES_IDS } from '../types'
import type { SpeciesId } from '../types'

describe('getSpeciesData', () => {
  test('returns valid data for charmander', () => {
    const data = getSpeciesData('charmander')
    expect(data.id).toBe('charmander')
    expect(data.name).toBe('Charmander')
    expect(data.dexNumber).toBe(4)
    expect(data.growthRate).toBe('medium-slow')
    expect(data.captureRate).toBe(45)
    expect(data.flavorText).toBeTruthy()
  })

  test('returns valid data for pikachu', () => {
    const data = getSpeciesData('pikachu')
    expect(data.id).toBe('pikachu')
    expect(data.dexNumber).toBe(25)
    expect(data.growthRate).toBe('medium-fast')
  })

  test('has baseStats with all 6 stats', () => {
    const data = getSpeciesData('bulbasaur')
    expect(data.baseStats).toHaveProperty('hp')
    expect(data.baseStats).toHaveProperty('attack')
    expect(data.baseStats).toHaveProperty('defense')
    expect(data.baseStats).toHaveProperty('spAtk')
    expect(data.baseStats).toHaveProperty('spDef')
    expect(data.baseStats).toHaveProperty('speed')
  })

  test('has types array', () => {
    const data = getSpeciesData('squirtle')
    expect(data.types.length).toBeGreaterThan(0)
    expect(data.types[0]).toBe('water')
  })

  test('has evolutionChain for species with evolutions', () => {
    const data = getSpeciesData('charmander')
    expect(data.evolutionChain).toBeDefined()
    expect(data.evolutionChain?.[0]?.into).toBe('charmeleon')
  })

  test('has no evolutionChain for final evolutions', () => {
    const data = getSpeciesData('charizard')
    expect(data.evolutionChain).toBeUndefined()
  })
})

describe('getAllSpeciesData', () => {
  test('returns data for all species', () => {
    const all = getAllSpeciesData()
    for (const id of ALL_SPECIES_IDS) {
      expect(all[id]).toBeDefined()
      expect(all[id]!.id).toBe(id)
    }
  })
})

describe('DEX_TO_SPECIES', () => {
  test('maps dex numbers correctly', () => {
    expect(DEX_TO_SPECIES[1]).toBe('bulbasaur')
    expect(DEX_TO_SPECIES[4]).toBe('charmander')
    expect(DEX_TO_SPECIES[7]).toBe('squirtle')
    expect(DEX_TO_SPECIES[25]).toBe('pikachu')
  })
})

describe('ensureSpeciesData', () => {
  test('resolves without error', async () => {
    await expect(ensureSpeciesData()).resolves.toBeUndefined()
  })
})

describe('getSpeciesData - supplementary fields', () => {
  test('has baseHappiness', () => {
    expect(getSpeciesData('bulbasaur').baseHappiness).toBe(70)
  })

  test('pikachu has higher captureRate', () => {
    expect(getSpeciesData('pikachu').captureRate).toBeGreaterThan(getSpeciesData('charmander').captureRate)
  })

  test('has names with en key', () => {
    const data = getSpeciesData('charmander')
    expect(data.names).toBeDefined()
    expect(data.names.en).toBe('Charmander')
  })

  test('shinyChance is 1/4096', () => {
    expect(getSpeciesData('bulbasaur').shinyChance).toBe(1 / 4096)
  })
})
