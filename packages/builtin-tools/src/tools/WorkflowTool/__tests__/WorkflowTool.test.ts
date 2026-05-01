import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkflowTool } from '../WorkflowTool'

let cwd: string
let previousCwd: string

beforeEach(async () => {
  previousCwd = process.cwd()
  cwd = join(
    tmpdir(),
    `workflow-tool-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  )
  await mkdir(join(cwd, '.claude', 'workflows'), { recursive: true })
  process.chdir(cwd)
})

afterEach(async () => {
  process.chdir(previousCwd)
  await rm(cwd, { recursive: true, force: true })
})

describe('WorkflowTool', () => {
  test('starts a workflow run and persists step state', async () => {
    await writeFile(
      join(cwd, '.claude', 'workflows', 'release.md'),
      ['# Release', '', '- [ ] Run tests', '- [ ] Build package'].join('\n'),
    )

    const result = await WorkflowTool.call({ workflow: 'release' })

    expect(result.data.output).toContain('Workflow run started')
    expect(result.data.output).toContain('Run tests')
    const match = result.data.output.match(/run_id: ([a-f0-9-]+)/)
    expect(match?.[1]).toBeString()

    const raw = await readFile(
      join(cwd, '.claude', 'workflow-runs', `${match![1]}.json`),
      'utf-8',
    )
    const run = JSON.parse(raw)
    expect(run.workflow).toBe('release')
    expect(run.status).toBe('running')
    expect(run.steps).toHaveLength(2)
    expect(run.steps[0].status).toBe('running')
    expect(run.steps[1].status).toBe('pending')
  })

  test('advances a workflow run through completion', async () => {
    await writeFile(
      join(cwd, '.claude', 'workflows', 'audit.yaml'),
      [
        'steps:',
        '  - name: Inspect',
        '    prompt: Inspect the code',
        '  - name: Verify',
        '    prompt: Run focused tests',
      ].join('\n'),
    )

    const started = await WorkflowTool.call({ workflow: 'audit' })
    const runId = started.data.output.match(/run_id: ([a-f0-9-]+)/)![1]!

    const next = await WorkflowTool.call({
      workflow: 'audit',
      action: 'advance',
      run_id: runId,
    })
    expect(next.data.output).toContain('Next workflow step')
    expect(next.data.output).toContain('Run focused tests')

    const done = await WorkflowTool.call({
      workflow: 'audit',
      action: 'advance',
      run_id: runId,
    })
    expect(done.data.output).toContain('Workflow completed')
  })

  test('lists and cancels workflow runs', async () => {
    await writeFile(
      join(cwd, '.claude', 'workflows', 'cleanup.md'),
      '- Remove stale files',
    )

    const started = await WorkflowTool.call({ workflow: 'cleanup' })
    const runId = started.data.output.match(/run_id: ([a-f0-9-]+)/)![1]!

    const listed = await WorkflowTool.call({
      workflow: 'cleanup',
      action: 'list',
    })
    expect(listed.data.output).toContain(runId)

    const cancelled = await WorkflowTool.call({
      workflow: 'cleanup',
      action: 'cancel',
      run_id: runId,
    })
    expect(cancelled.data.output).toContain('Workflow cancelled')
  })
})
