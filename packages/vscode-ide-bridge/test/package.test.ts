import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

const packageRoot = join(import.meta.dir, '..')
const packageJsonPath = join(packageRoot, 'package.json')

describe('vscode-ide-bridge package', () => {
  test('declares a VSCode extension entry', () => {
    expect(existsSync(packageJsonPath)).toBe(true)

    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      main?: string
      engines?: { vscode?: string }
      activationEvents?: string[]
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }

    expect(packageJson.main).toBe('./dist/extension.js')
    expect(packageJson.engines?.vscode).toBeDefined()
    expect(packageJson.activationEvents).toContain('onStartupFinished')
    expect(packageJson.dependencies).toMatchObject({
      '@modelcontextprotocol/sdk': expect.any(String),
      ws: expect.any(String),
    })
    expect(packageJson.devDependencies).toMatchObject({
      '@types/bun': expect.any(String),
      typescript: expect.any(String),
    })
  })
})
