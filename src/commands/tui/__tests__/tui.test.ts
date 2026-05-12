import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getClaudeConfigHomeDir } from '../../../utils/envUtils.js'

mock.module('bun:bundle', () => ({
  feature: (_name: string) => true,
}))

mock.module('src/services/analytics/index.js', () => ({
  logEvent: () => {},
  stripProtoFields: (v: unknown) => v,
}))

let tmpDir: string
let claudeDir: string
const origEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'tui-test-'))
  claudeDir = join(tmpDir, '.claude')
  mkdirSync(claudeDir, { recursive: true })
  process.env.CLAUDE_CONFIG_DIR = claudeDir
  // getClaudeConfigHomeDir is `memoize(...)` — clear its cache so this
  // suite's CLAUDE_CONFIG_DIR overrides any value cached by an earlier
  // test file in the same process.
  getClaudeConfigHomeDir.cache?.clear?.()
  // Save env vars we may mutate
  origEnv.CLAUDE_CODE_NO_FLICKER = process.env.CLAUDE_CODE_NO_FLICKER
  delete process.env.CLAUDE_CODE_NO_FLICKER
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
  delete process.env.CLAUDE_CONFIG_DIR
  // Restore env vars
  if (origEnv.CLAUDE_CODE_NO_FLICKER === undefined) {
    delete process.env.CLAUDE_CODE_NO_FLICKER
  } else {
    process.env.CLAUDE_CODE_NO_FLICKER = origEnv.CLAUDE_CODE_NO_FLICKER
  }
})

// Helper: invoke the command's call function
async function invokeCmd(
  args: string,
): Promise<{ type: string; value: string }> {
  const { callTui } = await import('../index.js')
  return callTui(args) as Promise<{ type: string; value: string }>
}

describe('tui command metadata', () => {
  test('has correct name, type, and description', async () => {
    const mod = await import('../index.js')
    const cmd = mod.default
    expect(cmd.name).toBe('tui')
    expect(cmd.type).toBe('local-jsx')
    expect(cmd.description).toContain('flicker')
  })

  test('interactive and noninteractive entries are mutually gated', async () => {
    const mod = await import('../index.js')
    const interactiveEnabled = mod.default.isEnabled?.()
    const nonInteractiveEnabled = mod.tuiNonInteractive.isEnabled?.()

    expect(typeof interactiveEnabled).toBe('boolean')
    expect(nonInteractiveEnabled).toBe(!interactiveEnabled)
  })

  test('supportsNonInteractive is true', async () => {
    const mod = await import('../index.js')
    const cmd = mod.tuiNonInteractive as unknown as {
      supportsNonInteractive: boolean
      type: string
    }
    expect(cmd.type).toBe('local')
    expect(cmd.supportsNonInteractive).toBe(true)
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
    expect(messages.join('\n')).toContain('TUI Mode Status')
  })
})

describe('tui status subcommand', () => {
  test('reports disabled when no marker file', async () => {
    const result = await invokeCmd('status')
    expect(result.type).toBe('text')
    expect(result.value).toContain('disabled')
  })

  test('reports enabled when marker file exists', async () => {
    const { getTuiMarkerPath } = await import('../index.js')
    const markerPath = getTuiMarkerPath()
    // Write the marker
    const { writeFileSync } = await import('node:fs')
    writeFileSync(markerPath, '1', 'utf8')

    const result = await invokeCmd('status')
    expect(result.type).toBe('text')
    expect(result.value).toContain('enabled')
  })
})

describe('tui on subcommand', () => {
  test('writes marker file', async () => {
    const { getTuiMarkerPath } = await import('../index.js')
    const markerPath = getTuiMarkerPath()
    expect(existsSync(markerPath)).toBe(false)

    const result = await invokeCmd('on')
    expect(result.type).toBe('text')
    expect(result.value).toContain('enabled')
    expect(existsSync(markerPath)).toBe(true)
  })

  test('idempotent: on when already on reports already enabled', async () => {
    await invokeCmd('on')
    const result = await invokeCmd('on')
    expect(result.type).toBe('text')
    // Second call still returns a success message
    expect(result.value).toContain('enabled')
  })
})

describe('tui off subcommand', () => {
  test('removes marker file', async () => {
    const { getTuiMarkerPath } = await import('../index.js')
    await invokeCmd('on')
    expect(existsSync(getTuiMarkerPath())).toBe(true)

    const result = await invokeCmd('off')
    expect(result.type).toBe('text')
    expect(result.value).toContain('disabled')
    expect(existsSync(getTuiMarkerPath())).toBe(false)
  })

  test('off when already off returns graceful message', async () => {
    const result = await invokeCmd('off')
    expect(result.type).toBe('text')
    expect(result.value).toContain('not active')
  })
})

describe('tui toggle subcommand', () => {
  test('toggle with no marker enables tui', async () => {
    const { getTuiMarkerPath } = await import('../index.js')
    const result = await invokeCmd('')
    expect(result.type).toBe('text')
    expect(result.value).toContain('enabled')
    expect(existsSync(getTuiMarkerPath())).toBe(true)
  })

  test('toggle with marker disables tui', async () => {
    const { getTuiMarkerPath } = await import('../index.js')
    await invokeCmd('')
    expect(existsSync(getTuiMarkerPath())).toBe(true)

    const result = await invokeCmd('')
    expect(result.type).toBe('text')
    expect(result.value).toContain('disabled')
    expect(existsSync(getTuiMarkerPath())).toBe(false)
  })
})

describe('tui unknown subcommand', () => {
  test('returns usage text for unknown subcommand', async () => {
    const result = await invokeCmd('foobar')
    expect(result.type).toBe('text')
    expect(result.value).toContain('Usage')
  })
})

describe('getTuiMarkerPath', () => {
  test('returns path under CLAUDE_CONFIG_DIR', async () => {
    const { getTuiMarkerPath } = await import('../index.js')
    const p = getTuiMarkerPath()
    expect(p).toContain(claudeDir)
    expect(p).toContain('.tui-mode')
  })
})

describe('tui status env var display', () => {
  test('shows forced-on when CLAUDE_CODE_NO_FLICKER=1', async () => {
    process.env.CLAUDE_CODE_NO_FLICKER = '1'
    const result = await invokeCmd('status')
    expect(result.value).toContain('forced on via env var')
    delete process.env.CLAUDE_CODE_NO_FLICKER
  })

  test('shows forced-off when CLAUDE_CODE_NO_FLICKER=0', async () => {
    process.env.CLAUDE_CODE_NO_FLICKER = '0'
    const result = await invokeCmd('status')
    expect(result.value).toContain('forced off via env var')
    delete process.env.CLAUDE_CODE_NO_FLICKER
  })
})

describe('isTuiModeEnabled', () => {
  test('returns false when marker absent', async () => {
    const { isTuiModeEnabled } = await import('../index.js')
    expect(isTuiModeEnabled()).toBe(false)
  })

  test('returns true when marker present', async () => {
    const { isTuiModeEnabled, getTuiMarkerPath } = await import('../index.js')
    const { writeFileSync } = await import('node:fs')
    writeFileSync(getTuiMarkerPath(), '1', 'utf8')
    expect(isTuiModeEnabled()).toBe(true)
  })
})
