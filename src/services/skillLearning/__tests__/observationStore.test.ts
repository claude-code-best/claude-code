import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  appendObservation,
  ingestTranscript,
  readObservations,
  scrubText,
} from '../observationStore.js'

let rootDir: string

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'skill-learning-observation-'))
})

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
})

describe('observationStore', () => {
  test('scrubs secrets and truncates large fields', () => {
    const scrubbed = scrubText('api_key: sk-ant-1234567890abcdef extra', 80)
    expect(scrubbed).toContain('[REDACTED]')

    const truncated = scrubText(
      `api_key: sk-ant-1234567890abcdef ${'x'.repeat(120)}`,
      40,
    )
    expect(truncated).toContain('[REDACTED]')
    expect(truncated).toContain('[TRUNCATED')
  })

  test('appends and reads project observations', async () => {
    await appendObservation(
      {
        id: 'obs-1',
        timestamp: '2026-04-16T00:00:00.000Z',
        event: 'user_message',
        sessionId: 's1',
        projectId: 'p1',
        projectName: 'project',
        cwd: rootDir,
        messageText: '不要 mock，用 testing-library',
      },
      {
        rootDir,
        project: projectContext(),
      },
    )

    const observations = await readObservations({
      rootDir,
      project: projectContext(),
    })
    expect(observations).toHaveLength(1)
    expect(observations[0]?.messageText).toContain('testing-library')
  })

  test('ingests Claude transcript JSONL into observations', async () => {
    const transcript = join(rootDir, 'session.jsonl')
    writeFileSync(
      transcript,
      [
        JSON.stringify({
          type: 'user',
          sessionId: 's1',
          cwd: rootDir,
          timestamp: '2026-04-16T00:00:00.000Z',
          message: { role: 'user', content: '不要 mock，用 testing-library' },
        }),
        JSON.stringify({
          type: 'assistant',
          sessionId: 's1',
          cwd: rootDir,
          timestamp: '2026-04-16T00:00:01.000Z',
          message: {
            role: 'assistant',
            content: [
              { type: 'tool_use', name: 'Grep', input: { pattern: 'x' } },
            ],
          },
        }),
      ].join('\n'),
    )

    const observations = await ingestTranscript(transcript, {
      rootDir,
      project: projectContext(),
    })

    expect(observations.length).toBeGreaterThanOrEqual(2)
    expect(observations.map(o => o.event)).toContain('user_message')
    expect(observations.map(o => o.event)).toContain('tool_start')
  })
})

function projectContext() {
  return {
    projectId: 'p1',
    projectName: 'project',
    cwd: rootDir,
    scope: 'project' as const,
    source: 'global' as const,
    storageDir: join(rootDir, 'projects', 'p1'),
  }
}
