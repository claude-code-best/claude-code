import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { getIsNonInteractiveSession } from '../../bootstrap/state.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import type { Command, LocalCommandResult } from '../../types/command.js'

/**
 * Path to the next-request-no-cache marker file.
 * When this file exists, the main API call path should append a random
 * comment to the system prompt to bust the prefix-cache hash, then delete it.
 *
 * Convention: public so other modules (e.g. claude.ts) can check it.
 */
export function getBreakCacheMarkerPath(): string {
  return join(getClaudeConfigHomeDir(), '.next-request-no-cache')
}

/**
 * Path to the always-on break-cache flag file.
 * When this file exists, EVERY API request gets a cache-busting nonce
 * (instead of just the next one).
 */
export function getBreakCacheAlwaysPath(): string {
  return join(getClaudeConfigHomeDir(), '.break-cache-always')
}

/**
 * Path to the append-only JSONL log that records each cache-break event.
 *
 * Replaces the old read-modify-write stats JSON to avoid lost increments when
 * two concurrent `/break-cache once` invocations race. Each break appends one
 * line; `readStats()` aggregates at read time.
 *
 * Uses getClaudeConfigHomeDir() so that CLAUDE_CONFIG_DIR env var overrides
 * the path in test environments.
 */
export function getBreakCacheStatsPath(): string {
  return join(getClaudeConfigHomeDir(), 'break-cache-events.jsonl')
}

interface BreakCacheStats {
  totalBreaks: number
  lastBreakAt: string | null
  alwaysModeEnabled: boolean
}

interface BreakCacheEvent {
  at: string
  kind: 'once' | 'always_on' | 'always_off'
}

/**
 * Reads stats by aggregating the append-only event log.
 * Because we only append, concurrent writers cannot lose increments.
 */
function readStats(): BreakCacheStats {
  try {
    const raw = readFileSync(getBreakCacheStatsPath(), 'utf8')
    const events = raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => {
        try {
          return JSON.parse(line) as BreakCacheEvent
        } catch {
          return null
        }
      })
      .filter((e): e is BreakCacheEvent => e !== null)

    const onceBreaks = events.filter(e => e.kind === 'once')
    const lastEvent = events[events.length - 1]
    const alwaysEvents = events.filter(
      e => e.kind === 'always_on' || e.kind === 'always_off',
    )
    const lastAlways = alwaysEvents[alwaysEvents.length - 1]

    return {
      totalBreaks: onceBreaks.length,
      lastBreakAt: lastEvent?.at ?? null,
      alwaysModeEnabled: lastAlways?.kind === 'always_on',
    }
  } catch {
    return { totalBreaks: 0, lastBreakAt: null, alwaysModeEnabled: false }
  }
}

/**
 * Appends a single event line to the stats log.
 * append is atomic at the OS level for small writes, so concurrent callers
 * cannot overwrite each other's increments.
 */
function appendBreakEvent(kind: BreakCacheEvent['kind']): void {
  const statsPath = getBreakCacheStatsPath()
  mkdirSync(getClaudeConfigHomeDir(), { recursive: true })
  const event: BreakCacheEvent = { at: new Date().toISOString(), kind }
  appendFileSync(statsPath, JSON.stringify(event) + '\n', 'utf8')
}

function incrementBreakCount(): void {
  appendBreakEvent('once')
}

const USAGE_TEXT = [
  'Usage: /break-cache [scope]',
  '',
  '  (no args)        Schedule a one-time cache break for the next API call',
  '  once             Same as no args',
  '  always           Enable persistent cache-break mode (every request)',
  '  off              Disable always mode and clear any pending marker',
  '  --clear          Clear the pending once marker (cancel before next call)',
  '  status           Show current break-cache status and stats',
  '',
  'How it works:',
  '  The Anthropic prompt cache keys on the system-prompt prefix hash.',
  '  A unique nonce invalidates the hash, forcing a fresh compute.',
  '  This is useful when you want to ensure a clean context window.',
].join('\n')

export async function callBreakCache(
  args: string,
): Promise<LocalCommandResult> {
  const scope = args.trim().toLowerCase()
  const markerPath = getBreakCacheMarkerPath()
  const alwaysPath = getBreakCacheAlwaysPath()

  // ── status ──
  if (scope === 'status') {
    const stats = readStats()
    const onceActive = existsSync(markerPath)
    const alwaysActive = existsSync(alwaysPath)
    return {
      type: 'text',
      value: [
        '## Break-Cache Status',
        '',
        `  Once marker:    ${onceActive ? 'ACTIVE (next call will bust cache)' : 'not set'}`,
        `  Always mode:    ${alwaysActive ? 'ON (every call busts cache)' : 'off'}`,
        '',
        '## Stats',
        `  total_breaks:   ${stats.totalBreaks}`,
        `  last_break_at:  ${stats.lastBreakAt ?? 'never'}`,
      ].join('\n'),
    }
  }

  // ── off ──
  if (scope === 'off') {
    let cleared = false
    if (existsSync(markerPath)) {
      unlinkSync(markerPath)
      cleared = true
    }
    if (existsSync(alwaysPath)) {
      unlinkSync(alwaysPath)
      cleared = true
    }
    appendBreakEvent('always_off')
    return {
      type: 'text',
      value: cleared
        ? 'Break-cache disabled. Removed once marker and/or always flag.'
        : 'Break-cache was not active.',
    }
  }

  // ── --clear ──
  if (scope === '--clear') {
    if (existsSync(markerPath)) {
      unlinkSync(markerPath)
      return {
        type: 'text',
        value: `Cache-break marker cleared.\n  \`${markerPath}\``,
      }
    }
    return {
      type: 'text',
      value: 'No cache-break marker was set.',
    }
  }

  // ── always ──
  if (scope === 'always') {
    writeFileSync(alwaysPath, new Date().toISOString(), 'utf8')
    appendBreakEvent('always_on')
    return {
      type: 'text',
      value: [
        '## Always-on cache break enabled',
        '',
        `Flag written: \`${alwaysPath}\``,
        '',
        'Every API call will now append a random nonce to the system prompt,',
        'permanently preventing prompt-cache hits for this session.',
        '',
        'To disable: `/break-cache off`',
      ].join('\n'),
    }
  }

  // ── once (legacy default, or explicit "once") ──
  if (scope === '' || scope === 'once') {
    const timestamp = new Date().toISOString()
    writeFileSync(markerPath, timestamp, 'utf8')
    incrementBreakCount()
    const stats = readStats()

    return {
      type: 'text',
      value: [
        '## Cache break scheduled',
        '',
        `Marker written: \`${markerPath}\``,
        `Timestamp: ${timestamp}`,
        '',
        'The next API call will append a random nonce to the system prompt,',
        'causing a cache miss. The marker is removed automatically after use.',
        '',
        'To cancel before the next call: `/break-cache --clear`',
        'For every call:               `/break-cache always`',
        '',
        `Total breaks this session: ${stats.totalBreaks}`,
        '',
        '_How it works: Anthropic prompt cache keys on the system-prompt prefix hash._',
        '_A unique nonce invalidates the hash, forcing a fresh compute._',
      ].join('\n'),
    }
  }

  // ── unknown scope ──
  return {
    type: 'text',
    value: [`Unknown scope: "${scope}"`, '', USAGE_TEXT].join('\n'),
  }
}

const breakCache: Command = {
  type: 'local-jsx',
  name: 'break-cache',
  description:
    'Manage prompt-cache breaking. Open actions or run: once, status, always, off',
  isHidden: false,
  isEnabled: () => !getIsNonInteractiveSession(),
  argumentHint: '[once|status|always|off|--clear]',
  bridgeSafe: true,
  getBridgeInvocationError: args =>
    args.trim()
      ? undefined
      : 'Use /break-cache once/status/always/off over Remote Control.',
  load: () => import('./panel.js'),
}

export const breakCacheNonInteractive: Command = {
  type: 'local',
  name: 'break-cache',
  description:
    'Force the next (or all) API call(s) to miss prompt cache. Scopes: once, status, always, off',
  isHidden: false,
  isEnabled: () => getIsNonInteractiveSession(),
  supportsNonInteractive: true,
  bridgeSafe: true,
  load: async () => ({
    call: callBreakCache,
  }),
}

export default breakCache
