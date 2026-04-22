import React, { useState, useRef } from 'react'
import { useInput } from '@anthropic/ink'
import {
  loadBuddyData,
  saveBuddyData,
  getActiveCreature,
  BattleFlow,
  type BuddyData,
  type BattleFlowHandle,
} from '@claude-code-best/pokemon'
import type { ToolUseContext } from '../../Tool.js'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'

async function getOrInitBuddyData(): Promise<BuddyData> {
  let data = await loadBuddyData()
  if (!getActiveCreature(data)) {
    data = await loadBuddyData()
  }
  return data
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: ToolUseContext & LocalJSXCommandContext,
  _args: string,
): Promise<React.ReactNode> {
  const data = await getOrInitBuddyData()

  if (!getActiveCreature(data)) {
    onDone('No companion yet · run /buddy first', { display: 'system' })
    return null
  }

  return React.createElement(BattlePanel, {
    buddyData: data,
    onClose: () => {
      onDone('battle closed', { display: 'system' })
    },
  })
}

function BattlePanel({
  buddyData,
  onClose,
}: {
  buddyData: BuddyData
  onClose: () => void
}) {
  const [battleKey, setBattleKey] = useState(0)
  const inputRef = useRef<BattleFlowHandle | null>(null)

  useInput((input, key) => {
    inputRef.current?.handleInput(input, key)
  })

  const handleClose = async () => {
    const updated = await loadBuddyData()
    setBattleKey(k => k + 1)
  }

  return React.createElement(BattleFlow, {
    key: battleKey,
    buddyData,
    onClose,
    isActive: true,
    inputRef,
  })
}
