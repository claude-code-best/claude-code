import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  generateOrMergeSkillDraft,
  writeLearnedSkill,
} from '../skillGenerator.js'
import { createInstinct } from '../instinctParser.js'

let root: string
let skillsRoot: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'skill-learning-dedup-'))
  skillsRoot = join(root, '.claude', 'skills')
  mkdirSync(skillsRoot, { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function testingInstinct(evidence: string) {
  return createInstinct({
    trigger: 'when writing tests',
    action: 'use testing-library',
    confidence: 0.85,
    domain: 'testing',
    source: 'session-observation',
    scope: 'project',
    evidence: [evidence],
    status: 'active',
  })
}

describe('skill dedup', () => {
  test('first instinct cluster creates a new skill', async () => {
    const outcome = await generateOrMergeSkillDraft(
      [testingInstinct('first')],
      { cwd: root },
      [skillsRoot],
    )
    expect(outcome.action).toBe('create')
    if (outcome.action === 'create') {
      await writeLearnedSkill(outcome.draft)
    }
  })

  test('second run with same trigger appends evidence instead of writing a duplicate', async () => {
    const first = await generateOrMergeSkillDraft(
      [testingInstinct('first')],
      { cwd: root },
      [skillsRoot],
    )
    expect(first.action).toBe('create')
    if (first.action === 'create') {
      await writeLearnedSkill(first.draft)
    }

    // Second pass — same cluster should collide with the skill we just wrote.
    const second = await generateOrMergeSkillDraft(
      [testingInstinct('second')],
      { cwd: root },
      [skillsRoot],
    )
    expect(second.action).toBe('append-evidence')
    if (second.action === 'append-evidence') {
      expect(second.overlap).toBeGreaterThanOrEqual(0.8)
      const body = readFileSync(second.appendedPath, 'utf8')
      expect(body).toContain('Learned evidence')
      expect(body).toContain('- second')
    }

    // There must still be only one SKILL.md file on disk.
    const files = findSkillMdFiles(skillsRoot)
    expect(files).toHaveLength(1)
  })
})

function findSkillMdFiles(dir: string): string[] {
  const { readdirSync, statSync } =
    require('node:fs') as typeof import('node:fs')
  const results: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      results.push(...findSkillMdFiles(full))
    } else if (entry === 'SKILL.md' && existsSync(full)) {
      results.push(full)
    }
  }
  return results
}
