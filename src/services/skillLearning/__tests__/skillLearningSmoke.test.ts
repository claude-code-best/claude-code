import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { call } from '../../../commands/skill-learning/skill-learning.js'
import { clearCommandsCache } from '../../../commands.js'
import { getSkillIndex, searchSkills } from '../../skillSearch/localSearch.js'
import {
  resetSkillLearningConfig,
  setSkillLearningConfigForTest,
} from '../config.js'
import { loadInstincts, readObservations } from '../index.js'

let root: string
let previousCwd: string
const originalEnv = { ...process.env }

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'skill-learning-smoke-'))
  previousCwd = process.cwd()
  process.chdir(root)
  process.env = { ...originalEnv }
  process.env.CLAUDE_SKILL_LEARNING_HOME = join(root, 'learning-home')
  process.env.CLAUDE_CONFIG_DIR = join(root, 'config')
  process.env.SKILL_LEARNING_ENABLED = '1'
  process.env.ANTHROPIC_API_KEY = 'test-key'
  process.env.NODE_ENV = 'test'
  setSkillLearningConfigForTest({ minConfidence: 0.3, minClusterSize: 1 })
})

afterEach(() => {
  process.chdir(previousCwd)
  process.env = { ...originalEnv }
  resetSkillLearningConfig()
  clearCommandsCache()
  try {
    rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    })
  } catch {
    // Windows can keep a transient handle open after dynamic command loading.
    // Temp cleanup is best-effort; failing here would mask the smoke result.
  }
})

describe('skillLearning smoke', () => {
  test('ingests corrections, evolves a learned skill, and skill search finds it', async () => {
    const transcript = join(root, 'session.jsonl')
    writeFileSync(transcript, buildTranscript(), 'utf8')

    // Pass --min-session-length=0 so the 9-observation test transcript is not
    // skipped by the ECC-parity gate (default threshold: 10 observations).
    const ingestResult = await call(
      `ingest ${transcript} --min-session-length=0`,
      {} as any,
    )
    expect(ingestResult.type).toBe('text')
    if (ingestResult.type === 'text') {
      expect(ingestResult.value).toContain('Ingested 9 observations')
    }

    const options = {
      rootDir: process.env.CLAUDE_SKILL_LEARNING_HOME,
      project: {
        projectId: 'global',
        projectName: 'global',
        cwd: root,
        scope: 'global' as const,
        source: 'global' as const,
        storageDir: join(process.env.CLAUDE_SKILL_LEARNING_HOME!, 'global'),
      },
    }
    const observations = await readObservations(options)
    expect(observations).toHaveLength(9)

    const instincts = await loadInstincts(options)
    const testingInstinct = instincts.find(i => i.domain === 'testing')
    expect(testingInstinct?.confidence).toBe(0.8)
    expect(testingInstinct?.status).toBe('active')

    const evolveResult = await call('evolve --generate', {} as any)
    expect(evolveResult.type).toBe('text')
    if (evolveResult.type === 'text') {
      // Smoke transcript (9 obs, single fabricated instinct per domain) may
      // produce 1 or 2 candidates depending on sessionObserver's clustering.
      // Post-H15 we accept either — the smoke proves end-to-end wiring, not
      // exact cluster math.
      expect(evolveResult.value).toMatch(/Generated [12] learned skill\(s\)/)
    }

    const skillName = 'testing-choosing-between-mock-testing-library'
    const skillFile = join(root, '.claude', 'skills', skillName, 'SKILL.md')
    expect(existsSync(skillFile)).toBe(true)
    expect(readFileSync(skillFile, 'utf8')).toContain('Prefer testing-library')

    clearCommandsCache()
    const index = await getSkillIndex(root)
    expect(index.some(entry => entry.name === skillName)).toBe(true)

    const results = searchSkills(
      'write tests with testing library instead of mock',
      index,
      5,
    )
    expect(results[0]?.name).toBe(skillName)
  })
})

function buildTranscript(): string {
  const entries = [
    user('不要 mock，用 testing-library', 0),
    toolUse('Grep', { pattern: 'renderHook' }, 1),
    toolUse('Read', { file_path: 'src/example.test.tsx' }, 2),
    toolUse('Edit', { file_path: 'src/example.test.tsx' }, 3),
    user('不要 mock，用 testing-library', 4),
    toolUse('Grep', { pattern: 'mock' }, 5),
    toolUse('Read', { file_path: 'src/example.test.tsx' }, 6),
    toolUse('Edit', { file_path: 'src/example.test.tsx' }, 7),
    user('不要 mock，用 testing-library', 8),
  ]
  return `${entries.map(entry => JSON.stringify(entry)).join('\n')}\n`
}

function user(content: string, second: number) {
  return {
    type: 'user',
    sessionId: 'smoke-session',
    cwd: root,
    timestamp: `2026-04-16T00:00:0${second}.000Z`,
    message: { role: 'user', content },
  }
}

function toolUse(name: string, input: Record<string, unknown>, second: number) {
  return {
    type: 'assistant',
    sessionId: 'smoke-session',
    cwd: root,
    timestamp: `2026-04-16T00:00:0${second}.000Z`,
    message: {
      role: 'assistant',
      content: [{ type: 'tool_use', name, input }],
    },
  }
}
