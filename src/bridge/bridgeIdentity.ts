import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { normalize, resolve } from 'node:path'

import { getClaudeConfigHomeDir } from '../utils/envUtils.js'

export const BRIDGE_DEVICE_IDENTITY_FILENAME = 'remote-control-device.json'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type StoredBridgeDeviceIdentity = {
  version: 1
  device_id: string
}

export type BridgeIdentity = {
  deviceId: string
  deviceName: string
  workspaceKey: string
  connectionId: string
}

function errnoCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined
}

async function readStoredDeviceId(path: string): Promise<string | null> {
  try {
    const parsed = JSON.parse(
      await readFile(path, 'utf8'),
    ) as Partial<StoredBridgeDeviceIdentity>
    return parsed.version === 1 &&
      typeof parsed.device_id === 'string' &&
      UUID_PATTERN.test(parsed.device_id)
      ? parsed.device_id
      : null
  } catch {
    return null
  }
}

function serializeDeviceIdentity(deviceId: string): string {
  return `${JSON.stringify({ version: 1, device_id: deviceId })}\n`
}

export async function loadOrCreateBridgeDeviceId(
  configDir = getClaudeConfigHomeDir(),
): Promise<string> {
  const path = resolve(configDir, BRIDGE_DEVICE_IDENTITY_FILENAME)
  const stored = await readStoredDeviceId(path)
  if (stored) return stored

  await mkdir(configDir, { recursive: true })
  const deviceId = randomUUID()

  try {
    await writeFile(path, serializeDeviceIdentity(deviceId), {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    })
    return deviceId
  } catch (error) {
    if (errnoCode(error) === 'EEXIST') {
      const raced = await readStoredDeviceId(path)
      if (raced) return raced
    } else {
      throw error
    }
  }

  const replacement = `${path}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(replacement, serializeDeviceIdentity(deviceId), {
    encoding: 'utf8',
    mode: 0o600,
  })
  await rename(replacement, path)
  return (await readStoredDeviceId(path)) ?? deviceId
}

function normalizeWorkspacePath(dir: string): string {
  const normalized = normalize(resolve(dir)).replaceAll('\\', '/')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

export function deriveWorkspaceKey(
  dir: string,
  gitRepoUrl: string | null,
): string {
  const identity = JSON.stringify({
    directory: normalizeWorkspacePath(dir),
    git_repo_url: gitRepoUrl?.trim().replace(/\/+$/, '') || null,
  })
  return `wrk_${createHash('sha256').update(identity).digest('hex').slice(0, 32)}`
}

export async function createBridgeIdentity(options: {
  configDir?: string
  dir: string
  gitRepoUrl: string | null
  deviceName: string
}): Promise<BridgeIdentity> {
  return {
    deviceId: await loadOrCreateBridgeDeviceId(options.configDir),
    deviceName: options.deviceName,
    workspaceKey: deriveWorkspaceKey(options.dir, options.gitRepoUrl),
    connectionId: randomUUID(),
  }
}
