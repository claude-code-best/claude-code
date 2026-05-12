import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// multiStore.ts has no log/debug/bun:bundle side effects — no mocks needed.

let callLocalMemory: typeof import('../launchLocalMemory.js').callLocalMemory

describe('callLocalMemory', () => {
  let tmpDir: string
  const messages: string[] = []
  const onDone = (msg?: string) => {
    if (msg) messages.push(msg)
  }

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'lm-launch-test-'))
    process.env['CLAUDE_CONFIG_DIR'] = tmpDir
    messages.length = 0
    const mod = await import('../launchLocalMemory.js')
    callLocalMemory = mod.callLocalMemory
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    delete process.env['CLAUDE_CONFIG_DIR']
  })

  test('no args renders action panel without completing', async () => {
    const node = await callLocalMemory(
      onDone as Parameters<typeof callLocalMemory>[0],
      {} as Parameters<typeof callLocalMemory>[1],
      '',
    )

    expect(node).not.toBeNull()
    expect(messages).toHaveLength(0)
  })

  test('list sub-command with no stores', async () => {
    await callLocalMemory(
      onDone as Parameters<typeof callLocalMemory>[0],
      {} as Parameters<typeof callLocalMemory>[1],
      'list',
    )
    expect(
      messages.some(m => m.includes('No memory stores') || m.includes('0')),
    ).toBe(true)
  })

  test('create sub-command creates a store', async () => {
    await callLocalMemory(
      onDone as Parameters<typeof callLocalMemory>[0],
      {} as Parameters<typeof callLocalMemory>[1],
      'create test-store',
    )
    expect(messages.some(m => m.includes('test-store'))).toBe(true)
    messages.length = 0
    await callLocalMemory(
      onDone as Parameters<typeof callLocalMemory>[0],
      {} as Parameters<typeof callLocalMemory>[1],
      'list',
    )
    expect(messages.some(m => m.includes('1') || m.includes('store'))).toBe(
      true,
    )
  })

  test('store sub-command writes entry', async () => {
    await callLocalMemory(
      onDone as Parameters<typeof callLocalMemory>[0],
      {} as Parameters<typeof callLocalMemory>[1],
      'create notes',
    )
    messages.length = 0
    await callLocalMemory(
      onDone as Parameters<typeof callLocalMemory>[0],
      {} as Parameters<typeof callLocalMemory>[1],
      'store notes hello Hello World entry',
    )
    expect(messages.some(m => m.includes('hello') || m.includes('notes'))).toBe(
      true,
    )
  })

  test('fetch sub-command retrieves stored entry', async () => {
    await callLocalMemory(
      onDone as Parameters<typeof callLocalMemory>[0],
      {} as Parameters<typeof callLocalMemory>[1],
      'create fetch-store',
    )
    await callLocalMemory(
      onDone as Parameters<typeof callLocalMemory>[0],
      {} as Parameters<typeof callLocalMemory>[1],
      'store fetch-store mykey my entry value',
    )
    messages.length = 0
    await callLocalMemory(
      onDone as Parameters<typeof callLocalMemory>[0],
      {} as Parameters<typeof callLocalMemory>[1],
      'fetch fetch-store mykey',
    )
    expect(
      messages.some(m => m.includes('fetch-store') || m.includes('mykey')),
    ).toBe(true)
    expect(messages.join('\n')).toContain('my entry value')
  })

  test('fetch for nonexistent key → not-found', async () => {
    await callLocalMemory(
      onDone as Parameters<typeof callLocalMemory>[0],
      {} as Parameters<typeof callLocalMemory>[1],
      'create empty-s',
    )
    messages.length = 0
    await callLocalMemory(
      onDone as Parameters<typeof callLocalMemory>[0],
      {} as Parameters<typeof callLocalMemory>[1],
      'fetch empty-s nonexistent',
    )
    expect(
      messages.some(m => m.includes('not found') || m.includes('nonexistent')),
    ).toBe(true)
  })

  test('entries sub-command lists keys in store', async () => {
    await callLocalMemory(
      onDone as Parameters<typeof callLocalMemory>[0],
      {} as Parameters<typeof callLocalMemory>[1],
      'create ent-store',
    )
    await callLocalMemory(
      onDone as Parameters<typeof callLocalMemory>[0],
      {} as Parameters<typeof callLocalMemory>[1],
      'store ent-store alpha value-a',
    )
    await callLocalMemory(
      onDone as Parameters<typeof callLocalMemory>[0],
      {} as Parameters<typeof callLocalMemory>[1],
      'store ent-store beta value-b',
    )
    messages.length = 0
    await callLocalMemory(
      onDone as Parameters<typeof callLocalMemory>[0],
      {} as Parameters<typeof callLocalMemory>[1],
      'entries ent-store',
    )
    expect(messages.some(m => m.includes('2') || m.includes('ent-store'))).toBe(
      true,
    )
    const allMessages = messages.join('\n')
    expect(allMessages).toContain('alpha')
    expect(allMessages).toContain('beta')
  })

  test('archive sub-command archives a store', async () => {
    await callLocalMemory(
      onDone as Parameters<typeof callLocalMemory>[0],
      {} as Parameters<typeof callLocalMemory>[1],
      'create to-archive',
    )
    messages.length = 0
    await callLocalMemory(
      onDone as Parameters<typeof callLocalMemory>[0],
      {} as Parameters<typeof callLocalMemory>[1],
      'archive to-archive',
    )
    expect(
      messages.some(m => m.includes('to-archive') || m.includes('rchiv')),
    ).toBe(true)
  })

  test('invalid sub-command shows usage', async () => {
    await callLocalMemory(
      onDone as Parameters<typeof callLocalMemory>[0],
      {} as Parameters<typeof callLocalMemory>[1],
      'badcmd',
    )
    expect(
      messages.some(
        m => m.toLowerCase().includes('usage') || m.includes('badcmd'),
      ),
    ).toBe(true)
  })

  test('create duplicate store → error view', async () => {
    await callLocalMemory(
      onDone as Parameters<typeof callLocalMemory>[0],
      {} as Parameters<typeof callLocalMemory>[1],
      'create dup-store',
    )
    messages.length = 0
    await callLocalMemory(
      onDone as Parameters<typeof callLocalMemory>[0],
      {} as Parameters<typeof callLocalMemory>[1],
      'create dup-store',
    )
    expect(
      messages.some(
        m => m.toLowerCase().includes('failed') || m.includes('already exists'),
      ),
    ).toBe(true)
  })

  test('store in nonexistent store auto-creates directory', async () => {
    // No explicit create — setEntry should auto-create dir
    await callLocalMemory(
      onDone as Parameters<typeof callLocalMemory>[0],
      {} as Parameters<typeof callLocalMemory>[1],
      'store auto-create-store key1 value1',
    )
    expect(
      messages.some(m => m.includes('key1') || m.includes('auto-create-store')),
    ).toBe(true)
    messages.length = 0
    await callLocalMemory(
      onDone as Parameters<typeof callLocalMemory>[0],
      {} as Parameters<typeof callLocalMemory>[1],
      'fetch auto-create-store key1',
    )
    expect(
      messages.some(m => m.includes('auto-create-store') || m.includes('key1')),
    ).toBe(true)
    expect(messages.join('\n')).toContain('value1')
  })
})
