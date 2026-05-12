import * as React from 'react'
import {
  subscribeToSearchExtraToolsPrefetch,
  getSearchExtraToolsPrefetchSnapshot,
  clearSearchExtraToolsPrefetchResults,
  type ToolDiscoveryResult,
} from 'src/services/searchExtraTools/prefetch.js'

type SearchExtraToolsHintItem = {
  name: string
  description: string
  score: number
}

type SearchExtraToolsHintResult = {
  tools: SearchExtraToolsHintItem[]
  visible: boolean
  handleSelect: (toolName: string) => void
  handleDismiss: () => void
}

const MAX_HINT_SCORE = 0.15
const MAX_HINT_TOOLS = 3

export function useSearchExtraToolsHint(): SearchExtraToolsHintResult {
  const prefetchResult = React.useSyncExternalStore(
    subscribeToSearchExtraToolsPrefetch,
    getSearchExtraToolsPrefetchSnapshot,
  )

  const tools: SearchExtraToolsHintItem[] = React.useMemo(() => {
    if (prefetchResult.length === 0) return []
    return prefetchResult
      .slice(0, MAX_HINT_TOOLS)
      .map((r: ToolDiscoveryResult) => ({
        name: r.name,
        description: r.description.slice(0, 60),
        score: r.score,
      }))
  }, [prefetchResult])

  const visible = tools.length > 0 && (tools[0]?.score ?? 0) >= MAX_HINT_SCORE

  const handleSelect = React.useCallback((_toolName: string) => {
    clearSearchExtraToolsPrefetchResults()
  }, [])

  const handleDismiss = React.useCallback(() => {
    clearSearchExtraToolsPrefetchResults()
  }, [])

  return { tools, visible, handleSelect, handleDismiss }
}
