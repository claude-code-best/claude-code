import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'

const { sessionImport } = await import('../sessionImport.js')

let tempDir: string
let sourceDir: string
let originalConfigDir: string | undefined

beforeEach(() => {
  tempDir = join(
    tmpdir(),
    `claude-import-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  // sessionImport writes to getProjectDir(originalCwd) =
  // ${CLAUDE_CONFIG_DIR}/projects/<sanitized-cwd>/ — pre-create projects/.
  mkdirSync(join(tempDir, 'projects'), { recursive: true })
  sourceDir = join(tempDir, 'src')
  mkdirSync(sourceDir, { recursive: true })
  // Pin session-file paths to the temp dir so tests never touch the real
  // ~/.claude/projects (same hermetic pattern as sessionStorage.test.ts).
  originalConfigDir = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = tempDir
})

afterEach(() => {
  if (originalConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = originalConfigDir
  }
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

const SRC_SESSION = '11111111-1111-4111-8111-111111111111'

function userEntry(
  uuid: string,
  parentUuid: string | null,
  timestamp: string,
  text: string,
  extra: Record<string, unknown> = {},
) {
  return {
    type: 'user',
    uuid,
    parentUuid,
    sessionId: SRC_SESSION,
    isSidechain: false,
    cwd: tempDir,
    timestamp,
    version: '1.0.0',
    message: { role: 'user', content: text },
    ...extra,
  }
}

function assistantEntry(
  uuid: string,
  parentUuid: string | null,
  timestamp: string,
  text: string,
) {
  return {
    type: 'assistant',
    uuid,
    parentUuid,
    sessionId: SRC_SESSION,
    isSidechain: false,
    cwd: tempDir,
    timestamp,
    version: '1.0.0',
    message: {
      role: 'assistant',
      content: [{ type: 'text', text }],
    },
  }
}

function writeSource(entries: object[]): string {
  const path = join(sourceDir, 'source.jsonl')
  writeFileSync(path, entries.map(e => JSON.stringify(e)).join('\n') + '\n')
  return path
}

describe('sessionImport', () => {
  test('imports the active chain as a new session, dropping dead branches and sidechains', async () => {
    const sourcePath = writeSource([
      userEntry('u1', null, '2026-08-13T10:00:00.000Z', 'first question'),
      assistantEntry('a1', 'u1', '2026-08-13T10:00:05.000Z', 'answer one'),
      // Dead branch: another child of a1, but the live continuation (u2)
      // was written later — newest leaf wins, d1 must be dropped.
      userEntry('d1', 'a1', '2026-08-13T10:00:30.000Z', 'dead branch'),
      userEntry('u2', 'a1', '2026-08-13T10:01:00.000Z', 'second question'),
      // Sidechain (subagent) messages never enter the imported main chain.
      userEntry('s1', null, '2026-08-13T10:00:20.000Z', 'sidechain prompt', {
        isSidechain: true,
        agentId: 'agent-1',
      }),
      {
        type: 'content-replacement',
        sessionId: SRC_SESSION,
        replacements: [
          { kind: 'tool-result', toolUseId: 'toolu_1', replacement: '<stub/>' },
        ],
      },
    ])

    const result = await sessionImport(sourcePath)

    expect(result.sessionId).not.toBe(SRC_SESSION)
    expect(result.importPath.startsWith(tempDir)).toBe(true)
    expect(existsSync(result.importPath)).toBe(true)

    const { readFileSync } = await import('node:fs')
    const lines = readFileSync(result.importPath, 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))
    expect(lines).toHaveLength(4) // 3 chain messages + 1 replacement entry

    const [first, second, third, replacement] = lines
    // Session id rewritten everywhere; original chain order/parents kept
    expect(first.uuid).toBe('u1')
    expect(first.parentUuid).toBeNull()
    expect(first.sessionId).toBe(result.sessionId)
    expect(first.importedFrom).toEqual({ path: resolve(sourcePath) })
    expect(second.uuid).toBe('a1')
    expect(second.parentUuid).toBe('u1')
    expect(second.sessionId).toBe(result.sessionId)
    expect(third.uuid).toBe('u2')
    expect(third.parentUuid).toBe('a1')
    expect(third.sessionId).toBe(result.sessionId)
    // Dead branch + sidechain excluded
    const uuids = lines.map(l => l.uuid)
    expect(uuids).not.toContain('d1')
    expect(uuids).not.toContain('s1')

    // Content-replacement copied with the new session id
    expect(replacement.type).toBe('content-replacement')
    expect(replacement.sessionId).toBe(result.sessionId)
    expect(replacement.replacements[0].toolUseId).toBe('toolu_1')
    expect(result.contentReplacementRecords).toHaveLength(1)

    // serializedMessages for the LogOption carry the new session id
    expect(result.serializedMessages.map(m => (m as any).uuid)).toEqual([
      'u1',
      'a1',
      'u2',
    ])
  })

  test('reserves import suffixes case-insensitively when deriving a unique title', async () => {
    const sourcePath = writeSource([
      userEntry('u1', null, '2026-08-13T10:00:00.000Z', 'first question'),
    ])

    // Establish the project dir sessionImport writes into (getProjectDir of
    // the original cwd) so the seeded titles below are discoverable.
    const { importPath } = await sessionImport(sourcePath)
    const projectDir = dirname(importPath)

    // Seed existing sessions whose titles collide case-insensitively with
    // candidates for base name "first question": the plain suffix exists,
    // and suffix 2 exists only in different casing.
    const seedTitle = (sessionId: string, title: string) => {
      writeFileSync(
        join(projectDir, `${sessionId}.jsonl`),
        `${JSON.stringify({ type: 'custom-title', customTitle: title, sessionId })}\n`,
      )
    }
    seedTitle(
      '22222222-2222-4222-8222-222222222222',
      'first question (Imported)',
    )
    seedTitle(
      '33333333-3333-4333-8333-333333333333',
      'FIRST QUESTION (Imported 2)',
    )

    const { getUniqueImportName } = await import('../sessionImport.js')

    // searchSessionsByCustomTitle matches titles case-insensitively, so
    // suffix 2 is already taken by the seed — the next free suffix is 3.
    expect(await getUniqueImportName('first question')).toBe(
      'first question (Imported 3)',
    )
  })

  test('rejects a missing file', async () => {
    await expect(sessionImport(join(sourceDir, 'nope.jsonl'))).rejects.toThrow(
      /File not found/,
    )
  })

  test('rejects an empty transcript', async () => {
    const sourcePath = join(sourceDir, 'empty.jsonl')
    writeFileSync(sourcePath, '')
    await expect(sessionImport(sourcePath)).rejects.toThrow(
      /No messages to import/,
    )
  })

  test('rejects a transcript with only sidechain messages', async () => {
    const sourcePath = writeSource([
      userEntry('s1', null, '2026-08-13T10:00:00.000Z', 'sidechain only', {
        isSidechain: true,
        agentId: 'agent-1',
      }),
    ])
    await expect(sessionImport(sourcePath)).rejects.toThrow(
      /No messages to import/,
    )
  })

  test('rewrites the compact summary transcript path to the import path', async () => {
    const oldPath = '/home/other-user/.claude/projects/old-project/aaaa.jsonl'
    const sourcePath = writeSource([
      userEntry('u1', null, '2026-08-13T10:00:00.000Z', 'first question'),
      assistantEntry('a1', 'u1', '2026-08-13T10:00:05.000Z', 'long answer'),
      {
        type: 'system',
        subtype: 'compact_boundary',
        uuid: 'b1',
        parentUuid: 'a1',
        sessionId: SRC_SESSION,
        isSidechain: false,
        cwd: tempDir,
        timestamp: '2026-08-13T10:10:00.000Z',
        version: '1.0.0',
        compactMetadata: {},
      },
      userEntry(
        'c1',
        'b1',
        '2026-08-13T10:10:05.000Z',
        `This session is being continued from a previous conversation that ran out of context.\n\nSummary:\nDid things.\n\nIf you need specific details from before compaction (like exact code snippets, error messages, or content you generated), read the full transcript at: ${oldPath}\n\nRecent messages are preserved verbatim.`,
        { isCompactSummary: true, isVisibleInTranscriptOnly: true },
      ),
    ])

    const result = await sessionImport(sourcePath)

    const { readFileSync } = await import('node:fs')
    const lines = readFileSync(result.importPath, 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))
    const summary = lines.find(l => l.uuid === 'c1')
    expect(summary.isCompactSummary).toBe(true)
    expect(summary.message.content).toContain(
      `read the full transcript at: ${result.importPath}`,
    )
    expect(summary.message.content).not.toContain(oldPath)
    // Suffix after the path line survives the rewrite
    expect(summary.message.content).toContain(
      'Recent messages are preserved verbatim.',
    )
    // Non-summary messages untouched
    expect(lines.find(l => l.uuid === 'u1').message.content).toBe(
      'first question',
    )
    // serializedMessages (LogOption/resume path) also carries the rewrite
    const serializedSummary = result.serializedMessages.find(
      m => (m as any).uuid === 'c1',
    ) as any
    expect(serializedSummary.message.content).toContain(
      `read the full transcript at: ${result.importPath}`,
    )
  })
})
