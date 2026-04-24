import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  findGapKeyByDraftPath,
  readSkillGaps,
  recordDraftHit,
  recordSkillGap,
  rejectSkillGap,
  shouldPromoteToActive,
  shouldPromoteToDraft,
  type SkillGapRecord,
} from '../skillGapStore.js'
import type { SkillLearningProjectContext } from '../types.js'

let root: string
let project: SkillLearningProjectContext

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'skill-gap-store-'))
  project = {
    projectId: 'global',
    projectName: 'global',
    scope: 'global',
    source: 'global',
    cwd: root,
    storageDir: join(root, 'global'),
    projectRoot: root,
  }
})

afterEach(() => {
  try {
    rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    })
  } catch {
    // Temp cleanup best-effort; Windows may hold transient handles.
  }
})

function draftsDir(): string {
  return join(root, '.claude', 'skills', '.drafts')
}

describe('recordSkillGap — P0-1 state machine', () => {
  test('first occurrence lands in pending and writes no skill file', async () => {
    const gap = await recordSkillGap({
      prompt: 'Refactor the data pipeline please',
      cwd: root,
      project,
      rootDir: root,
    })

    expect(gap.status).toBe('pending')
    expect(gap.count).toBe(1)
    expect(gap.draft).toBeUndefined()
    expect(gap.active).toBeUndefined()
    expect(existsSync(draftsDir())).toBe(false)
  })

  test('single Chinese exhortation stays pending — no draft, no active', async () => {
    const gap = await recordSkillGap({
      prompt: '以后必须严格检查类型',
      cwd: root,
      project,
      rootDir: root,
    })

    expect(gap.status).toBe('pending')
    expect(gap.draft).toBeUndefined()
    expect(gap.active).toBeUndefined()
  })

  test('second occurrence promotes to draft but not active', async () => {
    const prompt = 'explain the build pipeline'
    await recordSkillGap({ prompt, cwd: root, project, rootDir: root })
    const second = await recordSkillGap({
      prompt,
      cwd: root,
      project,
      rootDir: root,
    })

    expect(second.status).toBe('draft')
    expect(second.count).toBe(2)
    expect(second.draft?.type).toBe('draft')
    expect(second.active).toBeUndefined()
    expect(existsSync(second.draft!.skillPath)).toBe(true)
  })

  test('single strong English exhortation ("must never") stays pending', async () => {
    const gap = await recordSkillGap({
      prompt: 'You must never commit secrets to git',
      cwd: root,
      project,
      rootDir: root,
    })

    expect(gap.status).toBe('pending')
    expect(gap.count).toBe(1)
    expect(gap.draft).toBeUndefined()
    expect(gap.active).toBeUndefined()
  })

  test('reaching count >= 4 promotes an existing draft to active', async () => {
    const prompt = 'clean up abandoned feature flags'
    for (let i = 0; i < 3; i++) {
      await recordSkillGap({ prompt, cwd: root, project, rootDir: root })
    }
    const fourth = await recordSkillGap({
      prompt,
      cwd: root,
      project,
      rootDir: root,
    })

    expect(fourth.status).toBe('active')
    expect(fourth.count).toBe(4)
    expect(fourth.draft).toBeDefined()
    expect(fourth.active?.type).toBe('active')
    expect(existsSync(fourth.active!.skillPath)).toBe(true)
  })

  test('rejected gaps do not regenerate artefacts on subsequent calls', async () => {
    const prompt = 'please format the README differently'
    await recordSkillGap({ prompt, cwd: root, project, rootDir: root })
    const promoted = await recordSkillGap({
      prompt,
      cwd: root,
      project,
      rootDir: root,
    })
    expect(promoted.status).toBe('draft')

    await rejectSkillGap(promoted.key, project, root)
    const afterReject = await recordSkillGap({
      prompt,
      cwd: root,
      project,
      rootDir: root,
    })

    expect(afterReject.status).toBe('rejected')
    expect(afterReject.count).toBe(3)
    expect(afterReject.active).toBeUndefined()
  })
})

describe('recordDraftHit — draft hits escalation (P1-4 contract)', () => {
  test('draftHits reaching 2 escalates a draft to active', async () => {
    const prompt = 'improve error handling in loader.ts'
    await recordSkillGap({ prompt, cwd: root, project, rootDir: root })
    const drafted = await recordSkillGap({
      prompt,
      cwd: root,
      project,
      rootDir: root,
    })
    expect(drafted.status).toBe('draft')

    // Distinct session IDs — recordDraftHit enforces one hit per session so
    // a single session can't flip the draftHits>=2 active gate alone
    await recordDraftHit(drafted.key, project, root, 'session-a')
    const afterSecondHit = await recordDraftHit(
      drafted.key,
      project,
      root,
      'session-b',
    )

    expect(afterSecondHit?.draftHits).toBe(2)
    expect(afterSecondHit?.status).toBe('active')
    expect(afterSecondHit?.active?.type).toBe('active')
  })

  test('first draft hit does not promote to active', async () => {
    const prompt = 'add missing null checks in handler'
    await recordSkillGap({ prompt, cwd: root, project, rootDir: root })
    const drafted = await recordSkillGap({
      prompt,
      cwd: root,
      project,
      rootDir: root,
    })

    const afterOneHit = await recordDraftHit(drafted.key, project, root)

    expect(afterOneHit?.draftHits).toBe(1)
    expect(afterOneHit?.status).toBe('draft')
    expect(afterOneHit?.active).toBeUndefined()
  })

  test('findGapKeyByDraftPath resolves the correct gap for an existing draft', async () => {
    const prompt = 'restructure the module boundaries'
    await recordSkillGap({ prompt, cwd: root, project, rootDir: root })
    const drafted = await recordSkillGap({
      prompt,
      cwd: root,
      project,
      rootDir: root,
    })
    expect(drafted.draft?.skillPath).toBeTruthy()

    const foundKey = await findGapKeyByDraftPath(
      drafted.draft!.skillPath,
      project,
      root,
    )

    expect(foundKey).toBe(drafted.key)
  })

  test('findGapKeyByDraftPath returns undefined for unknown paths', async () => {
    const result = await findGapKeyByDraftPath(
      '/nowhere/.claude/skills/.drafts/mystery/SKILL.md',
      project,
      root,
    )
    expect(result).toBeUndefined()
  })

  test('recordDraftHit is a no-op on pending gaps', async () => {
    const gap = await recordSkillGap({
      prompt: 'investigate the mysterious cache bug',
      cwd: root,
      project,
      rootDir: root,
    })

    const updated = await recordDraftHit(gap.key, project, root)

    expect(updated?.status).toBe('pending')
    expect(updated?.draftHits).toBe(0)
  })
})

describe('shouldPromoteToDraft / shouldPromoteToActive', () => {
  test('shouldPromoteToDraft requires count >= 2 (strong signal no longer bypasses)', () => {
    const base: SkillGapRecord = {
      key: 'k',
      prompt: 'refactor this',
      count: 1,
      draftHits: 0,
      draftHitSessions: [],
      status: 'pending',
      sessionId: 's',
      cwd: root,
      projectId: 'global',
      projectName: 'global',
      recommendations: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    expect(shouldPromoteToDraft(base)).toBe(false)
    expect(shouldPromoteToDraft({ ...base, count: 2 })).toBe(true)
    // Single strong-signal prompt no longer promotes — must also repeat.
    expect(
      shouldPromoteToDraft({ ...base, prompt: '必须使用 testing-library' }),
    ).toBe(false)
  })

  test('shouldPromoteToActive requires a draft plus threshold', () => {
    const withDraft: SkillGapRecord = {
      key: 'k',
      prompt: 'refactor',
      count: 3,
      draftHits: 0,
      draftHitSessions: [],
      status: 'draft',
      sessionId: 's',
      cwd: root,
      projectId: 'global',
      projectName: 'global',
      recommendations: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      draft: { type: 'draft', name: 'x', skillPath: '/tmp/x' },
    }

    expect(shouldPromoteToActive(withDraft)).toBe(false)
    expect(shouldPromoteToActive({ ...withDraft, count: 4 })).toBe(true)
    expect(shouldPromoteToActive({ ...withDraft, draftHits: 2 })).toBe(true)
    expect(shouldPromoteToActive({ ...withDraft, draft: undefined })).toBe(
      false,
    )
  })
})

describe('migrateLegacyGapState', () => {
  test('resets legacy status=draft count=1 (no file) to pending', async () => {
    const gapPath = join(root, 'global', 'skill-gaps.json')
    mkdirSync(join(root, 'global'), { recursive: true })
    const legacy = {
      version: 1,
      gaps: {
        'legacy-key': {
          key: 'legacy-key',
          prompt: 'old gap',
          count: 1,
          status: 'draft',
          sessionId: 's1',
          cwd: root,
          projectId: 'global',
          projectName: 'global',
          recommendations: [],
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      },
    }
    writeFileSync(gapPath, JSON.stringify(legacy), 'utf8')

    const gaps = await readSkillGaps(project, root)
    const migrated = gaps[0]

    expect(migrated?.status).toBe('pending')
    expect(migrated?.draftHits).toBe(0)
  })

  test('downgrades active without skill file to draft if draft exists', async () => {
    const gapPath = join(root, 'global', 'skill-gaps.json')
    mkdirSync(join(root, 'global'), { recursive: true })
    const legacy = {
      version: 1,
      gaps: {
        'legacy-key': {
          key: 'legacy-key',
          prompt: 'old',
          count: 3,
          status: 'active',
          sessionId: 's1',
          cwd: root,
          projectId: 'global',
          projectName: 'global',
          recommendations: [],
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
          draft: { type: 'draft', name: 'x', skillPath: '/tmp/x' },
        },
      },
    }
    writeFileSync(gapPath, JSON.stringify(legacy), 'utf8')

    const gaps = await readSkillGaps(project, root)
    expect(gaps[0]?.status).toBe('draft')
  })
})
