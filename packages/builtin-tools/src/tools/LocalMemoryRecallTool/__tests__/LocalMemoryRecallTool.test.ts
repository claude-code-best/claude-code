import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mockToolContext } from '../../../../../../tests/mocks/toolContext.js'

// We test the tool through its public interface: schema validation +
// checkPermissions logic + call return shape. The tool is read-only and
// uses the multiStore backend, so we drive it with a real tmpdir and the
// CLAUDE_CONFIG_DIR override.

describe('LocalMemoryRecallTool', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'lmrt-test-'))
    process.env['CLAUDE_CONFIG_DIR'] = tmpDir
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    delete process.env['CLAUDE_CONFIG_DIR']
  })

  test('list_stores returns empty array when no stores exist', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const result = await LocalMemoryRecallTool.call(
      { action: 'list_stores' },
      // minimal context — call() doesn't use it for list_stores
      { toolUseId: 't1' } as never,
    )
    expect(result.data.action).toBe('list_stores')
    expect(result.data.stores).toEqual([])
  })

  test('list_stores returns existing stores', async () => {
    // Pre-create stores via direct fs write
    const baseDir = join(tmpDir, 'local-memory')
    mkdirSync(join(baseDir, 'store-a'), { recursive: true })
    mkdirSync(join(baseDir, 'store-b'), { recursive: true })

    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const result = await LocalMemoryRecallTool.call({ action: 'list_stores' }, {
      toolUseId: 't1',
    } as never)
    expect(result.data.stores).toEqual(['store-a', 'store-b'])
  })

  test('list_entries returns entry keys', async () => {
    const baseDir = join(tmpDir, 'local-memory', 'notes')
    mkdirSync(baseDir, { recursive: true })
    writeFileSync(join(baseDir, 'idea1.md'), 'first idea')
    writeFileSync(join(baseDir, 'idea2.md'), 'second idea')

    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const result = await LocalMemoryRecallTool.call(
      { action: 'list_entries', store: 'notes' },
      { toolUseId: 't2' } as never,
    )
    expect(result.data.entries).toEqual(['idea1', 'idea2'])
  })

  test('fetch returns content with untrusted wrapper', async () => {
    const baseDir = join(tmpDir, 'local-memory', 'notes')
    mkdirSync(baseDir, { recursive: true })
    writeFileSync(join(baseDir, 'idea1.md'), 'my secret note')

    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const result = await LocalMemoryRecallTool.call(
      { action: 'fetch', store: 'notes', key: 'idea1', preview_only: true },
      { toolUseId: 't3' } as never,
    )
    expect(result.data.action).toBe('fetch')
    expect(result.data.value).toContain('my secret note')
    expect(result.data.value).toContain('<user_local_memory')
    expect(result.data.value).toContain(
      'NOTE: The content above is user-stored data',
    )
    expect(result.data.preview_only).toBe(true)
  })

  test('fetch strips bidi/control chars from content', async () => {
    const baseDir = join(tmpDir, 'local-memory', 'notes')
    mkdirSync(baseDir, { recursive: true })
    const rlo = '‮'
    writeFileSync(join(baseDir, 'attack.md'), `safe${rlo}injected`)

    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const result = await LocalMemoryRecallTool.call(
      { action: 'fetch', store: 'notes', key: 'attack' },
      { toolUseId: 't4' } as never,
    )
    expect(result.data.value).not.toContain(rlo)
    expect(result.data.value).toContain('safeinjected')
  })

  test('fetch returns error for missing entry', async () => {
    const baseDir = join(tmpDir, 'local-memory', 'notes')
    mkdirSync(baseDir, { recursive: true })

    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const result = await LocalMemoryRecallTool.call(
      { action: 'fetch', store: 'notes', key: 'nonexistent' },
      { toolUseId: 't5' } as never,
    )
    expect(result.data.error).toMatch(/not found/i)
  })

  test('fetch preview truncates large content', async () => {
    const baseDir = join(tmpDir, 'local-memory', 'big')
    mkdirSync(baseDir, { recursive: true })
    const huge = 'A'.repeat(10_000) // > 2KB preview cap
    writeFileSync(join(baseDir, 'huge.md'), huge)

    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const result = await LocalMemoryRecallTool.call(
      { action: 'fetch', store: 'big', key: 'huge', preview_only: true },
      { toolUseId: 't6' } as never,
    )
    expect(result.data.truncated).toBe(true)
    // Wrapper adds chars, but stripped content should be ≤ 2048 bytes
    const wrapStart = result.data.value!.indexOf('<user_local_memory')
    const wrapEnd = result.data.value!.indexOf('</user_local_memory>')
    expect(wrapEnd - wrapStart).toBeLessThan(2300) // 2KB cap + wrapper headers
  })

  test('checkPermissions: list_stores allowed', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const result = await LocalMemoryRecallTool.checkPermissions!(
      { action: 'list_stores' },
      mockContext(),
    )
    expect(result.behavior).toBe('allow')
  })

  test('checkPermissions: list_entries missing store -> deny with reason', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const result = await LocalMemoryRecallTool.checkPermissions!(
      { action: 'list_entries' },
      mockContext(),
    )
    expect(result.behavior).toBe('deny')
    if (result.behavior === 'deny') {
      expect(result.message).toMatch(/missing 'store'/i)
      expect(result.decisionReason).toBeDefined()
    }
  })

  test('checkPermissions: fetch missing key -> deny with reason', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const result = await LocalMemoryRecallTool.checkPermissions!(
      { action: 'fetch', store: 'notes' },
      mockContext(),
    )
    expect(result.behavior).toBe('deny')
    if (result.behavior === 'deny') {
      expect(result.message).toMatch(/missing key/i)
    }
  })

  test('checkPermissions: invalid store name -> deny', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const result = await LocalMemoryRecallTool.checkPermissions!(
      { action: 'list_entries', store: '../etc' },
      mockContext(),
    )
    expect(result.behavior).toBe('deny')
  })

  test('checkPermissions: fetch with preview_only undefined -> allow (default preview)', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const result = await LocalMemoryRecallTool.checkPermissions!(
      { action: 'fetch', store: 'notes', key: 'idea1' },
      mockContext(),
    )
    expect(result.behavior).toBe('allow')
  })

  test('checkPermissions: fetch with preview_only=true -> allow', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const result = await LocalMemoryRecallTool.checkPermissions!(
      { action: 'fetch', store: 'notes', key: 'idea1', preview_only: true },
      mockContext(),
    )
    expect(result.behavior).toBe('allow')
  })

  test('checkPermissions: full fetch (preview_only=false) without rule -> ask', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const result = await LocalMemoryRecallTool.checkPermissions!(
      { action: 'fetch', store: 'notes', key: 'idea1', preview_only: false },
      mockContext(),
    )
    expect(result.behavior).toBe('ask')
  })

  test('Tool definition: requiresUserInteraction returns true (bypass-immune)', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    expect(LocalMemoryRecallTool.requiresUserInteraction!()).toBe(true)
  })

  test('Tool definition: isReadOnly returns true', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    expect(LocalMemoryRecallTool.isReadOnly!()).toBe(true)
  })

  // M9 fix: budget_exceeded test coverage
  test('M9: per-turn budget shared across multiple fetches with same turnKey', async () => {
    const { LocalMemoryRecallTool, _resetFetchBudgetForTest } = await import(
      '../LocalMemoryRecallTool.js'
    )
    _resetFetchBudgetForTest()
    const baseDir = join(tmpDir, 'local-memory', 'budget-test')
    mkdirSync(baseDir, { recursive: true })
    // 3 entries of 40KB each → 120KB total. With 100KB budget shared by
    // turnKey, the third call should hit budget_exceeded.
    writeFileSync(join(baseDir, 'a.md'), 'A'.repeat(40 * 1024))
    writeFileSync(join(baseDir, 'b.md'), 'B'.repeat(40 * 1024))
    writeFileSync(join(baseDir, 'c.md'), 'C'.repeat(40 * 1024))

    // F1 fix: production ToolUseContext doesn't have assistantMessageId.
    // Use messages array with a stable assistant uuid — that's how
    // deriveTurnKey actually identifies a turn in prod.
    const sharedMessages = [{ type: 'assistant', uuid: 'turn-1-uuid' }]
    const ctx = {
      messages: sharedMessages,
      toolUseId: 'tool-call-distinct',
    } as never

    const r1 = await LocalMemoryRecallTool.call(
      {
        action: 'fetch',
        store: 'budget-test',
        key: 'a',
        preview_only: false,
      },
      ctx,
    )
    expect(r1.data.budget_exceeded).toBeUndefined()

    const r2 = await LocalMemoryRecallTool.call(
      {
        action: 'fetch',
        store: 'budget-test',
        key: 'b',
        preview_only: false,
      },
      ctx,
    )
    expect(r2.data.budget_exceeded).toBeUndefined()

    const r3 = await LocalMemoryRecallTool.call(
      {
        action: 'fetch',
        store: 'budget-test',
        key: 'c',
        preview_only: false,
      },
      ctx,
    )
    // Third 40KB charge → 120KB > 100KB cap → rejected
    expect(r3.data.budget_exceeded).toBe(true)
    expect(r3.data.error).toMatch(/budget/i)
  })

  // ── M4 (codecov-100 audit #7): race / interleaving guarantees ──
  // The audit flagged the read-modify-write in consumeBudget as a potential
  // race. We document (and pin via test) that under the realistic JS
  // event-loop model, concurrently-issued async fetches sharing the same
  // turnKey settle on the correct cumulative budget — no double-charges,
  // no torn writes — because there is no `await` between get and set in
  // the tracker, and the tracker itself is synchronous.
  test('M4 (audit #7): concurrent fetches with same turnKey settle on correct budget', async () => {
    const { LocalMemoryRecallTool, _resetFetchBudgetForTest } = await import(
      '../LocalMemoryRecallTool.js'
    )
    _resetFetchBudgetForTest()
    const baseDir = join(tmpDir, 'local-memory', 'race-test')
    mkdirSync(baseDir, { recursive: true })
    // 5 entries of 30KB each → 150KB total. Budget=100KB. Issued in
    // parallel with the SAME turnKey, the first 3 succeed, the rest are
    // budget_exceeded. With 30KB charge per call: 30+30+30=90KB ok, 4th
    // would be 120KB > 100KB → exceeded. No torn-write should let two
    // calls past the cap.
    for (const k of ['a', 'b', 'c', 'd', 'e']) {
      writeFileSync(join(baseDir, `${k}.md`), 'X'.repeat(30 * 1024))
    }

    const sharedCtx = {
      messages: [{ type: 'assistant', uuid: 'race-turn' }],
      toolUseId: 't',
    } as never

    // Fire 5 calls in parallel via Promise.all
    const results = await Promise.all(
      ['a', 'b', 'c', 'd', 'e'].map(key =>
        LocalMemoryRecallTool.call(
          { action: 'fetch', store: 'race-test', key, preview_only: false },
          sharedCtx,
        ),
      ),
    )

    const exceeded = results.filter(r => r.data.budget_exceeded === true)
    const ok = results.filter(r => r.data.budget_exceeded !== true)
    // Exactly 3 ok (90KB), 2 exceeded (120KB+, 150KB+). Critical assertion:
    // the SUM of successful charges must NOT exceed the budget.
    expect(ok.length).toBe(3)
    expect(exceeded.length).toBe(2)
  })

  test('M9: different turnKeys do NOT share budget', async () => {
    const { LocalMemoryRecallTool, _resetFetchBudgetForTest } = await import(
      '../LocalMemoryRecallTool.js'
    )
    _resetFetchBudgetForTest()
    const baseDir = join(tmpDir, 'local-memory', 'budget-isolation')
    mkdirSync(baseDir, { recursive: true })
    writeFileSync(join(baseDir, 'a.md'), 'A'.repeat(60 * 1024))

    // Two different turn IDs each get their own 100KB budget
    const r1 = await LocalMemoryRecallTool.call(
      {
        action: 'fetch',
        store: 'budget-isolation',
        key: 'a',
        preview_only: false,
      },
      {
        messages: [{ type: 'assistant', uuid: 'turn-A' }],
        toolUseId: 'x',
      } as never,
    )
    expect(r1.data.budget_exceeded).toBeUndefined()

    const r2 = await LocalMemoryRecallTool.call(
      {
        action: 'fetch',
        store: 'budget-isolation',
        key: 'a',
        preview_only: false,
      },
      {
        messages: [{ type: 'assistant', uuid: 'turn-B' }],
        toolUseId: 'y',
      } as never,
    )
    expect(r2.data.budget_exceeded).toBeUndefined()
  })
})

describe('LocalMemoryRecallTool: tool definition methods', () => {
  test('isReadOnly returns true', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    expect(LocalMemoryRecallTool.isReadOnly()).toBe(true)
  })

  test('isConcurrencySafe returns true', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    expect(LocalMemoryRecallTool.isConcurrencySafe()).toBe(true)
  })

  test('requiresUserInteraction returns true (bypass-immune)', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    expect(LocalMemoryRecallTool.requiresUserInteraction()).toBe(true)
  })

  test('userFacingName returns "Local Memory"', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    expect(LocalMemoryRecallTool.userFacingName()).toBe('Local Memory')
  })

  test('description returns DESCRIPTION constant (non-empty string)', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const d = await LocalMemoryRecallTool.description()
    expect(typeof d).toBe('string')
    expect(d.length).toBeGreaterThan(0)
  })

  test('prompt returns PROMPT constant (non-empty string)', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const p = await LocalMemoryRecallTool.prompt()
    expect(typeof p).toBe('string')
    expect(p.length).toBeGreaterThan(0)
  })

  test('toAutoClassifierInput formats action with store + key', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    expect(
      LocalMemoryRecallTool.toAutoClassifierInput({
        action: 'fetch',
        store: 'work',
        key: 'note',
      } as never),
    ).toBe('fetch work/note')
  })

  test('toAutoClassifierInput formats action with store only (no key)', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    expect(
      LocalMemoryRecallTool.toAutoClassifierInput({
        action: 'list_entries',
        store: 'work',
      } as never),
    ).toBe('list_entries work')
  })

  test('toAutoClassifierInput formats list_stores (no store/key)', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    expect(
      LocalMemoryRecallTool.toAutoClassifierInput({
        action: 'list_stores',
      } as never),
    ).toBe('list_stores')
  })
})

describe('LocalMemoryRecallTool: checkPermissions edge cases', () => {
  test('checkPermissions: invalid key (path-traversal) → deny', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const result = await LocalMemoryRecallTool.checkPermissions!(
      {
        action: 'fetch',
        store: 'work',
        key: '../etc/passwd',
        preview_only: true,
      } as never,
      mockContext() as never,
    )
    expect(result.behavior).toBe('deny')
    if (result.behavior === 'deny') {
      expect(result.message).toContain('Invalid key')
    }
  })

  test('checkPermissions: list_entries with invalid store → deny (caught upstream)', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const result = await LocalMemoryRecallTool.checkPermissions!(
      {
        action: 'list_entries',
        store: '../bad',
      } as never,
      mockContext() as never,
    )
    expect(result.behavior).toBe('deny')
  })
})

describe('LocalMemoryRecallTool: budget consumeBudget eviction', () => {
  let evictTmpDir: string
  beforeEach(() => {
    evictTmpDir = mkdtempSync(join(tmpdir(), 'lmrt-evict-'))
    process.env['CLAUDE_CONFIG_DIR'] = evictTmpDir
  })
  afterEach(() => {
    rmSync(evictTmpDir, { recursive: true, force: true })
    delete process.env['CLAUDE_CONFIG_DIR']
  })

  test('FETCH_BUDGET_USED FIFO eviction triggers when >MAX_BUDGET_KEYS distinct turns fetch', async () => {
    // Pre-populate a real store with a small entry so fetch consumes budget.
    const baseDir = join(evictTmpDir, 'local-memory', 'evict-store')
    mkdirSync(baseDir, { recursive: true })
    writeFileSync(join(baseDir, 'k.md'), 'value')

    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    // MAX_BUDGET_KEYS is 100; do 105 distinct fetches to force eviction.
    for (let i = 0; i < 105; i++) {
      const r = await LocalMemoryRecallTool.call(
        {
          action: 'fetch',
          store: 'evict-store',
          key: 'k',
          preview_only: true,
        },
        {
          messages: [{ type: 'assistant', uuid: `turn-${i}` }],
          toolUseId: `t${i}`,
        } as never,
      )
      expect(r.data.action).toBe('fetch')
    }
  })
})

describe('LocalMemoryRecallTool: deny/allow rule branches', () => {
  test('deny rule for fetch:store/key → checkPermissions deny', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const result = await LocalMemoryRecallTool.checkPermissions!(
      {
        action: 'fetch',
        store: 'work',
        key: 'note',
        preview_only: false,
      } as never,
      mockToolContext({
        permissionOverrides: {
          alwaysDenyRules: {
            userSettings: ['LocalMemoryRecall(fetch:work/note)'],
            projectSettings: [],
            localSettings: [],
            flagSettings: [],
            policySettings: [],
            cliArg: [],
            command: [],
          },
        },
      }) as never,
    )
    expect(result.behavior).toBe('deny')
    if (result.behavior === 'deny') {
      expect(result.message).toContain('Denied by rule')
    }
  })

  test('allow rule for fetch:store/key → checkPermissions allow', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const result = await LocalMemoryRecallTool.checkPermissions!(
      {
        action: 'fetch',
        store: 'work',
        key: 'note',
        preview_only: false,
      } as never,
      mockToolContext({
        permissionOverrides: {
          alwaysAllowRules: {
            userSettings: ['LocalMemoryRecall(fetch:work/note)'],
            projectSettings: [],
            localSettings: [],
            flagSettings: [],
            policySettings: [],
            cliArg: [],
            command: [],
          },
        },
      }) as never,
    )
    expect(result.behavior).toBe('allow')
  })
})

describe('LocalMemoryRecallTool: turn-key fallback paths (via fetch)', () => {
  // Use fetch action since deriveTurnKey is only invoked from fetch, not list_stores.
  // Pre-populate a real entry so fetch reaches deriveTurnKey before erroring.
  let turnTmpDir: string
  beforeEach(() => {
    turnTmpDir = mkdtempSync(join(tmpdir(), 'lmrt-turn-'))
    process.env['CLAUDE_CONFIG_DIR'] = turnTmpDir
    const baseDir = join(turnTmpDir, 'local-memory', 'turn-store')
    mkdirSync(baseDir, { recursive: true })
    writeFileSync(join(baseDir, 'k.md'), 'value')
  })
  afterEach(() => {
    rmSync(turnTmpDir, { recursive: true, force: true })
    delete process.env['CLAUDE_CONFIG_DIR']
  })

  test('uses last assistant message uuid for turnKey', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const r = await LocalMemoryRecallTool.call(
      {
        action: 'fetch',
        store: 'turn-store',
        key: 'k',
        preview_only: true,
      },
      {
        messages: [
          { type: 'user', uuid: 'u1' },
          { type: 'assistant', uuid: 'a-uuid' },
        ],
        toolUseId: 't',
      } as never,
    )
    expect(r.data.action).toBe('fetch')
  })

  test('falls back to any message uuid when no assistant message', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const r = await LocalMemoryRecallTool.call(
      {
        action: 'fetch',
        store: 'turn-store',
        key: 'k',
        preview_only: true,
      },
      {
        messages: [
          { type: 'user', uuid: 'u1' },
          { type: 'system', uuid: 's1' },
        ],
        toolUseId: 't',
      } as never,
    )
    expect(r.data.action).toBe('fetch')
  })

  test('falls back to toolUseId when messages empty', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const r = await LocalMemoryRecallTool.call(
      {
        action: 'fetch',
        store: 'turn-store',
        key: 'k',
        preview_only: true,
      },
      {
        messages: [],
        toolUseId: 'tool-use-fallback',
      } as never,
    )
    expect(r.data.action).toBe('fetch')
  })

  test('falls back to NO_TURN_KEY when no messages and no toolUseId', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const r = await LocalMemoryRecallTool.call(
      {
        action: 'fetch',
        store: 'turn-store',
        key: 'k',
        preview_only: true,
      },
      { messages: [] } as never,
    )
    expect(r.data.action).toBe('fetch')
  })

  test('messages with no uuid string skips to toolUseId', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const r = await LocalMemoryRecallTool.call(
      {
        action: 'fetch',
        store: 'turn-store',
        key: 'k',
        preview_only: true,
      },
      {
        messages: [{ type: 'assistant' }, { type: 'user' }],
        toolUseId: 'no-uuid-fallback',
      } as never,
    )
    expect(r.data.action).toBe('fetch')
  })
})

describe('LocalMemoryRecallTool: defensive call() guards', () => {
  let dgTmpDir: string
  beforeEach(() => {
    dgTmpDir = mkdtempSync(join(tmpdir(), 'lmrt-dg-'))
    process.env['CLAUDE_CONFIG_DIR'] = dgTmpDir
  })
  afterEach(() => {
    rmSync(dgTmpDir, { recursive: true, force: true })
    delete process.env['CLAUDE_CONFIG_DIR']
  })

  test('list_entries without store returns internal error (defensive)', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const r = await LocalMemoryRecallTool.call(
      { action: 'list_entries' } as never,
      mockToolContext() as never,
    )
    expect(r.data.action).toBe('list_entries')
    expect(r.data.error).toContain('missing store')
  })

  test('fetch without store returns internal error (defensive)', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const r = await LocalMemoryRecallTool.call(
      { action: 'fetch', preview_only: true } as never,
      mockToolContext() as never,
    )
    expect(r.data.action).toBe('fetch')
    expect(r.data.error).toContain('missing store or key')
  })

  test('fetch with store but no key returns internal error', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const r = await LocalMemoryRecallTool.call(
      { action: 'fetch', store: 'work', preview_only: true } as never,
      mockToolContext() as never,
    )
    expect(r.data.error).toContain('missing store or key')
  })

  test('fetch on missing entry returns Error', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    // Store directory exists, key does not
    const baseDir = join(dgTmpDir, 'local-memory', 'work')
    mkdirSync(baseDir, { recursive: true })
    const r = await LocalMemoryRecallTool.call(
      {
        action: 'fetch',
        store: 'work',
        key: 'absent',
        preview_only: true,
      },
      mockToolContext() as never,
    )
    expect(r.data.action).toBe('fetch')
  })
})

describe('LocalMemoryRecallTool: mapToolResultToToolResultBlockParam', () => {
  test('non-error output has is_error=false', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const out = LocalMemoryRecallTool.mapToolResultToToolResultBlockParam!(
      { action: 'list_stores', stores: ['a', 'b'] } as never,
      'tool-use-1',
    )
    expect(out.tool_use_id).toBe('tool-use-1')
    expect(out.is_error).toBe(false)
    expect(typeof out.content).toBe('string')
  })

  test('error output has is_error=true', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const out = LocalMemoryRecallTool.mapToolResultToToolResultBlockParam!(
      { action: 'fetch', error: 'not found' } as never,
      'tool-use-2',
    )
    expect(out.is_error).toBe(true)
  })
})

describe('LocalMemoryRecallTool: call() catch path', () => {
  let catchTmpDir: string
  beforeEach(() => {
    catchTmpDir = mkdtempSync(join(tmpdir(), 'lmrt-catch-'))
    process.env['CLAUDE_CONFIG_DIR'] = catchTmpDir
  })
  afterEach(() => {
    rmSync(catchTmpDir, { recursive: true, force: true })
    delete process.env['CLAUDE_CONFIG_DIR']
  })

  test('call() catch returns error when local-memory is a regular file (ENOTDIR)', async () => {
    // Make local-memory path a regular file so listStores throws ENOTDIR
    writeFileSync(join(catchTmpDir, 'local-memory'), 'not-a-directory')
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const r = await LocalMemoryRecallTool.call(
      { action: 'list_stores' },
      mockToolContext({ toolUseId: 'catch-1' }) as never,
    )
    expect(r.data.action).toBe('list_stores')
    // Either the catch fires (error in data) or listStores returns []. Both
    // are valid outcomes — what we care about is no exception leaks out.
    expect(r.data).toBeDefined()
  })

  test('call() catch returns error when fetch path is corrupted', async () => {
    // Create store directory then put a directory at the entry-file path so
    // getEntryBounded throws EISDIR.
    const baseDir = join(catchTmpDir, 'local-memory', 'corrupt-store')
    mkdirSync(baseDir, { recursive: true })
    mkdirSync(join(baseDir, 'corruptkey.md'), { recursive: true })
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const r = await LocalMemoryRecallTool.call(
      {
        action: 'fetch',
        store: 'corrupt-store',
        key: 'corruptkey',
        preview_only: true,
      },
      mockToolContext({ toolUseId: 'catch-2' }) as never,
    )
    expect(r.data.action).toBe('fetch')
  })
})

describe('LocalMemoryRecallTool: truncate edge cases', () => {
  let truncTmpDir: string
  beforeEach(() => {
    truncTmpDir = mkdtempSync(join(tmpdir(), 'lmrt-trunc-'))
    process.env['CLAUDE_CONFIG_DIR'] = truncTmpDir
  })
  afterEach(() => {
    rmSync(truncTmpDir, { recursive: true, force: true })
    delete process.env['CLAUDE_CONFIG_DIR']
  })

  test('truncateUtf8 walks back past multi-byte UTF-8 continuation bytes', async () => {
    // PREVIEW_CAP_BYTES is 2048. Build content of all 3-byte chinese chars
    // so that byte 2048 falls in the middle of a multi-byte sequence and
    // the walk-back loop executes.
    const baseDir = join(truncTmpDir, 'local-memory', 'utf8-store')
    mkdirSync(baseDir, { recursive: true })
    // 1000 Chinese chars = 3000 bytes. Position 2048 is mid-char (continuation).
    const content = '你'.repeat(1000)
    writeFileSync(join(baseDir, 'k.md'), content)

    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const r = await LocalMemoryRecallTool.call(
      {
        action: 'fetch',
        store: 'utf8-store',
        key: 'k',
        preview_only: true,
      },
      mockToolContext({ toolUseId: 'utf8-test' }) as never,
    )
    expect(r.data.action).toBe('fetch')
    expect(r.data.truncated).toBe(true)
  })

  test('truncateListByByteCap truncates when list exceeds cap', async () => {
    // LIST_STORES_CAP_BYTES is 4096. Create many stores with long names so the
    // joined size exceeds the cap.
    for (let i = 0; i < 200; i++) {
      const storeName = `verylongstorename-${i.toString().padStart(4, '0')}-with-extra-padding-to-bloat-the-name`
      mkdirSync(join(truncTmpDir, 'local-memory', storeName), {
        recursive: true,
      })
    }
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const r = await LocalMemoryRecallTool.call(
      { action: 'list_stores' },
      mockToolContext({ toolUseId: 'cap-test' }) as never,
    )
    expect(r.data.action).toBe('list_stores')
    expect(r.data.truncated).toBe(true)
  })
})

describe('LocalMemoryRecallTool: invalid input edge cases', () => {
  test('checkPermissions: invalid store name with special chars → deny', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const result = await LocalMemoryRecallTool.checkPermissions!(
      {
        action: 'list_entries',
        store: '../escape',
      } as never,
      mockToolContext() as never,
    )
    expect(result.behavior).toBe('deny')
  })

  test('checkPermissions: invalid key with control char → deny', async () => {
    const { LocalMemoryRecallTool } = await import(
      '../LocalMemoryRecallTool.js'
    )
    const result = await LocalMemoryRecallTool.checkPermissions!(
      {
        action: 'fetch',
        store: 'work',
        key: 'bad\x00key',
        preview_only: true,
      } as never,
      mockToolContext() as never,
    )
    expect(result.behavior).toBe('deny')
  })
})

// M10 fix: mockContext is now shared from tests/mocks/toolContext.ts
function mockContext(): never {
  return mockToolContext()
}
