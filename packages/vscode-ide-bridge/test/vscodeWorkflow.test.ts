import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

type LaunchConfig = {
  name?: string
  type?: string
  request?: string
  preLaunchTask?: string
  args?: string[]
}

type TaskConfig = {
  label?: string
  command?: string
  args?: string[]
}

const workspaceRoot = join(import.meta.dir, '..', '..', '..')
const launchJsonPath = join(workspaceRoot, '.vscode', 'launch.json')
const tasksJsonPath = join(workspaceRoot, '.vscode', 'tasks.json')

describe('VSCode IDE bridge developer workflow', () => {
  test('declares a one-click extension host launch config', () => {
    const launchJson = JSON.parse(readFileSync(launchJsonPath, 'utf8')) as {
      configurations?: LaunchConfig[]
    }

    const config = launchJson.configurations?.find(
      item => item.name === 'Run VSCode IDE Bridge',
    )

    expect(config).toBeDefined()
    expect(config?.type).toBe('extensionHost')
    expect(config?.request).toBe('launch')
    expect(config?.preLaunchTask).toBe('Build VSCode IDE Bridge')
    expect(config?.args).toContain('--new-window')
    expect(config?.args).toContain('--disable-extensions')
    expect(config?.args).toContain(
      '--extensionDevelopmentPath=${workspaceFolder}/packages/vscode-ide-bridge',
    )
  })

  test('declares a build task for the bridge package', () => {
    const tasksJson = JSON.parse(readFileSync(tasksJsonPath, 'utf8')) as {
      tasks?: TaskConfig[]
    }

    const task = tasksJson.tasks?.find(
      item => item.label === 'Build VSCode IDE Bridge',
    )

    expect(task).toBeDefined()
    expect(task?.command).toBe('bunx')
    expect(task?.args).toEqual([
      'tsc',
      '-p',
      'packages/vscode-ide-bridge/tsconfig.json',
    ])
  })
})
