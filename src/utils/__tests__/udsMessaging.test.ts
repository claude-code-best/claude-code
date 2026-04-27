import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createConnection, createServer, type Socket } from 'node:net'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  drainInbox,
  getDefaultUdsSocketPath,
  MAX_UDS_INBOX_ENTRIES,
  MAX_UDS_INBOX_BYTES,
  MAX_UDS_FRAME_BYTES,
  MAX_UDS_CLIENTS,
  formatUdsAddress,
  parseUdsTarget,
  sendUdsMessage,
  setOnEnqueue,
  startUdsMessaging,
  stopUdsMessaging,
  UDS_AUTH_TIMEOUT_MS,
} from '../udsMessaging.js'

let previousConfigDir: string | undefined
let tempConfigDir = ''

function socketPath(label: string): string {
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}-${label}`
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\claude-code-test-${suffix}`
  }
  return join(tmpdir(), 'claude-code-test', `${suffix}.sock`)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForEnqueues(
  expected: number,
  sendMessages: () => Promise<void>,
): Promise<void> {
  let count = 0
  let resolveDone: (() => void) | undefined
  const done = new Promise<void>(resolve => {
    resolveDone = resolve
  })

  setOnEnqueue(() => {
    count++
    if (count >= expected) resolveDone?.()
  })

  await sendMessages()
  await Promise.race([
    done,
    sleep(5_000).then(() => {
      throw new Error(`Timed out waiting for ${expected} UDS enqueues`)
    }),
  ])
  setOnEnqueue(null)
}

beforeEach(async () => {
  previousConfigDir = process.env.CLAUDE_CONFIG_DIR
  tempConfigDir = await mkdtemp(join(tmpdir(), 'uds-messaging-home-'))
  process.env.CLAUDE_CONFIG_DIR = tempConfigDir
})

afterEach(async () => {
  setOnEnqueue(null)
  drainInbox()
  await stopUdsMessaging()
  if (previousConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = previousConfigDir
  }
  if (tempConfigDir) {
    await rm(tempConfigDir, { recursive: true, force: true })
    tempConfigDir = ''
  }
})

async function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>(resolve => {
    server.close(() => resolve())
  })
}

describe('UDS inbox retention', () => {
  test('drainInbox returns each pending socket message once', async () => {
    const path = socketPath('drain')
    await startUdsMessaging(path, { isExplicit: true })
    expect(process.env.CLAUDE_CODE_MESSAGING_TOKEN).toBeUndefined()

    await waitForEnqueues(2, async () => {
      await sendUdsMessage(path, { type: 'text', data: 'one' })
      await sendUdsMessage(path, { type: 'text', data: 'two' })
    })

    const drained = drainInbox()
    expect(drained.map(entry => entry.message.data)).toEqual(['one', 'two'])
    expect(drained.every(entry => entry.status === 'processed')).toBe(true)
    expect(drainInbox()).toEqual([])
  })

  test('inbox is capped when messages arrive faster than they are drained', async () => {
    const path = socketPath('cap')
    await startUdsMessaging(path, { isExplicit: true })

    await waitForEnqueues(MAX_UDS_INBOX_ENTRIES, async () => {
      for (let i = 0; i < MAX_UDS_INBOX_ENTRIES; i++) {
        await sendUdsMessage(path, { type: 'text', data: String(i) })
      }
    })
    await expect(
      sendUdsMessage(path, { type: 'text', data: 'overflow' }),
    ).rejects.toThrow('inbox full')

    const drained = drainInbox()
    expect(drained).toHaveLength(MAX_UDS_INBOX_ENTRIES)
    expect(drained[0]?.message.data).toBe('0')
    expect(drained.at(-1)?.message.data).toBe(String(MAX_UDS_INBOX_ENTRIES - 1))
  })

  test('inbox is capped by retained bytes before entry count', async () => {
    const path = socketPath('byte-cap')
    await startUdsMessaging(path, { isExplicit: true })

    const payload = 'x'.repeat(32 * 1024)
    let accepted = 0
    for (;;) {
      try {
        await sendUdsMessage(path, { type: 'text', data: payload })
        accepted++
        if (accepted > MAX_UDS_INBOX_BYTES / payload.length + 20) {
          throw new Error('byte cap was not enforced')
        }
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toContain('inbox full')
        break
      }
    }

    const drained = drainInbox()
    expect(drained.length).toBe(accepted)
    expect(drained.length).toBeLessThan(MAX_UDS_INBOX_ENTRIES)
  })

  test('ping replies with pong without enqueueing inbox work', async () => {
    const path = socketPath('ping')
    await startUdsMessaging(path, { isExplicit: true })

    await sendUdsMessage(path, { type: 'ping' })
    expect(drainInbox()).toEqual([])
  })

  test('udsClient helpers authenticate through the capability file', async () => {
    const path = socketPath('uds-client')
    await startUdsMessaging(path, { isExplicit: true })
    const { isPeerAlive, sendToUdsSocket } = await import('../udsClient.js')

    expect(await isPeerAlive(path)).toBe(true)
    await waitForEnqueues(1, async () => {
      await sendToUdsSocket(path, 'hello from client')
    })

    const drained = drainInbox()
    expect(drained).toHaveLength(1)
    expect(drained[0]?.message.data).toBe('hello from client')
    expect(drained[0]?.message.meta).toBeUndefined()
  })

  test('udsClient peer probe fails closed on oversized pong frames', async () => {
    const path = socketPath('uds-client-oversized-pong')
    if (process.platform !== 'win32') {
      await mkdir(dirname(path), { recursive: true })
    }
    const receiver = createServer(socket => {
      socket.on('data', () => {
        socket.write('x'.repeat(MAX_UDS_FRAME_BYTES + 1))
      })
    })
    await new Promise<void>((resolve, reject) => {
      receiver.on('error', reject)
      receiver.listen(path, () => resolve())
    })

    try {
      const { isPeerAlive } = await import('../udsClient.js')
      expect(await isPeerAlive(path, 3_000, 'test-token')).toBe(false)
    } finally {
      await closeServer(receiver)
      if (process.platform !== 'win32') {
        await unlink(path).catch(() => undefined)
      }
    }
  })

  test('udsClient send fails closed when no capability token exists', async () => {
    const path = socketPath('uds-client-no-token')
    const { sendToUdsSocket } = await import('../udsClient.js')

    await expect(sendToUdsSocket(path, 'hello')).rejects.toThrow(
      'No auth token found',
    )
  })

  test('udsClient send reports connection failures without leaking token state', async () => {
    const path = socketPath('uds-client-connect-error')
    const capabilityDir = join(tempConfigDir, 'messaging-capabilities')
    const capabilityName = `${createHash('sha256').update(path).digest('hex')}.json`
    await mkdir(capabilityDir, { recursive: true, mode: 0o700 })
    await writeFile(
      join(capabilityDir, capabilityName),
      JSON.stringify({ socketPath: path, authToken: 'test-token' }),
      'utf-8',
    )
    const { sendToUdsSocket, UdsPeerConnectionError } = await import(
      '../udsClient.js'
    )

    const error = await sendToUdsSocket(path, 'hello').then(
      () => undefined,
      err => err,
    )
    expect(error).toBeInstanceOf(UdsPeerConnectionError)
    if (!(error instanceof UdsPeerConnectionError)) {
      throw new Error('Expected UDS peer connection error')
    }
    expect(error.socketPath).toBe(path)
    expect(error.message).not.toContain('test-token')
  })

  test('udsClient send reports response timeouts as peer connection errors', async () => {
    const path = socketPath('uds-client-timeout')
    const capabilityDir = join(tempConfigDir, 'messaging-capabilities')
    const capabilityName = `${createHash('sha256').update(path).digest('hex')}.json`
    await mkdir(capabilityDir, { recursive: true, mode: 0o700 })
    await writeFile(
      join(capabilityDir, capabilityName),
      JSON.stringify({ socketPath: path, authToken: 'test-token' }),
      'utf-8',
    )
    if (process.platform !== 'win32') {
      await mkdir(dirname(path), { recursive: true })
    }

    const sockets = new Set<Socket>()
    const receiver = createServer(socket => {
      sockets.add(socket)
      socket.on('close', () => {
        sockets.delete(socket)
      })
      socket.on('data', () => undefined)
    })
    await new Promise<void>((resolve, reject) => {
      receiver.on('error', reject)
      receiver.listen(path, () => resolve())
    })

    try {
      const { sendToUdsSocket, UdsPeerConnectionError } = await import(
        '../udsClient.js'
      )

      const error = await sendToUdsSocket(path, 'hello', 50).then(
        () => undefined,
        err => err,
      )
      expect(error).toBeInstanceOf(UdsPeerConnectionError)
      if (!(error instanceof UdsPeerConnectionError)) {
        throw new Error('Expected UDS peer connection timeout error')
      }
      expect(error.socketPath).toBe(path)
      expect(error.cause).toBeInstanceOf(Error)
      if (!(error.cause instanceof Error)) {
        throw new Error('Expected timeout cause')
      }
      expect(error.cause.message).toBe('Connection timed out')
      expect(error.message).not.toContain('test-token')
    } finally {
      for (const socket of sockets) {
        socket.destroy()
      }
      await closeServer(receiver)
      if (process.platform !== 'win32') {
        await unlink(path).catch(() => undefined)
      }
    }
  })

  test('sendUdsMessage fails closed before connecting without an auth token', async () => {
    await expect(
      sendUdsMessage(socketPath('no-auth-token'), { type: 'text', data: 'x' }),
    ).rejects.toThrow('without auth token')
  })

  test('drained entries never expose the UDS auth token', async () => {
    const path = socketPath('strip-token')
    await startUdsMessaging(path, { isExplicit: true })

    await waitForEnqueues(1, async () => {
      await sendUdsMessage(path, {
        type: 'notification',
        meta: { keep: 'visible' },
      })
    })

    const drained = drainInbox()
    expect(drained).toHaveLength(1)
    expect(drained[0]?.message.meta).toEqual({ keep: 'visible' })
    expect(drained[0]?.message.meta).not.toHaveProperty('authToken')
  })

  test('rejects unauthenticated socket messages', async () => {
    const path = socketPath('auth')
    await startUdsMessaging(path, { isExplicit: true })

    const response = await new Promise<string>((resolve, reject) => {
      let responseText = ''
      const conn = createConnection(path, () => {
        conn.write(`${JSON.stringify({ type: 'text', data: 'bad' })}\n`)
      })
      conn.setTimeout(5_000, () => {
        conn.destroy()
        reject(new Error('Timed out waiting for auth rejection'))
      })
      conn.on('data', chunk => {
        const text = chunk.toString('utf-8')
        if (text.includes('\n')) {
          responseText = text
        }
      })
      conn.on('close', () => resolve(responseText))
      conn.on('error', reject)
    })

    expect(JSON.parse(response).type).toBe('error')
    expect(drainInbox()).toEqual([])
  })

  test('disconnects malformed JSON clients without enqueueing inbox work', async () => {
    const path = socketPath('malformed-client')
    await startUdsMessaging(path, { isExplicit: true })

    const response = await new Promise<string>((resolve, reject) => {
      let responseText = ''
      const conn = createConnection(path, () => {
        conn.write('{not-json\n')
      })
      conn.setTimeout(5_000, () => {
        conn.destroy()
        reject(new Error('Timed out waiting for malformed frame close'))
      })
      conn.on('data', chunk => {
        responseText += chunk.toString('utf-8')
      })
      conn.on('close', () => resolve(responseText))
      conn.on('error', reject)
    })

    const parsed = JSON.parse(response)
    expect(parsed.type).toBe('error')
    expect(parsed.data).toBe('invalid frame')
    expect(drainInbox()).toEqual([])
  })

  test('disconnects idle unauthenticated clients', async () => {
    const path = socketPath('idle-client')
    await startUdsMessaging(path, { isExplicit: true })

    const response = await new Promise<string>((resolve, reject) => {
      let responseText = ''
      const conn = createConnection(path)
      conn.setTimeout(UDS_AUTH_TIMEOUT_MS + 2_000, () => {
        conn.destroy()
        reject(new Error('Timed out waiting for auth timeout close'))
      })
      conn.on('data', chunk => {
        responseText += chunk.toString('utf-8')
      })
      conn.on('close', () => resolve(responseText))
      conn.on('error', reject)
    })

    const parsed = JSON.parse(response)
    expect(parsed.type).toBe('error')
    expect(parsed.data).toBe('authentication timeout')
    expect(drainInbox()).toEqual([])
  })

  test('destroys oversized frames before enqueueing inbox work', async () => {
    const path = socketPath('oversized')
    await startUdsMessaging(path, { isExplicit: true })

    await new Promise<void>((resolve, reject) => {
      const conn = createConnection(path, () => {
        conn.write('x'.repeat(MAX_UDS_FRAME_BYTES + 1))
      })
      conn.setTimeout(5_000, () => {
        conn.destroy()
        reject(new Error('Timed out waiting for oversized frame close'))
      })
      conn.on('close', () => resolve())
      conn.on('error', () => resolve())
    })

    expect(drainInbox()).toEqual([])
  })

  test('default socket path is regenerated after stop', async () => {
    const firstPath = getDefaultUdsSocketPath()
    await startUdsMessaging(firstPath)
    await stopUdsMessaging()

    expect(getDefaultUdsSocketPath()).not.toBe(firstPath)
  })

  test('rejects oversized receiver responses before retaining them', async () => {
    const path = socketPath('oversized-response')
    if (process.platform !== 'win32') {
      await mkdir(dirname(path), { recursive: true })
    }
    const receiver = createServer(socket => {
      socket.on('data', () => {
        socket.write('x'.repeat(MAX_UDS_FRAME_BYTES + 1))
      })
    })
    await new Promise<void>((resolve, reject) => {
      receiver.on('error', reject)
      receiver.listen(path, () => resolve())
    })

    try {
      await expect(
        sendUdsMessage(
          path,
          { type: 'text', data: 'hello' },
          { authToken: 'test-token' },
        ),
      ).rejects.toThrow('UDS response frame exceeded size limit')
    } finally {
      await closeServer(receiver)
      if (process.platform !== 'win32') {
        await unlink(path).catch(() => undefined)
      }
    }
  })

  test('rejects closed receiver responses without waiting for timeout', async () => {
    const path = socketPath('closed-response')
    if (process.platform !== 'win32') {
      await mkdir(dirname(path), { recursive: true })
    }
    const receiver = createServer(socket => {
      socket.end()
    })
    await new Promise<void>((resolve, reject) => {
      receiver.on('error', reject)
      receiver.listen(path, () => resolve())
    })

    try {
      await expect(
        sendUdsMessage(
          path,
          { type: 'text', data: 'hello' },
          { authToken: 'test-token' },
        ),
      ).rejects.toThrow('before response')
    } finally {
      await closeServer(receiver)
      if (process.platform !== 'win32') {
        await unlink(path).catch(() => undefined)
      }
    }
  })

  test('rejects malformed receiver responses without waiting for timeout', async () => {
    const path = socketPath('malformed-response')
    if (process.platform !== 'win32') {
      await mkdir(dirname(path), { recursive: true })
    }
    const receiver = createServer(socket => {
      socket.on('data', () => {
        socket.write('{not-json\n')
      })
    })
    await new Promise<void>((resolve, reject) => {
      receiver.on('error', reject)
      receiver.listen(path, () => resolve())
    })

    try {
      await expect(
        sendUdsMessage(
          path,
          { type: 'text', data: 'hello' },
          { authToken: 'test-token' },
        ),
      ).rejects.toThrow('Invalid UDS response frame')
    } finally {
      await closeServer(receiver)
      if (process.platform !== 'win32') {
        await unlink(path).catch(() => undefined)
      }
    }
  })

  test('rejects inline auth token UDS targets instead of parsing them', async () => {
    const path = socketPath('inline-token')

    expect(formatUdsAddress(path)).toBe(`uds:${path}`)

    const targetWithToken = `${path}#token=secret`
    expect(() => parseUdsTarget(targetWithToken)).toThrow('inline auth token')
    try {
      parseUdsTarget(targetWithToken)
    } catch (error) {
      expect((error as Error).message).not.toContain('secret')
    }

    const { sendToUdsSocket } = await import('../udsClient.js')
    await expect(sendToUdsSocket(targetWithToken, 'hello')).rejects.toThrow(
      'inline auth token',
    )
  })

  test('fails closed and cleans temp files when capability target is occupied', async () => {
    const path = socketPath('capability-target-dir')
    const capabilityDir = join(tempConfigDir, 'messaging-capabilities')
    const capabilityName = `${createHash('sha256').update(path).digest('hex')}.json`
    await mkdir(join(capabilityDir, capabilityName), {
      recursive: true,
      mode: 0o700,
    })

    await expect(
      startUdsMessaging(path, { isExplicit: true }),
    ).rejects.toThrow()

    expect(process.env.CLAUDE_CODE_MESSAGING_SOCKET).toBeUndefined()
    expect(await readdir(capabilityDir)).toEqual([capabilityName])
  })

  if (process.platform !== 'win32') {
    test('creates the listening socket with owner-only permissions', async () => {
      const path = socketPath('socket-mode')
      await startUdsMessaging(path, { isExplicit: true })

      const mode = (await stat(path)).mode & 0o777
      expect(mode).toBe(0o600)
    })

    test('fails closed when the capability directory is not private', async () => {
      const previousConfigDir = process.env.CLAUDE_CONFIG_DIR
      const tempHome = join(
        tmpdir(),
        `uds-capability-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      )
      process.env.CLAUDE_CONFIG_DIR = tempHome
      const capabilityDir = join(tempHome, 'messaging-capabilities')
      await mkdir(capabilityDir, { recursive: true, mode: 0o755 })
      await chmod(capabilityDir, 0o755)

      try {
        const path = socketPath('broad-capdir')
        await expect(
          startUdsMessaging(path, { isExplicit: true }),
        ).rejects.toThrow('permissions are too broad')
        await expect(stat(path)).rejects.toThrow()
      } finally {
        if (previousConfigDir === undefined) {
          delete process.env.CLAUDE_CONFIG_DIR
        } else {
          process.env.CLAUDE_CONFIG_DIR = previousConfigDir
        }
        await rm(tempHome, { recursive: true, force: true })
      }
    })

    test('fails closed when the capability directory is a symlink', async () => {
      const previousConfigDir = process.env.CLAUDE_CONFIG_DIR
      const tempHome = join(
        tmpdir(),
        `uds-capability-link-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      )
      const target = join(tempHome, 'target')
      process.env.CLAUDE_CONFIG_DIR = tempHome
      await mkdir(target, { recursive: true, mode: 0o700 })
      await symlink(target, join(tempHome, 'messaging-capabilities'), 'dir')

      try {
        await expect(
          startUdsMessaging(socketPath('symlink-capdir'), { isExplicit: true }),
        ).rejects.toThrow('not a private directory')
      } finally {
        if (previousConfigDir === undefined) {
          delete process.env.CLAUDE_CONFIG_DIR
        } else {
          process.env.CLAUDE_CONFIG_DIR = previousConfigDir
        }
        await rm(tempHome, { recursive: true, force: true })
      }
    })

    test('fails closed when an explicit socket parent is not private', async () => {
      const parent = join(
        tmpdir(),
        `uds-socket-parent-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      )
      await mkdir(parent, { recursive: true, mode: 0o755 })
      await chmod(parent, 0o755)

      try {
        await expect(
          startUdsMessaging(join(parent, 'messaging.sock'), {
            isExplicit: true,
          }),
        ).rejects.toThrow('socket parent permissions are too broad')
      } finally {
        await rm(parent, { recursive: true, force: true })
      }
    })

    test('fails closed when an explicit socket parent is a file', async () => {
      const parentFile = join(
        tmpdir(),
        `uds-socket-parent-file-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      )
      await writeFile(parentFile, 'not a directory', 'utf-8')

      try {
        await expect(
          startUdsMessaging(join(parentFile, 'messaging.sock'), {
            isExplicit: true,
          }),
        ).rejects.toThrow('socket parent is not a directory')
      } finally {
        await rm(parentFile, { force: true })
      }
    })

    test('stop tolerates an already removed socket path', async () => {
      const path = socketPath('already-removed')
      await startUdsMessaging(path, { isExplicit: true })
      await unlink(path)

      await stopUdsMessaging()

      expect(process.env.CLAUDE_CODE_MESSAGING_SOCKET).toBeUndefined()
    })

    test('rejects clients over the configured connection cap', async () => {
      const path = socketPath('client-cap')
      await startUdsMessaging(path, { isExplicit: true })
      const sockets: ReturnType<typeof createConnection>[] = []

      try {
        for (let i = 0; i < MAX_UDS_CLIENTS; i++) {
          const socket = await new Promise<ReturnType<typeof createConnection>>(
            (resolve, reject) => {
              const conn = createConnection(path, () => resolve(conn))
              conn.on('error', reject)
            },
          )
          sockets.push(socket)
        }

        await new Promise<void>((resolve, reject) => {
          const extra = createConnection(path)
          extra.on('close', () => resolve())
          extra.on('error', reject)
          extra.setTimeout(5_000, () => {
            extra.destroy()
            reject(new Error('Timed out waiting for client cap close'))
          })
        })
      } finally {
        for (const socket of sockets) {
          socket.destroy()
        }
      }
    })
  }
})
