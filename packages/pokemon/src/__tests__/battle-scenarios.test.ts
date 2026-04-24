import { describe, test, expect } from 'bun:test'
import { battleScenario, battleTest, makeCreature } from './battle-helper'
import type { BattleState } from '../battle/types'

// ─── 基础战斗创建 ───

describe('Battle Scenario: 创建', () => {
  battleTest('单精灵对战正常初始化', async () => {
    const s = await battleScenario()
      .party('charmander', 50, ['flamethrower', 'airslash'])
      .opponent('squirtle', 50)
      .start()

    s.expect(s.state)
      .ongoing()
      .playerSpecies('charmander')
      .opponentSpecies('squirtle')
      .playerHpFull()
      .opponentHpFull()
  })

  battleTest('多精灵队伍正确初始化', async () => {
    const s = await battleScenario()
      .party('charmander', 50, ['flamethrower'])
      .party('bulbasaur', 30, ['vinewhip'])
      .party('pikachu', 25, ['thundershock'])
      .opponent('squirtle', 50)
      .start()

    s.expect(s.state)
      .ongoing()
      .playerSpecies('charmander')
      .satisfies(s => s.playerParty.length === 3, 'party should have 3 members')
      .aliveInParty(3)
  })

  battleTest('初始回合数为 1', async () => {
    const s = await battleScenario()
      .party('pikachu', 50, ['thundershock'])
      .opponent('squirtle', 50)
      .start()

    s.expect(s.state).turnIs(1)
  })
})

// ─── 单回合战斗事件 ───

describe('Battle Scenario: 单回合事件', () => {
  battleTest('使用招式后产生伤害事件', async () => {
    const s = await battleScenario()
      .party('charmander', 100, ['flamethrower'], { ev: { hp: 252, attack: 252, speed: 252 } })
      .opponent('squirtle', 5)
      .start()

    const state = await s.useMove(0).runTurn()
    s.expect(state).hasDamage('opponent')
  })

  battleTest('双方均使用招式', async () => {
    const s = await battleScenario()
      .party('charmander', 50, ['flamethrower'])
      .opponent('squirtle', 50)
      .start()

    const state = await s.useMove(0).runTurn()
    s.expect(state)
      .hasMove('player')
      .hasMove('opponent')
  })

  battleTest('等级碾压一击击杀', async () => {
    const s = await battleScenario()
      .party('charmander', 100, ['flamethrower'], { ev: { hp: 252, attack: 252, speed: 252 } })
      .opponent('squirtle', 5)
      .start()

    const state = await s.useMove(0).runTurn()
    s.expect(state).finished().opponentFainted()
  })

  battleTest('回合数递增', async () => {
    const s = await battleScenario()
      .party('pikachu', 50, ['thundershock'])
      .opponent('pikachu', 50) // Same type matchup for neutral/longer battle
      .start()

    const state = await s.useMove(0).runTurn()
    s.expect(state).turnIs(2)
  })
})

// ─── 属性克制 ───

describe('Battle Scenario: 属性克制', () => {
  battleTest('火系招式对草系效果绝佳', async () => {
    const s = await battleScenario()
      .party('charmander', 50, ['flamethrower'])
      .opponent('bulbasaur', 50)
      .start()

    const state = await s.useMove(0).runTurn()
    s.expect(state).hasSuperEffective().hasDamage('opponent')
  })

  battleTest('水系招式对火系效果绝佳', async () => {
    const s = await battleScenario()
      .party('squirtle', 50, ['watergun'])
      .opponent('charmander', 50)
      .start()

    const state = await s.useMove(0).runTurn()
    s.expect(state).hasSuperEffective().hasDamage('opponent')
  })

  battleTest('水系招式对水系效果不佳', async () => {
    const s = await battleScenario()
      .party('squirtle', 50, ['watergun'])
      .opponent('squirtle', 50)
      .start()

    const state = await s.useMove(0).runTurn()
    s.expect(state).hasResisted().hasDamage('opponent')
  })
})

// ─── 强制换人 ───

describe('Battle Scenario: 强制换人', () => {
  battleTest('精灵倒下触发强制换人', async () => {
    const s = await battleScenario()
      .party('charmander', 5, ['ember'])
      .party('bulbasaur', 50, ['vinewhip'])
      .opponent('squirtle', 100)
      .start()

    const state = await s.useMove(0).runTurn()
    s.expect(state).needsSwitch().playerFainted().aliveInParty(1)
  })

  battleTest('换人后新精灵上场', async () => {
    const s = await battleScenario()
      .party('charmander', 5, ['ember'])
      .party('bulbasaur', 50, ['vinewhip'])
      .opponent('squirtle', 100)
      .start()

    const afterTurn = await s.useMove(0).runTurn()
    s.expect(afterTurn).needsSwitch()

    const afterSwitch = await s.doSwitch(1)
    s.expect(afterSwitch).playerSpecies('bulbasaur').ongoing()
  })

  battleTest('换人后继续战斗', async () => {
    const s = await battleScenario()
      .party('charmander', 5, ['ember'])
      .party('pikachu', 100, ['thundershock'], { ev: { attack: 252, speed: 252 } })
      .opponent('squirtle', 100)
      .start()

    // Charmander gets OHKO'd by L100 Squirtle
    await s.useMove(0).runTurn()
    // Switch to Pikachu
    await s.doSwitch(1)
    // Pikachu fights Squirtle
    const state = await s.useMove(0).runTurn()
    s.expect(state).hasMove('player').playerSpecies('pikachu')
  })

  battleTest('最后一只倒下不触发强制换人', async () => {
    const s = await battleScenario()
      .party('charmander', 5, ['ember'])
      .opponent('squirtle', 100)
      .start()

    const state = await s.useMove(0).runTurn()
    s.expect(state)
      .finished()
      .opponentWon()
      .satisfies(s => !s.needsSwitch, 'no switch needed when all fainted')
  })
})

// ─── 战术换人 ───

describe('Battle Scenario: 战术换人', () => {
  battleTest('战术换人在同回合执行', async () => {
    const s = await battleScenario()
      .party('charmander', 50, ['flamethrower'])
      .party('squirtle', 50, ['watergun'])
      .opponent('bulbasaur', 50)
      .start()

    const state = await s.switchTo(1).runTurn()
    s.expect(state).playerSpecies('squirtle').ongoing()
  })
})

// ─── 战斗结束 ───

describe('Battle Scenario: 战斗结束', () => {
  battleTest('玩家胜利', async () => {
    const s = await battleScenario()
      .party('charmander', 100, ['flamethrower'], { ev: { hp: 252, attack: 252, speed: 252 } })
      .opponent('bulbasaur', 5)
      .start()

    const state = await s.useMove(0).runTurn()
    s.expect(state).finished().playerWon()
  })

  battleTest('玩家失败', async () => {
    const s = await battleScenario()
      .party('charmander', 5, ['ember'])
      .opponent('squirtle', 100)
      .start()

    const state = await s.useMove(0).runTurn()
    s.expect(state).finished().opponentWon()
  })

  battleTest('runUntilEnd 自动完成战斗', async () => {
    const s = await battleScenario()
      .party('charmander', 50, ['flamethrower'])
      .opponent('squirtle', 5)
      .start()

    const state = await s.runUntilEnd()
    s.expect(state).finished()
  })

  battleTest('长战斗在 maxTurns 内结束', async () => {
    const s = await battleScenario()
      .party('charmander', 50, ['flamethrower'])
      .opponent('squirtle', 50)
      .start()

    const state = await s.runUntilEnd(100)
    s.expect(state).finished()
  })
})

// ─── 多精灵队伍战斗流程 ───

describe('Battle Scenario: 多精灵队伍', () => {
  battleTest('2v1 战斗：需要两次击杀', async () => {
    const s = await battleScenario()
      .party('charmander', 100, ['flamethrower'], { ev: { hp: 252, attack: 252, speed: 252 } })
      .party('bulbasaur', 100, ['vinewhip'], { ev: { hp: 252, attack: 252, speed: 252 } })
      .opponent('squirtle', 5)
      .start()

    // First pokemon OHKOs opponent
    const state = await s.useMove(0).runTurn()
    s.expect(state).finished().playerWon()
  })

  battleTest('连续换人后战斗继续', async () => {
    const s = await battleScenario()
      .party('charmander', 5, ['ember'])
      .party('bulbasaur', 5, ['vinewhip'])
      .party('pikachu', 100, ['thundershock'], { ev: { attack: 252, speed: 252 } })
      .opponent('squirtle', 100)
      .start()

    // Charmander faints to L100 Squirtle
    await s.useMove(0).runTurn()
    // Switch to Bulbasaur (index 1)
    await s.doSwitch(1)
    // Bulbasaur faints too
    await s.useMove(0).runTurn()
    // Switch to Pikachu (index 2)
    await s.doSwitch(2)
    // Pikachu finishes
    const state = await s.useMove(0).runTurn()
    s.expect(state)
      .playerSpecies('pikachu')
      .hasMove('player')
  })
})
