import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import type { SearchResult } from '../skillSearch/localSearch.js'
import { createInstinct, type StoredInstinct } from './instinctParser.js'
import {
  getProjectStorageDir,
  resolveProjectContext,
} from './projectContext.js'
import { generateSkillDraft, writeLearnedSkill } from './skillGenerator.js'
import type {
  InstinctDomain,
  SkillGapStatus,
  SkillLearningProjectContext,
} from './types.js'

export type SkillGapRecommendation = Pick<
  SearchResult,
  'name' | 'description' | 'score'
>

export type SkillGapMaterialization =
  | {
      type: 'draft'
      name: string
      skillPath: string
    }
  | {
      type: 'active'
      name: string
      skillPath: string
    }

export type SkillGapRecord = {
  key: string
  prompt: string
  count: number
  draftHits: number
  // Session IDs that have already contributed a draft hit for this gap —
  // prevents one session from inflating `draftHits` beyond 1 and flipping the
  // `draftHits >= 2` active-promotion gate by itself.
  draftHitSessions: string[]
  status: SkillGapStatus
  sessionId: string
  cwd: string
  projectId: string
  projectName: string
  recommendations: SkillGapRecommendation[]
  createdAt: string
  updatedAt: string
  draft?: SkillGapMaterialization
  active?: SkillGapMaterialization
}

// P0-2 hook: when outcome-aware observation lands, augment this with a
// lookup into observationStore for a matching `outcome: 'success'` tool_complete
// observation keyed by (sessionId, gap.key). Until then, draft promotion uses
// count/signal only.
const DRAFT_PROMOTION_COUNT = 2
const ACTIVE_PROMOTION_COUNT = 4
const ACTIVE_PROMOTION_DRAFT_HITS = 2

type SkillGapState = {
  version: 1
  gaps: Record<string, SkillGapRecord>
}

export type RecordSkillGapOptions = {
  prompt: string
  cwd?: string
  sessionId?: string
  recommendations?: SearchResult[]
  project?: SkillLearningProjectContext
  rootDir?: string
}

export async function recordSkillGap(
  options: RecordSkillGapOptions,
): Promise<SkillGapRecord> {
  const prompt = options.prompt.trim()
  if (!prompt) {
    throw new Error('Cannot record an empty skill gap')
  }

  const project = options.project ?? resolveProjectContext(options.cwd)
  const state = await readSkillGapState(project, options.rootDir)
  const key = buildSkillGapKey(prompt)
  const now = new Date().toISOString()
  const existing = state.gaps[key]

  const gap: SkillGapRecord = {
    key,
    prompt,
    count: (existing?.count ?? 0) + 1,
    draftHits: existing?.draftHits ?? 0,
    draftHitSessions: existing?.draftHitSessions ?? [],
    status: existing?.status ?? 'pending',
    sessionId: options.sessionId ?? 'unknown-session',
    cwd: options.cwd ?? project.cwd,
    projectId: project.projectId,
    projectName: project.projectName,
    recommendations: (options.recommendations ?? []).slice(0, 5).map(r => ({
      name: r.name,
      description: r.description,
      score: r.score,
    })),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    draft: existing?.draft,
    active: existing?.active,
  }

  if (gap.status === 'rejected') {
    state.gaps[key] = gap
    await writeSkillGapState(project, state, options.rootDir)
    return gap
  }

  if (!gap.draft && shouldPromoteToDraft(gap)) {
    gap.draft = await writeSkillGapDraft(gap, project)
    gap.status = 'draft'
    await clearRuntimeSkillCaches()
  }

  if (gap.draft && !gap.active && shouldPromoteToActive(gap)) {
    gap.active = await writeActiveSkillForGap(gap, project)
    gap.status = 'active'
    await clearRuntimeSkillCaches()
  }

  state.gaps[key] = gap
  await writeSkillGapState(project, state, options.rootDir)
  return gap
}

export async function readSkillGaps(
  project = resolveProjectContext(),
  rootDir?: string,
): Promise<SkillGapRecord[]> {
  const state = await readSkillGapState(project, rootDir)
  return Object.values(state.gaps).sort((a, b) => a.key.localeCompare(b.key))
}

export async function findGapKeyByDraftPath(
  draftPath: string,
  project = resolveProjectContext(),
  rootDir?: string,
): Promise<string | undefined> {
  const state = await readSkillGapState(project, rootDir)
  for (const gap of Object.values(state.gaps)) {
    if (gap.draft?.skillPath === draftPath) return gap.key
  }
  return undefined
}

export async function recordDraftHit(
  key: string,
  project = resolveProjectContext(),
  rootDir?: string,
  sessionId = 'unknown-session',
): Promise<SkillGapRecord | undefined> {
  const state = await readSkillGapState(project, rootDir)
  const gap = state.gaps[key]
  if (!gap || !gap.draft || gap.active) return gap
  // One draft hit per session: a single actor reloading the same draft
  // repeatedly must not flip the draftHits>=2 gate.
  const existingSessions = gap.draftHitSessions ?? []
  if (existingSessions.includes(sessionId)) return gap
  const now = new Date().toISOString()
  const updated: SkillGapRecord = {
    ...gap,
    draftHits: gap.draftHits + 1,
    draftHitSessions: [...existingSessions, sessionId],
    updatedAt: now,
  }

  if (shouldPromoteToActive(updated)) {
    updated.active = await writeActiveSkillForGap(updated, project)
    updated.status = 'active'
    await clearRuntimeSkillCaches()
  }

  state.gaps[key] = updated
  await writeSkillGapState(project, state, rootDir)
  return updated
}

export async function promoteGapToDraft(
  key: string,
  project = resolveProjectContext(),
  rootDir?: string,
): Promise<SkillGapRecord | undefined> {
  const state = await readSkillGapState(project, rootDir)
  const gap = state.gaps[key]
  if (!gap) return undefined
  if (gap.status === 'rejected') return gap
  if (gap.draft) return gap
  const updated: SkillGapRecord = {
    ...gap,
    draft: await writeSkillGapDraft(gap, project),
    status: 'draft',
    updatedAt: new Date().toISOString(),
  }
  state.gaps[key] = updated
  await writeSkillGapState(project, state, rootDir)
  await clearRuntimeSkillCaches()
  return updated
}

export async function rejectSkillGap(
  key: string,
  project = resolveProjectContext(),
  rootDir?: string,
): Promise<SkillGapRecord | undefined> {
  const state = await readSkillGapState(project, rootDir)
  const gap = state.gaps[key]
  if (!gap) return undefined
  const updated: SkillGapRecord = {
    ...gap,
    status: 'rejected',
    updatedAt: new Date().toISOString(),
  }
  state.gaps[key] = updated
  await writeSkillGapState(project, state, rootDir)
  return updated
}

export function shouldPromoteToDraft(gap: SkillGapRecord): boolean {
  // Draft promotion now requires repeated occurrence. The legacy
  // `isStrongReusableSignal` path was the cause of single-utterance Chinese
  // exhortations being promoted straight to active — P0-2 will reintroduce
  // outcome-aware signal once the observation layer supplies it.
  return gap.count >= DRAFT_PROMOTION_COUNT
}

export function shouldPromoteToActive(gap: SkillGapRecord): boolean {
  if (!gap.draft) return false
  return (
    gap.count >= ACTIVE_PROMOTION_COUNT ||
    gap.draftHits >= ACTIVE_PROMOTION_DRAFT_HITS
  )
}

async function writeSkillGapDraft(
  gap: SkillGapRecord,
  project: SkillLearningProjectContext,
): Promise<SkillGapMaterialization> {
  const instinct = createGapInstinct(gap, 'pending')
  const draftsRoot = join(
    project.projectRoot ?? project.cwd,
    '.claude',
    'skills',
    '.drafts',
  )
  const draft = generateSkillDraft([instinct], {
    cwd: project.projectRoot ?? project.cwd,
    outputRoot: draftsRoot,
    scope: 'project',
    name: `draft-${buildNameFragment(gap.prompt)}`,
    description:
      'Draft learned skill candidate. Promote after repeated evidence or explicit user correction.',
  })
  const skillFile = join(draft.outputPath, 'SKILL.md')
  if (!existsSync(skillFile)) {
    await writeLearnedSkill({
      ...draft,
      content:
        draft.content +
        '\n## Promotion Rule\n\nDo not move this draft into active skills until the same gap repeats or the user explicitly confirms this should become reusable.\n',
    })
  }
  return { type: 'draft', name: draft.name, skillPath: skillFile }
}

async function writeActiveSkillForGap(
  gap: SkillGapRecord,
  project: SkillLearningProjectContext,
): Promise<SkillGapMaterialization> {
  const instinct = createGapInstinct(gap, 'active')
  const draft = generateSkillDraft([instinct], {
    cwd: project.projectRoot ?? project.cwd,
    scope: 'project',
    name: buildNameFragment(gap.prompt),
    description: buildGapAction(gap.prompt),
  })
  const skillFile = join(draft.outputPath, 'SKILL.md')
  if (!existsSync(skillFile)) {
    await writeLearnedSkill(draft)
  }
  return { type: 'active', name: draft.name, skillPath: skillFile }
}

function createGapInstinct(
  gap: SkillGapRecord,
  status: StoredInstinct['status'],
): StoredInstinct {
  return createInstinct({
    trigger: `When the user asks for ${summarize(gap.prompt, 120)}`,
    action: buildGapAction(gap.prompt),
    confidence: status === 'active' ? 0.82 : 0.55,
    domain: inferDomain(gap.prompt),
    source: 'session-observation',
    scope: 'project',
    projectId: gap.projectId,
    projectName: gap.projectName,
    evidence: [
      `Skill gap prompt: ${summarize(gap.prompt, 180)}`,
      `No high-confidence active skill was auto-loaded.`,
      `Observed ${gap.count} time(s).`,
    ],
    status,
  })
}

function buildGapAction(prompt: string): string {
  if (
    /feature\s*\(|feature flag|flag_name|stub|no-op|noop|最小实现/i.test(prompt)
  ) {
    return 'Audit feature flags by scanning feature() call sites, excluding generated/dependency noise, classifying each candidate as stub, shell, MVP, or thin-toggle, and writing an evidence-backed document.'
  }
  if (/skill|技能|学习|进化|evolve|learning/i.test(prompt)) {
    return 'Run skill discovery first; auto-load only high-confidence matching skills; record a skill gap when none match; promote repeated or corrected gaps into learned skills.'
  }
  if (/test|测试|stub|调用链|参数/i.test(prompt)) {
    return 'Infer tests from existing files, parameters, exports, and call chains before simplifying mocks or inventing behavior.'
  }
  return `Reuse the workflow learned from this prompt: ${summarize(prompt, 180)}.`
}

function inferDomain(prompt: string): InstinctDomain {
  const text = prompt.toLowerCase()
  if (/test|测试|stub|fixture|断言/.test(text)) return 'testing'
  if (/error|bug|fix|失败|错误|修复|debug/.test(text)) return 'debugging'
  if (/security|安全|漏洞|secret|token/.test(text)) return 'security'
  if (/git|commit|branch|pr\b/.test(text)) return 'git'
  if (/style|lint|format|命名|规范/.test(text)) return 'code-style'
  return 'workflow'
}

async function readSkillGapState(
  project: SkillLearningProjectContext,
  rootDir?: string,
): Promise<SkillGapState> {
  const path = getSkillGapStatePath(project, rootDir)
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (error) {
    // Only treat "file doesn't exist yet" as empty state. Every other error
    // (EACCES, EIO, disk full, etc.) must throw — swallowing them here would
    // let a subsequent write persist {} and zero out all gap records.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: 1, gaps: {} }
    }
    throw error
  }
  try {
    return migrateLegacyGapState(JSON.parse(raw) as SkillGapState)
  } catch {
    // Corrupt/truncated JSON — don't silently reset. Backup and start fresh,
    // so the crash isn't masked and the data can be recovered manually.
    const backup = `${path}.corrupt-${Date.now()}`
    try {
      await writeFile(backup, raw, 'utf8')
    } catch {
      /* best effort */
    }
    return { version: 1, gaps: {} }
  }
}

function migrateLegacyGapState(state: SkillGapState): SkillGapState {
  const migrated: Record<string, SkillGapRecord> = {}
  for (const [key, record] of Object.entries(state.gaps ?? {})) {
    const legacy = record as Partial<SkillGapRecord> & {
      status?: unknown
    }
    const draftHits =
      typeof legacy.draftHits === 'number' && Number.isFinite(legacy.draftHits)
        ? legacy.draftHits
        : 0
    const count = typeof legacy.count === 'number' ? legacy.count : 1
    const normalizedStatus = normalizeLegacyStatus(legacy.status)
    const hasDraftFile = Boolean(legacy.draft)
    const hasActiveFile = Boolean(legacy.active)

    let status: SkillGapStatus = normalizedStatus
    if (status === 'draft' && count < DRAFT_PROMOTION_COUNT && !hasDraftFile) {
      // Legacy first-call-writes-draft artifact with no file on disk yet.
      status = 'pending'
    }
    if (status === 'active' && !hasActiveFile) {
      status = hasDraftFile ? 'draft' : 'pending'
    }

    const draftHitSessions = Array.isArray(legacy.draftHitSessions)
      ? legacy.draftHitSessions.filter(
          (session): session is string => typeof session === 'string',
        )
      : []
    migrated[key] = {
      ...(record as SkillGapRecord),
      count,
      draftHits,
      draftHitSessions,
      status,
    }
  }
  return { version: 1, gaps: migrated }
}

function normalizeLegacyStatus(value: unknown): SkillGapStatus {
  if (
    value === 'pending' ||
    value === 'draft' ||
    value === 'active' ||
    value === 'rejected'
  ) {
    return value
  }
  return 'pending'
}

async function writeSkillGapState(
  project: SkillLearningProjectContext,
  state: SkillGapState,
  rootDir?: string,
): Promise<void> {
  const path = getSkillGapStatePath(project, rootDir)
  await mkdir(dirname(path), { recursive: true })
  // Atomic write: temp + rename. A direct writeFile leaves a truncated file
  // on crash mid-write; combined with the (now strict) readSkillGapState,
  // that would lose gap records.
  const tmpPath = `${path}.tmp-${process.pid}-${Date.now()}`
  await writeFile(tmpPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  await rename(tmpPath, path)
}

function getSkillGapStatePath(
  project: SkillLearningProjectContext,
  rootDir?: string,
): string {
  const base = rootDir
    ? project.projectId === 'global'
      ? join(rootDir, 'global')
      : join(rootDir, 'projects', project.projectId)
    : getProjectStorageDir(project.projectId)
  return join(base, 'skill-gaps.json')
}

function buildSkillGapKey(prompt: string): string {
  return `${buildNameFragment(prompt)}-${hash(prompt).slice(0, 8)}`
}

function buildNameFragment(prompt: string): string {
  const mapped = prompt
    .replaceAll('技能', ' skill ')
    .replaceAll('学习', ' learning ')
    .replaceAll('进化', ' evolution ')
    .replaceAll('测试', ' testing ')
    .replaceAll('最小实现', ' minimal implementation ')
    .toLowerCase()
  const stop = new Set([
    'the',
    'and',
    'for',
    'with',
    'this',
    'that',
    'user',
    'about',
    'feature',
    'flag',
    'name',
  ])
  const words = (mapped.match(/[a-z0-9][a-z0-9_-]{2,}/g) ?? [])
    .filter(word => !stop.has(word))
    .slice(0, 5)
  const value = words.join('-') || 'learned-gap'
  return value.slice(0, 54).replace(/-+$/g, '')
}

function summarize(value: string, max: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function hash(value: string): string {
  return createHash('sha1').update(value).digest('hex')
}

async function clearRuntimeSkillCaches(): Promise<void> {
  try {
    const { clearCommandsCache } = await import('../../commands.js')
    clearCommandsCache()
  } catch {
    // Best effort only; generated skill files are still available next process.
  }
}
