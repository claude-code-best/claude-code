import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  resetStateForTests,
  setCwdState,
  setOriginalCwd,
} from '../../bootstrap/state'
import { getTaskListId } from '../../utils/tasks'
import { getTeamFilePath } from '../../utils/swarm/teamHelpers'
import { initializeAssistantTeam } from '../index'

let tempDir = ''
let previousConfigDir: string | undefined

beforeEach(() => {
  previousConfigDir = process.env.CLAUDE_CONFIG_DIR
  tempDir = join(
    tmpdir(),
    `assistant-team-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  )
  process.env.CLAUDE_CONFIG_DIR = join(tempDir, 'config')
  resetStateForTests()
  setOriginalCwd(tempDir)
  setCwdState(tempDir)
})

afterEach(async () => {
  resetStateForTests()
  if (previousConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = previousConfigDir
  }
  await rm(tempDir, { recursive: true, force: true })
})

describe('initializeAssistantTeam', () => {
  test('creates a session-scoped in-process team context and task list', async () => {
    const context = await initializeAssistantTeam()
    expect(context).toBeDefined()
    const teamContext = context!

    expect(teamContext.teamName).toStartWith('assistant-')
    expect(teamContext.isLeader).toBe(true)
    expect(teamContext.selfAgentName).toBe('team-lead')
    expect(
      teamContext.teammates[teamContext.leadAgentId]?.tmuxSessionName,
    ).toBe('in-process')
    expect(getTaskListId()).toBe(teamContext.teamName)

    const raw = await readFile(getTeamFilePath(teamContext.teamName), 'utf-8')
    const teamFile = JSON.parse(raw)
    expect(teamFile.leadAgentId).toBe(teamContext.leadAgentId)
    expect(teamFile.members[0].backendType).toBe('in-process')
    expect(teamFile.members[0].agentType).toBe('assistant')
  })
})
