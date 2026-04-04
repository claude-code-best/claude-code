import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from 'react'
import { saveCurrentProjectConfig } from '../utils/config.js'

export type StatsStore = {
  increment(name: string, value?: number): void
  set(name: string, value: number): void
  observe(name: string, value: number): void
  add(name: string, value: string): void
  getAll(): Record<string, number>
}

function percentile(sorted: number[], p: number): number {
  const index = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) {
    return sorted[lower]!
  }
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (index - lower)
}

const RESERVOIR_SIZE = 1024

type Histogram = {
  reservoir: number[]
  count: number
  sum: number
  min: number
  max: number
}

export function createStatsStore(): StatsStore {
  const metrics = new Map<string, number>()
  const histograms = new Map<string, Histogram>()
  const sets = new Map<string, Set<string>>()

  return {
    increment(name: string, value = 1) {
      metrics.set(name, (metrics.get(name) ?? 0) + value)
    },
    set(name: string, value: number) {
      metrics.set(name, value)
    },
    observe(name: string, value: number) {
      let h = histograms.get(name)
      if (!h) {
        h = { reservoir: [], count: 0, sum: 0, min: value, max: value }
        histograms.set(name, h)
      }
      h.count++
      h.sum += value
      if (value < h.min) {
        h.min = value
      }
      if (value > h.max) {
        h.max = value
      }
      // Reservoir sampling (Algorithm R)
      if (h.reservoir.length < RESERVOIR_SIZE) {
        h.reservoir.push(value)
      } else {
        const j = Math.floor(Math.random() * h.count)
        if (j < RESERVOIR_SIZE) {
          h.reservoir[j] = value
        }
      }
    },
    add(name: string, value: string) {
      let s = sets.get(name)
      if (!s) {
        s = new Set()
        sets.set(name, s)
      }
      s.add(value)
    },
    getAll() {
      const result: Record<string, number> = Object.fromEntries(metrics)

      for (const [name, h] of histograms) {
        if (h.count === 0) {
          continue
        }
        result[`${name}_count`] = h.count
        result[`${name}_min`] = h.min
        result[`${name}_max`] = h.max
        result[`${name}_avg`] = h.sum / h.count
        const sorted = [...h.reservoir].sort((a, b) => a - b)
        result[`${name}_p50`] = percentile(sorted, 50)
        result[`${name}_p95`] = percentile(sorted, 95)
        result[`${name}_p99`] = percentile(sorted, 99)
      }

      for (const [name, s] of sets) {
        result[name] = s.size
      }

      return result
    },
  }
}

export const StatsContext = createContext<StatsStore | null>(null)

type Props = {
  store?: StatsStore
  children: React.ReactNode
}

export function StatsProvider({
  store: externalStore,
  children,
}: Props): React.ReactNode {
  const internalStore = useMemo(() => createStatsStore(), [])
  const store = externalStore ?? internalStore

  useEffect(() => {
    const flush = () => {
      const metrics = store.getAll()
      if (Object.keys(metrics).length > 0) {
        saveCurrentProjectConfig(current => ({
          ...current,
          lastSessionMetrics: metrics,
        }))
      }
    }
    process.on('exit', flush)
    return () => {
      process.off('exit', flush)
    }
  }, [store])

  return <StatsContext.Provider value={store}>{children}</StatsContext.Provider>
}

export function useStats(): StatsStore {
  const store = useContext(StatsContext)
  if (!store) {
    throw new Error('useStats must be used within a StatsProvider')
  }
  return store
}

export function useCounter(name: string): (value?: number) => void {
  const store = useStats()
  return useCallback(
    (value?: number) => store.increment(name, value),
    [store, name],
  )
}

export function useGauge(name: string): (value: number) => void {
  const store = useStats()
  return useCallback((value: number) => store.set(name, value), [store, name])
}

export function useTimer(name: string): (value: number) => void {
  const store = useStats()
  return useCallback(
    (value: number) => store.observe(name, value),
    [store, name],
  )
}

export function useSet(name: string): (value: string) => void {
  const store = useStats()
  return useCallback((value: string) => store.add(name, value), [store, name])
}
