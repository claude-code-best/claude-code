import { expect, test } from 'bun:test'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile as fsWriteFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  cleanupOldRuns,
  getRunsDir,
  listPersistedRuns,
  readRunState,
  writeRunState,
} from '../persistence.js'
import type { RunProgress } from '../progress/store.js'

function makeRun(over: Partial<RunProgress> = {}): RunProgress {
  return {
    runId: 'r1',
    workflowName: 'w',
    status: 'completed',
    phases: [],
    declaredPhases: [],
    currentPhase: null,
    agents: [],
    agentCount: 0,
    startedAt: 1000,
    updatedAt: 2000,
    ...over,
  } as RunProgress
}

test('writeRunState → readRunState round-trip consistent (returnValue is object)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-'))
  try {
    const run = makeRun({
      returnValue: { confirmedCount: 2, items: ['a', 'b'] },
    })
    await writeRunState(dir, run)
    const got = await readRunState(dir, 'r1')
    expect(got).not.toBeNull()
    expect(got!.runId).toBe('r1')
    expect(got!.returnValue).toEqual({ confirmedCount: 2, items: ['a', 'b'] })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('readRunState missing file → null', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-'))
  try {
    const got = await readRunState(dir, 'never-exists')
    expect(got).toBeNull()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('readRunState corrupt JSON → null', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-'))
  try {
    await mkdir(join(dir, 'rX'), { recursive: true })
    await fsWriteFile(join(dir, 'rX', 'state.json'), '{not valid json', 'utf-8')
    const got = await readRunState(dir, 'rX')
    expect(got).toBeNull()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('readRunState schemaVersion mismatch → null', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-'))
  try {
    await mkdir(join(dir, 'rX'), { recursive: true })
    await fsWriteFile(
      join(dir, 'rX', 'state.json'),
      JSON.stringify({ schemaVersion: 999, run: makeRun({ runId: 'rX' }) }),
      'utf-8',
    )
    const got = await readRunState(dir, 'rX')
    expect(got).toBeNull()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('writeRunState atomic write: no tmp residue after success', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-'))
  try {
    await writeRunState(dir, makeRun({ runId: 'rAtom' }))
    const sub = await readdir(join(dir, 'rAtom'))
    expect(sub).toContain('state.json')
    expect(sub).not.toContain('state.json.tmp')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('listPersistedRuns scans multiple subdirs, skips dirs without state.json, sorts by updatedAt desc', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-'))
  try {
    // three valid runs + one half-broken dir with only journal, no state.json
    await writeRunState(dir, makeRun({ runId: 'old', updatedAt: 1000 }))
    await writeRunState(dir, makeRun({ runId: 'mid', updatedAt: 2000 }))
    await writeRunState(dir, makeRun({ runId: 'new', updatedAt: 3000 }))
    await mkdir(join(dir, 'half-broken'), { recursive: true })

    const runs = await listPersistedRuns(dir)
    expect(runs.map(r => r.runId)).toEqual(['new', 'mid', 'old'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('listPersistedRuns scans a corrupt state.json → skip that single one, continue scanning the rest', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-'))
  try {
    await writeRunState(dir, makeRun({ runId: 'good' }))
    await mkdir(join(dir, 'bad'), { recursive: true })
    await fsWriteFile(join(dir, 'bad', 'state.json'), 'corrupt', 'utf-8')

    const runs = await listPersistedRuns(dir)
    expect(runs.map(r => r.runId)).toEqual(['good'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('writeRunState does not throw when returnValue is null/string/array', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-'))
  try {
    await writeRunState(dir, makeRun({ runId: 'n', returnValue: null }))
    await writeRunState(dir, makeRun({ runId: 's', returnValue: 'text' }))
    await writeRunState(dir, makeRun({ runId: 'a', returnValue: [1, 2, 3] }))
    expect((await readRunState(dir, 'n'))!.returnValue).toBeNull()
    expect((await readRunState(dir, 's'))!.returnValue).toBe('text')
    expect((await readRunState(dir, 'a'))!.returnValue).toEqual([1, 2, 3])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('writeRunState overwrite: same runId second write overwrites old content', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-'))
  try {
    await writeRunState(dir, makeRun({ runId: 'rOV', status: 'running' }))
    await writeRunState(dir, makeRun({ runId: 'rOV', status: 'completed' }))
    const got = await readRunState(dir, 'rOV')
    expect(got!.status).toBe('completed')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('writeRunState writes full AgentProgress (no output content, includes label/phase/token etc.)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-'))
  try {
    const run = makeRun({
      runId: 'rAg',
      agents: [
        {
          id: 1,
          label: 'review:hooks',
          phase: 'Review',
          status: 'done',
          outputShape: 'object',
          tokenCount: 12345,
          toolCount: 3,
          model: 'claude-sonnet-4-6',
        },
      ],
      agentCount: 1,
    })
    await writeRunState(dir, run)
    const got = await readRunState(dir, 'rAg')
    expect(got!.agents).toHaveLength(1)
    expect(got!.agents[0]).toEqual({
      id: 1,
      label: 'review:hooks',
      phase: 'Review',
      status: 'done',
      outputShape: 'object',
      tokenCount: 12345,
      toolCount: 3,
      model: 'claude-sonnet-4-6',
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('getRunsDir returns <projectRoot>/.claude/workflow-runs shape', () => {
  const dir = getRunsDir()
  // do not hard-code projectRoot (differs across machines), only check suffix structure
  expect(dir.endsWith(`${join('.claude', 'workflow-runs')}`)).toBe(true)
})

test('listPersistedRuns limit N returns the N newest by updatedAt desc', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-'))
  try {
    await writeRunState(dir, makeRun({ runId: 'old', updatedAt: 1000 }))
    await writeRunState(dir, makeRun({ runId: 'mid', updatedAt: 2000 }))
    await writeRunState(dir, makeRun({ runId: 'new', updatedAt: 3000 }))

    expect((await listPersistedRuns(dir, 0)).map(r => r.runId)).toEqual([])
    expect((await listPersistedRuns(dir, 1)).map(r => r.runId)).toEqual(['new'])
    expect((await listPersistedRuns(dir, 2)).map(r => r.runId)).toEqual([
      'new',
      'mid',
    ])
    // limit larger than total → returns all (no padding)
    expect((await listPersistedRuns(dir, 99)).map(r => r.runId)).toEqual([
      'new',
      'mid',
      'old',
    ])
    // undefined → unchanged "load everything" semantics (back-compat)
    expect((await listPersistedRuns(dir)).map(r => r.runId)).toEqual([
      'new',
      'mid',
      'old',
    ])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('cleanupOldRuns keeps the newest keepMax runs and removes the rest', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-'))
  try {
    await writeRunState(dir, makeRun({ runId: 'old', updatedAt: 1000 }))
    await writeRunState(dir, makeRun({ runId: 'mid', updatedAt: 2000 }))
    await writeRunState(dir, makeRun({ runId: 'new', updatedAt: 3000 }))

    const removed = await cleanupOldRuns(dir, 1)
    expect(removed).toBe(2)
    const remaining = (await listPersistedRuns(dir)).map(r => r.runId)
    expect(remaining).toEqual(['new'])
    // pruned dirs are fully gone (state.json included)
    await expect(readRunState(dir, 'old')).resolves.toBeNull()
    await expect(readRunState(dir, 'mid')).resolves.toBeNull()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('cleanupOldRuns prunes orphan dirs (no state.json) first', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-'))
  try {
    await writeRunState(dir, makeRun({ runId: 'r1', updatedAt: 1000 }))
    await writeRunState(dir, makeRun({ runId: 'r2', updatedAt: 2000 }))
    // orphan: no state.json → treated as updatedAt=0, sorted last, pruned first
    await mkdir(join(dir, 'orphan'), { recursive: true })

    const removed = await cleanupOldRuns(dir, 2)
    expect(removed).toBe(1)
    const entries = await readdir(dir)
    expect(entries).not.toContain('orphan')
    expect(entries).toContain('r1')
    expect(entries).toContain('r2')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('cleanupOldRuns under keepMax is a no-op', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-'))
  try {
    await writeRunState(dir, makeRun({ runId: 'r1', updatedAt: 1000 }))
    await writeRunState(dir, makeRun({ runId: 'r2', updatedAt: 2000 }))

    const removed = await cleanupOldRuns(dir, 5)
    expect(removed).toBe(0)
    expect((await listPersistedRuns(dir)).map(r => r.runId)).toEqual([
      'r2',
      'r1',
    ])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('cleanupOldRuns on missing dir returns 0 (no throw)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-'))
  await rm(dir, { recursive: true, force: true })
  await expect(cleanupOldRuns(dir, 5)).resolves.toBe(0)
})

test('cleanupOldRuns negative keepMax is clamped to 0 (removes everything, no slice(-N) inversion)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-'))
  try {
    await writeRunState(dir, makeRun({ runId: 'r1', updatedAt: 1000 }))
    await writeRunState(dir, makeRun({ runId: 'r2', updatedAt: 2000 }))

    // Without the clamp, slice(-1) would keep 1 entry — violating "keep 0 means keep none".
    await expect(cleanupOldRuns(dir, -1)).resolves.toBe(2)
    expect(await listPersistedRuns(dir)).toEqual([])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
