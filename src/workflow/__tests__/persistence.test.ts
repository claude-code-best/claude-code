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

test('writeRunState → readRunState 往返一致（returnValue 为对象）', async () => {
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

test('readRunState 缺文件 → null', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-'))
  try {
    const got = await readRunState(dir, 'never-exists')
    expect(got).toBeNull()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('readRunState 损坏 JSON → null', async () => {
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

test('readRunState schemaVersion 不符 → null', async () => {
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

test('writeRunState 原子写：成功后无 tmp 残留', async () => {
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

test('listPersistedRuns 扫多子目录、跳过无 state.json 的目录、按 updatedAt 降序', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-'))
  try {
    // 三个有效 run + 一个只有 journal 没 state.json 的半残目录
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

test('listPersistedRuns 扫到损坏 state.json → 跳过该单个，继续扫其余', async () => {
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

test('writeRunState 不抛 returnValue 为 null/字符串/数组', async () => {
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

test('writeRunState 覆盖写：同 runId 二次写覆盖旧内容', async () => {
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

test('writeRunState 写入完整 AgentProgress（不含 output 内容，含 label/phase/token 等）', async () => {
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

test('getRunsDir 返回 <projectRoot>/.claude/workflow-runs 形态', () => {
  const dir = getRunsDir()
  // 不 hard-code projectRoot（跨机器不同），只校验后缀结构
  expect(dir.endsWith(`${join('.claude', 'workflow-runs')}`)).toBe(true)
})
