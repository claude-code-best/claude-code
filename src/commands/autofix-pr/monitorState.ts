type MonitorState = {
  taskId: string
  owner: string
  repo: string
  prNumber: number
  abortController: AbortController
  startedAt: number
}

let active: MonitorState | null = null

export function getActiveMonitor(): Readonly<MonitorState> | null {
  return active
}

/**
 * Atomic check-and-set. Returns true if the lock was acquired, false if a
 * monitor is already active. Use this instead of getActiveMonitor + setActiveMonitor
 * — those two together race because the caller may await between them.
 */
export function trySetActiveMonitor(state: MonitorState): boolean {
  if (active) return false
  active = state
  return true
}

/**
 * Sets the active monitor unconditionally. Throws if a monitor is already
 * active. Prefer trySetActiveMonitor for race-free acquisition.
 */
export function setActiveMonitor(state: MonitorState): void {
  if (active)
    throw new Error(`Monitor already active: ${active.repo}#${active.prNumber}`)
  active = state
}

/**
 * Releases the active monitor. If `taskId` is provided, only releases when the
 * active monitor's taskId matches — prevents a late-arriving cleanup from
 * clobbering a freshly-acquired lock owned by a different task.
 */
export function clearActiveMonitor(taskId?: string): void {
  if (!active) return
  if (taskId && active.taskId !== taskId) return
  active.abortController.abort()
  active = null
}

/**
 * Atomically merges partial updates into the active monitor. Returns true if
 * applied, false if no active monitor. Used when the caller needs to swap the
 * lock's taskId after the framework assigns a different one than the
 * tentative one used to acquire the lock — without this the framework's
 * cleanup (clearActiveMonitor with the framework taskId) would no-op against
 * a lock keyed by the caller's tentative id.
 */
export function updateActiveMonitor(partial: Partial<MonitorState>): boolean {
  if (!active) return false
  active = { ...active, ...partial }
  return true
}

export function isMonitoring(
  owner: string,
  repo: string,
  prNumber: number,
): boolean {
  return (
    active?.owner === owner &&
    active?.repo === repo &&
    active?.prNumber === prNumber
  )
}
