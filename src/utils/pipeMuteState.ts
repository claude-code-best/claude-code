/**
 * pipeMuteState — Master-side logical disconnect state.
 *
 * Tracks which slave pipes are currently "muted" (logically disconnected)
 * and which have a temporary `/send` override active.
 *
 * This is local master state only — not part of the socket protocol.
 */

// ---------------------------------------------------------------------------
// Muted set: slaves whose business messages should be dropped by master
// ---------------------------------------------------------------------------

const _mutedPipes = new Set<string>()

export function setMasterMutedPipes(names: Iterable<string>): void {
  _mutedPipes.clear()
  for (const n of names) _mutedPipes.add(n)
}

export function isMasterPipeMuted(name: string): boolean {
  return _mutedPipes.has(name)
}

export function removeMasterPipeMute(name: string): void {
  _mutedPipes.delete(name)
}

export function clearMasterMutedPipes(): void {
  _mutedPipes.clear()
}

// ---------------------------------------------------------------------------
// Send override set: slaves temporarily unmuted by explicit `/send` command.
// Override lasts until the slave emits `done` or `error`.
// ---------------------------------------------------------------------------

const _sendOverrides = new Set<string>()
let _sendOverrideVersion = 0
const _sendOverrideListeners = new Set<() => void>()

function emitSendOverrideChanged(): void {
  _sendOverrideVersion += 1
  for (const listener of _sendOverrideListeners) {
    listener()
  }
}

export function addSendOverride(name: string): void {
  _sendOverrides.add(name)
  emitSendOverrideChanged()
}

export function removeSendOverride(name: string): void {
  if (_sendOverrides.delete(name)) {
    emitSendOverrideChanged()
  }
}

export function hasSendOverride(name: string): boolean {
  return _sendOverrides.has(name)
}

export function clearSendOverrides(): void {
  if (_sendOverrides.size > 0) {
    _sendOverrides.clear()
    emitSendOverrideChanged()
  }
}

export function subscribeSendOverride(listener: () => void): () => void {
  _sendOverrideListeners.add(listener)
  return () => {
    _sendOverrideListeners.delete(listener)
  }
}

export function getSendOverrideVersion(): number {
  return _sendOverrideVersion
}
