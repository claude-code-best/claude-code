// Auto-generated stub — replace with real implementation

export interface ServerLockInfo {
  pid: number
  port: number
  host: string
  httpUrl: string
  startedAt: number
}

export const writeServerLock: (info: ServerLockInfo) => Promise<void> =
  async () => {}
export const removeServerLock: () => Promise<void> = async () => {}
export const probeRunningServer: () => Promise<ServerLockInfo | null> =
  async () => null
