import { logForDebugging } from './debug.js'

/**
 * In-memory file content cache for attribution diffing.
 * Keyed by normalized file path → last known content string.
 * Used to compute character-level diffs when file tools report changes.
 */
const fileContentCache = new Map<string, string>()

/**
 * Clear all attribution-related caches.
 * Called from `clear/caches.ts` when user runs /clear caches.
 */
export function clearAttributionCaches(): void {
  const size = fileContentCache.size
  fileContentCache.clear()
  logForDebugging(`Attribution: cleared ${size} cached file entries`)
}

/**
 * Remove stale entries from the file content cache.
 * Called from `postCompactCleanup.ts` after conversation compaction
 * to prevent unbounded memory growth in long sessions.
 *
 * Strategy: remove entries older than the compaction boundary.
 * Since we don't track timestamps per entry, we simply cap the cache
 * to a reasonable size by removing the oldest half when over limit.
 */
const MAX_CACHE_ENTRIES = 500

export function sweepFileContentCache(): void {
  if (fileContentCache.size <= MAX_CACHE_ENTRIES) {
    return
  }

  // Remove oldest entries (first half of iteration order = oldest inserts)
  const toRemove = Math.floor(fileContentCache.size / 2)
  let removed = 0
  for (const key of fileContentCache.keys()) {
    if (removed >= toRemove) break
    fileContentCache.delete(key)
    removed++
  }
  logForDebugging(
    `Attribution: swept ${removed} stale cache entries (${fileContentCache.size} remaining)`,
  )
}

/**
 * Register PostToolUse hooks for attribution file change tracking.
 * Called from `setup.ts` at startup when COMMIT_ATTRIBUTION is enabled.
 *
 * The primary file tracking (FileEditTool, FileWriteTool) is handled
 * inline within those tools via commitAttribution.ts. These hooks
 * provide supplementary tracking for bash-created files and cache
 * management.
 */
export function registerAttributionHooks(): void {
  logForDebugging('Attribution: hooks registered')
  // The file content cache is populated lazily by tool execution paths
  // that call into commitAttribution.ts. No PostToolUse hooks are needed
  // here because the tool implementations already call trackFileModification
  // / trackFileCreation / trackFileDeletion directly.
  //
  // This function exists as the extension point for future supplementary
  // tracking (e.g., detecting file changes made by bash commands via
  // fs.watch or git-diff post-hoc analysis).
}
