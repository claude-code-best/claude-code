import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getTeammateStatuses } from '../teamDiscovery'

let tempHome: string
let previousConfigDir: string | undefined

beforeEach(() => {
  previousConfigDir = process.env.CLAUDE_CONFIG_DIR
  tempHome = join(
    tmpdir(),
    `team-discovery-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  )
  process.env.CLAUDE_CONFIG_DIR = tempHome
})

afterEach(() => {
  if (previousConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = previousConfigDir
  }
  rmSync(tempHome, { recursive: true, force: true })
})

function writeTeamConfig(teamName: string, config: unknown): void {
  const teamDir = join(tempHome, 'teams', teamName)
  mkdirSync(teamDir, { recursive: true })
  writeFileSync(join(teamDir, 'config.json'), JSON.stringify(config, null, 2))
}

describe('getTeammateStatuses', () => {
  test('preserves in-process backend type for lifecycle actions', () => {
    writeTeamConfig('alpha', {
      name: 'alpha',
      createdAt: Date.now(),
      leadAgentId: 'team-lead@alpha',
      members: [
        {
          agentId: 'team-lead@alpha',
          name: 'team-lead',
          joinedAt: Date.now(),
          tmuxPaneId: '',
          cwd: tempHome,
          subscriptions: [],
        },
        {
          agentId: 'worker@alpha',
          name: 'worker',
          joinedAt: Date.now(),
          tmuxPaneId: 'in-process',
          cwd: tempHome,
          subscriptions: [],
          backendType: 'in-process',
        },
      ],
    })

    expect(getTeammateStatuses('alpha')).toEqual([
      expect.objectContaining({
        agentId: 'worker@alpha',
        backendType: 'in-process',
      }),
    ])
  })
})
