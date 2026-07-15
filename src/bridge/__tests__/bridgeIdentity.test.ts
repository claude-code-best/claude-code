import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  BRIDGE_DEVICE_IDENTITY_FILENAME,
  createBridgeIdentity,
  deriveWorkspaceKey,
  loadOrCreateBridgeDeviceId,
} from '../bridgeIdentity.js'
import { buildBridgeProviderCapabilities } from '../../services/providerRegistry/catalogCapability.js'

const tempDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'bridge-identity-test-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true })))
})

describe('bridge device identity', () => {
  test('creates one installation id and reuses it across loads', async () => {
    const configDir = await makeTempDir()
    const first = await loadOrCreateBridgeDeviceId(configDir)
    const second = await loadOrCreateBridgeDeviceId(configDir)

    expect(first).toMatch(/^[0-9a-f-]{36}$/)
    expect(second).toBe(first)

    const stored = JSON.parse(
      await readFile(join(configDir, BRIDGE_DEVICE_IDENTITY_FILENAME), 'utf8'),
    )
    expect(stored).toEqual({ version: 1, device_id: first })
  })

  test('replaces a corrupted identity file with a valid installation id', async () => {
    const configDir = await makeTempDir()
    const path = join(configDir, BRIDGE_DEVICE_IDENTITY_FILENAME)
    await writeFile(path, '{not-json', 'utf8')

    const deviceId = await loadOrCreateBridgeDeviceId(configDir)
    const stored = JSON.parse(await readFile(path, 'utf8'))

    expect(deviceId).toMatch(/^[0-9a-f-]{36}$/)
    expect(stored.device_id).toBe(deviceId)
  })

  test('derives a stable workspace key from normalized directory and remote', () => {
    const first = deriveWorkspaceKey(
      '/tmp/project/../project',
      'git@example/repo.git',
    )
    const second = deriveWorkspaceKey('/tmp/project', 'git@example/repo.git')
    const otherRemote = deriveWorkspaceKey(
      '/tmp/project',
      'git@example/other.git',
    )

    expect(first).toBe(second)
    expect(first).toMatch(/^wrk_[0-9a-f]{32}$/)
    expect(otherRemote).not.toBe(first)
  })

  test('keeps device and workspace stable while rotating process connections', async () => {
    const configDir = await makeTempDir()
    const first = await createBridgeIdentity({
      configDir,
      dir: '/tmp/project',
      gitRepoUrl: null,
      deviceName: 'macbook',
    })
    const second = await createBridgeIdentity({
      configDir,
      dir: '/tmp/project',
      gitRepoUrl: null,
      deviceName: 'macbook',
    })

    expect(second.deviceId).toBe(first.deviceId)
    expect(second.workspaceKey).toBe(first.workspaceKey)
    expect(second.connectionId).not.toBe(first.connectionId)
    expect(second.deviceName).toBe('macbook')
  })
})

describe('bridge provider capabilities', () => {
  test('advertises the gated catalog and derives the legacy view from it', () => {
    const capabilities = buildBridgeProviderCapabilities(
      {
        version: 2,
        revision: 0,
        defaultModel: null,
        providers: [],
      },
      [],
      'anthropic',
    )

    expect(capabilities.provider_model_catalog_v1).toMatchObject({
      version: 1,
      revision: 0,
      features: {
        catalogWrite: false,
        sessionPersistence: false,
        runtimeSwitch: false,
        secretControl: false,
      },
    })
    expect(capabilities.session_model_persistence_v1).toBe(false)
    expect(capabilities.provider_runtime_switch_v1).toBe(false)
    expect(capabilities.provider).toEqual({
      current: 'anthropic',
      configs: [],
    })
  })
})
