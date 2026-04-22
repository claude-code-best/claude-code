import { describe, test, expect } from 'bun:test'
import { getDefaultMoveset, getDefaultAbility, getNewLearnableMoves } from '../dex/learnsets'
import { EMPTY_MOVE } from '../types'

describe('getDefaultMoveset', () => {
  test('charmander at level 1 has at least one move', async () => {
    const moves = await getDefaultMoveset('charmander', 1)
    expect(moves.length).toBe(4)
    expect(moves[0]!.id).not.toBe('')
  })

  test('charmander at level 10 has more moves', async () => {
    const moves = await getDefaultMoveset('charmander', 10)
    const nonEmpty = moves.filter(m => m.id !== '')
    expect(nonEmpty.length).toBeGreaterThan(1)
  })

  test('all moves have valid pp', async () => {
    const moves = await getDefaultMoveset('bulbasaur', 20)
    for (const move of moves) {
      if (move.id) {
        expect(move.pp).toBeGreaterThan(0)
        expect(move.maxPp).toBeGreaterThan(0)
      }
    }
  })

  test('invalid species returns empty moves', async () => {
    const moves = await getDefaultMoveset('nonexistent' as any, 10)
    expect(moves.every(m => m.id === '')).toBe(true)
  })
})

describe('getDefaultAbility', () => {
  test('charmander has blaze', () => {
    expect(getDefaultAbility('charmander')).toBe('blaze')
  })

  test('bulbasaur has overgrow', () => {
    expect(getDefaultAbility('bulbasaur')).toBe('overgrow')
  })

  test('squirtle has torrent', () => {
    expect(getDefaultAbility('squirtle')).toBe('torrent')
  })
})

describe('getNewLearnableMoves', () => {
  test('charmander gains ember at level 4', async () => {
    const moves = await getNewLearnableMoves('charmander', 1, 4)
    expect(moves.length).toBeGreaterThan(0)
    expect(moves.some(m => m.id === 'ember')).toBe(true)
  })

  test('no new moves when level stays same', async () => {
    const moves = await getNewLearnableMoves('charmander', 5, 5)
    expect(moves.length).toBe(0)
  })
})
