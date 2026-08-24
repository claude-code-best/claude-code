import type { LocalCommandResult } from '../../commands.js'
import type { ToolUseContext } from '../../Tool.js'
import type { PopOptions } from '../../services/pushStack/state.js'

/**
 * Parses a marker argument (`#N` or `N`) into a positive ordinal. Rejects any
 * input that is not a pure integer — `Number.parseInt` would otherwise silently
 * accept `2junk` (→2) or `1.5` (→1) and pop the wrong branch. Returns null on
 * any malformed value.
 */
function parseMarkerOrdinal(raw: string): number | null {
  const digits = raw.replace(/^#/, '')
  if (!/^\d+$/.test(digits)) return null
  const n = Number.parseInt(digits, 10)
  return Number.isInteger(n) && n >= 1 ? n : null
}

/**
 * Parses `/pop` flags into PopOptions. Recognized:
 *   --to #N | --to N   cross-layer pop back to marker ordinal N (§4.7)
 *   --discard          truncate without generating a digest
 *   --keep-code        truncate conversation but skip file rollback
 * Returns a string on parse error.
 */
export function parsePopArgs(args: string): PopOptions | string {
  const opts: PopOptions = {}
  const tokens = args.trim().split(/\s+/).filter(Boolean)
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!
    if (tok === '--discard') {
      opts.discard = true
    } else if (tok === '--keep-code') {
      opts.keepCode = true
    } else if (tok === '--to') {
      const next = tokens[++i]
      if (next === undefined)
        return 'Missing marker number after --to (e.g. /pop --to #1).'
      const n = parseMarkerOrdinal(next)
      if (n === null) return `Invalid marker number: ${next}`
      opts.to = n
    } else if (tok.startsWith('--to=')) {
      const n = parseMarkerOrdinal(tok.slice('--to='.length))
      if (n === null) return `Invalid marker number: ${tok}`
      opts.to = n
    } else {
      return `Unknown option: ${tok}`
    }
  }
  return opts
}

/**
 * `/pop` handler. Parses flags, validates the target marker against the current
 * stack, then hands off to the interactive `applyPop` callback which distills
 * the branch into a digest and rewinds. Errors out (no state mutation) on an
 * empty stack, an out-of-range `--to`, or a non-interactive session.
 */
export async function call(
  args: string,
  context: ToolUseContext,
): Promise<LocalCommandResult> {
  const parsed = parsePopArgs(args)
  if (typeof parsed === 'string') {
    return { type: 'text', value: parsed }
  }

  const stack = context.getAppState().pushStack
  if (stack.length === 0) {
    return {
      type: 'text',
      value:
        'No push point to pop. Use /push [note] to open a discussion branch first.',
    }
  }

  if (parsed.to !== undefined && parsed.to > stack.length) {
    return {
      type: 'text',
      value: `No push point #${parsed.to} — the stack has ${stack.length}.`,
    }
  }

  if (!context.applyPop) {
    return {
      type: 'text',
      value: '/pop is only available in an interactive session.',
    }
  }

  context.applyPop(parsed)
  return { type: 'skip' }
}
