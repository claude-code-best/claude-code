/**
 * Cached Microcompact configuration.
 *
 * In upstream, config comes from GrowthBook. In this fork, we use
 * sensible defaults that can be overridden via environment variables.
 */
import { logForDebugging } from 'src/utils/debug.js'

export function getCachedMCConfig(): {
  enabled?: boolean
  systemPromptSuggestSummaries?: boolean
  supportedModels?: string[]
  triggerThreshold?: number
  keepRecent?: number
  [key: string]: unknown
} {
  const triggerThreshold = parseInt(
    process.env.CACHED_MC_TRIGGER_THRESHOLD ?? '10',
    10,
  )
  const keepRecent = parseInt(process.env.CACHED_MC_KEEP_RECENT ?? '5', 10)

  return {
    enabled: true,
    systemPromptSuggestSummaries: true,
    // Models that support cache editing — Claude 3.5+ and all Claude 4.x
    supportedModels: [
      'claude-sonnet-4',
      'claude-opus-4',
      'claude-haiku-4',
      'claude-3-5-sonnet',
      'claude-3-5-haiku',
      'claude-sonnet-4-5',
      'claude-opus-4-5',
      'claude-sonnet-4-6',
      'claude-opus-4-6',
      'claude-opus-4-7',
    ],
    triggerThreshold,
    keepRecent,
  }
}
