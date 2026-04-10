// Auto-generated stub — replace with real implementation
export {}

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

export const isCachedMicrocompactEnabled: () => boolean = () => false
export const isModelSupportedForCacheEditing: (model: string) => boolean = () =>
  false
export const getCachedMCConfig: () => {
  triggerThreshold: number
  keepRecent: number
} = () => ({ triggerThreshold: 0, keepRecent: 0 })
export const createCachedMCState: () => CachedMCState = () => ({
  registeredTools: new Set(),
  toolOrder: [],
  deletedRefs: new Set(),
  pinnedEdits: [],
  toolsSentToAPI: false,
})
export const markToolsSentToAPI: (state: CachedMCState) => void = () => {}
export const resetCachedMCState: (state: CachedMCState) => void = () => {}
export const registerToolResult: (
  state: CachedMCState,
  toolId: string,
) => void = () => {}
export const registerToolMessage: (
  state: CachedMCState,
  groupIds: string[],
) => void = () => {}
export const getToolResultsToDelete: (state: CachedMCState) => string[] =
  () => []
export const createCacheEditsBlock: (
  state: CachedMCState,
  toolIds: string[],
) => CacheEditsBlock | null = () => null
