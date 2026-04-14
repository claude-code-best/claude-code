import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import {
  AUTONOMY_AGENTS_PATH_POSIX,
  AUTONOMY_DIR,
  buildAutonomyTurnPrompt,
  loadAutonomyAuthority,
  resetAutonomyAuthorityForTests,
} from '../autonomyAuthority'
import {
  cleanupTempDir,
  createTempDir,
  createTempSubdir,
  writeTempFile,
} from '../../../tests/mocks/file-system'

const AGENTS_REL = join(AUTONOMY_DIR, 'AGENTS.md')
const HEARTBEAT_REL = join(AUTONOMY_DIR, 'HEARTBEAT.md')

let tempDir = ''

beforeEach(async () => {
  tempDir = await createTempDir('autonomy-authority-')
})

afterEach(async () => {
  resetAutonomyAuthorityForTests()
  if (tempDir) {
    await cleanupTempDir(tempDir)
  }
})

describe('autonomyAuthority', () => {
  test('loadAutonomyAuthority merges AGENTS.md files from root to current directory', async () => {
    const nestedDir = await createTempSubdir(tempDir, 'packages/app')
    await writeTempFile(tempDir, AGENTS_REL, 'root authority')
    await writeTempFile(nestedDir, AGENTS_REL, 'nested authority')
    await writeTempFile(
      tempDir,
      HEARTBEAT_REL,
      [
        '# Heartbeat',
        'tasks:',
        '  - name: inbox',
        '    interval: 30m',
        '    prompt: "Check inbox"',
      ].join('\n'),
    )

    const snapshot = await loadAutonomyAuthority({
      rootDir: tempDir,
      currentDir: nestedDir,
    })

    expect(snapshot.agentsFiles.map(file => file.relativePath)).toEqual([
      AUTONOMY_AGENTS_PATH_POSIX,
      `packages/app/${AUTONOMY_AGENTS_PATH_POSIX}`,
    ])
    expect(snapshot.agentsContent).toContain('root authority')
    expect(snapshot.agentsContent).toContain('nested authority')
    expect(snapshot.heartbeatContent).toContain('# Heartbeat')
    expect(snapshot.heartbeatTasks).toEqual([
      {
        name: 'inbox',
        interval: '30m',
        prompt: 'Check inbox',
        steps: [],
      },
    ])
  })

  test('loadAutonomyAuthority reads HEARTBEAT.md only from the workspace root', async () => {
    const nestedDir = await createTempSubdir(tempDir, 'child')
    await writeTempFile(
      tempDir,
      HEARTBEAT_REL,
      '# Root heartbeat\nRemember the root task',
    )
    await writeTempFile(
      nestedDir,
      HEARTBEAT_REL,
      '# Nested heartbeat\nThis should not be used',
    )

    const snapshot = await loadAutonomyAuthority({
      rootDir: tempDir,
      currentDir: nestedDir,
    })

    expect(snapshot.heartbeatFile?.path).toBe(join(tempDir, HEARTBEAT_REL))
    expect(snapshot.heartbeatContent).toContain('Root heartbeat')
    expect(snapshot.heartbeatContent).not.toContain('Nested heartbeat')
  })

  test('buildAutonomyTurnPrompt returns the original prompt when no authority files exist', async () => {
    const prompt = await buildAutonomyTurnPrompt({
      basePrompt: 'Run the scheduled task.',
      trigger: 'scheduled-task',
      rootDir: tempDir,
      currentDir: tempDir,
    })

    expect(prompt).toBe('Run the scheduled task.')
  })

  test('buildAutonomyTurnPrompt injects AGENTS.md and HEARTBEAT.md for automated turns', async () => {
    const nestedDir = await createTempSubdir(tempDir, 'nested')
    await writeTempFile(tempDir, AGENTS_REL, 'root rules')
    await writeTempFile(nestedDir, AGENTS_REL, 'nested rules')
    await writeTempFile(tempDir, HEARTBEAT_REL, 'Check heartbeat directives')

    const scheduledPrompt = await buildAutonomyTurnPrompt({
      basePrompt: 'Review the nightly report.',
      trigger: 'scheduled-task',
      rootDir: tempDir,
      currentDir: nestedDir,
    })
    const tickPrompt = await buildAutonomyTurnPrompt({
      basePrompt: '<tick>12:00:00</tick>',
      trigger: 'proactive-tick',
      rootDir: tempDir,
      currentDir: nestedDir,
    })

    expect(scheduledPrompt).toContain(
      'This prompt was generated automatically. Follow the workspace authority below before acting.',
    )
    expect(scheduledPrompt).toContain('<autonomy_authority>')
    expect(scheduledPrompt).toContain('root rules')
    expect(scheduledPrompt).toContain('nested rules')
    expect(scheduledPrompt).toContain('Check heartbeat directives')
    expect(scheduledPrompt).toContain('Review the nightly report.')

    expect(tickPrompt).toContain(
      'This is an autonomous proactive turn. Follow the workspace authority below before acting.',
    )
    expect(tickPrompt).toContain('<tick>12:00:00</tick>')
  })

  test('proactive prompts surface due HEARTBEAT.md tasks only when their interval elapses', async () => {
    await writeTempFile(
      tempDir,
      HEARTBEAT_REL,
      [
        'tasks:',
        '  - name: inbox',
        '    interval: 30m',
        '    prompt: "Check inbox"',
      ].join('\n'),
    )

    const first = await buildAutonomyTurnPrompt({
      basePrompt: '<tick>12:00:00</tick>',
      trigger: 'proactive-tick',
      rootDir: tempDir,
      currentDir: tempDir,
      nowMs: 0,
    })
    const second = await buildAutonomyTurnPrompt({
      basePrompt: '<tick>12:10:00</tick>',
      trigger: 'proactive-tick',
      rootDir: tempDir,
      currentDir: tempDir,
      nowMs: 10 * 60_000,
    })
    const third = await buildAutonomyTurnPrompt({
      basePrompt: '<tick>12:31:00</tick>',
      trigger: 'proactive-tick',
      rootDir: tempDir,
      currentDir: tempDir,
      nowMs: 31 * 60_000,
    })

    expect(first).toContain('Due HEARTBEAT.md tasks:')
    expect(first).toContain('- inbox (30m): Check inbox')
    expect(second).not.toContain('Due HEARTBEAT.md tasks:')
    expect(third).toContain('Due HEARTBEAT.md tasks:')
  })

  test('managed HEARTBEAT.md tasks parse nested steps and are not duplicated into the inline due-task section', async () => {
    await writeTempFile(
      tempDir,
      HEARTBEAT_REL,
      [
        'tasks:',
        '  - name: inbox',
        '    interval: 30m',
        '    prompt: "Check inbox"',
        '  - name: weekly-report',
        '    interval: 7d',
        '    prompt: "Ship the weekly report"',
        '    steps:',
        '      - name: gather',
        '        prompt: "Gather weekly inputs"',
        '      - name: draft',
        '        prompt: "Draft the weekly report"',
        '        wait_for: manual',
      ].join('\n'),
    )

    const snapshot = await loadAutonomyAuthority({
      rootDir: tempDir,
      currentDir: tempDir,
    })
    const prompt = await buildAutonomyTurnPrompt({
      basePrompt: '<tick>12:00:00</tick>',
      trigger: 'proactive-tick',
      rootDir: tempDir,
      currentDir: tempDir,
      nowMs: 0,
    })

    expect(snapshot.heartbeatTasks).toEqual([
      {
        name: 'inbox',
        interval: '30m',
        prompt: 'Check inbox',
        steps: [],
      },
      {
        name: 'weekly-report',
        interval: '7d',
        prompt: 'Ship the weekly report',
        steps: [
          {
            name: 'gather',
            prompt: 'Gather weekly inputs',
          },
          {
            name: 'draft',
            prompt: 'Draft the weekly report',
            waitFor: 'manual',
          },
        ],
      },
    ])
    expect(prompt).toContain('- inbox (30m): Check inbox')
    expect(prompt).not.toContain('- weekly-report (7d): Ship the weekly report')
    expect(prompt).not.toContain('- gather (')
  })
})
