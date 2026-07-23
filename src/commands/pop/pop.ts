import type { LocalCommandResult } from '../../commands.js'
import type { ToolUseContext } from '../../Tool.js'
import type { PopOptions } from '../../services/pushStack/state.js'

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
      const n = Number.parseInt(next.replace(/^#/, ''), 10)
      if (!Number.isInteger(n) || n < 1) return `Invalid marker number: ${next}`
      opts.to = n
    } else if (tok.startsWith('--to=')) {
      const n = Number.parseInt(tok.slice('--to='.length).replace(/^#/, ''), 10)
      if (!Number.isInteger(n) || n < 1) return `Invalid marker number: ${tok}`
      opts.to = n
    } else {
      return `Unknown option: ${tok}`
    }
  }
  return opts
}

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
