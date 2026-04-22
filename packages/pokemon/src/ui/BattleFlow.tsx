import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Box, Text } from '@anthropic/ink'
import type { BuddyData, Creature, SpeciesId } from '../types'
import { ALL_SPECIES_IDS } from '../types'
import { getSpeciesData } from '../dex/species'
import { saveBuddyData } from '../core/storage'
import { createBattle, executeTurn, executeSwitch, type BattleInit } from '../battle/engine'
import { settleBattle, applyMoveLearn, applyEvolution } from '../battle/settlement'
import { BattleConfigPanel } from './BattleConfigPanel'
import { BattleScene, type MenuPhase } from './BattleScene'
import { SwitchPanel } from './SwitchPanel'
import { ItemPanel } from './ItemPanel'
import { BattleResultPanel } from './BattleResultPanel'
import { MoveLearnPanel } from './MoveLearnPanel'
import type { BattleState, PlayerAction } from '../battle/types'

type Phase =
  | 'config'
  | 'configSelect'
  | 'battle'
  | 'result'
  | 'learnMoves'
  | 'evolution'
  | 'done'

export interface BattleFlowHandle {
  handleInput: (input: string, key: {
    escape?: boolean
    return?: boolean
    upArrow?: boolean
    downArrow?: boolean
    leftArrow?: boolean
    rightArrow?: boolean
    tab?: boolean
    backspace?: boolean
    ctrl?: boolean
    shift?: boolean
    meta?: boolean
  }) => void
}

interface BattleFlowProps {
  buddyData: BuddyData
  onClose: () => void
  isActive?: boolean
  inputRef?: React.MutableRefObject<BattleFlowHandle | null>
}

const VISIBLE_SPECIES = 7

export function BattleFlow({ buddyData: initialData, onClose, isActive = true, inputRef }: BattleFlowProps) {
  const [phase, setPhase] = useState<Phase>('config')
  const [buddyData, setBuddyData] = useState(initialData)
  const [battleInit, setBattleInit] = useState<BattleInit | null>(null)
  const [battleState, setBattleState] = useState<BattleState | null>(null)
  const [opponentSpeciesId, setOpponentSpeciesId] = useState<SpeciesId>('pikachu')
  const [opponentLevel, setOpponentLevel] = useState(5)
  const [pendingMoves, setPendingMoves] = useState<{ creatureId: string; moveId: string; moveName: string }[]>([])
  const [pendingEvos, setPendingEvos] = useState<{ creatureId: string; from: SpeciesId; to: SpeciesId }[]>([])
  const [replaceIndex, setReplaceIndex] = useState(0)
  const [speciesIndex, setSpeciesIndex] = useState(0)
  const [configCursor, setConfigCursor] = useState(0)

  // ─── Battle UI state ───
  const [menuPhase, setMenuPhase] = useState<MenuPhase>('main')
  const [cursorIndex, setCursorIndex] = useState(0)
  const [animEnabled, setAnimEnabled] = useState(true)

  // ─── Helpers ───

  function getActiveCreatureLevel(): number {
    const id = buddyData.party[0]
    if (!id) return 5
    const c = buddyData.creatures.find(cr => cr.id === id)
    return c?.level ?? 5
  }

  function getPartyCreatures(): Creature[] {
    return buddyData.party
      .filter((id): id is string => id !== null)
      .map(id => buddyData.creatures.find(c => c.id === id))
      .filter((c): c is Creature => c !== undefined)
  }

  /** Build battleHp map from battleState.playerParty */
  function getBattleHpMap(): Record<string, { hp: number; maxHp: number }> {
    if (!battleState) return {}
    const map: Record<string, { hp: number; maxHp: number }> = {}
    for (const p of battleState.playerParty) {
      map[p.id] = { hp: p.hp, maxHp: p.maxHp }
    }
    return map
  }

  /** Get max cursor index for current sub-phase */
  function getMaxCursor(): number {
    if (!battleState) return 0
    switch (menuPhase) {
      case 'main': return 3
      case 'fight': return battleState.playerPokemon.moves.length - 1
      case 'bag': return battleState.usableItems.length - 1
      case 'pokemon': return getPartyCreatures().length - 1
      default: return 0
    }
  }

  // ─── Actions ───

  const handleRandomBattle = useCallback(() => {
    const opponentLevel = getActiveCreatureLevel()
    const speciesList = ALL_SPECIES_IDS
    const randomSpecies = speciesList[Math.floor(Math.random() * speciesList.length)]!
    handleStartBattle(randomSpecies, opponentLevel)
  }, [buddyData])

  const handleStartBattle = useCallback(async (speciesId: SpeciesId, level: number) => {
    setOpponentSpeciesId(speciesId)
    setOpponentLevel(level)

    const creatures = buddyData.party
      .filter((id): id is string => id !== null)
      .map(id => buddyData.creatures.find(c => c.id === id))
      .filter((c): c is Creature => c !== undefined)

    if (creatures.length === 0) return

    const bagItems = buddyData.bag.items
    const init = await createBattle(creatures, speciesId, level, bagItems)
    setBattleInit(init)
    setBattleState(init.state)
    setMenuPhase('main')
    setCursorIndex(0)
    setPhase('battle')
  }, [buddyData])

  const handleAction = useCallback(async (action: PlayerAction) => {
    if (!battleInit) return
    const state = await executeTurn(battleInit, action)
    setBattleState(state)
    setMenuPhase('main')
    setCursorIndex(0)

    // Pokémon fainted — show switch panel overlay
    if (state.needsSwitch && !state.finished) {
      setMenuPhase('pokemon')
      setCursorIndex(0)
      return
    }

    if (state.finished && state.result) {
      const participants = buddyData.party.filter((id): id is string => id !== null)
      const result = { ...state.result, participantIds: participants }
      const settled = await settleBattle(buddyData, result, opponentSpeciesId, opponentLevel)

      setBuddyData(settled.data)
      setPendingMoves(settled.learnableMoves)
      setPendingEvos(settled.pendingEvolutions)
      setBattleState({ ...state, result })
      setPhase('result')
    }
  }, [battleInit, buddyData, opponentSpeciesId, opponentLevel])

  const handleResultContinue = useCallback(() => {
    if (pendingMoves.length > 0) {
      setPhase('learnMoves')
    } else if (pendingEvos.length > 0) {
      setPhase('evolution')
    } else {
      saveBuddyData(buddyData)
      setPhase('done')
      onClose()
    }
  }, [pendingMoves, pendingEvos, buddyData, onClose])

  const handleMoveLearn = useCallback((idx: number) => {
    if (pendingMoves.length === 0) return
    const move = pendingMoves[0]!
    const updated = applyMoveLearn(buddyData, move.creatureId, move.moveId, idx)
    setBuddyData(updated)
    const remaining = pendingMoves.slice(1)
    setPendingMoves(remaining)
    if (remaining.length === 0) {
      if (pendingEvos.length > 0) {
        setPhase('evolution')
      } else {
        saveBuddyData(updated)
        setPhase('done')
        onClose()
      }
    }
  }, [pendingMoves, pendingEvos, buddyData, onClose])

  const handleMoveSkip = useCallback(() => {
    const remaining = pendingMoves.slice(1)
    setPendingMoves(remaining)
    if (remaining.length === 0) {
      if (pendingEvos.length > 0) {
        setPhase('evolution')
      } else {
        saveBuddyData(buddyData)
        setPhase('done')
        onClose()
      }
    }
  }, [pendingMoves, pendingEvos, buddyData, onClose])

  const handleEvolutionConfirm = useCallback(() => {
    if (pendingEvos.length === 0) return
    const evo = pendingEvos[0]!
    const updated = applyEvolution(buddyData, evo.creatureId, evo.to)
    setBuddyData(updated)
    const remaining = pendingEvos.slice(1)
    setPendingEvos(remaining)
    if (remaining.length === 0) {
      saveBuddyData(updated)
      setPhase('done')
      onClose()
    }
  }, [pendingEvos, buddyData, onClose])

  // Forced switch after faint
  const handleForcedSwitch = useCallback(async (partyIndex: number) => {
    if (!battleInit) return
    const state = await executeSwitch(battleInit, partyIndex)
    setBattleState(state)
    setMenuPhase('main')
    setCursorIndex(0)

    if (state.finished && state.result) {
      const participants = buddyData.party.filter((id): id is string => id !== null)
      const result = { ...state.result, participantIds: participants }
      const settled = await settleBattle(buddyData, result, opponentSpeciesId, opponentLevel)
      setBuddyData(settled.data)
      setPendingMoves(settled.learnableMoves)
      setPendingEvos(settled.pendingEvolutions)
      setBattleState({ ...state, result })
      setPhase('result')
    }
  }, [battleInit, buddyData, opponentSpeciesId, opponentLevel])

  // ─── Main menu cursor navigation (2x2 grid) ───

  const moveMainCursor = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    setCursorIndex(prev => {
      // Grid: 0=TL, 1=TR, 2=BL, 3=BR
      switch (direction) {
        case 'up': return prev >= 2 ? prev - 2 : prev + 2
        case 'down': return prev < 2 ? prev + 2 : prev - 2
        case 'left': return prev % 2 === 1 ? prev - 1 : prev + 1
        case 'right': return prev % 2 === 0 ? prev + 1 : prev - 1
        default: return prev
      }
    })
  }, [])

  // ─── Input handler ───

  const handleInput = useCallback((input: string, key: {
    escape?: boolean; return?: boolean; upArrow?: boolean; downArrow?: boolean
    leftArrow?: boolean; rightArrow?: boolean
  }) => {
    if (!isActive) return

    if (phase === 'config') {
      if (key.escape) {
        onClose()
      } else if (key.upArrow) {
        setConfigCursor(prev => (prev - 1 + 2) % 2)
      } else if (key.downArrow) {
        setConfigCursor(prev => (prev + 1) % 2)
      } else if (key.return) {
        if (configCursor === 0) {
          handleRandomBattle()
        } else {
          setSpeciesIndex(ALL_SPECIES_IDS.indexOf(opponentSpeciesId))
          setPhase('configSelect')
        }
      }
      return
    }

    if (phase === 'configSelect') {
      if (key.escape) {
        setPhase('config')
      } else if (key.upArrow) {
        const idx = speciesIndex > 0 ? speciesIndex - 1 : ALL_SPECIES_IDS.length - 1
        setSpeciesIndex(idx)
        setOpponentSpeciesId(ALL_SPECIES_IDS[idx]!)
      } else if (key.downArrow) {
        const idx = speciesIndex < ALL_SPECIES_IDS.length - 1 ? speciesIndex + 1 : 0
        setSpeciesIndex(idx)
        setOpponentSpeciesId(ALL_SPECIES_IDS[idx]!)
      } else if (key.return) {
        handleStartBattle(opponentSpeciesId, buddyData.party[0] ? getActiveCreatureLevel() : 5)
      }
      return
    }

    if (phase === 'battle') {
      if (!battleState) return

      // F key toggles animation
      if (input.toLowerCase() === 'f') {
        setAnimEnabled(prev => !prev)
        return
      }

      // ─── Main menu ───
      if (menuPhase === 'main') {
        if (key.escape) return
        if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) {
          moveMainCursor(key.upArrow ? 'up' : key.downArrow ? 'down' : key.leftArrow ? 'left' : 'right')
          return
        }
        if (key.return) {
          switch (cursorIndex) {
            case 0: // 战斗 → move selection
              setMenuPhase('fight')
              setCursorIndex(0)
              return
            case 1: // 背包
              setMenuPhase('bag')
              setCursorIndex(0)
              return
            case 2: // 宝可梦
              setMenuPhase('pokemon')
              setCursorIndex(0)
              return
            case 3: // 逃跑 — show message
              return
          }
        }
        return
      }

      // ─── Fight (move selection) ───
      if (menuPhase === 'fight') {
        if (key.escape) {
          setMenuPhase('main')
          setCursorIndex(0)
          return
        }
        if (key.upArrow) {
          setCursorIndex(prev => Math.max(0, prev - 1))
          return
        }
        if (key.downArrow) {
          setCursorIndex(prev => Math.min(battleState.playerPokemon.moves.length - 1, prev + 1))
          return
        }
        if (key.return) {
          const move = battleState.playerPokemon.moves[cursorIndex]
          if (move && move.pp > 0 && !move.disabled) {
            handleAction({ type: 'move', moveIndex: cursorIndex })
          }
          return
        }
        return
      }

      // ─── Bag (item selection) ───
      if (menuPhase === 'bag') {
        if (key.escape) {
          setMenuPhase('main')
          setCursorIndex(1) // return to 背包
          return
        }
        if (key.upArrow) {
          setCursorIndex(prev => Math.max(0, prev - 1))
          return
        }
        if (key.downArrow) {
          setCursorIndex(prev => Math.min(battleState.usableItems.length - 1, prev + 1))
          return
        }
        if (key.return) {
          const item = battleState.usableItems[cursorIndex]
          if (item) {
            handleAction({ type: 'item', itemId: item.id })
          }
          return
        }
        return
      }

      // ─── Pokemon (switch selection) ───
      if (menuPhase === 'pokemon') {
        const isForced = battleState.needsSwitch
        if (key.escape && !isForced) {
          setMenuPhase('main')
          setCursorIndex(2) // return to 宝可梦
          return
        }
        if (key.upArrow) {
          setCursorIndex(prev => Math.max(0, prev - 1))
          return
        }
        if (key.downArrow) {
          const maxIdx = getPartyCreatures().length - 1
          setCursorIndex(prev => Math.min(maxIdx, prev + 1))
          return
        }
        if (key.return) {
          const party = getPartyCreatures()
          const creature = party[cursorIndex]
          const battleParty = battleState.playerParty
          const battleCreature = battleParty[cursorIndex]
          if (creature && battleCreature && battleCreature.hp > 0) {
            if (isForced) {
              handleForcedSwitch(cursorIndex)
            } else {
              handleAction({ type: 'switch', partyIndex: cursorIndex })
            }
          }
          return
        }
        return
      }

      return
    }

    if (phase === 'result') {
      if (key.return) handleResultContinue()
      return
    }

    if (phase === 'learnMoves') {
      if (input.toLowerCase() === 's') {
        handleMoveSkip()
      } else if (key.upArrow) {
        setReplaceIndex(prev => Math.max(0, prev - 1))
      } else if (key.downArrow) {
        setReplaceIndex(prev => Math.min(3, prev + 1))
      } else if (key.return) {
        handleMoveLearn(replaceIndex)
      }
      return
    }

    if (phase === 'evolution') {
      if (key.return) handleEvolutionConfirm()
      return
    }
  }, [isActive, phase, menuPhase, cursorIndex, configCursor, speciesIndex, opponentSpeciesId, buddyData, battleState, battleInit, pendingMoves, pendingEvos, onClose, handleRandomBattle, handleStartBattle, handleAction, handleResultContinue, handleForcedSwitch, handleMoveLearn, handleMoveSkip, handleEvolutionConfirm, moveMainCursor])

  // Expose handleInput via ref
  useEffect(() => {
    if (inputRef) inputRef.current = { handleInput }
  }, [handleInput, inputRef])

  // ─── Build overlay content for sub-panels ───

  function buildOverlay(): React.ReactNode | undefined {
    if (!battleState) return undefined

    if (menuPhase === 'bag') {
      return (
        <ItemPanel
          items={battleState.usableItems}
          cursorIndex={cursorIndex}
          categoryIndex={0}
          phase="items"
          onSelect={() => {}}
          onCancel={() => { setMenuPhase('main'); setCursorIndex(1) }}
        />
      )
    }

    if (menuPhase === 'pokemon') {
      return (
        <SwitchPanel
          party={getPartyCreatures()}
          activeId={battleState.playerPokemon.id}
          cursorIndex={cursorIndex}
          battleHp={getBattleHpMap()}
          onSelect={() => {}}
          onCancel={() => { setMenuPhase('main'); setCursorIndex(2) }}
        />
      )
    }

    return undefined
  }

  // ─── Render by phase ───

  switch (phase) {
    case 'config':
      return (
        <BattleConfigPanel
          party={getPartyCreatures()}
          cursorIndex={configCursor}
          onSubmit={handleStartBattle}
          onCancel={onClose}
        />
      )

    case 'configSelect':
      return renderSpeciesSelect()

    case 'battle': {
      if (!battleState) return null
      return (
        <BattleScene
          state={battleState}
          menuPhase={menuPhase}
          cursorIndex={cursorIndex}
          animEnabled={animEnabled}
          overlay={buildOverlay()}
          onMoveCursor={(dir) => {
            if (menuPhase === 'main') moveMainCursor(dir)
            else if (dir === 'up') setCursorIndex(prev => Math.max(0, prev - 1))
            else if (dir === 'down') setCursorIndex(prev => Math.min(getMaxCursor(), prev + 1))
          }}
          onSelect={() => {}}
          onBack={() => { setMenuPhase('main'); setCursorIndex(0) }}
          onToggleAnim={() => setAnimEnabled(prev => !prev)}
        />
      )
    }

    case 'result': {
      if (!battleState?.result) return null
      return (
        <BattleResultPanel
          result={battleState.result}
          onContinue={handleResultContinue}
        />
      )
    }

    case 'learnMoves': {
      if (pendingMoves.length === 0) return null
      const move = pendingMoves[0]!
      const creature = buddyData.creatures.find(c => c.id === move.creatureId)
      if (!creature) return null
      return (
        <MoveLearnPanel
          creature={creature}
          newMoveId={move.moveId}
          cursorIndex={replaceIndex}
          onLearn={handleMoveLearn}
          onSkip={handleMoveSkip}
          onSelectReplace={setReplaceIndex}
        />
      )
    }

    case 'evolution': {
      if (pendingEvos.length === 0) return null
      const evo = pendingEvos[0]!
      return (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="warning"
          borderText={{ content: ' 进化 ', position: 'top', align: 'center' }}
          paddingX={2}
          paddingY={1}
        >
          <Text bold color="warning">{evo.from} 正在进化为 {evo.to}!</Text>
          <Box marginTop={1}>
            <Text color="claude">[Enter] 继续</Text>
          </Box>
        </Box>
      )
    }

    case 'done':
      return null

    default:
      return null
  }

  // ─── Species select sub-render ───

  function renderSpeciesSelect() {
    const total = ALL_SPECIES_IDS.length
    // Scroll window centered on selection
    const halfVisible = Math.floor(VISIBLE_SPECIES / 2)
    let startIdx = speciesIndex - halfVisible
    if (startIdx < 0) startIdx = 0
    if (startIdx + VISIBLE_SPECIES > total) startIdx = Math.max(0, total - VISIBLE_SPECIES)
    const visibleSpecies = ALL_SPECIES_IDS.slice(startIdx, startIdx + VISIBLE_SPECIES)

    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="success"
        borderText={{ content: ' 选择对手 ', position: 'top', align: 'center' }}
        paddingX={2}
        paddingY={1}
      >
        {/* Scroll indicator */}
        {total > VISIBLE_SPECIES && (
          <Box justifyContent="center">
            <Text dimColor>{startIdx > 0 ? '  ↑ 更多  ' : ''}</Text>
          </Box>
        )}

        {visibleSpecies.map((sid) => {
          const s = getSpeciesData(sid)
          const isSelected = sid === opponentSpeciesId
          return (
            <Box key={sid}>
              {isSelected ? (
                <Text color="success" bold> ▸ </Text>
              ) : (
                <Text dimColor>   </Text>
              )}
              <Text color={isSelected ? 'claude' : 'inactive'} bold={isSelected}>
                #{String(s.dexNumber).padStart(3, '0')} {s.names.zh ?? s.name}
              </Text>
              {isSelected && (
                <Text dimColor> Lv.{getActiveCreatureLevel()}</Text>
              )}
            </Box>
          )
        })}

        {/* Scroll indicator */}
        {total > VISIBLE_SPECIES && (
          <Box justifyContent="center">
            <Text dimColor>{startIdx + VISIBLE_SPECIES < total ? '  ↓ 更多  ' : ''}</Text>
          </Box>
        )}

        <Box marginTop={1}>
          <Text dimColor>[↑↓] 选择 · [Enter] 确认 · [ESC] 返回</Text>
        </Box>
      </Box>
    )
  }
}
