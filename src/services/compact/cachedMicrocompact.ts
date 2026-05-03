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
//超过TRIGGER_THRESHOLD条工具结果，则启动 microcompact 压缩。
const TRIGGER_THRESHOLD = 10
//启动 microcompact 压缩后，保留最近的KEEP_RECENT条工具结果。
const KEEP_RECENT = 5

/** 当 CLAUDE_CACHED_MICROCOMPACT 环境变量设置为 '1' 或该功能被显式启用时，返回 true。 */
export function isCachedMicrocompactEnabled(): boolean {
  return process.env.CLAUDE_CACHED_MICROCOMPACT === '1'
}

/** 对于支持 cache_edits 的 Claude 4.x 模型，返回 true。 */
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

/** 返回应被删除的工具 ID（按从旧到新的顺序），以使数量低于阈值，排除已删除的工具和最近出现的工具。 */
export function getToolResultsToDelete(state: CachedMCState): string[] {
  const { triggerThreshold, keepRecent } = getCachedMCConfig()
  const active = state.toolOrder.filter(id => !state.deletedRefs.has(id))
  if (active.length <= triggerThreshold) return []
  // 保留最近 keepRecent 个工具
  const toDelete = active.slice(0, active.length - keepRecent)
  return toDelete
}

/** 创建一个 cache_edits 块，用于删除给定的工具结果 ID。如果 toolIds 为空，则返回 null。 */
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
