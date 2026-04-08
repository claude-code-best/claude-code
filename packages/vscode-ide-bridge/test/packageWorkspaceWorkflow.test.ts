import { existsSync, readFileSync } from 'node:fs'
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

const packageRoot = join(import.meta.dir, '..')
const launchJsonPath = join(packageRoot, '.vscode', 'launch.json')
const tasksJsonPath = join(packageRoot, '.vscode', 'tasks.json')

describe('standalone package workspace workflow', () => {
  test('declares a package-local extension host launch config', () => {
    expect(existsSync(launchJsonPath)).toBe(true)

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
      '--extensionDevelopmentPath=${workspaceFolder}',
    )
  })

  test('declares a launch config that opens the claude-code workspace root', () => {
    const launchJson = JSON.parse(readFileSync(launchJsonPath, 'utf8')) as {
      configurations?: LaunchConfig[]
    }

    const config = launchJson.configurations?.find(
      item => item.name === 'Run VSCode IDE Bridge (Open Claude Code Root)',
    )

    expect(config).toBeDefined()
    expect(config?.type).toBe('extensionHost')
    expect(config?.request).toBe('launch')
    expect(config?.preLaunchTask).toBe('Build VSCode IDE Bridge')
    expect(config?.args).toContain('--new-window')
    expect(config?.args).toContain('--disable-extensions')
    expect(config?.args).toContain(
      '--extensionDevelopmentPath=${workspaceFolder}',
    )
    expect(config?.args).toContain('${workspaceFolder}/../..')
  })

  test('declares package-local build and test tasks', () => {
    expect(existsSync(tasksJsonPath)).toBe(true)

    const tasksJson = JSON.parse(readFileSync(tasksJsonPath, 'utf8')) as {
      tasks?: TaskConfig[]
    }

    const buildTask = tasksJson.tasks?.find(
      item => item.label === 'Build VSCode IDE Bridge',
    )
    const testTask = tasksJson.tasks?.find(
      item => item.label === 'Test VSCode IDE Bridge',
    )

    expect(buildTask).toBeDefined()
    expect(buildTask?.command).toBe('bunx')
    expect(buildTask?.args).toEqual(['tsc', '-p', 'tsconfig.json'])

    expect(testTask).toBeDefined()
    expect(testTask?.command).toBe('bun')
    expect(testTask?.args).toEqual(['test', 'test'])
  })
})
