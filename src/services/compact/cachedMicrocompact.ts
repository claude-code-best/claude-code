export type CachedMCState = {
  registeredTools: Set<string>
  toolOrder: string[]
  deletedRefs: Set<string>
  pinnedEdits: PinnedCacheEdits[]
  toolsSentToAPI: boolean
}

export type CacheEditsBlock = {
  type: 'cache_edits'
  edits: Array<{ type: string; tool_use_id: string }>
}

export type PinnedCacheEdits = {
  userMessageIndex: number
  block: CacheEditsBlock
}

const TRIGGER_THRESHOLD = 10
const KEEP_RECENT = 5

/**
 * Returns true when the CLAUDE_CACHED_MICROCOMPACT env var is set to '1'
 * or the feature is explicitly enabled.
 */
export function isCachedMicrocompactEnabled(): boolean {
  return process.env.CLAUDE_CACHED_MICROCOMPACT === '1'
}

/**
 * Returns true for Claude 4.x models that support cache_edits.
 */
export function isModelSupportedForCacheEditing(model: string): boolean {
  return /claude-[a-z]+-4[-\d]/.test(model)
}

export function getCachedMCConfig(): {
  triggerThreshold: number
  keepRecent: number
} {
  return { triggerThreshold: TRIGGER_THRESHOLD, keepRecent: KEEP_RECENT }
}

export function createCachedMCState(): CachedMCState {
  return {
    registeredTools: new Set(),
    toolOrder: [],
    deletedRefs: new Set(),
    pinnedEdits: [],
    toolsSentToAPI: false,
  }
}

export function markToolsSentToAPI(state: CachedMCState): void {
  state.toolsSentToAPI = true
}

export function resetCachedMCState(state: CachedMCState): void {
  state.registeredTools.clear()
  state.toolOrder = []
  state.deletedRefs.clear()
  state.pinnedEdits = []
  state.toolsSentToAPI = false
}

export function registerToolResult(state: CachedMCState, toolId: string): void {
  if (!state.registeredTools.has(toolId)) {
    state.registeredTools.add(toolId)
    state.toolOrder.push(toolId)
  }
}

export function registerToolMessage(
  state: CachedMCState,
  groupIds: string[],
): void {
  for (const id of groupIds) {
    registerToolResult(state, id)
  }
}

/**
 * Returns the tool IDs that should be deleted (oldest first) to bring
 * the count below the threshold, excluding already-deleted tools and
 * the most recently seen ones.
 */
export function getToolResultsToDelete(state: CachedMCState): string[] {
  const { triggerThreshold, keepRecent } = getCachedMCConfig()
  const active = state.toolOrder.filter(id => !state.deletedRefs.has(id))
  if (active.length <= triggerThreshold) return []
  // Keep the last keepRecent tools
  const toDelete = active.slice(0, active.length - keepRecent)
  return toDelete
}

/**
 * Creates a cache_edits block that deletes the given tool result IDs.
 * Returns null if toolIds is empty.
 */
export function createCacheEditsBlock(
  state: CachedMCState,
  toolIds: string[],
): CacheEditsBlock | null {
  if (toolIds.length === 0) return null
  return {
    type: 'cache_edits',
    edits: toolIds.map(id => ({
      type: 'delete_tool_result',
      tool_use_id: id,
    })),
  }
}
