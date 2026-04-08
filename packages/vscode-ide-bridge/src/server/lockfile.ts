import { mkdir, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { LockfilePayload } from './protocol.js'

type BuildLockfilePayloadInput = {
  pid: number
  ideName: string
  workspaceFolders: string[]
  authToken: string
  runningInWindows: boolean
}

function getClaudeConfigDir(): string {
  return (process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')).normalize(
    'NFC',
  )
}

export function buildLockfilePayload(
  input: BuildLockfilePayloadInput,
): LockfilePayload {
  return {
    workspaceFolders: input.workspaceFolders,
    pid: input.pid,
    ideName: input.ideName,
    transport: 'ws',
    runningInWindows: input.runningInWindows,
    authToken: input.authToken,
  }
}

export function getLockfileDir(): string {
  return join(getClaudeConfigDir(), 'ide')
}

export function getLockfilePath(port: number): string {
  return join(getLockfileDir(), `${port}.lock`)
}

export async function writeLockfile(
  port: number,
  payload: LockfilePayload,
): Promise<string> {
  const lockfilePath = getLockfilePath(port)
  await mkdir(getLockfileDir(), { recursive: true })
  await writeFile(lockfilePath, JSON.stringify(payload), 'utf8')
  return lockfilePath
}

export async function removeLockfile(lockfilePath: string | null): Promise<void> {
  if (!lockfilePath) {
    return
  }
  await rm(lockfilePath, { force: true })
}
