/**
 * Pipe Registry — central registry for multi-instance pipe coordination.
 *
 * Manages a shared registry.json that tracks all CLI instances (main + subs).
 * Main role is bound to machineId (OS-level stable fingerprint), not to
 * instance startup order.
 *
 * File locking prevents race conditions when multiple instances start
 * simultaneously.
 */
import { readFile, writeFile, unlink, mkdir } from 'fs/promises'
import { join } from 'path'
import { createHash } from 'crypto'
import { getClaudeConfigHomeDir } from './envUtils.js'
import { isPipeAlive, getPipesDir } from './pipeTransport.js'
import type { TcpEndpoint } from './pipeTransport.js'
import type { LanAnnounce } from './lanBeacon.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PipeRegistryEntry {
  id: string
  pid: number
  machineId: string
  startedAt: number
  ip: string
  mac: string
  hostname: string
  pipeName: string
  tcpPort?: number
  lanVisible?: boolean
}

export interface PipeRegistrySub extends PipeRegistryEntry {
  subIndex: number
  boundToMain: string | null
}

export interface PipeRegistry {
  version: number
  mainMachineId: string | null
  main: PipeRegistryEntry | null
  subs: PipeRegistrySub[]
}

export type DetermineRoleResult =
  | { role: 'main' }
  | { role: 'main-recover' }
  | { role: 'sub'; subIndex: number }

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function getRegistryPath(): string {
  return join(getPipesDir(), 'registry.json')
}

function getLockPath(): string {
  return join(getPipesDir(), 'registry.lock')
}

// ---------------------------------------------------------------------------
// Machine ID — stable OS-level fingerprint
// ---------------------------------------------------------------------------

let _cachedMachineId: string | null = null

export async function getMachineId(): Promise<string> {
  if (_cachedMachineId) return _cachedMachineId

  let raw: string | null = null

  if (process.platform === 'win32') {
    // Windows: HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid (async)
    try {
      const { execFile } =
        require('child_process') as typeof import('child_process')
      raw = await new Promise<string>((resolve, reject) => {
        execFile(
          'reg',
          [
            'query',
            'HKLM\\SOFTWARE\\Microsoft\\Cryptography',
            '/v',
            'MachineGuid',
          ],
          { timeout: 3000 },
          (err, stdout) => (err ? reject(err) : resolve(stdout)),
        )
      })
      const match = raw.match(/MachineGuid\s+REG_SZ\s+(\S+)/)
      if (match) {
        _cachedMachineId = match[1]!
        return _cachedMachineId
      }
    } catch {}
  } else if (process.platform === 'linux') {
    // Linux: /etc/machine-id (already async)
    try {
      raw = await readFile('/etc/machine-id', 'utf8')
      raw = raw.trim()
      if (raw) {
        _cachedMachineId = raw
        return _cachedMachineId
      }
    } catch {}
  } else if (process.platform === 'darwin') {
    // macOS: IOPlatformSerialNumber (async)
    try {
      const { execFile } =
        require('child_process') as typeof import('child_process')
      raw = await new Promise<string>((resolve, reject) => {
        execFile(
          'bash',
          [
            '-c',
            'ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformSerialNumber',
          ],
          { timeout: 3000 },
          (err, stdout) => (err ? reject(err) : resolve(stdout)),
        )
      })
      const match = raw.match(/"IOPlatformSerialNumber"\s*=\s*"(\S+)"/)
      if (match) {
        _cachedMachineId = match[1]!
        return _cachedMachineId
      }
    } catch {}
  }

  // Fallback: hash hostname + MAC addresses
  _cachedMachineId = generateFallbackId()
  return _cachedMachineId
}

function generateFallbackId(): string {
  const os = require('os') as typeof import('os')
  const nets = os.networkInterfaces()
  const macs: string[] = []
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.mac && net.mac !== '00:00:00:00:00:00') {
        macs.push(net.mac)
      }
    }
  }
  macs.sort()
  const raw = `${os.hostname()}:${macs.join(',')}`
  return createHash('sha256').update(raw).digest('hex').slice(0, 32)
}

export function getMacAddress(): string {
  const os = require('os') as typeof import('os')
  const nets = os.networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (
        net.family === 'IPv4' &&
        !net.internal &&
        net.mac &&
        net.mac !== '00:00:00:00:00:00'
      ) {
        return net.mac
      }
    }
  }
  return '00:00:00:00:00:00'
}

// ---------------------------------------------------------------------------
// File lock — simple .lock file with timeout
// ---------------------------------------------------------------------------

const LOCK_TIMEOUT_MS = 2000
const LOCK_RETRY_MS = 50

async function acquireLock(): Promise<void> {
  await mkdir(getPipesDir(), { recursive: true })
  const lockPath = getLockPath()
  const deadline = Date.now() + LOCK_TIMEOUT_MS

  while (Date.now() < deadline) {
    try {
      // O_CREAT | O_EXCL — fails if file exists
      await writeFile(lockPath, String(process.pid), { flag: 'wx' })
      return // Lock acquired
    } catch (err: any) {
      if (err.code === 'EEXIST') {
        // Check if lock is stale (older than LOCK_TIMEOUT_MS)
        try {
          const content = await readFile(lockPath, 'utf8')
          const lockPid = parseInt(content, 10)
          if (lockPid && lockPid !== process.pid) {
            try {
              process.kill(lockPid, 0) // Check if process alive
            } catch {
              // Process dead — remove stale lock
              await unlink(lockPath).catch(() => {})
              continue
            }
          }
        } catch {
          // Can't read lock file — try to remove
          await unlink(lockPath).catch(() => {})
          continue
        }
        await new Promise(r => setTimeout(r, LOCK_RETRY_MS))
      } else {
        throw err
      }
    }
  }

  // Timeout — force remove and retry once
  await unlink(getLockPath()).catch(() => {})
  await writeFile(lockPath, String(process.pid), { flag: 'wx' }).catch(() => {})
}

async function releaseLock(): Promise<void> {
  await unlink(getLockPath()).catch(() => {})
}

// ---------------------------------------------------------------------------
// Registry CRUD
// ---------------------------------------------------------------------------

const EMPTY_REGISTRY: PipeRegistry = {
  version: 1,
  mainMachineId: null,
  main: null,
  subs: [],
}

export async function readRegistry(): Promise<PipeRegistry> {
  try {
    const content = await readFile(getRegistryPath(), 'utf8')
    const parsed = JSON.parse(content) as PipeRegistry
    if (parsed.version !== 1) return { ...EMPTY_REGISTRY }
    return parsed
  } catch {
    return { ...EMPTY_REGISTRY }
  }
}

export async function writeRegistry(registry: PipeRegistry): Promise<void> {
  await mkdir(getPipesDir(), { recursive: true })
  await writeFile(getRegistryPath(), JSON.stringify(registry, null, 2))
}

// ---------------------------------------------------------------------------
// Role management (all operations are lock-protected)
// ---------------------------------------------------------------------------

export async function determineRole(
  machineId: string,
): Promise<DetermineRoleResult> {
  await acquireLock()
  try {
    const registry = await readRegistry()

    // Case A: no main registered
    if (!registry.mainMachineId || !registry.main) {
      return { role: 'main' }
    }

    // Case B: this machine is the main machine
    if (registry.mainMachineId === machineId) {
      if (registry.main && (await isPipeAlive(registry.main.pipeName, 1000))) {
        // Main instance is alive → this is a same-machine sub
        const subIndex = registry.subs.length + 1
        return { role: 'sub', subIndex }
      }
      // Main instance is dead → recover main on same machine
      return { role: 'main-recover' }
    }

    // Case C: different machine
    const subIndex = registry.subs.length + 1
    return { role: 'sub', subIndex }
  } finally {
    await releaseLock()
  }
}

export async function registerAsMain(entry: PipeRegistryEntry): Promise<void> {
  await acquireLock()
  try {
    const registry = await readRegistry()
    registry.mainMachineId = entry.machineId
    registry.main = entry
    await writeRegistry(registry)
  } finally {
    await releaseLock()
  }
}

export async function registerAsSub(
  entry: PipeRegistryEntry,
  subIndex: number,
): Promise<void> {
  await acquireLock()
  try {
    const registry = await readRegistry()
    // Remove existing entry with same id (re-registration)
    registry.subs = registry.subs.filter(s => s.id !== entry.id)
    registry.subs.push({
      ...entry,
      subIndex,
      boundToMain: registry.main?.id ?? null,
    })
    await writeRegistry(registry)
  } finally {
    await releaseLock()
  }
}

export async function unregister(id: string): Promise<void> {
  await acquireLock()
  try {
    const registry = await readRegistry()
    if (registry.main?.id === id) {
      registry.main = null
      // Don't clear mainMachineId — same machine can recover
    }
    registry.subs = registry.subs.filter(s => s.id !== id)
    await writeRegistry(registry)
  } finally {
    await releaseLock()
  }
}

export async function revertToIndependent(id: string): Promise<void> {
  await acquireLock()
  try {
    const registry = await readRegistry()
    const sub = registry.subs.find(s => s.id === id)
    if (sub) {
      sub.boundToMain = null
    }
    await writeRegistry(registry)
  } finally {
    await releaseLock()
  }
}

export async function claimMain(
  newMachineId: string,
  entry: PipeRegistryEntry,
): Promise<void> {
  await acquireLock()
  try {
    const registry = await readRegistry()
    registry.mainMachineId = newMachineId
    registry.main = entry
    // All existing subs become bound to new main
    for (const sub of registry.subs) {
      sub.boundToMain = entry.id
    }
    await writeRegistry(registry)
  } finally {
    await releaseLock()
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function isMainAlive(): Promise<boolean> {
  const registry = await readRegistry()
  if (!registry.main) return false
  return isPipeAlive(registry.main.pipeName, 1000)
}

export function isMainMachine(
  machineId: string,
  registry: PipeRegistry,
): boolean {
  return registry.mainMachineId === machineId
}

export async function getAliveSubs(): Promise<PipeRegistrySub[]> {
  const registry = await readRegistry()
  const results = await Promise.all(
    registry.subs.map(sub =>
      isPipeAlive(sub.pipeName, 1000).then(alive => (alive ? sub : null)),
    ),
  )
  return results.filter((s): s is PipeRegistrySub => s !== null)
}

export async function cleanupStaleEntries(): Promise<void> {
  // Phase 1: Probe all entries in parallel WITHOUT holding the lock
  const registry = await readRegistry()
  const [mainAlive, subResults] = await Promise.all([
    registry.main
      ? isPipeAlive(registry.main.pipeName, 1000)
      : Promise.resolve(true),
    Promise.all(
      registry.subs.map(sub =>
        isPipeAlive(sub.pipeName, 1000).then(alive => ({ sub, alive })),
      ),
    ),
  ])

  const needsWrite = !mainAlive || subResults.some(r => !r.alive)
  if (!needsWrite) return

  // Phase 2: Briefly hold lock to apply changes
  await acquireLock()
  try {
    const fresh = await readRegistry()
    let changed = false

    if (!mainAlive && fresh.main?.pipeName === registry.main?.pipeName) {
      fresh.main = null
      changed = true
    }

    const deadNames = new Set(
      subResults.filter(r => !r.alive).map(r => r.sub.pipeName),
    )
    const aliveSubs = fresh.subs.filter(s => !deadNames.has(s.pipeName))
    if (aliveSubs.length !== fresh.subs.length) {
      fresh.subs = aliveSubs
      changed = true
    }

    if (changed) {
      await writeRegistry(fresh)
    }
  } finally {
    await releaseLock()
  }
}

// ---------------------------------------------------------------------------
// LAN peer merging
// ---------------------------------------------------------------------------

export type MergedPipeEntry = {
  id: string
  pipeName: string
  role: string
  machineId: string
  ip: string
  hostname: string
  alive: boolean
  source: 'local' | 'lan'
  tcpEndpoint?: TcpEndpoint
}

/**
 * Merge local registry entries with LAN beacon-discovered peers.
 * Local entries take precedence — LAN peers are only added if not
 * already present in the local registry.
 */
export function mergeWithLanPeers(
  registry: PipeRegistry,
  lanPeers: Map<string, LanAnnounce>,
): MergedPipeEntry[] {
  const result: MergedPipeEntry[] = []
  const knownPipes = new Set<string>()

  // Add main from local registry
  if (registry.main) {
    knownPipes.add(registry.main.pipeName)
    result.push({
      id: registry.main.id,
      pipeName: registry.main.pipeName,
      role: 'main',
      machineId: registry.main.machineId,
      ip: registry.main.ip,
      hostname: registry.main.hostname,
      alive: true, // caller should verify
      source: 'local',
      tcpEndpoint: registry.main.tcpPort
        ? { host: registry.main.ip, port: registry.main.tcpPort }
        : undefined,
    })
  }

  // Add subs from local registry
  for (const sub of registry.subs) {
    knownPipes.add(sub.pipeName)
    result.push({
      id: sub.id,
      pipeName: sub.pipeName,
      role: `sub-${sub.subIndex}`,
      machineId: sub.machineId,
      ip: sub.ip,
      hostname: sub.hostname,
      alive: true,
      source: 'local',
      tcpEndpoint: sub.tcpPort
        ? { host: sub.ip, port: sub.tcpPort }
        : undefined,
    })
  }

  // Add LAN peers not already in local registry
  for (const [pipeName, peer] of lanPeers) {
    if (knownPipes.has(pipeName)) continue
    result.push({
      id: `lan-${pipeName}`,
      pipeName,
      role: peer.role,
      machineId: peer.machineId,
      ip: peer.ip,
      hostname: peer.hostname,
      alive: true,
      source: 'lan',
      tcpEndpoint: { host: peer.ip, port: peer.tcpPort },
    })
  }

  return result
}
