import { afterEach, describe, expect, test } from 'bun:test'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer, type AddressInfo, type Socket } from 'node:net'
import { StringDecoder } from 'node:string_decoder'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  abortLock,
  applyStaged,
  beginLock,
  beginLockFrom,
  blenderStatePath,
  BlenderBridge,
  BlenderCommandError,
  BlenderError,
  BlenderNotConnected,
  BlenderProtocolError,
  BlenderScriptError,
  BlenderTimeout,
  buildSelectScript,
  cancelLock,
  clearStale,
  DEFAULT_HOST,
  DEFAULT_PORT,
  extractJsonValue,
  idleState,
  isStale,
  MAX_SELECTION_IDS,
  normalizeSelectMode,
  normalizeSelectionIds,
  parseState,
  PROTOCOL_VERSION,
  readBlenderState,
  stagePatch,
  STALE_LOCK_MS,
  validateSelectNames,
  validateStagedScript,
  writeBlenderState,
  type BlenderState,
  type BlenderScriptErrorCode,
} from 'src/services/blender/index.js'
import {
  BlenderTool,
  BlenderToolError,
  EditBlenderSelectionTool,
  stageBlenderSelection,
  type BlenderToolErrorCode,
} from './BlenderTool.js'

/* ------------------------------------------------------------------ */
/* Fake addon                                                          */
/* ------------------------------------------------------------------ */

interface FakeRequest {
  type: string
  params: Record<string, unknown>
}

type Responder = (request: FakeRequest, socket: Socket) => void

const HANDSHAKE = JSON.stringify({
  status: 'success',
  result: {
    protocol_version: PROTOCOL_VERSION,
    addon_version: [1, 11, 0],
    blender_version: '4.2.0',
  },
})

function success(result: unknown): string {
  return JSON.stringify({ status: 'success', result })
}

function errorReply(message: string): string {
  return JSON.stringify({ status: 'error', message })
}

function sendJson(socket: Socket, value: unknown): void {
  if (!socket.destroyed) socket.write(JSON.stringify(value))
}

function sendRaw(socket: Socket, raw: string): void {
  if (!socket.destroyed) socket.write(raw)
}

function sendBytes(socket: Socket, bytes: Buffer): void {
  if (!socket.destroyed) socket.write(bytes)
}

/** A TCP server that speaks the addon framing and records requests. */
class FakeAddon {
  readonly requests: FakeRequest[] = []
  readonly port: number
  private readonly sockets = new Set<Socket>()

  private constructor(
    private readonly server: ReturnType<typeof createServer>,
    private readonly responder: Responder,
  ) {
    this.server.on('connection', (socket: Socket) => {
      this.sockets.add(socket)
      socket.on('close', () => this.sockets.delete(socket))
      socket.on('error', () => this.sockets.delete(socket))
      const decoder = new StringDecoder('utf8')
      let buffer = ''
      socket.on('data', (chunk: Buffer) => {
        buffer += decoder.write(chunk)
        for (;;) {
          const extracted = extractJsonValue(buffer)
          if (!extracted) return
          buffer = extracted.rest
          let request: FakeRequest
          try {
            request = JSON.parse(extracted.raw) as FakeRequest
          } catch {
            return
          }
          this.requests.push(request)
          this.responder(request, socket)
        }
      })
    })
    const address = server.address() as AddressInfo
    this.port = address.port
  }

  static async start(responder: Responder): Promise<FakeAddon> {
    const server = createServer()
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve())
    })
    return new FakeAddon(server, responder)
  }

  async close(): Promise<void> {
    for (const socket of this.sockets) socket.destroy()
    await new Promise<void>(resolve => {
      this.server.close(() => resolve())
    })
  }
}

const addons: FakeAddon[] = []

async function startAddon(responder: Responder): Promise<FakeAddon> {
  const addon = await FakeAddon.start(responder)
  addons.push(addon)
  return addon
}

/** A responder that handles the handshake and returns per-command results. */
function standardResponder(results: Record<string, unknown> = {}): Responder {
  return (request, socket) => {
    if (request.type === 'get_addon_info') {
      sendRaw(socket, HANDSHAKE)
      return
    }
    sendJson(socket, {
      status: 'success',
      result: request.type in results ? results[request.type] : { ok: true },
    })
  }
}

/* ------------------------------------------------------------------ */
/* Test environment                                                    */
/* ------------------------------------------------------------------ */

const dirs: string[] = []
const savedEnv = {
  blender: process.env.AUTOAGENT_BLENDER,
  host: process.env.AUTOAGENT_BLENDER_HOST,
  port: process.env.AUTOAGENT_BLENDER_PORT,
  timeout: process.env.AUTOAGENT_BLENDER_TIMEOUT,
  state: process.env.AUTOAGENT_BLENDER_STATE,
  session: process.env.AUTOAGENT_SESSION_ID,
}

const NOW = 1_700_000_000_000

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'opencc-blender-'))
  dirs.push(dir)
  return dir
}

function tempFile(): string {
  return join(tempDir(), '.autoagent', 'blender', 'state.json')
}

function writeRaw(file: string, contents: string): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, contents)
}

function locked(overrides: Partial<BlenderState> = {}): BlenderState {
  return {
    version: 1,
    sessionId: 'session-mine',
    lockId: 'lock-1',
    selectionIds: ['Cube'],
    selectionPayload: { objects: [{ name: 'Cube' }] },
    status: 'locked',
    staged: null,
    createdAt: Date.now(),
    ...overrides,
  }
}

function toolCode(run: () => unknown): BlenderToolErrorCode | undefined {
  try {
    run()
    return undefined
  } catch (error) {
    return error instanceof BlenderToolError ? error.code : undefined
  }
}

function scriptCode(run: () => unknown): BlenderScriptErrorCode | undefined {
  try {
    run()
    return undefined
  } catch (error) {
    return error instanceof BlenderScriptError ? error.code : undefined
  }
}

afterEach(async () => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true })
  for (const addon of addons.splice(0)) await addon.close()
  restore('AUTOAGENT_BLENDER', savedEnv.blender)
  restore('AUTOAGENT_BLENDER_HOST', savedEnv.host)
  restore('AUTOAGENT_BLENDER_PORT', savedEnv.port)
  restore('AUTOAGENT_BLENDER_TIMEOUT', savedEnv.timeout)
  restore('AUTOAGENT_BLENDER_STATE', savedEnv.state)
  restore('AUTOAGENT_SESSION_ID', savedEnv.session)
})

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

/* ------------------------------------------------------------------ */
/* Framing                                                             */
/* ------------------------------------------------------------------ */

describe('bridge framing', () => {
  test('fragmented JSON and a UTF-8 sequence split across chunks', async () => {
    const addon = await startAddon((request, socket) => {
      if (request.type === 'get_addon_info') {
        sendRaw(socket, HANDSHAKE.slice(0, 11))
        setTimeout(() => sendRaw(socket, HANDSHAKE.slice(11)), 1)
        return
      }
      const raw = success({ name: '场景-立方体' })
      const bytes = Buffer.from(raw, 'utf8')
      const cut = bytes.indexOf(Buffer.from('场', 'utf8')) + 1
      sendBytes(socket, bytes.subarray(0, cut))
      setTimeout(() => sendBytes(socket, bytes.subarray(cut)), 1)
    })
    const bridge = new BlenderBridge({ port: addon.port, timeoutMs: 500 })
    await expect(bridge.scene()).resolves.toEqual({ name: '场景-立方体' })
  })

  test('concatenated replies leave the second object buffered', async () => {
    const addon = await startAddon((request, socket) => {
      if (request.type === 'get_addon_info') {
        // Handshake and the command reply in one write, before the command is
        // even read. The reader must keep the remainder.
        sendRaw(socket, `${HANDSHAKE}${success({ concatenated: true })}`)
      }
    })
    const bridge = new BlenderBridge({ port: addon.port, timeoutMs: 500 })
    await expect(bridge.scene()).resolves.toEqual({ concatenated: true })
  })

  test('a silent addon times out with BlenderTimeout', async () => {
    const addon = await startAddon(() => {
      // Accept the connection and never answer.
    })
    const bridge = new BlenderBridge({ port: addon.port, timeoutMs: 60 })
    await expect(bridge.scene()).rejects.toBeInstanceOf(BlenderTimeout)
  })

  test('a closed port is a clean not-connected status', async () => {
    const addon = await FakeAddon.start(() => {})
    const port = addon.port
    await addon.close()
    const bridge = new BlenderBridge({ port, timeoutMs: 200 })
    const status = await bridge.status()
    expect(status.connected).toBe(false)
    expect(status.host).toBe(DEFAULT_HOST)
    expect(typeof status.error).toBe('string')
  })

  test('protocol mismatch is rejected before the command is sent', async () => {
    const addon = await startAddon((request, socket) => {
      if (request.type === 'get_addon_info') {
        sendJson(socket, {
          status: 'success',
          result: { protocol_version: 10 },
        })
      }
    })
    const bridge = new BlenderBridge({ port: addon.port, timeoutMs: 500 })
    await expect(bridge.scene()).rejects.toBeInstanceOf(BlenderProtocolError)
    expect(
      addon.requests.some(request => request.type === 'get_scene_info'),
    ).toBe(false)
  })

  test('an error envelope becomes a command error', async () => {
    const addon = await startAddon((request, socket) => {
      if (request.type === 'get_addon_info') {
        sendRaw(socket, HANDSHAKE)
        return
      }
      sendRaw(socket, errorReply('handler exploded'))
    })
    const bridge = new BlenderBridge({ port: addon.port, timeoutMs: 500 })
    const failure = bridge.scene()
    await expect(failure).rejects.toBeInstanceOf(BlenderCommandError)
    await expect(failure).rejects.toThrow('handler exploded')
  })

  test('a success result carrying a top-level error is a command error', async () => {
    const addon = await startAddon((request, socket) => {
      if (request.type === 'get_addon_info') {
        sendRaw(socket, HANDSHAKE)
        return
      }
      sendRaw(socket, success({ error: 'screenshot failed' }))
    })
    const bridge = new BlenderBridge({ port: addon.port, timeoutMs: 500 })
    await expect(bridge.screenshot({ maxSize: 512 })).rejects.toBeInstanceOf(
      BlenderCommandError,
    )
  })

  test('status reports the addon version on success', async () => {
    const addon = await startAddon((request, socket) => {
      sendRaw(socket, HANDSHAKE)
    })
    const bridge = new BlenderBridge({ port: addon.port, timeoutMs: 500 })
    const status = await bridge.status()
    expect(status.connected).toBe(true)
    expect(status.addon).toMatchObject({
      protocol: PROTOCOL_VERSION,
      addonVersion: '1.11.0',
      blenderVersion: '4.2.0',
    })
  })
})

/* ------------------------------------------------------------------ */
/* select                                                              */
/* ------------------------------------------------------------------ */

describe('select', () => {
  test('validates names and mode', () => {
    expect(validateSelectNames(['Cube'])).toEqual(['Cube'])
    expect(normalizeSelectMode('vertex')).toBe('VERTEX')
    expect(normalizeSelectMode(undefined)).toBe('OBJECT')
    expect(() => validateSelectNames([])).toThrow(BlenderError)
    expect(() => validateSelectNames([''])).toThrow(BlenderError)
    expect(() => validateSelectNames(['a\nb'])).toThrow(BlenderError)
    expect(() => validateSelectNames(['x'.repeat(257)])).toThrow(BlenderError)
    expect(() =>
      validateSelectNames(
        Array.from({ length: MAX_SELECTION_IDS + 1 }, (_, i) => `o${i}`),
      ),
    ).toThrow(BlenderError)
    expect(() => normalizeSelectMode('OBJECT; import os')).toThrow(BlenderError)
  })

  test('embeds names as JSON literals so they cannot inject Python', async () => {
    const malicious = 'x"]) ; import os; #'
    const addon = await startAddon(standardResponder())
    const bridge = new BlenderBridge({ port: addon.port, timeoutMs: 500 })
    await bridge.select([malicious], 'VERTEX')
    const request = addon.requests.find(item => item.type === 'execute_code')
    expect(request).toBeDefined()
    const code = String(request?.params.code)
    const namesLine = code.split('\n').find(line => line.startsWith('names = '))
    expect(namesLine).toBeDefined()
    expect(JSON.parse(String(namesLine).slice('names = '.length))).toEqual([
      malicious,
    ])
    expect(code).toContain('mode = "VERTEX"')
    expect(code).toContain('bpy.ops.mesh.select_mode(type=mode)')
    expect(code).toContain('bpy.ops.object.select_all(action="DESELECT")')
  })

  test('buildSelectScript is deterministic and uses the requested mode', () => {
    const script = buildSelectScript(['Cube', 'Cam'], 'EDIT')
    expect(script).toContain('names = ["Cube","Cam"]')
    expect(script).toContain('mode = "EDIT"')
    expect(script).toContain('bpy.ops.object.mode_set(mode="EDIT")')
  })

  test('invalid input is refused before a connection is opened', async () => {
    // Port 1 is not our addon; validation must fail before any connect.
    const bridge = new BlenderBridge({ port: 1, timeoutMs: 50 })
    await expect(bridge.select([], 'OBJECT')).rejects.toBeInstanceOf(
      BlenderError,
    )
    await expect(bridge.select(['Cube'], 'BOGUS')).rejects.toBeInstanceOf(
      BlenderError,
    )
  })
})

/* ------------------------------------------------------------------ */
/* State transitions                                                   */
/* ------------------------------------------------------------------ */

describe('state transitions', () => {
  test('an empty selection cannot start a lock', () => {
    expect(beginLock('session-mine', 'lock-1', [], NOW)).toEqual({
      ok: false,
      reason: 'empty-selection',
    })
    expect(beginLock('session-mine', '', ['Cube'], NOW)).toEqual({
      ok: false,
      reason: 'invalid-lock',
    })
  })

  test('a second lock is refused while one is active', () => {
    const first = beginLock('session-mine', 'lock-1', ['Cube'], NOW)
    expect(first.ok).toBe(true)
    if (!first.ok) throw new Error('expected a lock')
    expect(beginLockFrom(first.state, 'lock-2', ['Cube'], NOW)).toEqual({
      ok: false,
      reason: 'locked',
    })
    expect(beginLockFrom(null, 'lock-2', ['Cube'], NOW).ok).toBe(true)
  })

  test('staging preserves createdAt and can happen once', () => {
    const began = beginLock('session-mine', 'lock-1', ['Cube', 'Cam'], NOW)
    if (!began.ok) throw new Error('expected a lock')
    const staged = stagePatch(
      began.state,
      'lock-1',
      'bpy.data.objects["Cube"].location.x = 1',
      'move cube',
    )
    expect(staged?.status).toBe('staged')
    expect(staged?.createdAt).toBe(NOW)
    expect(staged?.staged).toEqual({
      script: 'bpy.data.objects["Cube"].location.x = 1',
      summary: 'move cube',
    })
    expect(stagePatch(staged as BlenderState, 'lock-1', 'x = 1')).toBeNull()
  })

  test('applied clears the lock exactly once', () => {
    const began = beginLock('session-mine', 'lock-1', ['Cube'], NOW)
    if (!began.ok) throw new Error('expected a lock')
    const staged = stagePatch(began.state, 'lock-1', 'x = 1')
    if (!staged) throw new Error('expected a staged patch')
    const first = applyStaged(staged, 'lock-1', NOW)
    expect(first.applied).toBe(true)
    expect(first.state.status).toBe('idle')
    expect(first.state.lockId).toBeNull()
    const second = applyStaged(first.state, 'lock-1', NOW)
    expect(second.applied).toBe(false)
  })

  test('a stale lock expires and a stale patch is not applied', () => {
    const began = beginLock('session-mine', 'lock-1', ['Cube'], NOW)
    if (!began.ok) throw new Error('expected a lock')
    const staged = stagePatch(began.state, 'lock-1', 'x = 1')
    if (!staged) throw new Error('expected a staged patch')
    expect(isStale(staged, NOW + STALE_LOCK_MS)).toBe(false)
    expect(isStale(staged, NOW + STALE_LOCK_MS + 1)).toBe(true)
    const applied = applyStaged(staged, 'lock-1', NOW + STALE_LOCK_MS + 1)
    expect(applied.applied).toBe(false)
    expect(applied.stale).toBe(true)
    expect(applied.state.status).toBe('idle')
    const cleared = clearStale(staged, NOW + STALE_LOCK_MS + 1)
    expect(cleared.stale).toBe(true)
  })

  test('cancel and abort are idempotent and respect the lock id', () => {
    const began = beginLock('session-mine', 'lock-1', ['Cube'], NOW)
    if (!began.ok) throw new Error('expected a lock')
    expect(cancelLock(began.state, 'other', NOW).cancelled).toBe(false)
    const cancelled = cancelLock(began.state, 'lock-1', NOW)
    expect(cancelled.cancelled).toBe(true)
    expect(cancelled.state.status).toBe('idle')
    expect(cancelLock(cancelled.state, 'lock-1', NOW).cancelled).toBe(false)
    expect(abortLock(began.state, NOW).status).toBe('idle')
    const idle = idleState('session-mine', NOW)
    expect(abortLock(idle, NOW)).toBe(idle)
  })

  test('normalizeSelectionIds dedupes, keeps order and caps', () => {
    expect(
      normalizeSelectionIds(['b', 'a', 'b', '', '  ', 'a\n', 3, 'c']),
    ).toEqual(['b', 'a', 'c'])
    expect(
      normalizeSelectionIds(
        Array.from({ length: MAX_SELECTION_IDS + 5 }, (_, i) => `o${i}`),
      ),
    ).toHaveLength(MAX_SELECTION_IDS)
  })

  test('parseState tolerates corrupt files and rejects broken staged state', () => {
    expect(parseState(null)).toBeNull()
    expect(parseState({ version: 2 })).toBeNull()
    expect(parseState({ version: 1, status: 'nonsense' })).toBeNull()
    expect(parseState(locked({ status: 'staged', staged: null }))).toBeNull()
    const parsed = parseState(locked())
    expect(parsed).toMatchObject({
      version: 1,
      lockId: 'lock-1',
      selectionIds: ['Cube'],
      status: 'locked',
    })
  })

  test('state path honours the override and the per-pid default', () => {
    // Never the working directory: a lock file per engine process would pile
    // up in the person's project.
    expect(blenderStatePath({ pid: 123, uid: 1000, env: {} })).toBe(
      join(tmpdir(), 'autoagent-blender-1000', '123', 'state.json'),
    )
    expect(
      blenderStatePath({ pid: 123, uid: 1000, env: { XDG_RUNTIME_DIR: '/run/user/1000' } }),
    ).toBe(join('/run/user/1000', 'autoagent', 'blender', '123', 'state.json'))
    expect(
      blenderStatePath({
        pid: 123,
        env: { AUTOAGENT_BLENDER_STATE: '/tmp/custom.json' },
      }),
    ).toBe('/tmp/custom.json')
  })

  test('the mod and the tool agree on the default state path', async () => {
    const mod = await import('../../../examples/mods/blender-modeling/mod.js')
    for (const env of [{}, { XDG_RUNTIME_DIR: '/run/user/1000' }]) {
      expect(mod.defaultStatePath(env as NodeJS.ProcessEnv, 123, 1000)).toBe(
        blenderStatePath({ pid: 123, uid: 1000, env }),
      )
    }
  })
})

/* ------------------------------------------------------------------ */
/* State file ownership                                                */
/* ------------------------------------------------------------------ */

describe('state file ownership', () => {
  test('a foreign session file is never written by the tool', () => {
    const file = tempFile()
    const foreign = locked({ sessionId: 'other-session' })
    writeRaw(file, JSON.stringify(foreign))
    const before = readFileSync(file, 'utf8')
    process.env.AUTOAGENT_BLENDER_STATE = file
    process.env.AUTOAGENT_SESSION_ID = 'session-mine'

    expect(
      toolCode(() =>
        stageBlenderSelection({
          lockId: 'lock-1',
          script: 'bpy.data.objects["Cube"].location.x = 1',
        }),
      ),
    ).toBe('FOREIGN_LOCK')
    expect(readFileSync(file, 'utf8')).toBe(before)

    expect(writeBlenderState(foreign, file)).toBe(false)
    expect(readFileSync(file, 'utf8')).toBe(before)
    expect(readBlenderState(file)?.sessionId).toBe('other-session')
  })

  test('an owned staged patch is written atomically and can be read back', () => {
    const file = tempFile()
    const state = locked()
    expect(writeBlenderState(state, file)).toBe(true)
    expect(readBlenderState(file)).toEqual(state)
    expect(readFileSync(file, 'utf8')).toBe(JSON.stringify(state))
  })
})

/* ------------------------------------------------------------------ */
/* Staged script validation                                            */
/* ------------------------------------------------------------------ */

describe('staged script validation', () => {
  test('accepts a scoped bpy mutation', () => {
    expect(
      validateStagedScript(
        'obj = bpy.data.objects["Cube"]\nobj.location.x += 1',
        ['Cube'],
      ),
    ).toContain('location.x')
    expect(
      validateStagedScript('bpy.data.objects.get("Cube").scale = (2, 2, 2)', [
        'Cube',
      ]),
    ).toContain('scale')
    expect(
      validateStagedScript('bpy.context.scene.objects["Cube"].hide_set(True)', [
        'Cube',
      ]),
    ).toContain('hide_set')
  })

  test('rejects an out-of-scope object literal', () => {
    expect(
      scriptCode(() =>
        validateStagedScript('bpy.data.objects["Other"].hide = True', ['Cube']),
      ),
    ).toBe('OUT_OF_SCOPE')
    expect(
      scriptCode(() =>
        validateStagedScript('bpy.context.scene.objects["Cube"].hide = True', [
          'Other',
        ]),
      ),
    ).toBe('OUT_OF_SCOPE')
  })

  test('checks view-layer object access like the other registries', () => {
    expect(
      validateStagedScript('bpy.context.view_layer.objects["Cube"].hide_set(True)', [
        'Cube',
      ]),
    ).toContain('view_layer')
    expect(
      scriptCode(() =>
        validateStagedScript('bpy.context.view_layer.objects["Other"].hide_set(True)', [
          'Cube',
        ]),
      ),
    ).toBe('OUT_OF_SCOPE')
    expect(
      scriptCode(() =>
        validateStagedScript('for o in bpy.context.view_layer.objects: o.hide_set(True)', [
          'Cube',
        ]),
      ),
    ).toBe('OUT_OF_SCOPE')
  })

  test('rejects dynamic registry access', () => {
    expect(
      scriptCode(() =>
        validateStagedScript('bpy.data.objects[name].hide = True', ['Cube']),
      ),
    ).toBe('INVALID_SCRIPT')
    expect(
      scriptCode(() =>
        validateStagedScript('bpy.data.objects.keys()', ['Cube']),
      ),
    ).toBe('OUT_OF_SCOPE')
  })

  test('rejects unbalanced syntax and unterminated strings', () => {
    expect(
      scriptCode(() =>
        validateStagedScript('bpy.data.objects["Cube"].hide = (True', ['Cube']),
      ),
    ).toBe('INVALID_SCRIPT')
    expect(
      scriptCode(() =>
        validateStagedScript('bpy.data.objects["Cube].hide = True', ['Cube']),
      ),
    ).toBe('INVALID_SCRIPT')
    expect(
      scriptCode(() =>
        validateStagedScript('bpy.data.objects["Cube"].hide = True)', ['Cube']),
      ),
    ).toBe('INVALID_SCRIPT')
  })

  test('rejects imports, dunders and process/file APIs', () => {
    for (const script of [
      'import bpy',
      'from os import path',
      '__import__("os")',
      'open("/etc/passwd").read()',
      'exec("x=1")',
      'eval("1+1")',
      'compile("x=1", "x", "exec")',
      'import subprocess',
      'import socket',
      'os.system("rm -rf /")',
      'sys.exit(0)',
      'import shutil',
      'import pathlib',
      'import pickle',
      'import marshal',
    ]) {
      expect(scriptCode(() => validateStagedScript(script, ['Cube']))).toBe(
        'INVALID_SCRIPT',
      )
    }
  })

  test('rejects an oversized script', () => {
    expect(
      scriptCode(() =>
        validateStagedScript(`# ${'x'.repeat(64 * 1024)}`, ['Cube']),
      ),
    ).toBe('TOO_LARGE')
  })
})

/* ------------------------------------------------------------------ */
/* edit_blender_selection                                              */
/* ------------------------------------------------------------------ */

describe('edit_blender_selection', () => {
  test('stages a validated script and never executes it', async () => {
    const file = tempFile()
    writeRaw(file, JSON.stringify(locked({ sessionId: 'session-mine' })))
    process.env.AUTOAGENT_BLENDER_STATE = file
    process.env.AUTOAGENT_SESSION_ID = 'session-mine'
    process.env.AUTOAGENT_BLENDER = '1'

    const call = EditBlenderSelectionTool.call as unknown as (input: {
      lockId: string
      script: string
      summary?: string
    }) => Promise<{ data: { success: true; lockId: string; status: 'staged' } }>

    const result = await call({
      lockId: 'lock-1',
      script: 'bpy.data.objects["Cube"].location.x = 1',
      summary: 'nudge the cube',
    })
    expect(result.data).toMatchObject({
      success: true,
      lockId: 'lock-1',
      status: 'staged',
    })
    const stored = readBlenderState(file)
    expect(stored?.status).toBe('staged')
    expect(stored?.staged?.script).toBe(
      'bpy.data.objects["Cube"].location.x = 1',
    )
    expect(stored?.staged?.summary).toBe('nudge the cube')
  })

  test('a second stage for the same lock is refused', () => {
    const file = tempFile()
    writeRaw(file, JSON.stringify(locked({ sessionId: 'session-mine' })))
    process.env.AUTOAGENT_BLENDER_STATE = file
    process.env.AUTOAGENT_SESSION_ID = 'session-mine'

    expect(
      toolCode(() =>
        stageBlenderSelection({
          lockId: 'lock-1',
          script: 'bpy.data.objects["Cube"].location.x = 1',
        }),
      ),
    ).toBeUndefined()
    expect(
      toolCode(() =>
        stageBlenderSelection({
          lockId: 'lock-1',
          script: 'bpy.data.objects["Cube"].location.x = 2',
        }),
      ),
    ).toBe('ALREADY_STAGED')
  })

  test('rejects a missing, mismatched, expired or foreign lock', () => {
    const file = tempFile()
    process.env.AUTOAGENT_BLENDER_STATE = file
    process.env.AUTOAGENT_SESSION_ID = 'session-mine'

    expect(
      toolCode(() =>
        stageBlenderSelection({ lockId: 'lock-1', script: 'x = 1' }),
      ),
    ).toBe('NO_LOCK')

    writeRaw(file, JSON.stringify(locked({ sessionId: 'session-mine' })))
    expect(
      toolCode(() =>
        stageBlenderSelection({ lockId: 'wrong', script: 'x = 1' }),
      ),
    ).toBe('LOCK_MISMATCH')

    const expired = locked({
      sessionId: 'session-mine',
      createdAt: NOW - STALE_LOCK_MS - 1,
    })
    writeRaw(file, JSON.stringify(expired))
    expect(
      toolCode(() =>
        stageBlenderSelection({ lockId: 'lock-1', script: 'x = 1' }),
      ),
    ).toBe('LOCK_EXPIRED')

    writeRaw(file, JSON.stringify(locked({ sessionId: 'other-session' })))
    expect(
      toolCode(() =>
        stageBlenderSelection({ lockId: 'lock-1', script: 'x = 1' }),
      ),
    ).toBe('FOREIGN_LOCK')
  })

  test('rejections leave the state file byte-identical', () => {
    const file = tempFile()
    const state = locked({ sessionId: 'session-mine' })
    writeRaw(file, JSON.stringify(state))
    process.env.AUTOAGENT_BLENDER_STATE = file
    process.env.AUTOAGENT_SESSION_ID = 'session-mine'
    const before = readFileSync(file, 'utf8')

    expect(
      toolCode(() =>
        stageBlenderSelection({
          lockId: 'lock-1',
          script: 'import os',
        }),
      ),
    ).toBe('INVALID_SCRIPT')
    expect(
      toolCode(() =>
        stageBlenderSelection({
          lockId: 'lock-1',
          script: 'bpy.data.objects["Other"].hide = True',
        }),
      ),
    ).toBe('INVALID_SCRIPT')
    expect(
      toolCode(() =>
        stageBlenderSelection({
          lockId: 'lock-1',
          script: `# ${'x'.repeat(64 * 1024)}`,
        }),
      ),
    ).toBe('TOO_LARGE')
    expect(readFileSync(file, 'utf8')).toBe(before)
  })

  test('a failed edit can be aborted so the next attempt starts clean', () => {
    const file = tempFile()
    writeRaw(file, JSON.stringify(locked({ sessionId: 'session-mine' })))
    process.env.AUTOAGENT_BLENDER_STATE = file
    process.env.AUTOAGENT_SESSION_ID = 'session-mine'

    expect(
      toolCode(() =>
        stageBlenderSelection({
          lockId: 'lock-1',
          script: 'import os',
        }),
      ),
    ).toBe('INVALID_SCRIPT')

    const owned = readBlenderState(file)
    expect(owned?.status).toBe('locked')
    const idle = abortLock(owned as BlenderState, NOW)
    expect(idle.status).toBe('idle')
    expect(writeBlenderState(idle, file)).toBe(true)
    expect(readBlenderState(file)?.status).toBe('idle')
  })

  test('maps a staged result to a clear model-facing line', () => {
    const block = EditBlenderSelectionTool.mapToolResultToToolResultBlockParam(
      {
        success: true,
        lockId: 'lock-1',
        status: 'staged',
        script: 'x = 1',
        summary: 'nudge',
      },
      'tool-1',
    )
    expect(block).toMatchObject({ tool_use_id: 'tool-1', type: 'tool_result' })
    expect(String(block.content)).toContain(
      'Do not call edit_blender_selection again',
    )
  })
})

/* ------------------------------------------------------------------ */
/* Gating and tool calls                                               */
/* ------------------------------------------------------------------ */

describe('gating', () => {
  test('both tools are on by default and only an explicit falsey flag disables them', () => {
    delete process.env.AUTOAGENT_BLENDER
    const file = tempFile()
    writeRaw(file, JSON.stringify(locked()))
    process.env.AUTOAGENT_BLENDER_STATE = file
    expect(BlenderTool.isEnabled()).toBe(true)
    expect(EditBlenderSelectionTool.isEnabled()).toBe(true)

    process.env.AUTOAGENT_BLENDER = '0'
    expect(BlenderTool.isEnabled()).toBe(false)
    expect(EditBlenderSelectionTool.isEnabled()).toBe(false)

    process.env.AUTOAGENT_BLENDER = 'false'
    expect(BlenderTool.isEnabled()).toBe(false)
    expect(EditBlenderSelectionTool.isEnabled()).toBe(false)

    process.env.AUTOAGENT_BLENDER = '1'
    expect(BlenderTool.isEnabled()).toBe(true)
    expect(EditBlenderSelectionTool.isEnabled()).toBe(true)
    const lifecycle = BlenderTool as unknown as {
      isReadOnly(): boolean
      isConcurrencySafe(): boolean
    }
    expect(lifecycle.isReadOnly()).toBe(false)
    expect(lifecycle.isConcurrencySafe()).toBe(false)
  })
})

describe('blender tool calls', () => {
  async function enable(addon: FakeAddon): Promise<void> {
    process.env.AUTOAGENT_BLENDER = '1'
    process.env.AUTOAGENT_BLENDER_HOST = '127.0.0.1'
    process.env.AUTOAGENT_BLENDER_PORT = String(addon.port)
    process.env.AUTOAGENT_BLENDER_TIMEOUT = '500'
  }

  const call = BlenderTool.call as unknown as (input: {
    action: string
    [key: string]: unknown
  }) => Promise<{ data: { action: string; result: unknown } }>

  test('status, scene and selection return tagged data', async () => {
    const addon = await startAddon(
      standardResponder({
        get_selection: { selected: ['Cube'], mode: 'OBJECT' },
      }),
    )
    await enable(addon)

    const status = await call({ action: 'status' })
    expect(status.data.action).toBe('status')
    expect(status.data.result).toMatchObject({ connected: true })

    const scene = await call({ action: 'scene' })
    expect(scene.data).toMatchObject({ action: 'scene' })

    const selection = await call({ action: 'selection' })
    expect(selection.data.result).toEqual({
      selected: ['Cube'],
      mode: 'OBJECT',
    })
  })

  test('select, screenshot, export and exec forward the right params', async () => {
    const addon = await startAddon(
      standardResponder({
        execute_code: { stdout: 'ok' },
        get_viewport_screenshot: { path: '/tmp/shot.png' },
        export_scene: { filepath: '/tmp/out.glb' },
      }),
    )
    await enable(addon)

    await call({ action: 'select', names: ['Cube', 'Cam'], mode: 'EDIT' })
    await call({ action: 'screenshot', maxSize: 512, path: '/tmp/shot.png' })
    await call({
      action: 'export',
      path: '/tmp/out.glb',
      format: 'glb',
      selectionOnly: true,
      objectNames: ['Cube'],
    })
    await call({ action: 'exec', code: 'print("hi")' })

    const screenshot = addon.requests.find(
      request => request.type === 'get_viewport_screenshot',
    )
    expect(screenshot?.params).toEqual({
      max_size: 512,
      filepath: '/tmp/shot.png',
    })
    const exported = addon.requests.find(
      request => request.type === 'export_scene',
    )
    expect(exported?.params).toEqual({
      filepath: '/tmp/out.glb',
      format: 'glb',
      object_names: ['Cube'],
      selection_only: true,
    })
    const executed = addon.requests.find(
      request => request.type === 'execute_code',
    )
    expect(executed?.params.code).toContain('names = ["Cube","Cam"]')
    expect(executed?.params.code).toContain('mode = "EDIT"')
  })

  test('missing required inputs fail before connecting', async () => {
    process.env.AUTOAGENT_BLENDER = '1'
    process.env.AUTOAGENT_BLENDER_PORT = '1'
    await expect(call({ action: 'select' })).rejects.toBeInstanceOf(
      BlenderToolError,
    )
    await expect(call({ action: 'exec' })).rejects.toBeInstanceOf(
      BlenderToolError,
    )
    await expect(call({ action: 'export' })).rejects.toBeInstanceOf(
      BlenderToolError,
    )
  })

  test('renders a status result and an operation result', () => {
    const status = BlenderTool.mapToolResultToToolResultBlockParam(
      {
        action: 'status',
        result: {
          connected: true,
          host: '127.0.0.1',
          port: 9876,
          addon: {
            protocol: 11,
            addonVersion: '1.11.0',
            blenderVersion: '4.2.0',
          },
        },
      },
      'tool-1',
    )
    expect(String(status.content)).toContain('Blender addon connected')
    expect(String(status.content)).toContain('addon 1.11.0')

    const scene = BlenderTool.mapToolResultToToolResultBlockParam(
      { action: 'scene', result: { name: 'Scene' } },
      'tool-2',
    )
    expect(String(scene.content)).toContain('scene:')
    expect(String(scene.content)).toContain('"name": "Scene"')

    const render = BlenderTool.renderToolUseMessage as unknown as (input: {
      action: string
      names?: string[]
    }) => unknown
    expect(String(render({ action: 'select', names: ['a', 'b'] }))).toContain(
      '2',
    )
  })
})

/* ------------------------------------------------------------------ */
/* CLI edit flow                                                       */
/* ------------------------------------------------------------------ */

describe('CLI edit flow', () => {
  async function enable(addon: FakeAddon): Promise<void> {
    process.env.AUTOAGENT_BLENDER = '1'
    process.env.AUTOAGENT_BLENDER_HOST = '127.0.0.1'
    process.env.AUTOAGENT_BLENDER_PORT = String(addon.port)
    process.env.AUTOAGENT_BLENDER_TIMEOUT = '500'
  }

  const call = BlenderTool.call as unknown as (input: {
    action: string
    [key: string]: unknown
  }) => Promise<{ data: { action: string; result: unknown } }>

  test('begin_edit locks the current selection and returns a prompt', async () => {
    const addon = await startAddon(
      standardResponder({
        get_selection: { names: ['Cube', 'Camera'], mode: 'OBJECT' },
      }),
    )
    await enable(addon)
    const file = tempFile()
    process.env.AUTOAGENT_BLENDER_STATE = file
    process.env.AUTOAGENT_SESSION_ID = 'session-mine'

    const out = await call({ action: 'begin_edit' })
    const result = out.data.result as {
      lockId: string
      selectionIds: string[]
      prompt: string
    }
    expect(result.lockId).toBeTruthy()
    expect(result.selectionIds).toEqual(['Cube', 'Camera'])
    expect(result.prompt).toContain(result.lockId)

    const state = readBlenderState(file)
    expect(state?.status).toBe('locked')
    expect(state?.lockId).toBe(result.lockId)
    expect(state?.selectionIds).toEqual(['Cube', 'Camera'])
  })

  test('begin_edit refuses an empty selection', async () => {
    const addon = await startAddon(
      standardResponder({ get_selection: { names: [] } }),
    )
    await enable(addon)
    process.env.AUTOAGENT_BLENDER_STATE = tempFile()

    await expect(call({ action: 'begin_edit' })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    })
  })

  test('apply_staged executes exactly the staged script and clears the lock', async () => {
    const addon = await startAddon(
      standardResponder({ execute_code: { executed: true, result: 'ok' } }),
    )
    await enable(addon)
    const file = tempFile()
    process.env.AUTOAGENT_BLENDER_STATE = file
    process.env.AUTOAGENT_SESSION_ID = 'session-mine'
    writeRaw(
      file,
      JSON.stringify(
        locked({
          status: 'staged',
          staged: { script: 'bpy.data.objects["Cube"].name = "Cube"' },
        }),
      ),
    )

    const out = await call({ action: 'apply_staged' })
    expect((out.data.result as { applied: boolean }).applied).toBe(true)
    expect(readBlenderState(file)?.status).toBe('idle')
  })

  test('apply_staged without a staged patch is NO_LOCK', async () => {
    const addon = await startAddon(standardResponder())
    await enable(addon)
    process.env.AUTOAGENT_BLENDER_STATE = tempFile()

    await expect(call({ action: 'apply_staged' })).rejects.toMatchObject({
      code: 'NO_LOCK',
    })
  })

  test('a failed apply aborts the lock', async () => {
    const addon = await startAddon(
      standardResponder({ execute_code: { error: 'boom' } }),
    )
    await enable(addon)
    const file = tempFile()
    process.env.AUTOAGENT_BLENDER_STATE = file
    process.env.AUTOAGENT_SESSION_ID = 'session-mine'
    writeRaw(
      file,
      JSON.stringify(
        locked({
          status: 'staged',
          staged: { script: 'bpy.data.objects["Cube"].name = "x"' },
        }),
      ),
    )

    await expect(call({ action: 'apply_staged' })).rejects.toBeInstanceOf(
      BlenderCommandError,
    )
    expect(readBlenderState(file)?.status).toBe('idle')
  })

  test('cancel_edit clears a matching lock', async () => {
    const addon = await startAddon(standardResponder())
    await enable(addon)
    const file = tempFile()
    process.env.AUTOAGENT_BLENDER_STATE = file
    process.env.AUTOAGENT_SESSION_ID = 'session-mine'
    writeRaw(file, JSON.stringify(locked()))

    const out = await call({ action: 'cancel_edit', lockId: 'lock-1' })
    expect((out.data.result as { cancelled: boolean }).cancelled).toBe(true)
    expect(readBlenderState(file)?.status).toBe('idle')
  })
})

/* ------------------------------------------------------------------ */
/* Misc contracts                                                      */
/* ------------------------------------------------------------------ */

describe('constants', () => {
  test('defaults are the frozen protocol values', () => {
    expect(DEFAULT_HOST).toBe('127.0.0.1')
    expect(DEFAULT_PORT).toBe(9876)
    expect(PROTOCOL_VERSION).toBe(11)
  })

  test('BlenderNotConnected is a BlenderError and is exported', () => {
    const error = new BlenderNotConnected('nope')
    expect(error).toBeInstanceOf(BlenderError)
    expect(error.code).toBe('NOT_CONNECTED')
  })
})
