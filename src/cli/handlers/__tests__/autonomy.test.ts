import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  resetStateForTests,
  setOriginalCwd,
  setProjectRoot,
} from '../../../bootstrap/state'
import { createAutonomyQueuedPrompt } from '../../../utils/autonomyRuns'
import {
  cancelAutonomyFlowText,
  getAutonomyDeepSectionText,
  getAutonomyFlowText,
  getAutonomyFlowsText,
  getAutonomyStatusText,
  resumeAutonomyFlowText,
} from '../autonomy'
import {
  listAutonomyFlows,
  startManagedAutonomyFlow,
} from '../../../utils/autonomyFlows'

let tempDir: string
let previousConfigDir: string | undefined

beforeEach(async () => {
  previousConfigDir = process.env.CLAUDE_CONFIG_DIR
  tempDir = join(
    tmpdir(),
    `autonomy-cli-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  )
  await mkdir(tempDir, { recursive: true })
  process.env.CLAUDE_CONFIG_DIR = join(tempDir, 'config')
  resetStateForTests()
  setOriginalCwd(tempDir)
  setProjectRoot(tempDir)
})

afterEach(async () => {
  resetStateForTests()
  if (previousConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = previousConfigDir
  }
  await rm(tempDir, { recursive: true, force: true })
})

describe('autonomy CLI handler', () => {
  test('prints the same basic status surfaces as the slash command', async () => {
    await createAutonomyQueuedPrompt({
      basePrompt: 'scheduled prompt',
      trigger: 'scheduled-task',
      rootDir: tempDir,
      currentDir: tempDir,
      sourceLabel: 'nightly',
    })

    const output = await getAutonomyStatusText({ rootDir: tempDir })

    expect(output).toContain('Autonomy runs: 1')
    expect(output).toContain('Queued: 1')
    expect(output).toContain('Autonomy flows: 0')
  })

  test('prints deep status for CLI status --deep', async () => {
    await mkdir(join(tempDir, '.claude'), { recursive: true })
    await writeFile(
      join(tempDir, '.claude', 'remote-trigger-audit.jsonl'),
      `${JSON.stringify({
        auditId: 'audit-1',
        createdAt: 1,
        action: 'list',
        ok: true,
        status: 200,
      })}\n`,
    )

    const output = await getAutonomyStatusText({ deep: true, rootDir: tempDir })

    expect(output).toContain('# Autonomy Deep Status')
    expect(output).toContain('## Workflow Runs')
    expect(output).toContain('## Pipes')
    expect(output).toContain('## Remote Control')
    expect(output).toContain('## RemoteTrigger')
  })

  test('prints individual deep status sections for panel actions', async () => {
    const pipes = await getAutonomyDeepSectionText('pipes', {
      rootDir: tempDir,
    })
    const remoteControl = await getAutonomyDeepSectionText('remote-control', {
      rootDir: tempDir,
    })

    expect(pipes).toContain('# Pipes')
    expect(pipes).toContain('Pipe registry:')
    expect(remoteControl).toContain('# Remote Control')
    expect(remoteControl).toContain('Remote Control:')
  })

  test('lists, inspects, cancels, and resumes flows from CLI handlers', async () => {
    await startManagedAutonomyFlow({
      trigger: 'proactive-tick',
      goal: 'ship managed flow',
      rootDir: tempDir,
      currentDir: tempDir,
      steps: [
        {
          name: 'wait',
          prompt: 'Wait for manual signal',
          waitFor: 'manual',
        },
        {
          name: 'run',
          prompt: 'Run the next step',
        },
      ],
    })
    const [waitingFlow] = await listAutonomyFlows(tempDir)

    expect(
      await getAutonomyFlowsText(undefined, { rootDir: tempDir }),
    ).toContain(waitingFlow!.flowId)
    expect(
      await getAutonomyFlowText(waitingFlow!.flowId, { rootDir: tempDir }),
    ).toContain('Current step: wait')

    const resumed = await resumeAutonomyFlowText(waitingFlow!.flowId, {
      rootDir: tempDir,
      currentDir: tempDir,
    })
    expect(resumed).toContain('Prepared the next managed step')
    expect(resumed).toContain('Prompt:')
    expect(resumed).toContain('Wait for manual signal')

    const cancelled = await cancelAutonomyFlowText(waitingFlow!.flowId, {
      rootDir: tempDir,
    })
    expect(cancelled).toContain('Cancelled flow')
  })
})
