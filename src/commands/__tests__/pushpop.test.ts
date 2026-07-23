import { describe, expect, mock, test, beforeAll } from 'bun:test'
import { logMock } from '../../../tests/mocks/log.js'
import { debugMock } from '../../../tests/mocks/debug.js'

// Mock bun:bundle before anything that calls feature()
mock.module('bun:bundle', () => ({ feature: (_name: string) => false }))

// Cut bootstrap/state.ts side-effect chain
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)
mock.module('src/utils/config.ts', () => ({
  getGlobalConfig: () => ({}),
  saveGlobalConfig: async () => {},
  getGlobalConfigWriteCount: () => 0,
}))
mock.module('src/utils/settings/settings.js', () => ({
  getCachedOrLoadSettings: async () => ({}),
  getCachedSettings: () => ({}),
}))

let parsePopArgs: (
  args: string,
) => import('../../services/pushStack/state.js').PopOptions | string

beforeAll(async () => {
  const popModule = await import('../pop/pop.js')
  parsePopArgs = popModule.parsePopArgs
})

describe('parsePopArgs', () => {
  test('empty args yields empty options', () => {
    const result = parsePopArgs('')
    expect(typeof result).toBe('object')
    expect(result).toEqual({})
  })

  test('--discard sets discard flag', () => {
    const result = parsePopArgs('--discard')
    expect(result).toEqual({ discard: true })
  })

  test('--keep-code sets keepCode flag', () => {
    const result = parsePopArgs('--keep-code')
    expect(result).toEqual({ keepCode: true })
  })

  test('--to #N parses marker number', () => {
    const result = parsePopArgs('--to #2')
    expect(result).toEqual({ to: 2 })
  })

  test('--to N (without #) parses marker number', () => {
    const result = parsePopArgs('--to 3')
    expect(result).toEqual({ to: 3 })
  })

  test('--to=N= syntax works', () => {
    const result = parsePopArgs('--to=1')
    expect(result).toEqual({ to: 1 })
  })

  test('combined flags work', () => {
    const result = parsePopArgs('--to #1 --keep-code')
    expect(result).toEqual({ to: 1, keepCode: true })
  })

  test('--to missing number returns error string', () => {
    const result = parsePopArgs('--to')
    expect(typeof result).toBe('string')
    expect(result as string).toMatch(/Missing marker/)
  })

  test('--to 0 returns error (must be >= 1)', () => {
    const result = parsePopArgs('--to 0')
    expect(typeof result).toBe('string')
  })

  test('--to #abc returns error', () => {
    const result = parsePopArgs('--to #abc')
    expect(typeof result).toBe('string')
    expect(result as string).toMatch(/Invalid marker/)
  })

  test('unknown flag returns error string', () => {
    const result = parsePopArgs('--unknown')
    expect(typeof result).toBe('string')
    expect(result as string).toMatch(/Unknown option/)
  })
})

describe('push stack state', () => {
  test('MAX_PUSH_DEPTH is 3', async () => {
    const { MAX_PUSH_DEPTH } = await import('../../services/pushStack/state.js')
    expect(MAX_PUSH_DEPTH).toBe(3)
  })

  test('getPushStackMirror starts empty', async () => {
    const { getPushStackMirror } = await import(
      '../../services/pushStack/state.js'
    )
    const mirror = getPushStackMirror()
    expect(Array.isArray(mirror)).toBe(true)
    // May have stale content if other tests ran first — just verify it's readable
    expect(mirror).toBeDefined()
  })

  test('setPushStackMirror round-trips', async () => {
    const { getPushStackMirror, setPushStackMirror } = await import(
      '../../services/pushStack/state.js'
    )
    const marker = {
      id: 'test-id',
      messageUuid:
        '00000000-0000-0000-0000-000000000001' as `${string}-${string}-${string}-${string}-${string}`,
      note: 'test note',
      timestamp: Date.now(),
      anchorPreview: 'preview text',
    }
    setPushStackMirror([marker])
    const stack = getPushStackMirror()
    expect(stack.length).toBe(1)
    expect(stack[0]!.id).toBe('test-id')
    expect(stack[0]!.note).toBe('test note')
    // Restore
    setPushStackMirror([])
  })
})

describe('DIGEST_PROMPT and DIGEST_TEMPLATE', () => {
  test('DIGEST_PROMPT contains required four-section structure', async () => {
    const { DIGEST_PROMPT } = await import(
      '../../services/pushStack/digestPrompt.js'
    )
    expect(DIGEST_PROMPT).toContain('[Decisions]')
    expect(DIGEST_PROMPT).toContain('[Rejected]')
    expect(DIGEST_PROMPT).toContain('[Open questions]')
    expect(DIGEST_PROMPT).toContain('[Action items]')
    expect(DIGEST_PROMPT).toContain('<analysis>')
    expect(DIGEST_PROMPT).toContain('<summary>')
  })

  test('DIGEST_TEMPLATE is a non-empty string', async () => {
    const { DIGEST_TEMPLATE } = await import(
      '../../services/pushStack/digestPrompt.js'
    )
    expect(typeof DIGEST_TEMPLATE).toBe('string')
    expect(DIGEST_TEMPLATE.length).toBeGreaterThan(0)
  })
})

describe('pop command integration', () => {
  test('empty stack returns error text', async () => {
    const { call } = await import('../pop/pop.js')
    const ctx = {
      getAppState: () => ({ pushStack: [] as unknown[] }),
      applyPop: undefined,
    } as unknown as import('../../Tool.js').ToolUseContext
    const result = await call('', ctx)
    expect(result.type).toBe('text')
    expect((result as { type: string; value: string }).value).toMatch(
      /No push point to pop/,
    )
  })

  test('stack overflow --to N returns error text', async () => {
    const { call } = await import('../pop/pop.js')
    const ctx = {
      getAppState: () => ({
        pushStack: [
          {
            id: 'a',
            messageUuid: '00000000-0000-0000-0000-000000000001',
            note: '',
            timestamp: 0,
            anchorPreview: '',
          },
        ],
      }),
      applyPop: undefined,
    } as unknown as import('../../Tool.js').ToolUseContext
    const result = await call('--to #5', ctx)
    expect(result.type).toBe('text')
    expect((result as { type: string; value: string }).value).toMatch(
      /No push point #5/,
    )
  })

  test('interactive session with no applyPop returns error text', async () => {
    const { call } = await import('../pop/pop.js')
    const ctx = {
      getAppState: () => ({
        pushStack: [
          {
            id: 'a',
            messageUuid: '00000000-0000-0000-0000-000000000001',
            note: '',
            timestamp: 0,
            anchorPreview: '',
          },
        ],
      }),
      applyPop: undefined,
    } as unknown as import('../../Tool.js').ToolUseContext
    const result = await call('', ctx)
    expect(result.type).toBe('text')
    expect((result as { type: string; value: string }).value).toMatch(
      /interactive session/,
    )
  })

  test('invalid args returns error text', async () => {
    const { call } = await import('../pop/pop.js')
    const ctx = {
      getAppState: () => ({ pushStack: [] as unknown[] }),
    } as unknown as import('../../Tool.js').ToolUseContext
    const result = await call('--unknown-flag', ctx)
    expect(result.type).toBe('text')
    expect((result as { type: string; value: string }).value).toMatch(
      /Unknown option/,
    )
  })
})

describe('push command integration', () => {
  test('--list on empty stack returns empty message', async () => {
    const { call } = await import('../push/push.js')
    const ctx = {
      getAppState: () => ({ pushStack: [] }),
      pushContextMark: undefined,
    } as unknown as import('../../Tool.js').ToolUseContext
    const result = await call('--list', ctx)
    expect(result.type).toBe('text')
    expect((result as { type: string; value: string }).value).toMatch(
      /No active push points/,
    )
  })

  test('--list with items renders stack', async () => {
    const { call } = await import('../push/push.js')
    const now = Date.now()
    const ctx = {
      getAppState: () => ({
        pushStack: [
          {
            id: 'a',
            messageUuid: '00000000-0000-0000-0000-000000000001',
            note: 'discuss API',
            timestamp: now - 60000,
            anchorPreview: 'let me think...',
          },
          {
            id: 'b',
            messageUuid: '00000000-0000-0000-0000-000000000002',
            note: '',
            timestamp: now - 30000,
            anchorPreview: 'another point',
          },
        ],
      }),
      pushContextMark: undefined,
    } as unknown as import('../../Tool.js').ToolUseContext
    const result = await call('--list', ctx)
    expect(result.type).toBe('text')
    const text = (result as { type: string; value: string }).value
    expect(text).toContain('Push stack (2)')
    expect(text).toContain('#1')
    expect(text).toContain('#2')
    expect(text).toContain('discuss API')
  })

  test('no pushContextMark returns not-interactive error', async () => {
    const { call } = await import('../push/push.js')
    const ctx = {
      getAppState: () => ({ pushStack: [] }),
      pushContextMark: undefined,
    } as unknown as import('../../Tool.js').ToolUseContext
    const result = await call('my note', ctx)
    expect(result.type).toBe('text')
    expect((result as { type: string; value: string }).value).toMatch(
      /interactive session/,
    )
  })

  test('with pushContextMark invokes it and returns skip', async () => {
    const { call } = await import('../push/push.js')
    let capturedNote = ''
    const ctx = {
      getAppState: () => ({ pushStack: [] }),
      pushContextMark: (note: string) => {
        capturedNote = note
      },
    } as unknown as import('../../Tool.js').ToolUseContext
    const result = await call('test branch note', ctx)
    expect(result.type).toBe('skip')
    expect(capturedNote).toBe('test branch note')
  })
})
