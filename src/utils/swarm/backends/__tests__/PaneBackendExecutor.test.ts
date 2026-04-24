import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPaneBackendExecutor } from '../PaneBackendExecutor'
import type { PaneBackend } from '../types'

let tempHome: string
let previousConfigDir: string | undefined

beforeEach(() => {
  previousConfigDir = process.env.CLAUDE_CONFIG_DIR
  tempHome = join(
    tmpdir(),
    `pane-backend-executor-${Date.now()}-${Math.random().toString(16).slice(2)}`,
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

describe('PaneBackendExecutor', () => {
  test('spawns process teammates with agent type and inherited auto permission mode', async () => {
    let sentCommand = ''
    const backend: PaneBackend = {
      type: 'tmux',
      displayName: 'tmux',
      supportsHideShow: true,
      async isAvailable() {
        return true
      },
      async isRunningInside() {
        return false
      },
      async createTeammatePaneInSwarmView() {
        return { paneId: '%1', isFirstTeammate: false }
      },
      async sendCommandToPane(_paneId, command) {
        sentCommand = command
      },
      async setPaneBorderColor() {},
      async setPaneTitle() {},
      async enablePaneBorderStatus() {},
      async rebalancePanes() {},
      async killPane() {
        return true
      },
      async hidePane() {
        return true
      },
      async showPane() {
        return true
      },
    }

    const executor = createPaneBackendExecutor(backend)
    executor.setContext({
      getAppState: () => ({
        toolPermissionContext: {
          mode: 'auto',
        },
      }),
    } as any)

    const result = await executor.spawn({
      name: 'reviewer',
      teamName: 'alpha',
      prompt: 'review the change',
      cwd: tempHome,
      parentSessionId: 'parent-session',
      agentType: 'code-reviewer',
      planModeRequired: false,
    })

    expect(result.success).toBe(true)
    expect(result.backendType).toBe('tmux')
    expect(result.paneId).toBe('%1')
    expect(sentCommand).toContain('--agent-type code-reviewer')
    expect(sentCommand).toContain('--permission-mode auto')
  })

  test('preserves legacy separate-window spawning when useSplitPane is false', async () => {
    let paneSpawned = false
    let windowSpawned = false
    const backend: PaneBackend = {
      type: 'tmux',
      displayName: 'tmux',
      supportsHideShow: true,
      async isAvailable() {
        return true
      },
      async isRunningInside() {
        return false
      },
      async createTeammatePaneInSwarmView() {
        paneSpawned = true
        return { paneId: '%pane', isFirstTeammate: false }
      },
      async createTeammateWindowInSwarmView() {
        windowSpawned = true
        return {
          paneId: '%window',
          windowName: 'teammate-worker',
          isFirstTeammate: false,
        }
      },
      async sendCommandToPane() {},
      async setPaneBorderColor() {},
      async setPaneTitle() {},
      async enablePaneBorderStatus() {},
      async rebalancePanes() {},
      async killPane() {
        return true
      },
      async hidePane() {
        return true
      },
      async showPane() {
        return true
      },
    }

    const executor = createPaneBackendExecutor(backend)
    executor.setContext({
      getAppState: () => ({
        toolPermissionContext: {
          mode: 'default',
        },
      }),
    } as any)

    const result = await executor.spawn({
      name: 'worker',
      teamName: 'alpha',
      prompt: 'do work',
      cwd: tempHome,
      parentSessionId: 'parent-session',
      useSplitPane: false,
    })

    expect(result.success).toBe(true)
    expect(paneSpawned).toBe(false)
    expect(windowSpawned).toBe(true)
    expect(result.paneId).toBe('%window')
    expect(result.windowName).toBe('teammate-worker')
    expect(result.isSplitPane).toBe(false)
  })
})
