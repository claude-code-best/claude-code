import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

mock.module('bun:bundle', () => ({
  feature: (_name: string) => true,
}))

mock.module('src/services/analytics/index.js', () => ({
  logEvent: () => {},
  stripProtoFields: (v: unknown) => v,
}))

let tmpDir: string
let claudeDir: string

// Dynamic envUtils mock — reads CLAUDE_CONFIG_DIR from process.env at call
// time so it stays compatible across the full suite when other test files
// also drive their own dirs via process.env.
mock.module('src/utils/envUtils.js', () => ({
  getClaudeConfigHomeDir: () =>
    process.env.CLAUDE_CONFIG_DIR ?? `${tmpdir()}/dummy-claude`,
  isEnvTruthy: (v: unknown) => Boolean(v),
  getTeamsDir: () =>
    join(process.env.CLAUDE_CONFIG_DIR ?? `${tmpdir()}/dummy-claude`, 'teams'),
  hasNodeOption: () => false,
  isEnvDefinedFalsy: () => false,
  isBareMode: () => false,
  parseEnvVars: (s: string) => s,
  getAWSRegion: () => 'us-east-1',
  getDefaultVertexRegion: () => 'us-central1',
  shouldMaintainProjectWorkingDir: () => false,
}))

async function invokeBreakCache(
  args: string,
): Promise<{ type: string; value: string }> {
  const { callBreakCache } = await import('../index.js')
  return callBreakCache(args) as Promise<{ type: string; value: string }>
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'break-cache-test-'))
  claudeDir = join(tmpDir, '.claude')
  mkdirSync(claudeDir, { recursive: true })
  process.env.CLAUDE_CONFIG_DIR = claudeDir
})

afterEach(() => {
  // Clean up any lingering marker files
  try {
    const { getBreakCacheMarkerPath } = require('../index.js')
    const markerPath = getBreakCacheMarkerPath()
    if (existsSync(markerPath)) unlinkSync(markerPath)
  } catch {
    // ignore
  }
  rmSync(tmpDir, { recursive: true, force: true })
  delete process.env.CLAUDE_CONFIG_DIR
})

describe('break-cache command', () => {
  test('command has correct name and type', async () => {
    const mod = await import('../index.js')
    const cmd = mod.default
    expect(cmd.name).toBe('break-cache')
    expect(cmd.type).toBe('local-jsx')
    expect(cmd.argumentHint).toContain('status')

    const nonInteractive = mod.breakCacheNonInteractive
    expect(nonInteractive.name).toBe('break-cache')
    expect(nonInteractive.type).toBe('local')
    expect(
      (nonInteractive as unknown as { supportsNonInteractive: boolean })
        .supportsNonInteractive,
    ).toBe(true)
  })

  test('interactive and noninteractive entries are mutually gated', async () => {
    const mod = await import('../index.js')
    const interactiveEnabled = mod.default.isEnabled?.()
    const nonInteractiveEnabled = mod.breakCacheNonInteractive.isEnabled?.()

    expect(typeof interactiveEnabled).toBe('boolean')
    expect(nonInteractiveEnabled).toBe(!interactiveEnabled)
  })

  test('writes marker file and confirms in message', async () => {
    const mod = await import('../index.js')
    const { getBreakCacheMarkerPath } = mod
    const result = await invokeBreakCache('')

    expect(result.type).toBe('text')
    if (result.type === 'text') {
      expect(result.value).toContain('Cache break scheduled')
      expect(result.value).toContain('next API call')
    }

    // Marker file must exist under CLAUDE_CONFIG_DIR
    const markerPath = getBreakCacheMarkerPath()
    expect(markerPath).toContain('.next-request-no-cache')
    expect(existsSync(markerPath)).toBe(true)

    // Clean up
    unlinkSync(markerPath)
  })

  test('--clear removes an existing marker', async () => {
    const mod = await import('../index.js')
    const { getBreakCacheMarkerPath } = mod

    // Set the marker first
    await invokeBreakCache('')
    const markerPath = getBreakCacheMarkerPath()
    expect(existsSync(markerPath)).toBe(true)

    // Now clear it
    const clearResult = await invokeBreakCache('--clear')
    expect(clearResult.type).toBe('text')
    if (clearResult.type === 'text') {
      expect(clearResult.value).toContain('cleared')
    }
    expect(existsSync(markerPath)).toBe(false)
  })

  test('--clear when no marker returns no-marker message', async () => {
    const mod = await import('../index.js')
    const { getBreakCacheMarkerPath } = mod
    const markerPath = getBreakCacheMarkerPath()

    // Ensure it does not exist
    if (existsSync(markerPath)) unlinkSync(markerPath)

    const result = await invokeBreakCache('--clear')
    expect(result.type).toBe('text')
    if (result.type === 'text') {
      expect(result.value).toContain('No cache-break marker')
    }
  })

  test('getBreakCacheMarkerPath points inside CLAUDE_CONFIG_DIR', async () => {
    const { getBreakCacheMarkerPath } = await import('../index.js')
    const path = getBreakCacheMarkerPath()
    expect(path).toContain('.next-request-no-cache')
    // The path should be under claudeDir (CLAUDE_CONFIG_DIR)
    expect(path.startsWith(claudeDir)).toBe(true)
  })

  test('"once" scope is same as empty args', async () => {
    const mod = await import('../index.js')
    const { getBreakCacheMarkerPath } = mod
    const result = await invokeBreakCache('once')
    expect(result.type).toBe('text')
    if (result.type === 'text') {
      expect(result.value).toContain('Cache break scheduled')
    }
    const markerPath = getBreakCacheMarkerPath()
    expect(existsSync(markerPath)).toBe(true)
  })

  test('"always" scope writes the always flag', async () => {
    const mod = await import('../index.js')
    const { getBreakCacheAlwaysPath } = mod
    const result = await invokeBreakCache('always')
    expect(result.type).toBe('text')
    if (result.type === 'text') {
      expect(result.value).toContain('Always-on')
    }
    expect(existsSync(getBreakCacheAlwaysPath())).toBe(true)
    // Clean up
    unlinkSync(getBreakCacheAlwaysPath())
  })

  test('"off" scope clears both flags', async () => {
    const mod = await import('../index.js')
    const { getBreakCacheMarkerPath, getBreakCacheAlwaysPath } = mod
    // Set both markers
    await invokeBreakCache('')
    await invokeBreakCache('always')
    expect(existsSync(getBreakCacheMarkerPath())).toBe(true)
    expect(existsSync(getBreakCacheAlwaysPath())).toBe(true)
    // Clear both
    const result = await invokeBreakCache('off')
    expect(result.type).toBe('text')
    if (result.type === 'text') {
      expect(result.value).toContain('disabled')
    }
    expect(existsSync(getBreakCacheMarkerPath())).toBe(false)
    expect(existsSync(getBreakCacheAlwaysPath())).toBe(false)
  })

  test('"status" scope shows current state', async () => {
    const result = await invokeBreakCache('status')
    expect(result.type).toBe('text')
    if (result.type === 'text') {
      expect(result.value).toContain('Break-Cache Status')
      expect(result.value).toContain('Once marker')
      expect(result.value).toContain('Always mode')
    }
  })

  test('unknown scope returns usage text', async () => {
    const result = await invokeBreakCache('foobar')
    expect(result.type).toBe('text')
    if (result.type === 'text') {
      expect(result.value).toContain('Unknown scope')
      expect(result.value).toContain('Usage')
    }
  })

  test('getBreakCacheAlwaysPath and getBreakCacheStatsPath are exported', async () => {
    const { getBreakCacheAlwaysPath, getBreakCacheStatsPath } = await import(
      '../index.js'
    )
    expect(typeof getBreakCacheAlwaysPath()).toBe('string')
    expect(typeof getBreakCacheStatsPath()).toBe('string')
    expect(getBreakCacheAlwaysPath()).toContain('.break-cache-always')
    // File was renamed to append-only JSONL (H3 fix: atomic append prevents RMW race)
    expect(getBreakCacheStatsPath()).toContain('break-cache-events.jsonl')
  })

  // ── H3 regression: append-only stats log accumulates correctly ──
  test('H3: each /break-cache once appends one event; totalBreaks reflects all calls', async () => {
    const { readFileSync } = await import('node:fs')
    const mod = await import('../index.js')
    const { getBreakCacheStatsPath } = mod

    // Call /break-cache once, twice
    await invokeBreakCache('once')
    await invokeBreakCache('once')
    await invokeBreakCache('once')

    // Stats path should be a JSONL file with 3 'once' events
    const statsPath = getBreakCacheStatsPath()
    const lines = readFileSync(statsPath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
    const events = lines.map(l => JSON.parse(l) as { kind: string })
    const onceEvents = events.filter(e => e.kind === 'once')
    expect(onceEvents.length).toBe(3)

    // The status command should report totalBreaks = 3
    const statusResult = await invokeBreakCache('status')
    if (statusResult.type === 'text') {
      expect(statusResult.value).toContain('total_breaks:   3')
    }
  })

  test('local-jsx no args renders action panel without completing', async () => {
    const { call } = await import('../panel.js')
    const messages: string[] = []

    const node = await call(
      msg => {
        if (msg) messages.push(msg)
      },
      {} as never,
      '',
    )

    expect(node).not.toBeNull()
    expect(messages).toHaveLength(0)
  })

  test('local-jsx explicit args completes through onDone', async () => {
    const { call } = await import('../panel.js')
    const messages: string[] = []

    const node = await call(
      msg => {
        if (msg) messages.push(msg)
      },
      {} as never,
      'status',
    )

    expect(node).toBeNull()
    expect(messages.join('\n')).toContain('Break-Cache Status')
  })

  test('readEvents skips malformed JSON lines (catch branch)', async () => {
    const { getBreakCacheStatsPath } = await import('../index.js')
    const statsPath = getBreakCacheStatsPath()
    mkdirSync(join(statsPath, '..'), { recursive: true })
    writeFileSync(
      statsPath,
      [
        '{not valid json',
        JSON.stringify({ kind: 'once', timestamp: Date.now() }),
        '',
        '{"truncated":',
      ].join('\n') + '\n',
    )
    // Status read uses readEvents internally → exercises the JSON.parse catch.
    const result = await invokeBreakCache('status')
    expect(result.type).toBe('text')
    expect(result.value).toContain('Break-Cache Status')
  })

  test('breakCache (interactive): getBridgeInvocationError requires arg', async () => {
    const mod = await import('../index.js')
    const cmd = mod.default
    const fn = (
      cmd as unknown as {
        getBridgeInvocationError?: (args: string) => string | undefined
      }
    ).getBridgeInvocationError
    expect(typeof fn).toBe('function')
    if (fn) {
      expect(fn('')).toContain('Remote Control')
      expect(fn('   ')).toContain('Remote Control')
      expect(fn('once')).toBeUndefined()
      expect(fn('status')).toBeUndefined()
    }
  })

  test('breakCacheNonInteractive: load() returns call function', async () => {
    const { breakCacheNonInteractive } = await import('../index.js')
    expect(breakCacheNonInteractive.type).toBe('local')
    const loaded = await (
      breakCacheNonInteractive as unknown as {
        load: () => Promise<{ call: unknown }>
      }
    ).load()
    expect(typeof loaded.call).toBe('function')
  })
})
