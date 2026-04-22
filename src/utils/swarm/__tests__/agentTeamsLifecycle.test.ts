import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let terminateCalls: string[] = []

mock.module('src/utils/swarm/backends/registry.js', () => {
  const executor = {
    type: 'in-process' as const,
    setContext() {},
    async isAvailable() {
      return true
    },
    async spawn(config: { name: string; teamName: string; color?: string }) {
      return {
        success: true,
        agentId: `${config.name}@${config.teamName}`,
        taskId: `task-${config.name}`,
        backendType: 'in-process',
        color: config.color,
        isSplitPane: false,
      }
    },
    async sendMessage() {},
    async terminate(agentId: string) {
      terminateCalls.push(agentId)
      return true
    },
    async kill() {
      return true
    },
    async isActive() {
      return true
    },
  }

  return {
    getTeammateExecutor: async () => executor,
    getInProcessBackend: () => executor,
    detectAndGetBackend: async () => ({
      backend: { type: 'in-process' },
      isNative: false,
      needsIt2Setup: false,
    }),
    isInProcessEnabled: () => true,
    markInProcessFallback: () => {},
    resetBackendDetection: () => {},
    getCachedBackend: () => null,
    getCachedDetectionResult: () => null,
    getResolvedTeammateMode: () => 'in-process',
    ensureBackendsRegistered: async () => {},
    getBackendByType: () => ({
      type: 'tmux',
      killPane: async () => true,
    }),
  }
})

let tempHome: string
let previousConfigDir: string | undefined
let previousAnthropicApiKey: string | undefined
let state: any

function setState(updater: (prev: any) => any): void {
  state = updater(state)
}

function readTeamConfig(teamName: string): any {
  return JSON.parse(
    readFileSync(join(tempHome, 'teams', teamName, 'config.json'), 'utf-8'),
  )
}

function writeTeamConfig(teamName: string, config: unknown): void {
  const teamDir = join(tempHome, 'teams', teamName)
  mkdirSync(teamDir, { recursive: true })
  writeFileSync(join(teamDir, 'config.json'), JSON.stringify(config, null, 2))
}

beforeEach(() => {
  terminateCalls = []
  previousConfigDir = process.env.CLAUDE_CONFIG_DIR
  previousAnthropicApiKey = process.env.ANTHROPIC_API_KEY
  tempHome = join(
    tmpdir(),
    `agent-teams-lifecycle-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  )
  process.env.CLAUDE_CONFIG_DIR = tempHome
  process.env.ANTHROPIC_API_KEY = 'test-key'
  state = {
    teamContext: undefined,
    tasks: {},
    inbox: { messages: [] },
    toolPermissionContext: {
      mode: 'default',
      alwaysAllowRules: {},
      alwaysDenyRules: {},
      additionalWorkingDirectories: new Map(),
    },
    mainLoopModel: null,
    mainLoopModelForSession: null,
    agentNameRegistry: new Map(),
    mcp: { tools: [] },
  }
})

afterEach(() => {
  if (previousConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = previousConfigDir
  }
  if (previousAnthropicApiKey === undefined) {
    delete process.env.ANTHROPIC_API_KEY
  } else {
    process.env.ANTHROPIC_API_KEY = previousAnthropicApiKey
  }
  rmSync(tempHome, { recursive: true, force: true })
})

describe('Agent Teams lifecycle', () => {
  test('runs TeamCreate -> spawn -> TaskUpdate -> SendMessage -> TeamDelete', async () => {
    const { TeamCreateTool } = await import(
      '@claude-code-best/builtin-tools/tools/TeamCreateTool/TeamCreateTool.js'
    )
    const { spawnTeammate } = await import(
      '@claude-code-best/builtin-tools/tools/shared/spawnMultiAgent.js'
    )
    const { TaskCreateTool } = await import(
      '@claude-code-best/builtin-tools/tools/TaskCreateTool/TaskCreateTool.js'
    )
    const { TaskUpdateTool } = await import(
      '@claude-code-best/builtin-tools/tools/TaskUpdateTool/TaskUpdateTool.js'
    )
    const { SendMessageTool } = await import(
      '@claude-code-best/builtin-tools/tools/SendMessageTool/SendMessageTool.js'
    )
    const { TeamDeleteTool } = await import(
      '@claude-code-best/builtin-tools/tools/TeamDeleteTool/TeamDeleteTool.js'
    )

    const context = {
      getAppState: () => state,
      setAppState: setState,
      options: {
        agentDefinitions: { activeAgents: [] },
      },
      abortController: new AbortController(),
    } as any

    const created = await TeamCreateTool.call(
      { team_name: 'alpha', description: 'test team' },
      context,
      undefined as any,
      undefined as any,
    )
    expect(created.data.team_name).toBe('alpha')

    const spawned = await spawnTeammate(
      {
        name: 'worker',
        prompt: 'handle assigned tasks',
        team_name: 'alpha',
      },
      context,
    )
    expect(spawned.data.agent_id).toBe('worker@alpha')

    const task = await TaskCreateTool.call(
      { subject: 'Check lifecycle', description: 'Verify team task flow' },
      context,
    )
    await TaskUpdateTool.call(
      { taskId: task.data.task.id, owner: 'worker' },
      context,
    )

    const message = await SendMessageTool.call(
      {
        to: 'worker',
        summary: 'Status request',
        message: 'Please report status.',
      },
      context,
      async () => ({ behavior: 'allow' as const }),
      undefined as any,
    )
    expect(message.data.success).toBe(true)

    const blockedDelete = await TeamDeleteTool.call(
      {},
      context,
      undefined as any,
      undefined as any,
    )
    expect(blockedDelete.data.success).toBe(false)
    expect(terminateCalls).toEqual(['worker@alpha'])

    const config = readTeamConfig('alpha')
    config.members = config.members.map((member: any) =>
      member.name === 'worker' ? { ...member, isActive: false } : member,
    )
    writeTeamConfig('alpha', config)

    const deleted = await TeamDeleteTool.call(
      {},
      context,
      undefined as any,
      undefined as any,
    )
    expect(deleted.data.success).toBe(true)
  })

  test('TeamDelete waits for active teammates to become inactive before cleanup', async () => {
    const { TeamDeleteTool } = await import(
      '@claude-code-best/builtin-tools/tools/TeamDeleteTool/TeamDeleteTool.js'
    )
    const now = Date.now()
    writeTeamConfig('alpha', {
      name: 'alpha',
      createdAt: now,
      leadAgentId: 'team-lead@alpha',
      members: [
        {
          agentId: 'team-lead@alpha',
          name: 'team-lead',
          joinedAt: now,
          tmuxPaneId: '',
          cwd: tempHome,
          subscriptions: [],
        },
        {
          agentId: 'worker@alpha',
          name: 'worker',
          joinedAt: now,
          tmuxPaneId: 'in-process',
          cwd: tempHome,
          subscriptions: [],
          backendType: 'in-process',
        },
      ],
    })
    state.teamContext = {
      teamName: 'alpha',
      teamFilePath: join(tempHome, 'teams', 'alpha', 'config.json'),
      leadAgentId: 'team-lead@alpha',
      teammates: {
        'worker@alpha': {
          name: 'worker',
          tmuxSessionName: 'in-process',
          tmuxPaneId: 'in-process',
          cwd: tempHome,
          spawnedAt: now,
        },
      },
    }

    setTimeout(() => {
      const config = readTeamConfig('alpha')
      config.members = config.members.map((member: any) =>
        member.name === 'worker' ? { ...member, isActive: false } : member,
      )
      writeTeamConfig('alpha', config)
    }, 25)

    const result = await TeamDeleteTool.call(
      { wait_ms: 1000 },
      {
        getAppState: () => state,
        setAppState: setState,
      } as any,
      undefined as any,
      undefined as any,
    )

    expect(result.data.success).toBe(true)
  })
})
