import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'
import { getClaudeConfigHomeDir } from '../../../utils/envUtils.js'
import {
  getProjectContextPath,
  getProjectsRegistryPath,
  getSkillLearningRootDir,
  resolveProjectContext,
} from '../projectContext.js'
import { isSkillLearningEnabled } from '../featureCheck.js'

const tempBase = mkdtempSync(join(tmpdir(), 'skill-learning-context-test-'))
const originalEnv = { ...process.env }

beforeEach(() => {
  resetEnv()
  const tempHome = mkdtempSync(join(tempBase, 'home-'))
  process.env.CLAUDE_CONFIG_DIR = tempHome
})

afterAll(() => {
  process.env = { ...originalEnv }
  clearConfigDirCache()
  rmSync(tempBase, { recursive: true, force: true })
})

describe('isSkillLearningEnabled', () => {
  test('honors explicit SKILL_LEARNING_ENABLED overrides', () => {
    process.env.SKILL_LEARNING_ENABLED = '1'
    expect(isSkillLearningEnabled()).toBe(true)

    process.env.SKILL_LEARNING_ENABLED = '0'
    expect(isSkillLearningEnabled()).toBe(false)
  })

  test('honors FEATURE_SKILL_LEARNING env fallback', () => {
    delete process.env.SKILL_LEARNING_ENABLED
    process.env.FEATURE_SKILL_LEARNING = '1'
    expect(isSkillLearningEnabled()).toBe(true)

    process.env.FEATURE_SKILL_LEARNING = '0'
    expect(isSkillLearningEnabled()).toBe(false)
  })
})

describe('resolveProjectContext', () => {
  test('prefers CLAUDE_PROJECT_DIR and writes registry files', () => {
    const cwd = mkdirTempDir('cwd-')
    const projectDir = mkdirTempDir('project-')
    process.env.CLAUDE_PROJECT_DIR = projectDir

    const context = resolveProjectContext(cwd)

    expect(context.source).toBe('claude_project_dir')
    expect(context.scope).toBe('project')
    expect(context.projectRoot).toBe(realpathSync(projectDir))
    expect(context.projectName).toBe(lastPathSegment(projectDir))
    expect(context.storageDir).toContain(context.projectId)

    expect(existsSync(getProjectsRegistryPath())).toBe(true)
    expect(existsSync(getProjectContextPath(context.projectId))).toBe(true)

    const registry = readJson(getProjectsRegistryPath())
    expect(registry.projects[context.projectId].source).toBe(
      'claude_project_dir',
    )
  })

  test('uses git remote as stable identity across different checkouts', () => {
    const first = createGitRepo('remote-a-', 'https://example.com/acme/app.git')
    const second = createGitRepo(
      'remote-b-',
      'https://example.com/acme/app.git',
    )

    const firstContext = resolveProjectContext(first)
    const secondContext = resolveProjectContext(second)

    expect(firstContext.source).toBe('git_remote')
    expect(secondContext.source).toBe('git_remote')
    expect(firstContext.projectId).toBe(secondContext.projectId)
    expect(firstContext.gitRemote).toBe('https://example.com/acme/app')
    expect(firstContext.projectName).toBe('app')

    const registry = readJson(getProjectsRegistryPath())
    expect(Object.keys(registry.projects)).toContain(firstContext.projectId)
    expect(registry.projects[firstContext.projectId].gitRemote).toBe(
      'https://example.com/acme/app',
    )
  })

  test('falls back to git root when origin remote is missing', () => {
    const repo = createGitRepo('root-only-')

    const context = resolveProjectContext(join(repo, 'nested'))

    expect(context.source).toBe('git_root')
    expect(context.scope).toBe('project')
    expect(context.projectRoot).toBe(realpathSync(repo))
    expect(context.projectName).toBe(lastPathSegment(repo))
  })

  test('falls back to global context outside a git repository', () => {
    const cwd = mkdirTempDir('not-git-')

    const context = resolveProjectContext(cwd)

    expect(context.source).toBe('global')
    expect(context.scope).toBe('global')
    expect(context.projectId).toBe('global')
    expect(context.projectName).toBe('Global')
    expect(context.storageDir).toBe(join(getSkillLearningRootDir(), 'global'))
    expect(existsSync(getProjectContextPath('global'))).toBe(true)
  })
})

function createGitRepo(prefix: string, remote?: string): string {
  const dir = mkdirTempDir(prefix)
  mkdirSync(join(dir, 'nested'), { recursive: true })
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' })
  if (remote) {
    execFileSync('git', ['remote', 'add', 'origin', remote], {
      cwd: dir,
      stdio: 'ignore',
    })
  }
  return dir
}

function mkdirTempDir(prefix: string): string {
  return mkdtempSync(join(tempBase, prefix))
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function lastPathSegment(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}

function resetEnv(): void {
  process.env = { ...originalEnv }
  delete process.env.CLAUDE_PROJECT_DIR
  delete process.env.SKILL_LEARNING_ENABLED
  delete process.env.FEATURE_SKILL_LEARNING
  clearConfigDirCache()
}

function clearConfigDirCache(): void {
  if (
    typeof getClaudeConfigHomeDir === 'function' &&
    'cache' in getClaudeConfigHomeDir
  ) {
    ;(getClaudeConfigHomeDir as any).cache.clear?.()
  }
}
