import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeRegistry } from '../pipeRegistry'
import { formatPipeRegistryStatus } from '../pipeStatus'

let tempDir: string
let previousConfigDir: string | undefined

beforeEach(() => {
  previousConfigDir = process.env.CLAUDE_CONFIG_DIR
  tempDir = join(
    tmpdir(),
    `pipe-status-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  )
  process.env.CLAUDE_CONFIG_DIR = tempDir
})

afterEach(async () => {
  if (previousConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = previousConfigDir
  }
  await rm(tempDir, { recursive: true, force: true })
})

describe('pipe status', () => {
  test('formats registry main and sub pipe communication state', async () => {
    await writeRegistry({
      version: 1,
      mainMachineId: 'machine-main-123456',
      main: {
        id: 'main-id',
        pid: 123,
        machineId: 'machine-main-123456',
        startedAt: 1,
        ip: '127.0.0.1',
        mac: '00:11:22:33:44:55',
        hostname: 'main-host',
        pipeName: 'main-pipe',
        tcpPort: 43123,
      },
      subs: [
        {
          id: 'sub-id',
          pid: 456,
          machineId: 'machine-sub-123456',
          startedAt: 2,
          ip: '127.0.0.2',
          mac: '66:77:88:99:aa:bb',
          hostname: 'sub-host',
          pipeName: 'sub-pipe',
          tcpPort: 43124,
          subIndex: 1,
          boundToMain: 'main-pipe',
        },
      ],
    })

    const formatted = await formatPipeRegistryStatus()

    expect(formatted).toContain('Pipe registry: 1 main, 1 sub(s)')
    expect(formatted).toContain('[main] main-pipe')
    expect(formatted).toContain('[sub-1] sub-pipe')
    expect(formatted).toContain('bound=main-pipe')
  })
})
