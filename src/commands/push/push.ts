import type { LocalCommandResult } from '../../commands.js'
import type { ToolUseContext } from '../../Tool.js'
import type { PushMarker } from '../../services/pushStack/state.js'
import { formatRelativeTimeAgo } from '../../utils/format.js'

/**
 * Renders `/push --list`: the current push stack, newest last, numbered #1..#N.
 * Pure local read of AppState.pushStack — zero API tokens, no fork (§4.7).
 */
function renderStackList(stack: readonly PushMarker[]): string {
  if (stack.length === 0) {
    return 'No active push points. Use /push [note] to open a discussion branch.'
  }
  const now = new Date()
  const lines = stack.map((m, i) => {
    const depth = i + 1
    const when = formatRelativeTimeAgo(new Date(m.timestamp), {
      style: 'short',
      now,
    })
    // branchPreview (what the branch is about) wins over anchorPreview
    // (where it forked from); both are truncated original conversation text.
    const preview = m.branchPreview || m.anchorPreview || ''
    const note = m.note ? ` · ${m.note}` : ''
    const previewPart = preview ? ` · ${preview}` : ''
    return `#${depth}${note}${previewPart} · ${when} · depth ${depth}`
  })
  return `Push stack (${stack.length}):\n${lines.join('\n')}`
}

export async function call(
  args: string,
  context: ToolUseContext,
): Promise<LocalCommandResult> {
  const trimmed = args.trim()

  // `/push --list` (or `/stack --list`) lists the stack. Note: a bare
  // `/push list` would be swallowed as a note, so a flag is required (§4.7).
  if (trimmed === '--list' || trimmed === '-l') {
    const stack = context.getAppState().pushStack
    return { type: 'text', value: renderStackList(stack) }
  }

  if (!context.pushContextMark) {
    return {
      type: 'text',
      value: '/push is only available in an interactive session.',
    }
  }

  context.pushContextMark(trimmed)
  return { type: 'skip' }
}
