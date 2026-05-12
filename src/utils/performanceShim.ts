/**
 * Performance shim — replaces globalThis.performance to prevent JSC's C++ Vector
 * from growing without bound.
 *
 * In Bun, globalThis.performance is JSC's native Performance object. It stores
 * marks, measures, and resource timings in a C++ Vector that never shrinks even
 * after clearMarks(). Long-running sessions (daemon, /loop) accumulate hundreds
 * of MB of dead capacity.
 *
 * This shim keeps performance.now() on the native object (fast, no memory cost)
 * but redirects mark/measure/getEntries operations to a plain JS Map that the GC
 * can reclaim. Third-party code (React reconciler, OTel/Langfuse) uses
 * performance.now() for timing — that stays native. The accumulating operations
 * go to GC-able JS memory instead.
 *
 * MUST be installed before React/OTel import — see cli.tsx first import.
 */

const original = globalThis.performance

// JS-backed storage — fully GC-able
const marks = new Map<string, number>()
const measures = new Map<
  string,
  { name: string; startTime: number; duration: number }
>()

function now(): number {
  return original.now()
}

function mark(name: string): PerformanceMark {
  marks.set(name, now())
  // Return a minimal PerformanceMark-like object to satisfy the interface.
  // React/OTel only use mark() for side effects, not the return value.
  return {
    name,
    entryType: 'mark',
    startTime: marks.get(name)!,
    duration: 0,
  } as PerformanceMark
}

function measure(
  name: string,
  startMarkOrOptions?: string | MeasureOptions,
  endMark?: string,
): void {
  let startTime: number
  let duration: number

  if (typeof startMarkOrOptions === 'string') {
    const start = marks.get(startMarkOrOptions)
    const end = endMark ? marks.get(endMark) : now()
    startTime = start ?? now()
    duration = (end ?? now()) - startTime
  } else if (startMarkOrOptions && typeof startMarkOrOptions === 'object') {
    startTime = startMarkOrOptions.start ?? 0
    duration = (startMarkOrOptions.end ?? now()) - startTime
  } else {
    startTime = 0
    duration = now()
  }

  measures.set(name, { name, startTime, duration })
}

interface MeasureOptions {
  start?: number
  end?: number
  detail?: unknown
}

interface PerformanceEntryLike {
  readonly name: string
  readonly entryType: string
  readonly startTime: number
  readonly duration: number
}

function getEntriesByType(type: string): PerformanceEntryLike[] {
  if (type === 'mark') {
    return [...marks.entries()].map(([name, startTime]) => ({
      name,
      entryType: 'mark',
      startTime,
      duration: 0,
    }))
  }
  if (type === 'measure') {
    return [...measures.values()].map(m => ({
      name: m.name,
      entryType: 'measure',
      startTime: m.startTime,
      duration: m.duration,
    }))
  }
  return []
}

function getEntriesByName(name: string, type?: string): PerformanceEntryLike[] {
  const entries = getEntriesByType(type ?? 'mark').concat(
    type === undefined ? getEntriesByType('measure') : [],
  )
  return entries.filter(e => e.name === name)
}

function clearMarks(name?: string): void {
  if (name !== undefined) {
    marks.delete(name)
  } else {
    marks.clear()
  }
}

function clearMeasures(name?: string): void {
  if (name !== undefined) {
    measures.delete(name)
  } else {
    measures.clear()
  }
}

// Plain object shim — must NOT inherit from Performance.prototype because
// native getters (onresourcetimingbufferfull, timeOrigin, toJSON) check
// that `this` is an actual JSC Performance instance and throw otherwise.
const shim = {
  now,
  mark,
  measure: measure as typeof performance.measure,
  getEntriesByType: getEntriesByType as typeof performance.getEntriesByType,
  getEntriesByName: getEntriesByName as typeof performance.getEntriesByName,
  clearMarks: clearMarks as typeof performance.clearMarks,
  clearMeasures: clearMeasures as typeof performance.clearMeasures,
  clearResourceTimings: (() => {}) as typeof performance.clearResourceTimings,
  setResourceTimingBufferSize:
    (() => {}) as typeof performance.setResourceTimingBufferSize,
  // Delegate read-only properties to the original
  get timeOrigin() {
    return original.timeOrigin
  },
  get onresourcetimingbufferfull() {
    return (original as any).onresourcetimingbufferfull
  },
  set onresourcetimingbufferfull(_v: any) {
    // no-op — prevent accumulation
  },
  toJSON() {
    return original.toJSON()
  },
} as typeof performance

/**
 * Install the shim onto globalThis.performance. Safe to call multiple times.
 * Must run before React and OTel import to prevent them from capturing the
 * native Performance reference.
 */
export function installPerformanceShim(): void {
  if ((globalThis as any).__performanceShimInstalled) return
  ;(globalThis as any).__performanceShimInstalled = true
  globalThis.performance = shim
}

// Auto-install on import
installPerformanceShim()
