/**
 * Memory Shape Telemetry — track patterns of memory read/write operations.
 *
 * Logs structured events about which memories are recalled (and how many
 * are selected vs. available) and which files are written to memory dirs.
 */
import type { MemoryHeader } from './memoryScan.js'
import type { MemoryScope } from '../utils/memoryFileDetection.js'
import { logForDebugging } from '../utils/debug.js'

/**
 * Log memory recall shape — how many memories were available vs. selected.
 * Called from findRelevantMemories after filtering.
 */
export function logMemoryRecallShape(
  memories: MemoryHeader[],
  selected: MemoryHeader[],
): void {
  const types = new Map<string, number>()
  for (const m of selected) {
    const t = ((m as Record<string, unknown>).type as string) ?? 'unknown'
    types.set(t, (types.get(t) ?? 0) + 1)
  }

  logForDebugging(
    `[memory-shape] recall: ${selected.length}/${memories.length} selected, types=${JSON.stringify(Object.fromEntries(types))}`,
  )
}

/**
 * Log memory write shape — what tool wrote to which memory file.
 * Called from sessionFileAccessHooks when a memory file is modified.
 */
export function logMemoryWriteShape(
  toolName: string,
  toolInput: Record<string, unknown>,
  filePath: string,
  scope: MemoryScope,
): void {
  logForDebugging(
    `[memory-shape] write: tool=${toolName} scope=${scope} path=${filePath}`,
  )
}
