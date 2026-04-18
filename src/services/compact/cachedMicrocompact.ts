/**
 * Cached Microcompact — KV cache deletion for efficient context management.
 *
 * Instead of rewriting the conversation (traditional compact), this tells
 * the Anthropic API to delete specific cached tool_result entries via
 * cache_edits blocks. The API responds with cache_deleted_input_tokens.
 */
import { feature } from 'bun:bundle'
import { logForDebugging } from 'src/utils/debug.js'
import { getCachedMCConfig as getConfigFromModule } from './cachedMCConfig.js'

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

export function isCachedMicrocompactEnabled(): boolean {
  if (feature('CACHED_MICROCOMPACT')) {
    return true
  }
  return false
}

export function isModelSupportedForCacheEditing(model: string): boolean {
  const config = getConfigFromModule()
  const supported = config.supportedModels ?? []
  if (supported.length === 0) return false
  const norm = model.toLowerCase()
  return supported.some(m => norm.includes(m.toLowerCase()))
}

export function getCachedMCConfig(): {
  triggerThreshold: number
  keepRecent: number
} {
  const config = getConfigFromModule()
  return {
    triggerThreshold: (config.triggerThreshold as number) ?? 10,
    keepRecent: (config.keepRecent as number) ?? 5,
  }
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
  // Groups implicitly tracked via toolOrder
}

export function getToolResultsToDelete(state: CachedMCState): string[] {
  const { triggerThreshold, keepRecent } = getCachedMCConfig()
  if (state.toolOrder.length < triggerThreshold) return []
  const deleteCount = state.toolOrder.length - keepRecent
  if (deleteCount <= 0) return []
  const toDelete: string[] = []
  for (let i = 0; i < deleteCount; i++) {
    const id = state.toolOrder[i]!
    if (!state.deletedRefs.has(id)) toDelete.push(id)
  }
  return toDelete
}

export function createCacheEditsBlock(
  state: CachedMCState,
  toolIds: string[],
): CacheEditsBlock | null {
  if (toolIds.length === 0) return null
  for (const id of toolIds) state.deletedRefs.add(id)
  return {
    type: 'cache_edits',
    edits: toolIds.map(id => ({ type: 'delete_tool_result', tool_use_id: id })),
  }
}
