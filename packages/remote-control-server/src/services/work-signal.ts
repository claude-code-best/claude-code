type WorkSignalState = {
  generation: number
  waiters: Set<() => void>
}

const signals = new Map<string, WorkSignalState>()

function getSignal(environmentId: string): WorkSignalState {
  let signal = signals.get(environmentId)
  if (!signal) {
    signal = { generation: 0, waiters: new Set() }
    signals.set(environmentId, signal)
  }
  return signal
}

export function getWorkSignalGeneration(environmentId: string): number {
  return getSignal(environmentId).generation
}

export function notifyWorkAvailable(environmentId: string): void {
  const signal = getSignal(environmentId)
  signal.generation++
  for (const wake of [...signal.waiters]) wake()
}

export function waitForWorkSignal(
  environmentId: string,
  generation: number,
  timeoutMs: number,
): Promise<void> {
  if (timeoutMs <= 0) return Promise.resolve()

  const signal = getSignal(environmentId)
  if (signal.generation !== generation) return Promise.resolve()

  return new Promise(resolve => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = () => {
      if (settled) return
      settled = true
      signal.waiters.delete(finish)
      if (timer) clearTimeout(timer)
      resolve()
    }

    signal.waiters.add(finish)
    if (signal.generation !== generation) {
      finish()
      return
    }
    timer = setTimeout(finish, timeoutMs)
  })
}
