/**
 * Shared infrastructure for profiler modules (startupProfiler, queryProfiler,
 * headlessProfiler).
 *
 * Uses process.hrtime.bigint() for timing instead of perf_hooks.performance
 * to avoid a Bun/JSC memory leak: JSC's Performance object stores marks in a
 * C++ Vector that never shrinks even after clearMarks(). Long-running sessions
 * (daemon, /loop) accumulate hundreds of MB of dead capacity.
 *
 * The LightweightPerf class provides the same interface the profilers need
 * (mark, getEntriesByType, clearMarks, now) backed by a plain JS Map.
 */

import { formatFileSize } from './format.js'

/** Minimal PerformanceEntry-like object used by profilers */
export interface CheckpointEntry {
  readonly name: string
  readonly startTime: number
  readonly entryType: 'mark'
}

/**
 * Lightweight replacement for perf_hooks.performance that stores marks in a
 * plain JavaScript Map instead of JSC's C++ Vector. This avoids the memory
 * leak where clearMarks() sets the count to 0 but never frees Vector capacity.
 */
class LightweightPerf {
  private marks = new Map<string, number>()
  private _origin: number

  constructor() {
    this._origin = Number(process.hrtime.bigint() / 1000n) / 1000
  }

  mark(name: string): void {
    this.marks.set(name, this.now())
  }

  getEntriesByType(type: 'mark'): CheckpointEntry[] {
    if (type !== 'mark') return []
    const entries: CheckpointEntry[] = []
    for (const [name, startTime] of this.marks) {
      entries.push({ name, startTime, entryType: 'mark' })
    }
    return entries
  }

  clearMarks(name?: string): void {
    if (name !== undefined) {
      this.marks.delete(name)
    } else {
      this.marks.clear()
    }
  }

  now(): number {
    return Number(process.hrtime.bigint() / 1000n) / 1000 - this._origin
  }
}

// Singleton — shared across all profilers (same as the old perf_hooks singleton)
const perf = new LightweightPerf()

export function getPerformance(): LightweightPerf {
  return perf
}

export function formatMs(ms: number): string {
  return ms.toFixed(3)
}

/**
 * Render a single timeline line in the shared profiler report format:
 *   [+  total.ms] (+  delta.ms) name [extra] [| RSS: .., Heap: ..]
 *
 * totalPad/deltaPad control the padStart width so callers can align columns
 * based on their expected magnitude (startup uses 8/7, query uses 10/9).
 */
export function formatTimelineLine(
  totalMs: number,
  deltaMs: number,
  name: string,
  memory: NodeJS.MemoryUsage | undefined,
  totalPad: number,
  deltaPad: number,
  extra = '',
): string {
  const memInfo = memory
    ? ` | RSS: ${formatFileSize(memory.rss)}, Heap: ${formatFileSize(memory.heapUsed)}`
    : ''
  return `[+${formatMs(totalMs).padStart(totalPad)}ms] (+${formatMs(deltaMs).padStart(deltaPad)}ms) ${name}${extra}${memInfo}`
}
