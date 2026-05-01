import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Message } from 'src/types/message.js'
import { getErrnoCode } from 'src/utils/errors.js'
import {
  compactMailboxMessages,
  getLastPeerDmSummary,
  getInboxPath,
  markMessageAsReadByIndex,
  markMessageAsReadByIdentity,
  markMessagesAsRead,
  markMessagesAsReadByPredicate,
  MAX_MAILBOX_MESSAGE_TEXT_BYTES,
  MAX_MAILBOX_FILE_BYTES,
  MAX_MAILBOX_MESSAGES,
  MAX_READ_MAILBOX_MESSAGES,
  MAX_UNREAD_PROTOCOL_MAILBOX_MESSAGES,
  readMailbox,
  type TeammateMessage,
  writeToMailbox,
} from 'src/utils/teammateMailbox.js'

let tempHome = ''
let previousConfigDir: string | undefined

function message(
  text: string,
  read: boolean,
  timestamp = new Date(0).toISOString(),
): TeammateMessage {
  return {
    from: 'team-lead',
    text,
    timestamp,
    read,
  }
}

async function seedMailbox(
  agentName: string,
  teamName: string,
  messages: TeammateMessage[],
): Promise<void> {
  const inboxPath = getInboxPath(agentName, teamName)
  await mkdir(dirname(inboxPath), { recursive: true })
  await writeFile(inboxPath, JSON.stringify(messages, null, 2), 'utf-8')
}

async function readRawMailbox(
  agentName: string,
  teamName: string,
): Promise<TeammateMessage[]> {
  const content = await readFile(getInboxPath(agentName, teamName), 'utf-8')
  return JSON.parse(content) as TeammateMessage[]
}

describe('compactMailboxMessages', () => {
  test('prioritizes unread messages and keeps only recent read history', () => {
    const compacted = compactMailboxMessages(
      [
        message('read-1', true),
        message('read-2', true),
        message('unread-1', false),
        message('read-3', true),
        message('unread-2', false),
        message('read-4', true),
        message('read-5', true),
        message('unread-3', false),
      ],
      { maxMessages: 5, maxReadMessages: 2 },
    )

    expect(compacted.map(m => m.text)).toEqual([
      'unread-1',
      'unread-2',
      'read-4',
      'read-5',
      'unread-3',
    ])
  })

  test('retains unread protocol messages separately from regular cap', () => {
    const protocol = message(
      JSON.stringify({ type: 'permission_response', request_id: 'req-1' }),
      false,
    )
    const compacted = compactMailboxMessages(
      [
        protocol,
        ...Array.from({ length: 5 }, (_value, index) =>
          message(`regular-${index}`, false),
        ),
      ],
      {
        maxMessages: 2,
        maxReadMessages: 0,
        maxUnreadProtocolMessages: 1,
      },
    )

    expect(compacted.map(m => m.text)).toEqual([
      protocol.text,
      'regular-3',
      'regular-4',
    ])
  })

  test('does not prioritize malformed JSON-like unread messages as protocol', () => {
    const compacted = compactMailboxMessages(
      [
        message('{not-json', false),
        message('regular-1', false),
        message('regular-2', false),
      ],
      {
        maxMessages: 1,
        maxReadMessages: 0,
        maxUnreadProtocolMessages: 10,
      },
    )

    expect(compacted.map(m => m.text)).toEqual(['regular-2'])
  })

  test('caps unread protocol messages with an independent bound', () => {
    const compacted = compactMailboxMessages(
      Array.from(
        { length: MAX_UNREAD_PROTOCOL_MAILBOX_MESSAGES + 1 },
        (_value, index) =>
          message(
            JSON.stringify({
              type: 'permission_response',
              request_id: `req-${index}`,
            }),
            false,
          ),
      ),
    )

    expect(compacted).toHaveLength(MAX_UNREAD_PROTOCOL_MAILBOX_MESSAGES)
    expect(compacted[0]?.text).toContain('req-1')
  })

  test('keeps retained mailbox bytes under an explicit budget', () => {
    const compacted = compactMailboxMessages(
      Array.from({ length: 20 }, (_value, index) =>
        message(`msg-${index}-${'x'.repeat(200)}`, false),
      ),
      {
        maxMessages: 20,
        maxReadMessages: 0,
        maxRetainedBytes: 1_000,
      },
    )

    expect(
      Buffer.byteLength(JSON.stringify(compacted), 'utf8'),
    ).toBeLessThanOrEqual(1_000)
    expect(compacted.length).toBeLessThan(20)
    expect(compacted.at(-1)?.text).toContain('msg-19')
  })

  test('returns an empty mailbox when even one message exceeds retained budget', () => {
    const compacted = compactMailboxMessages([message('too-large', false)], {
      maxMessages: 10,
      maxReadMessages: 0,
      maxRetainedBytes: 1,
    })

    expect(compacted).toEqual([])
  })

  test('returns an empty mailbox when all retention lanes are disabled', () => {
    const compacted = compactMailboxMessages([message('unread', false)], {
      maxMessages: 0,
      maxReadMessages: 0,
      maxUnreadProtocolMessages: 0,
      maxRetainedBytes: 1_000,
    })

    expect(compacted).toEqual([])
  })
})

describe('teammate mailbox retention', () => {
  beforeEach(() => {
    previousConfigDir = process.env.CLAUDE_CONFIG_DIR
    tempHome = mkdtempSync(join(tmpdir(), 'teammate-mailbox-'))
    process.env.CLAUDE_CONFIG_DIR = tempHome
  })

  afterEach(async () => {
    if (previousConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = previousConfigDir
    }
    await rm(tempHome, { recursive: true, force: true })
    tempHome = ''
  })

  test('writeToMailbox compacts oversized unread inbox files', async () => {
    const existing = Array.from(
      { length: MAX_MAILBOX_MESSAGES + 20 },
      (_value, index) => message(`old-${index}`, false),
    )
    await seedMailbox('worker', 'alpha', existing)

    await writeToMailbox(
      'worker',
      {
        from: 'team-lead',
        text: 'newest',
        timestamp: new Date(1).toISOString(),
      },
      'alpha',
    )

    const after = await readMailbox('worker', 'alpha')
    expect(after).toHaveLength(MAX_MAILBOX_MESSAGES)
    expect(after[0]?.text).toBe('old-21')
    expect(after.at(-1)?.text).toBe('newest')
  })

  test('markMessagesAsRead compacts read history after consumption', async () => {
    const existing = Array.from(
      { length: MAX_MAILBOX_MESSAGES + 20 },
      (_value, index) => message(`msg-${index}`, false),
    )
    await seedMailbox('worker', 'alpha', existing)

    await markMessagesAsRead('worker', 'alpha')

    const after = await readRawMailbox('worker', 'alpha')
    expect(after).toHaveLength(MAX_READ_MAILBOX_MESSAGES)
    expect(after.every(m => m.read)).toBe(true)
    expect(after[0]?.text).toBe(
      `msg-${MAX_MAILBOX_MESSAGES + 20 - MAX_READ_MAILBOX_MESSAGES}`,
    )
  })

  test('markMessagesAsReadByPredicate leaves structured messages unread', async () => {
    await seedMailbox('worker', 'alpha', [
      message('plain', false),
      message(JSON.stringify({ type: 'permission_request' }), false),
    ])

    await markMessagesAsReadByPredicate(
      'worker',
      m => !m.text.includes('permission_request'),
      'alpha',
    )

    const after = await readRawMailbox('worker', 'alpha')
    expect(after.map(m => m.read)).toEqual([true, false])
  })

  test('markMessageAsReadByIdentity survives compaction shifting indexes', async () => {
    const permissionResponse = message(
      JSON.stringify({ type: 'permission_response', request_id: 'req-1' }),
      false,
    )
    await seedMailbox('worker', 'alpha', [
      permissionResponse,
      ...Array.from({ length: MAX_MAILBOX_MESSAGES + 20 }, (_value, index) =>
        message(`regular-${index}`, false),
      ),
    ])

    await writeToMailbox(
      'worker',
      {
        from: 'team-lead',
        text: 'newest',
        timestamp: new Date(2).toISOString(),
      },
      'alpha',
    )
    const marked = await markMessageAsReadByIdentity(
      'worker',
      'alpha',
      permissionResponse,
    )

    const after = await readRawMailbox('worker', 'alpha')
    expect(marked).toBe(true)
    expect(after.some(m => m.text === permissionResponse.text && !m.read)).toBe(
      false,
    )
  })

  test('markMessageAsReadByIndex also compacts through the compatibility path', async () => {
    const existing = Array.from(
      { length: MAX_MAILBOX_MESSAGES + 10 },
      (_value, index) => message(`msg-${index}`, false),
    )
    await seedMailbox('worker', 'alpha', existing)

    await markMessageAsReadByIndex('worker', 'alpha', existing.length - 1)

    const after = await readRawMailbox('worker', 'alpha')
    expect(after).toHaveLength(MAX_MAILBOX_MESSAGES)
    expect(after.some(m => m.text === `msg-${existing.length - 1}`)).toBe(false)
    expect(after.at(-1)?.text).toBe(`msg-${existing.length - 2}`)
  })

  test('writeToMailbox rejects oversized message text instead of storing it', async () => {
    await expect(
      writeToMailbox(
        'worker',
        {
          from: 'team-lead',
          text: 'x'.repeat(MAX_MAILBOX_MESSAGE_TEXT_BYTES + 1),
          timestamp: new Date(3).toISOString(),
        },
        'alpha',
      ),
    ).rejects.toThrow('Mailbox message text exceeds')

    expect(await readRawMailbox('worker', 'alpha')).toEqual([])
  })

  test('writeToMailbox fails closed when an existing mailbox is corrupt', async () => {
    const inboxPath = getInboxPath('worker', 'alpha')
    await mkdir(dirname(inboxPath), { recursive: true })
    await writeFile(inboxPath, '{not-json', 'utf-8')

    await expect(
      writeToMailbox(
        'worker',
        {
          from: 'team-lead',
          text: 'new',
          timestamp: new Date(4).toISOString(),
        },
        'alpha',
      ),
    ).rejects.toThrow()

    expect(await readFile(inboxPath, 'utf-8')).toBe('{not-json')
  })

  test('writeToMailbox rejects when the inbox path is already a directory', async () => {
    const inboxPath = getInboxPath('worker', 'alpha')
    await mkdir(inboxPath, { recursive: true })

    const error = await writeToMailbox(
      'worker',
      {
        from: 'team-lead',
        text: 'new',
        timestamp: new Date(5).toISOString(),
      },
      'alpha',
    ).then(
      () => undefined,
      err => err,
    )

    const code = getErrnoCode(error)
    expect(code).toBeDefined()
    if (code === undefined) {
      throw new Error('Expected filesystem errno code')
    }
    const expectedCodes =
      process.platform === 'win32' ? ['EISDIR', 'EPERM', 'EACCES'] : ['EISDIR']
    expect(expectedCodes).toContain(code)
    expect((await stat(inboxPath)).isDirectory()).toBe(true)
  })

  test('readMailbox fails closed on corrupt mailbox content', async () => {
    const inboxPath = getInboxPath('worker', 'alpha')
    await mkdir(dirname(inboxPath), { recursive: true })
    await writeFile(inboxPath, '{not-json', 'utf-8')

    await expect(readMailbox('worker', 'alpha')).rejects.toThrow()
  })

  test('readMailbox rejects non-array mailbox files', async () => {
    const inboxPath = getInboxPath('worker', 'alpha')
    await mkdir(dirname(inboxPath), { recursive: true })
    await writeFile(
      inboxPath,
      JSON.stringify({ text: 'not an array' }),
      'utf-8',
    )

    await expect(readMailbox('worker', 'alpha')).rejects.toThrow(
      'expected message array',
    )
  })

  test('readMailbox rejects malformed stored message shapes', async () => {
    const inboxPath = getInboxPath('worker', 'alpha')
    await mkdir(dirname(inboxPath), { recursive: true })
    await writeFile(
      inboxPath,
      JSON.stringify([{ from: 'lead', text: 'missing timestamp' }]),
      'utf-8',
    )

    await expect(readMailbox('worker', 'alpha')).rejects.toThrow(
      'Invalid mailbox message shape',
    )
  })

  test('readMailbox rejects non-object stored messages', async () => {
    const inboxPath = getInboxPath('worker', 'alpha')
    await mkdir(dirname(inboxPath), { recursive: true })
    await writeFile(inboxPath, JSON.stringify(['not an object']), 'utf-8')

    await expect(readMailbox('worker', 'alpha')).rejects.toThrow(
      'expected object',
    )
  })

  test('readMailbox rejects oversized mailbox files before parsing', async () => {
    const inboxPath = getInboxPath('worker', 'alpha')
    await mkdir(dirname(inboxPath), { recursive: true })
    await writeFile(
      inboxPath,
      `[${' '.repeat(MAX_MAILBOX_FILE_BYTES)}]`,
      'utf-8',
    )

    await expect(readMailbox('worker', 'alpha')).rejects.toThrow(
      'Mailbox file exceeds',
    )
  })

  test('markMessageAsReadByIdentity returns false for missing mailbox files', async () => {
    await expect(
      markMessageAsReadByIdentity('worker', 'alpha', message('absent', false)),
    ).resolves.toBe(false)
  })

  test('markMessageAsReadByIdentity returns false when the expected message moved out', async () => {
    await seedMailbox('worker', 'alpha', [message('other', false)])

    await expect(
      markMessageAsReadByIdentity('worker', 'alpha', message('missing', false)),
    ).resolves.toBe(false)

    expect((await readRawMailbox('worker', 'alpha'))[0]?.read).toBe(false)
  })

  test('markMessageAsReadByIdentity returns false on corrupt mailbox content', async () => {
    const inboxPath = getInboxPath('worker', 'alpha')
    await mkdir(dirname(inboxPath), { recursive: true })
    await writeFile(inboxPath, '{not-json', 'utf-8')

    await expect(
      markMessageAsReadByIdentity('worker', 'alpha', message('missing', false)),
    ).resolves.toBe(false)
  })
})

describe('getLastPeerDmSummary', () => {
  test('extracts the final peer direct-message summary from assistant tool use', () => {
    const messages = [
      { type: 'user', message: { content: 'wake up' } },
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'SendMessage',
              input: {
                to: 'worker-1',
                message: 'please check the UDS bounds',
                summary: 'Checking UDS bounds',
              },
            },
          ],
        },
      },
    ] as unknown as Message[]

    expect(getLastPeerDmSummary(messages)).toBe(
      '[to worker-1] Checking UDS bounds',
    )
  })

  test('stops peer direct-message summary search at the wake-up boundary', () => {
    const messages = [
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'SendMessage',
              input: {
                to: 'worker-1',
                message: 'old message',
              },
            },
          ],
        },
      },
      { type: 'user', message: { content: 'new prompt' } },
    ] as unknown as Message[]

    expect(getLastPeerDmSummary(messages)).toBeUndefined()
  })
})
