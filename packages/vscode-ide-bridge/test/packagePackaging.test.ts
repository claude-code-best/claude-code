import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

type PackageJson = {
  displayName?: string
  publisher?: string
  license?: string
  scripts?: Record<string, string>
}

type TaskConfig = {
  label?: string
  command?: string
  args?: string[]
}

const packageRoot = join(import.meta.dir, '..')
const packageJsonPath = join(packageRoot, 'package.json')
const tasksJsonPath = join(packageRoot, '.vscode', 'tasks.json')
const vscodeIgnorePath = join(packageRoot, '.vscodeignore')
const readmePath = join(packageRoot, 'README.md')

describe('vscode-ide-bridge packaging workflow', () => {
  test('declares the metadata and script needed to package a .vsix', () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as PackageJson

    expect(packageJson.displayName).toBe('Claude Code IDE Bridge')
    expect(packageJson.publisher).toBe('claude-code-best')
    expect(packageJson.license).toBeDefined()
    expect(packageJson.scripts?.bundle).toBe(
      'bun build ./src/extension.ts --outdir dist --target node --format esm --external vscode',
    )
    expect(packageJson.scripts?.package).toBe(
      'bun run bundle && bunx @vscode/vsce package --no-dependencies --out dist/vscode-ide-bridge.vsix',
    )
  })

  test('declares a package-local task for building a .vsix', () => {
    expect(existsSync(tasksJsonPath)).toBe(true)

    const tasksJson = JSON.parse(readFileSync(tasksJsonPath, 'utf8')) as {
      tasks?: TaskConfig[]
    }

    const packageTask = tasksJson.tasks?.find(
      item => item.label === 'Package VSCode IDE Bridge',
    )

    expect(packageTask).toBeDefined()
    expect(packageTask?.command).toBe('bun')
    expect(packageTask?.args).toEqual(['run', 'package'])
  })

  test('excludes development-only files from the packaged extension', () => {
    expect(existsSync(vscodeIgnorePath)).toBe(true)

    const contents = readFileSync(vscodeIgnorePath, 'utf8')

    expect(contents).toContain('src/**')
    expect(contents).toContain('test/**')
    expect(contents).toContain('tsconfig.json')
  })

  test('keeps the packaged README free of local absolute file links', () => {
    const contents = readFileSync(readmePath, 'utf8')

    expect(contents).not.toContain('](/')
    expect(contents).not.toContain(':/')
  })
})
