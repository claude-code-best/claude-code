import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  resetSkillLearningConfig,
  setSkillLearningConfigForTest,
} from '../config.js'
import { loadInstincts, readObservations } from '../index.js'
import {
  resetRuntimeObserverForTest,
  runSkillLearningPostSampling,
} from '../runtimeObserver.js'

let root: string
let previousCwd: string
const originalEnv = { ...process.env }

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'skill-learning-runtime-'))
  previousCwd = process.cwd()
  process.chdir(root)
  process.env = { ...originalEnv }
  process.env.CLAUDE_SKILL_LEARNING_HOME = join(root, 'learning-home')
  process.env.CLAUDE_CONFIG_DIR = join(root, 'config')
  process.env.SKILL_LEARNING_ENABLED = '1'
  process.env.NODE_ENV = 'test'
  setSkillLearningConfigForTest({ minConfidence: 0.3, minClusterSize: 1 })
  resetRuntimeObserverForTest()
})

afterEach(() => {
  process.chdir(previousCwd)
  process.env = { ...originalEnv }
  resetSkillLearningConfig()
  rmSync(root, { recursive: true, force: true })
})

describe('runtimeObserver', () => {
  test('records and learns from post-sampling main-thread messages', async () => {
    await runSkillLearningPostSampling({
      querySource: 'repl_main_thread',
      messages: [
        {
          type: 'user',
          uuid: 'u1' as any,
          message: { role: 'user', content: '不要 mock，用 testing-library' },
        },
      ],
      systemPrompt: [] as any,
      userContext: {},
      systemContext: {},
      toolUseContext: { agentId: undefined } as any,
    })

    const observations = await readObservations({
      rootDir: process.env.CLAUDE_SKILL_LEARNING_HOME,
      project: {
        projectId: 'global',
        projectName: 'global',
        cwd: root,
        scope: 'global',
        source: 'global',
        storageDir: join(process.env.CLAUDE_SKILL_LEARNING_HOME!, 'global'),
      },
    })
    const instincts = await loadInstincts({
      rootDir: process.env.CLAUDE_SKILL_LEARNING_HOME,
      project: {
        projectId: 'global',
        projectName: 'global',
        cwd: root,
        scope: 'global',
        source: 'global',
        storageDir: join(process.env.CLAUDE_SKILL_LEARNING_HOME!, 'global'),
      },
    })

    expect(observations).toHaveLength(1)
    expect(instincts[0]?.action).toContain('testing-library')
  })

  test('skips subagent sessions', async () => {
    await runSkillLearningPostSampling({
      querySource: 'repl_main_thread',
      messages: [
        {
          type: 'user',
          uuid: 'u1' as any,
          message: { role: 'user', content: '不要 mock，用 testing-library' },
        },
      ],
      systemPrompt: [] as any,
      userContext: {},
      systemContext: {},
      toolUseContext: { agentId: 'agent-1' } as any,
    })

    const observations = await readObservations({
      rootDir: process.env.CLAUDE_SKILL_LEARNING_HOME,
    })
    expect(observations).toEqual([])
  })

  test('auto-evolves repeated corrections into an active learned skill', async () => {
    await runSkillLearningPostSampling({
      querySource: 'repl_main_thread',
      messages: [
        {
          type: 'user',
          uuid: 'u1' as any,
          message: { role: 'user', content: '不要 mock，用 testing-library' },
        },
        {
          type: 'user',
          uuid: 'u2' as any,
          message: { role: 'user', content: '不要 mock，用 testing-library' },
        },
        {
          type: 'user',
          uuid: 'u3' as any,
          message: { role: 'user', content: '不要 mock，用 testing-library' },
        },
      ],
      systemPrompt: [] as any,
      userContext: {},
      systemContext: {},
      toolUseContext: { agentId: undefined } as any,
    })

    expect(
      existsSync(
        join(
          root,
          '.claude',
          'skills',
          'testing-choosing-between-mock-testing-library',
          'SKILL.md',
        ),
      ),
    ).toBe(true)
  })
})
