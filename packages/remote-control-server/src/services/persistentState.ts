import { closePersistence, initializePersistence } from '../persistence/runtime'
import { storeHydratePersistentState } from '../store'
import { runDisconnectMonitorSweep } from './disconnect-monitor'

export function initializePersistentState(dbPath: string, now?: number): void {
  initializePersistence(dbPath)
  storeHydratePersistentState()
  runDisconnectMonitorSweep(now)
}

export function closePersistentState(): void {
  closePersistence()
}
