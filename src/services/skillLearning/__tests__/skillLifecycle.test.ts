import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LearnedSkillDraft } from '../types.js'
import {
  applySkillLifecycleDecision,
  compareExistingSkills,
  decideSkillLifecycle,
  loadExistingSkills,
} from '../skillLifecycle.js'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'skill-learning-lifecycle-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('skillLifecycle', () => {
  test('detects overlapping existing skills', async () => {
    await writeSkill('react-testing', 'Use testing-library for React tests')
    const draft = draftSkill(
      'react-testing-updated',
      'Use testing-library for React tests and avoid implementation mocks',
    )

    const matches = await compareExistingSkills(draft, [root])

    expect(matches[0]?.name).toBe('react-testing')
  })

  test('replace archives old skill so it leaves active index', async () => {
    await writeSkill(
      'react-testing',
      'Use testing-library for React tests and avoid implementation mocks',
    )
    const draft = draftSkill(
      'react-testing-updated',
      'Use testing-library for React tests and avoid implementation mocks',
    )
    const matches = await compareExistingSkills(draft, [root])
    const decision = decideSkillLifecycle(draft, matches)

    expect(decision.type).toBe('replace')
    const result = await applySkillLifecycleDecision(decision)

    expect(result.activePath).toBeDefined()
    expect(result.archivedPath).toBeDefined()
    expect(existsSync(join(root, 'react-testing'))).toBe(false)
    expect(
      existsSync(join(result.archivedPath!, 'replacement-manifest.json')),
    ).toBe(true)
    expect(
      (await loadExistingSkills([root])).map(skill => skill.name),
    ).not.toContain('react-testing')
  })

  test('create writes new skill when no overlap exists', async () => {
    const draft = draftSkill('new-testing', 'A unique learned testing workflow')
    const decision = decideSkillLifecycle(draft, [])
    const result = await applySkillLifecycleDecision(decision)

    expect(result.activePath).toBeDefined()
    expect(readFileSync(result.activePath!, 'utf8')).toContain('new-testing')
  })

  test('merge skips user-authored skill without origin field and logs warning', async () => {
    const body =
      'Use testing-library for React tests and avoid implementation mocks'
    await writeSkill('react-testing', body, null)
    // Build a draft that overlaps with the existing skill at the merge threshold
    const draft: LearnedSkillDraft = {
      name: 'react-testing',
      description: body,
      scope: 'project',
      sourceInstinctIds: ['i1'],
      confidence: 0.6,
      content: `---\nname: react-testing\ndescription: ${JSON.stringify(body)}\n---\n\n# React Testing\n\n${body}\n`,
      outputPath: join(root, 'react-testing-patch'),
    }
    const matches = await compareExistingSkills(draft, [root])
    // Force a merge decision by lowering confidence below the replace threshold
    const decision = decideSkillLifecycle(draft, matches)
    expect(decision.type).toBe('merge')

    const stderrChunks: string[] = []
    const originalWrite = process.stderr.write.bind(process.stderr)
    process.stderr.write = (chunk: unknown) => {
      stderrChunks.push(String(chunk))
      return true
    }
    try {
      const result = await applySkillLifecycleDecision(decision)
      expect(result.activePath).toBeUndefined()
      expect(
        stderrChunks.some(line =>
          line.includes('[skill-learning] skip user-authored skill'),
        ),
      ).toBe(true)
    } finally {
      process.stderr.write = originalWrite
    }
  })

  test('replace proceeds normally for skill-learning-generated skill', async () => {
    await writeSkill(
      'generated-testing',
      'Use testing-library for React tests and avoid implementation mocks',
      'skill-learning',
    )
    const draft = draftSkill(
      'generated-testing-updated',
      'Use testing-library for React tests and avoid implementation mocks',
    )
    const matches = await compareExistingSkills(draft, [root])
    const decision = decideSkillLifecycle(draft, matches)

    expect(decision.type).toBe('replace')
    const result = await applySkillLifecycleDecision(decision)

    expect(result.activePath).toBeDefined()
    expect(result.archivedPath).toBeDefined()
  })
})

async function writeSkill(
  name: string,
  body: string,
  origin: string | null = 'skill-learning',
): Promise<void> {
  const dir = join(root, name)
  await mkdir(dir, { recursive: true })
  const originLine = origin !== null ? `origin: ${origin}\n` : ''
  writeFileSync(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${JSON.stringify(body)}\n${originLine}---\n\n# ${name}\n\n${body}\n`,
  )
}

function draftSkill(name: string, text: string): LearnedSkillDraft {
  return {
    name,
    description: text,
    scope: 'project',
    sourceInstinctIds: ['i1'],
    confidence: 0.9,
    content: `---\nname: ${name}\ndescription: ${JSON.stringify(text)}\n---\n\n# ${name}\n\n${text}\n`,
    outputPath: join(root, name),
  }
}
