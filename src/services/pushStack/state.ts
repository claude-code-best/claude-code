import type { UUID } from 'crypto'

/**
 * Push/Pop context stack (docs/features/push-pop-context-stack.md).
 *
 * A PushMarker records the point where a discussion branch was opened. `/push`
 * appends one; `/pop` distills everything after it into a digest and rewinds.
 */
export type PushMarker = {
  /** Stable id for the marker (also used as the display "#N" ordinal source). */
  id: string
  /** UUID of the last message at push time — this message stays on the mainline. */
  messageUuid: UUID
  /** Optional free-text note supplied as `/push <note>`. */
  note: string
  /** Epoch ms at push time (for relative-time display in `/push --list`). */
  timestamp: number
  /** Snapshot of the last message text at push time (where the branch forked from). */
  anchorPreview: string
  /** First user message after push (what the branch is about); backfilled lazily. */
  branchPreview?: string
}

/** Options for `/pop` parsed from its flags, passed to the REPL apply callback. */
export type PopOptions = {
  /** `--to #N`: cross-layer pop back to marker ordinal N (1-based). */
  to?: number
  /** `--discard`: truncate without generating a digest. */
  discard?: boolean
  /** `--keep-code`: truncate conversation but do not offer file rollback. */
  keepCode?: boolean
}

/** A push marker as surfaced to the auto-compact strategy picker (§4.2). */
export type CompactStrategyMarker = {
  id: string
  note: string
  /** 1-based ordinal (#1 = oldest). */
  depth: number
}

/**
 * The user's choice in the stack-aware auto-compact dialog (§4.2):
 *   'full'    → run full compaction, dropping every push point.
 *   'partial' → compact up to markerId, keeping it and any newer markers.
 */
export type CompactStrategyChoice =
  | { kind: 'full' }
  | { kind: 'partial'; markerId: string }

/** Max nesting depth for the push stack (§4.3). Beyond this, `/push` errors. */
export const MAX_PUSH_DEPTH = 3

// Write-through mirror of AppState.pushStack. autoCompactIfNeeded /
// shouldAutoCompact run outside the React tree and cannot read AppState, so the
// REPL mirrors the stack here whenever it changes. Read-only for consumers.
let pushStackMirror: PushMarker[] = []

/** Synchronous read of the current push stack (for the auto-compact path). */
export function getPushStackMirror(): readonly PushMarker[] {
  return pushStackMirror
}

/** Called by the REPL to keep the mirror in sync with AppState.pushStack. */
export function setPushStackMirror(stack: readonly PushMarker[]): void {
  pushStackMirror = [...stack]
}
