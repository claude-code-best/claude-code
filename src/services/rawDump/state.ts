/**
 * Raw Dump 磁盘状态管理
 * 用于 conversation 和 commits 的去重
 */

import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { RawDumpState } from './types.js'

const STATE_DIR = path.join(os.homedir(), '.claude')
const STATE_FILE = path.join(STATE_DIR, 'csc-raw-dump-state.json')

function createEmptyState(): RawDumpState {
  return {
    conversation: {},
    commits: {},
  }
}

export async function readState(): Promise<RawDumpState> {
  try {
    const text = await fs.readFile(STATE_FILE, 'utf-8')
    const parsed = JSON.parse(text) as Partial<RawDumpState>
    return {
      conversation: parsed.conversation ?? {},
      commits: parsed.commits ?? {},
    }
  } catch {
    return createEmptyState()
  }
}

export async function writeState(state: RawDumpState): Promise<void> {
  await fs.mkdir(STATE_DIR, { recursive: true })
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8')
}
