type WorkSignalState = {
  controlGeneration: number
  sessionGeneration: number
  mixedGeneration: number
  controlWaiters: Set<() => void>
  sessionWaiters: Set<() => void>
  mixedWaiters: Set<() => void>
}

export type WorkLane = 'control' | 'session' | 'mixed'

const signals = new Map<string, WorkSignalState>()

function getSignal(environmentId: string): WorkSignalState {
  let signal = signals.get(environmentId)
  if (!signal) {
    signal = {
      controlGeneration: 0,
      sessionGeneration: 0,
      mixedGeneration: 0,
      controlWaiters: new Set(),
      sessionWaiters: new Set(),
      mixedWaiters: new Set(),
    }
    signals.set(environmentId, signal)
  }
  return signal
}

export function getWorkSignalGeneration(
  environmentId: string,
  lane: WorkLane = 'mixed',
): number {
  const signal = getSignal(environmentId)
  return lane === 'control'
    ? signal.controlGeneration
    : lane === 'session'
      ? signal.sessionGeneration
      : signal.mixedGeneration
}

export function notifyWorkAvailable(
  environmentId: string,
  lane: WorkLane | 'both' = 'both',
): void {
  const signal = getSignal(environmentId)
  const notify = (waiters: Set<() => void>) => {
    for (const wake of [...waiters]) wake()
  }
  if (lane === 'control' || lane === 'both') {
    signal.controlGeneration++
    notify(signal.controlWaiters)
  }
  if (lane === 'session' || lane === 'both') {
    signal.sessionGeneration++
    notify(signal.sessionWaiters)
  }
  signal.mixedGeneration++
  notify(signal.mixedWaiters)
}

export function waitForWorkSignal(
  environmentId: string,
  generation: number,
  timeoutMs: number,
  lane: WorkLane = 'mixed',
): Promise<void> {
  if (timeoutMs <= 0) return Promise.resolve()

  const signal = getSignal(environmentId)
  const currentGeneration =
    lane === 'control'
      ? signal.controlGeneration
      : lane === 'session'
        ? signal.sessionGeneration
        : signal.mixedGeneration
  if (currentGeneration !== generation) return Promise.resolve()

  const waiters =
    lane === 'control'
      ? signal.controlWaiters
      : lane === 'session'
        ? signal.sessionWaiters
        : signal.mixedWaiters

  return new Promise(resolve => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = () => {
      if (settled) return
      settled = true
      waiters.delete(finish)
      if (timer) clearTimeout(timer)
      resolve()
    }

    waiters.add(finish)
    const latestGeneration =
      lane === 'control'
        ? signal.controlGeneration
        : lane === 'session'
          ? signal.sessionGeneration
          : signal.mixedGeneration
    if (latestGeneration !== generation) {
      finish()
      return
    }
    timer = setTimeout(finish, timeoutMs)
  })
}
