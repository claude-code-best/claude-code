import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createConnection, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { StringDecoder } from 'node:string_decoder'

/**
 * Engine-side Blender bridge.
 *
 * The vendored addon speaks one JSON object per request and one JSON object
 * per reply, with no length prefix and no newline. A reader must accumulate
 * bytes and try to parse; fragmented UTF-8 must survive. This module owns that
 * framing plus the handshake, deadlines and the lock/stage contract the
 * `blender` and `edit_blender_selection` tools share. Tools never touch a
 * socket or the state file directly.
 *
 * A fresh connection is opened per request:
 *
 *   connect -> get_addon_info -> require protocol 11 -> command -> parse
 *
 * This is deliberately simple: the addon has no request ids and replies on the
 * same socket, so one in-flight request per connection removes any ambiguity
 * about which reply belongs to which request.
 */

export const DEFAULT_HOST = '127.0.0.1'
export const DEFAULT_PORT = 9876
/** The addon version this client was written against. */
export const PROTOCOL_VERSION = 11
export const DEFAULT_TIMEOUT_MS = 30_000
/** `execute_code` runs on Blender's main thread and may legitimately be slow. */
export const EXEC_TIMEOUT_MS = 120_000
/** A confused addon must not grow the buffer without bound. */
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024

// biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export type BlenderErrorCode =
  | 'NOT_CONNECTED'
  | 'TIMEOUT'
  | 'PROTOCOL'
  | 'COMMAND'
  | 'INVALID_INPUT'

export class BlenderError extends Error {
  readonly code: BlenderErrorCode

  constructor(
    code: BlenderErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'BlenderError'
    this.code = code
  }
}

export class BlenderNotConnected extends BlenderError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('NOT_CONNECTED', message, options)
    this.name = 'BlenderNotConnected'
  }
}

export class BlenderTimeout extends BlenderError {
  constructor(message: string) {
    super('TIMEOUT', message)
    this.name = 'BlenderTimeout'
  }
}

export class BlenderProtocolError extends BlenderError {
  constructor(message: string, options?: { cause?: unknown }) {
    super('PROTOCOL', message, options)
    this.name = 'BlenderProtocolError'
  }
}

export class BlenderCommandError extends BlenderError {
  constructor(message: string) {
    super('COMMAND', message)
    this.name = 'BlenderCommandError'
  }
}

/* ------------------------------------------------------------------ */
/* Environment                                                         */
/* ------------------------------------------------------------------ */

export function blenderHost(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.AUTOAGENT_BLENDER_HOST
  return value && value.trim() ? value.trim() : DEFAULT_HOST
}

export function blenderPort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.AUTOAGENT_BLENDER_PORT
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65_536
    ? parsed
    : DEFAULT_PORT
}

export function blenderTimeout(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.AUTOAGENT_BLENDER_TIMEOUT
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS
}

/* ------------------------------------------------------------------ */
/* Framing                                                             */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read one complete JSON value from the front of `buffer`.
 *
 * The addon does not delimit replies. A fragmented reply yields `null` (read
 * more); a concatenated reply leaves the next object in `rest`. A buffer that
 * does not start with `{` or `[` is returned whole so `interpretBlenderReply`
 * can fail loudly instead of the caller waiting for a timeout.
 */
export function extractJsonValue(
  buffer: string,
): { raw: string; rest: string } | null {
  let start = 0
  while (start < buffer.length && /\s/.test(buffer[start])) start += 1
  if (start >= buffer.length) return null

  const first = buffer[start]
  if (first !== '{' && first !== '[') {
    return { raw: buffer.slice(start), rest: '' }
  }

  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < buffer.length; index += 1) {
    const char = buffer[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{' || char === '[') depth += 1
    else if (char === '}' || char === ']') {
      depth -= 1
      if (depth <= 0) {
        return {
          raw: buffer.slice(start, index + 1),
          rest: buffer.slice(index + 1),
        }
      }
    }
  }
  return null
}

/**
 * Turn one wire reply into its `result`, or throw a typed failure.
 *
 * `{status:"error",message}` is a handler failure. Some handlers catch their
 * own errors and put `error` inside a success result (screenshot, export and
 * selection do this); that is a failure too.
 */
export function interpretBlenderReply(raw: string): unknown {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new BlenderProtocolError(
      `Blender reply is not valid JSON: ${raw.slice(0, 200)}`,
      { cause: error },
    )
  }
  if (!isRecord(parsed)) {
    throw new BlenderProtocolError('Blender reply is not a JSON object')
  }
  if (parsed.status === 'error') {
    const message =
      typeof parsed.message === 'string'
        ? parsed.message
        : 'unknown addon error'
    throw new BlenderCommandError(`Blender addon error: ${message}`)
  }
  if (parsed.status !== 'success') {
    throw new BlenderProtocolError('Blender reply is missing status "success"')
  }
  const result = parsed.result
  if (
    isRecord(result) &&
    typeof result.error === 'string' &&
    result.error.length > 0
  ) {
    throw new BlenderCommandError(`Blender addon error: ${result.error}`)
  }
  return result
}

export interface AddonInfo {
  protocol: number
  name?: string
  addonVersion?: string
  blenderVersion?: string
}

export function parseAddonInfo(result: unknown): AddonInfo {
  if (!isRecord(result)) {
    throw new BlenderProtocolError('Blender handshake result is not an object')
  }
  const protocol =
    typeof result.protocol_version === 'number'
      ? result.protocol_version
      : typeof result.protocol === 'number'
        ? result.protocol
        : Number.NaN
  if (!Number.isFinite(protocol)) {
    throw new BlenderProtocolError(
      'Blender handshake did not report a protocol version',
    )
  }
  if (protocol !== PROTOCOL_VERSION) {
    throw new BlenderProtocolError(
      `Blender addon protocol ${protocol} is not supported (need ${PROTOCOL_VERSION})`,
    )
  }
  return {
    protocol,
    ...(typeof result.name === 'string' ? { name: result.name } : {}),
    ...(Array.isArray(result.addon_version)
      ? { addonVersion: result.addon_version.join('.') }
      : typeof result.addon_version === 'string'
        ? { addonVersion: result.addon_version }
        : {}),
    ...(typeof result.blender_version === 'string'
      ? { blenderVersion: result.blender_version }
      : {}),
  }
}

/* ------------------------------------------------------------------ */
/* Selection script                                                    */
/* ------------------------------------------------------------------ */

export const SELECT_MODES = [
  'OBJECT',
  'EDIT',
  'VERTEX',
  'EDGE',
  'FACE',
] as const
export type BlenderSelectMode = (typeof SELECT_MODES)[number]

export const MAX_SELECTION_IDS = 1000
export const MAX_ID_CHARS = 256

const SELECT_MODES_SET = new Set<string>(SELECT_MODES)

/**
 * Validate object names before they are embedded in a bpy snippet. Quotes and
 * newlines are legal in a Blender object name; the snippet uses JSON-encoded
 * literals so they cannot break out. Only control characters (which cannot be
 * carried literally and are almost always a mistake) are refused.
 */
export function validateSelectNames(names: unknown): string[] {
  if (!Array.isArray(names)) {
    throw new BlenderError('INVALID_INPUT', 'blender: names must be an array')
  }
  if (names.length === 0) {
    throw new BlenderError(
      'INVALID_INPUT',
      'blender: names must contain at least one object',
    )
  }
  if (names.length > MAX_SELECTION_IDS) {
    throw new BlenderError(
      'INVALID_INPUT',
      `blender: at most ${MAX_SELECTION_IDS} objects may be selected`,
    )
  }
  for (const name of names) {
    if (
      typeof name !== 'string' ||
      name.length === 0 ||
      name.length > MAX_ID_CHARS
    ) {
      throw new BlenderError(
        'INVALID_INPUT',
        'blender: every object name must be a non-empty bounded string',
      )
    }
    if (CONTROL_CHARS.test(name)) {
      throw new BlenderError(
        'INVALID_INPUT',
        'blender: object names may not contain control characters',
      )
    }
  }
  return names as string[]
}

export function normalizeSelectMode(mode: unknown): BlenderSelectMode {
  if (mode === undefined || mode === null) return 'OBJECT'
  const upper = typeof mode === 'string' ? mode.toUpperCase() : ''
  if (!SELECT_MODES_SET.has(upper)) {
    throw new BlenderError(
      'INVALID_INPUT',
      `blender: mode must be one of ${SELECT_MODES.join(', ')}`,
    )
  }
  return upper as BlenderSelectMode
}

/**
 * The bpy snippet behind `select`. The addon exposes no select command, so
 * this is an `execute_code` payload. `names` and `mode` are JSON literals;
 * JSON string syntax is valid Python string syntax, so a name containing a
 * quote or newline is data, never code.
 */
export function buildSelectScript(
  names: readonly string[],
  mode: BlenderSelectMode = 'OBJECT',
): string {
  return [
    'bpy.ops.object.select_all(action="DESELECT")',
    `names = ${JSON.stringify(names)}`,
    'selected = []',
    'missing = []',
    'for name in names:',
    '    obj = bpy.data.objects.get(name)',
    '    if obj is None:',
    '        missing.append(name)',
    '        continue',
    '    obj.select_set(True)',
    '    selected.append(obj.name)',
    'if selected:',
    '    bpy.context.view_layer.objects.active = bpy.data.objects[selected[0]]',
    `mode = ${JSON.stringify(mode)}`,
    'if selected and mode != "OBJECT":',
    '    bpy.ops.object.mode_set(mode="EDIT")',
    '    if mode in ("VERTEX", "EDGE", "FACE"):',
    '        bpy.ops.mesh.select_mode(type=mode)',
    'print("selected: " + ", ".join(selected))',
    'if missing:',
    '    print("missing: " + ", ".join(missing))',
  ].join('\n')
}

/* ------------------------------------------------------------------ */
/* Bridge                                                              */
/* ------------------------------------------------------------------ */

export interface BlenderStatus {
  connected: boolean
  host: string
  port: number
  addon?: AddonInfo
  error?: string
}

export interface BlenderBridgeOptions {
  host?: string
  port?: number
  timeoutMs?: number
  execTimeoutMs?: number
}

export interface ScreenshotOptions {
  maxSize?: number
  filepath?: string
}

export interface ExportSceneOptions {
  filepath: string
  format: string
  objectNames?: string[]
  selectionOnly?: boolean
}

interface ReplyWaiter {
  resolve: (raw: string) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface Connection {
  socket: Socket
  buffer: string
  decoder: StringDecoder
  bytes: number
  waiter: ReplyWaiter | null
}

export class BlenderBridge {
  readonly host: string
  readonly port: number
  readonly timeoutMs: number
  readonly execTimeoutMs: number

  constructor(options: BlenderBridgeOptions = {}) {
    this.host = options.host ?? blenderHost()
    this.port = options.port ?? blenderPort()
    this.timeoutMs = options.timeoutMs ?? blenderTimeout()
    this.execTimeoutMs = options.execTimeoutMs ?? EXEC_TIMEOUT_MS
  }

  /** A clean probe: a closed port is `connected:false`, never a throw. */
  async status(): Promise<BlenderStatus> {
    try {
      const result = await this.request('get_addon_info', {})
      return {
        connected: true,
        host: this.host,
        port: this.port,
        addon: parseAddonInfo(result),
      }
    } catch (error) {
      if (!(error instanceof BlenderError)) throw error
      return {
        connected: false,
        host: this.host,
        port: this.port,
        error: error.message,
      }
    }
  }

  async scene(): Promise<unknown> {
    return this.request('get_scene_info', {})
  }

  async selection(): Promise<unknown> {
    return this.request('get_selection', {})
  }

  async select(names: unknown, mode: unknown = 'OBJECT'): Promise<unknown> {
    const safeNames = validateSelectNames(names)
    const safeMode = normalizeSelectMode(mode)
    return this.exec(buildSelectScript(safeNames, safeMode))
  }

  async screenshot(options: ScreenshotOptions = {}): Promise<unknown> {
    return this.request('get_viewport_screenshot', {
      ...(options.maxSize !== undefined ? { max_size: options.maxSize } : {}),
      ...(options.filepath !== undefined ? { filepath: options.filepath } : {}),
    })
  }

  async exportScene(options: ExportSceneOptions): Promise<unknown> {
    if (
      typeof options.filepath !== 'string' ||
      options.filepath.trim().length === 0
    ) {
      throw new BlenderError(
        'INVALID_INPUT',
        'blender: export requires a filepath',
      )
    }
    return this.request('export_scene', {
      filepath: options.filepath,
      format: options.format,
      object_names: options.objectNames ?? [],
      selection_only: options.selectionOnly ?? false,
    })
  }

  /** The escape hatch. Trusted code only; it gets the long deadline. */
  async exec(code: string): Promise<unknown> {
    if (typeof code !== 'string' || code.trim().length === 0) {
      throw new BlenderError(
        'INVALID_INPUT',
        'blender: code must be a non-empty string',
      )
    }
    return this.request('execute_code', { code }, this.execTimeoutMs)
  }

  /** No persistent socket to close; kept for a symmetric tool lifecycle. */
  close(): void {}

  private async request(
    type: string,
    params: Record<string, unknown>,
    timeoutMs = this.timeoutMs,
  ): Promise<unknown> {
    const socket = await this.connect(this.timeoutMs)
    try {
      const connection = this.attach(socket)
      // Handshake first on every connection: a listening port is not proof the
      // addon is ready or compatible.
      await this.writeCommand(connection, 'get_addon_info', {}, this.timeoutMs)
      const infoRaw = await this.readReply(
        connection,
        this.timeoutMs,
        'get_addon_info',
      )
      parseAddonInfo(interpretBlenderReply(infoRaw))

      await this.writeCommand(connection, type, params, timeoutMs)
      const raw = await this.readReply(connection, timeoutMs, type)
      return interpretBlenderReply(raw)
    } finally {
      socket.destroy()
    }
  }

  private connect(timeoutMs: number): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = createConnection({ host: this.host, port: this.port })
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        socket.destroy()
        reject(
          new BlenderNotConnected(
            `Blender addon did not accept a TCP connection on ${this.host}:${this.port}`,
          ),
        )
      }, timeoutMs)
      timer.unref?.()
      socket.once('connect', () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(socket)
      })
      socket.once('error', error => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(
          new BlenderNotConnected(
            `Could not connect to the Blender addon on ${this.host}:${this.port}: ${error.message}`,
            { cause: error },
          ),
        )
      })
    })
  }

  private attach(socket: Socket): Connection {
    const connection: Connection = {
      socket,
      buffer: '',
      decoder: new StringDecoder('utf8'),
      bytes: 0,
      waiter: null,
    }

    socket.on('data', (chunk: Buffer) => {
      connection.bytes += chunk.length
      connection.buffer += connection.decoder.write(chunk)
      if (connection.bytes > MAX_RESPONSE_BYTES) {
        this.failWaiter(
          connection,
          new BlenderProtocolError('Blender reply exceeded the size limit'),
        )
        socket.destroy()
        return
      }
      this.pump(connection)
    })
    socket.on('error', error => {
      this.failWaiter(
        connection,
        new BlenderNotConnected(`Blender connection failed: ${error.message}`, {
          cause: error,
        }),
      )
    })
    socket.on('close', () => {
      this.failWaiter(
        connection,
        new BlenderNotConnected('Blender addon closed the connection'),
      )
    })
    return connection
  }

  private pump(connection: Connection): void {
    while (connection.waiter) {
      const extracted = extractJsonValue(connection.buffer)
      if (!extracted) return
      connection.buffer = extracted.rest
      const waiter = connection.waiter
      connection.waiter = null
      clearTimeout(waiter.timer)
      waiter.resolve(extracted.raw)
    }
  }

  private readReply(
    connection: Connection,
    timeoutMs: number,
    type: string,
  ): Promise<string> {
    const buffered = extractJsonValue(connection.buffer)
    if (buffered) {
      connection.buffer = buffered.rest
      return Promise.resolve(buffered.raw)
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (connection.waiter?.timer === timer) {
          connection.waiter = null
          reject(
            new BlenderTimeout(
              `Blender did not answer "${type}" within ${timeoutMs}ms`,
            ),
          )
        }
      }, timeoutMs)
      timer.unref?.()
      connection.waiter = { resolve, reject, timer }
    })
  }

  private writeCommand(
    connection: Connection,
    type: string,
    params: Record<string, unknown>,
    timeoutMs = this.timeoutMs,
  ): Promise<void> {
    const data = JSON.stringify({ type, params })
    return new Promise((resolve, reject) => {
      let done = false
      let timer: ReturnType<typeof setTimeout> | undefined
      let onError: (error: Error) => void
      const finish = (error?: Error): void => {
        if (done) return
        done = true
        if (timer) clearTimeout(timer)
        connection.socket.off('error', onError)
        if (error) reject(error)
        else resolve()
      }
      onError = (error: Error): void => {
        finish(
          new BlenderNotConnected(
            `Could not send "${type}" to Blender: ${error.message}`,
            { cause: error },
          ),
        )
      }
      timer = setTimeout(
        () =>
          finish(
            new BlenderTimeout(
              `Blender did not accept "${type}" within ${timeoutMs}ms`,
            ),
          ),
        timeoutMs,
      )
      timer.unref?.()
      connection.socket.once('error', onError)
      connection.socket.write(data, error => {
        finish(
          error
            ? new BlenderNotConnected(
                `Could not send "${type}" to Blender: ${error.message}`,
                { cause: error },
              )
            : undefined,
        )
      })
    })
  }

  private failWaiter(connection: Connection, error: Error): void {
    const waiter = connection.waiter
    if (!waiter) return
    connection.waiter = null
    clearTimeout(waiter.timer)
    waiter.reject(error)
  }
}

/* ------------------------------------------------------------------ */
/* Lock / stage state                                                  */
/* ------------------------------------------------------------------ */

export const STATE_VERSION = 1 as const
/** Mirrors the whiteboard: a lock nobody finished dies after ten minutes. */
export const STALE_LOCK_MS = 10 * 60 * 1000

export type BlenderLockStatus = 'idle' | 'locked' | 'staged'

export interface BlenderStagedPatch {
  script: string
  summary?: string
}

/**
 * The on-disk contract shared with the blender-modeling mod:
 *
 *   { version, sessionId, lockId, selectionIds, selectionPayload,
 *     status, staged, createdAt }
 *
 * `idle` means nothing is held. `locked` means the model was asked and may
 * stage; `staged` means a validated script is waiting for the UI.
 */
export interface BlenderState {
  version: 1
  sessionId: string
  lockId: string | null
  selectionIds: string[]
  selectionPayload: unknown
  status: BlenderLockStatus
  staged: BlenderStagedPatch | null
  createdAt: number
}

export interface BlenderStatePathOptions {
  pid?: number
  env?: NodeJS.ProcessEnv
  uid?: number | string
}

/**
 * The per-user directory for default (per-process) state files.
 *
 * Never the working directory: that is the person's project, and a lock file
 * per engine process would pile up in it. `XDG_RUNTIME_DIR` is per user and
 * private; without it a uid-named directory under the system temp dir keeps
 * users apart. The mod computes the same path (`defaultStatePath`).
 */
export function blenderStateRoot(
  env: NodeJS.ProcessEnv = process.env,
  uid: number | string = process.getuid?.() ?? 'user',
): string {
  const runtime = env.XDG_RUNTIME_DIR
  if (runtime && runtime.trim()) return join(runtime, 'autoagent', 'blender')
  return join(tmpdir(), `autoagent-blender-${uid}`)
}

/**
 * `AUTOAGENT_BLENDER_STATE`, else a per-process file.
 *
 * The desktop always sets the override to one file per session under its data
 * directory, where it reads the staged patch to apply it. Keying the default
 * by PID keeps two engine processes from reading or overwriting each other's
 * lock. A host that shares a lock sets the override and is then subject to the
 * explicit session-ownership check.
 */
export function blenderStatePath(
  options: BlenderStatePathOptions = {},
): string {
  const env = options.env ?? process.env
  const override = env.AUTOAGENT_BLENDER_STATE
  if (override && override.trim()) return override
  const pid = options.pid ?? process.pid
  return join(
    blenderStateRoot(env, options.uid ?? process.getuid?.() ?? 'user'),
    String(pid),
    'state.json',
  )
}

/** The session id the engine was started for, else the PID. */
export function blenderStateOwner(
  env: NodeJS.ProcessEnv = process.env,
  pid: number = process.pid,
): string {
  const session = env.AUTOAGENT_SESSION_ID
  return session && session.trim() ? session : String(pid)
}

/** Alias kept for the mod, which mirrors the whiteboard naming. */
export const stateOwner = blenderStateOwner

/** Only an override can point two sessions at one file. */
export function usesSharedBlenderStateFile(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const override = env.AUTOAGENT_BLENDER_STATE
  return typeof override === 'string' && override.trim().length > 0
}

/** Selection ids: strings, first occurrence wins, order kept, capped. */
export function normalizeSelectionIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const ids: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    if (!item || item.length > MAX_ID_CHARS || CONTROL_CHARS.test(item))
      continue
    if (item.trim().length === 0) continue
    if (seen.has(item)) continue
    seen.add(item)
    ids.push(item)
    if (ids.length >= MAX_SELECTION_IDS) break
  }
  return ids
}

export function idleState(
  sessionId: string = blenderStateOwner(),
  now = 0,
): BlenderState {
  return {
    version: STATE_VERSION,
    sessionId,
    lockId: null,
    selectionIds: [],
    selectionPayload: null,
    status: 'idle',
    staged: null,
    createdAt: now,
  }
}

export function isActive(state: BlenderState): boolean {
  return state.status !== 'idle' && state.lockId !== null
}

/** "Older than ten minutes", not "at least ten minutes". */
export function isStale(
  state: BlenderState,
  now = Date.now(),
  maxAge = STALE_LOCK_MS,
): boolean {
  if (!isActive(state)) return false
  if (!Number.isFinite(state.createdAt) || state.createdAt <= 0) return true
  return now - state.createdAt > maxAge
}

export type BeginLockResult =
  | { ok: true; state: BlenderState }
  | { ok: false; reason: 'empty-selection' | 'invalid-lock' | 'locked' }

/**
 * Start a lock. Empty selection is refused before any prompt is produced: a
 * prompt with an empty boundary would let a model edit anything.
 *
 * Mirrors the whiteboard's pure `beginLock`; `beginLockFrom` adds the
 * "already locked" refusal the mod performs.
 */
export function beginLock(
  sessionId: string,
  lockId: string,
  selectionIds: unknown,
  now = Date.now(),
  selectionPayload: unknown = null,
): BeginLockResult {
  if (
    typeof lockId !== 'string' ||
    lockId.length === 0 ||
    CONTROL_CHARS.test(lockId)
  ) {
    return { ok: false, reason: 'invalid-lock' }
  }
  const ids = normalizeSelectionIds(selectionIds)
  if (ids.length === 0) return { ok: false, reason: 'empty-selection' }
  return {
    ok: true,
    state: {
      version: STATE_VERSION,
      sessionId,
      lockId,
      selectionIds: ids,
      selectionPayload,
      status: 'locked',
      staged: null,
      createdAt: now,
    },
  }
}

/** Begin a lock only when nothing is currently held. */
export function beginLockFrom(
  current: BlenderState | null,
  lockId: string,
  selectionIds: unknown,
  now = Date.now(),
  selectionPayload: unknown = null,
): BeginLockResult {
  if (current && isActive(current)) return { ok: false, reason: 'locked' }
  return beginLock(
    current?.sessionId ?? blenderStateOwner(),
    lockId,
    selectionIds,
    now,
    selectionPayload,
  )
}

/**
 * Record a validated staged script. Validation belongs to the tool; this is
 * the state transition, kept pure so the test can drive it without files.
 * The lock's creation time is preserved: staging must not extend its life.
 */
export function stagePatch(
  state: BlenderState,
  lockId: string,
  script: string,
  summary?: string,
): BlenderState | null {
  if (!isActive(state) || state.lockId !== lockId) return null
  if (state.status !== 'locked') return null
  if (typeof script !== 'string' || script.trim().length === 0) return null
  return {
    ...state,
    status: 'staged',
    staged: {
      script,
      ...(typeof summary === 'string' && summary.length > 0 ? { summary } : {}),
    },
  }
}

export interface ApplyResult {
  state: BlenderState
  applied: boolean
  stale: boolean
}

/**
 * Clear the lock for an applied patch — at most once.
 *
 * Only `staged` + matching `lockId` + fresh qualifies. A second `applied`
 * finds `idle` and changes nothing; an old or foreign lock id changes nothing.
 * A stale staged patch is discarded rather than applied.
 */
export function applyStaged(
  state: BlenderState,
  lockId: string,
  now = Date.now(),
  maxAge = STALE_LOCK_MS,
): ApplyResult {
  if (!isActive(state)) return { state, applied: false, stale: false }
  if (isStale(state, now, maxAge)) {
    return {
      state: idleState(state.sessionId, now),
      applied: false,
      stale: true,
    }
  }
  if (
    typeof lockId !== 'string' ||
    lockId.length === 0 ||
    state.lockId !== lockId
  ) {
    return { state, applied: false, stale: false }
  }
  if (state.status !== 'staged' || !state.staged) {
    return { state, applied: false, stale: false }
  }
  return { state: idleState(state.sessionId, now), applied: true, stale: false }
}

export interface CancelResult {
  state: BlenderState
  cancelled: boolean
}

/**
 * Drop a lock. Idempotent: cancelling idle state, or a lock already gone, is a
 * no-op. A supplied lock id must match; an omitted id means "whatever is held".
 */
export function cancelLock(
  state: BlenderState,
  lockId = '',
  now = Date.now(),
): CancelResult {
  if (!isActive(state)) return { state, cancelled: false }
  if (lockId && state.lockId !== lockId) return { state, cancelled: false }
  return { state: idleState(state.sessionId, now), cancelled: true }
}

/**
 * Drop everything. Used after a failed tool call so the next attempt starts
 * clean. Idempotent on idle state.
 */
export function abortLock(state: BlenderState, now = Date.now()): BlenderState {
  if (!isActive(state)) return state
  return idleState(state.sessionId, now)
}

export interface StaleResult {
  state: BlenderState
  stale: boolean
}

/** Recover a lock nobody finished, with the age rule above. */
export function clearStale(
  state: BlenderState,
  now = Date.now(),
  maxAge = STALE_LOCK_MS,
): StaleResult {
  if (!isStale(state, now, maxAge)) return { state, stale: false }
  return { state: idleState(state.sessionId, now), stale: true }
}

/**
 * Tolerate a missing, old or corrupt file: anything that is not a valid
 * version-1 state reads as `null`. A malformed file must cost one edit, never
 * the session.
 */
export function parseState(
  raw: unknown,
  fallbackSessionId: string = blenderStateOwner(),
): BlenderState | null {
  if (!isRecord(raw) || raw.version !== STATE_VERSION) return null
  const status = raw.status
  if (status !== 'idle' && status !== 'locked' && status !== 'staged') {
    return null
  }

  const sessionId =
    typeof raw.sessionId === 'string' &&
    raw.sessionId.length > 0 &&
    !CONTROL_CHARS.test(raw.sessionId)
      ? raw.sessionId
      : fallbackSessionId
  const createdAt =
    typeof raw.createdAt === 'number' &&
    Number.isFinite(raw.createdAt) &&
    raw.createdAt >= 0
      ? raw.createdAt
      : 0
  const selectionIds = normalizeSelectionIds(raw.selectionIds)
  const selectionPayload = raw.selectionPayload ?? null

  if (status === 'idle') {
    return idleState(sessionId, createdAt)
  }

  const lockId =
    typeof raw.lockId === 'string' &&
    raw.lockId.length > 0 &&
    !CONTROL_CHARS.test(raw.lockId)
      ? raw.lockId
      : null
  if (!lockId || selectionIds.length === 0) return null

  if (status === 'staged') {
    if (
      !isRecord(raw.staged) ||
      typeof raw.staged.script !== 'string' ||
      raw.staged.script.length === 0
    ) {
      return null
    }
    if (
      raw.staged.summary !== undefined &&
      raw.staged.summary !== null &&
      typeof raw.staged.summary !== 'string'
    ) {
      return null
    }
    return {
      version: STATE_VERSION,
      sessionId,
      lockId,
      selectionIds,
      selectionPayload,
      status: 'staged',
      staged: {
        script: raw.staged.script,
        ...(typeof raw.staged.summary === 'string'
          ? { summary: raw.staged.summary }
          : {}),
      },
      createdAt,
    }
  }

  return {
    version: STATE_VERSION,
    sessionId,
    lockId,
    selectionIds,
    selectionPayload,
    status: 'locked',
    staged: null,
    createdAt,
  }
}

/** Alias matching the module's other `Blender*` names. */
export const parseBlenderState = parseState

/** Pure read; a missing or corrupt file is "no state", never an exception. */
export function readBlenderState(
  file = blenderStatePath(),
): BlenderState | null {
  try {
    if (!existsSync(file)) return null
    return parseState(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    return null
  }
}

/**
 * Atomic temp + rename so a concurrent reader never sees half a file.
 *
 * A shared file that belongs to another session is never written, not even to
 * clear it. Returns `false` when the write was refused for that reason.
 */
export function writeBlenderState(
  state: BlenderState,
  file = blenderStatePath(),
  owner: string = blenderStateOwner(),
): boolean {
  if (usesSharedBlenderStateFile() && state.sessionId !== owner) return false
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  try {
    writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 })
    renameSync(tmp, file)
    return true
  } catch (error) {
    try {
      rmSync(tmp, { force: true })
    } catch {
      // The original failure is the one worth reporting.
    }
    throw error
  }
}

/* ------------------------------------------------------------------ */
/* Staged script validation                                            */
/* ------------------------------------------------------------------ */

/** One staged script may not crowd out the session. */
export const MAX_STAGED_SCRIPT_CHARS = 64 * 1024

export type BlenderScriptErrorCode =
  | 'INVALID_SCRIPT'
  | 'TOO_LARGE'
  | 'OUT_OF_SCOPE'

export class BlenderScriptError extends Error {
  readonly code: BlenderScriptErrorCode

  constructor(code: BlenderScriptErrorCode, message: string) {
    super(message)
    this.name = 'BlenderScriptError'
    this.code = code
  }
}

function scriptFail(code: BlenderScriptErrorCode, message: string): never {
  throw new BlenderScriptError(code, message)
}

/**
 * Walk Python syntax far enough to prove brackets and quotes balance.
 *
 * It understands single/double and triple-quoted strings, escapes and
 * comments; it is not a parser. A script that fails here would be a syntax
 * error in Blender, and a staged patch should fail in the validator instead.
 */
export function assertBalancedPython(code: string): void {
  const stack: string[] = []
  let index = 0
  while (index < code.length) {
    const char = code[index]
    if (char === '#') {
      while (index < code.length && code[index] !== '\n') index += 1
      continue
    }
    if (char === '"' || char === "'") {
      const triple = code.slice(index, index + 3)
      const quote = triple === '"""' || triple === "'''" ? triple : char
      index += quote.length
      let closed = false
      while (index < code.length) {
        if (code[index] === '\\') {
          index += 2
          continue
        }
        if (quote.length === 3) {
          if (code.startsWith(quote, index)) {
            index += 3
            closed = true
            break
          }
        } else if (code[index] === quote) {
          index += 1
          closed = true
          break
        }
        index += 1
      }
      if (!closed) {
        scriptFail(
          'INVALID_SCRIPT',
          'edit_blender_selection: the script has an unterminated string',
        )
      }
      continue
    }
    if (char === '(' || char === '[' || char === '{') {
      stack.push(char)
      index += 1
      continue
    }
    if (char === ')' || char === ']' || char === '}') {
      const expected = char === ')' ? '(' : char === ']' ? '[' : '{'
      if (stack.pop() !== expected) {
        scriptFail(
          'INVALID_SCRIPT',
          `edit_blender_selection: unbalanced "${char}" in the script`,
        )
      }
      index += 1
      continue
    }
    index += 1
  }
  if (stack.length > 0) {
    scriptFail(
      'INVALID_SCRIPT',
      'edit_blender_selection: the script has an unclosed bracket',
    )
  }
}

const FORBIDDEN_CODE_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bimport\b/, 'import statements are not allowed'],
  [/__/, 'double-underscore names are not allowed'],
  [/\bopen\s*\(/, 'open() is not allowed'],
  [/\bexec\s*\(/, 'exec() is not allowed'],
  [/\beval\s*\(/, 'eval() is not allowed'],
  [/\bcompile\s*\(/, 'compile() is not allowed'],
  [/\bsubprocess\b/, 'subprocess is not allowed'],
  [/\bsocket\b/, 'socket is not allowed'],
  [/\bos\s*\./, 'the os module is not allowed'],
  [/\bsys\s*\./, 'the sys module is not allowed'],
  [/\bshutil\b/, 'shutil is not allowed'],
  [/\bpathlib\b/, 'pathlib is not allowed'],
  [/\bpickle\b/, 'pickle is not allowed'],
  [/\bmarshal\b/, 'marshal is not allowed'],
]

interface PythonStringLiteral {
  value: string
  end: number
}

/** Read a single- or double-quoted Python literal starting at `start`. */
function readPythonString(
  code: string,
  start: number,
): PythonStringLiteral | null {
  const quote = code[start]
  if (quote !== '"' && quote !== "'") return null
  if (code.startsWith(quote.repeat(3), start)) {
    scriptFail(
      'INVALID_SCRIPT',
      'edit_blender_selection: triple-quoted object names are not allowed',
    )
  }
  let value = ''
  let index = start + 1
  while (index < code.length) {
    const char = code[index]
    if (char === quote) return { value, end: index + 1 }
    if (char === '\n' || char === '\r') return null
    if (char === '\\') {
      index += 1
      if (index >= code.length) return null
      const escaped = code[index]
      switch (escaped) {
        case 'n':
          value += '\n'
          break
        case 'r':
          value += '\r'
          break
        case 't':
          value += '\t'
          break
        case '\\':
        case "'":
        case '"':
          value += escaped
          break
        case 'x': {
          const hex = code.slice(index + 1, index + 3)
          if (!/^[0-9a-fA-F]{2}$/.test(hex)) return null
          value += String.fromCharCode(Number.parseInt(hex, 16))
          index += 2
          break
        }
        case 'u': {
          const hex = code.slice(index + 1, index + 5)
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) return null
          value += String.fromCharCode(Number.parseInt(hex, 16))
          index += 4
          break
        }
        default:
          value += escaped
          break
      }
      index += 1
      continue
    }
    value += char
    index += 1
  }
  return null
}

/**
 * Every object registry access must name a literal in the lock scope.
 * Iterating or indexing the registry with an expression could reach objects
 * the user did not select, which is exactly what the lock prevents.
 *
 * This is a guard against model mistakes, not a sandbox: bpy reaches objects
 * through many other paths (meshes, shared materials, operators, parents).
 * The person reads the script before applying it, and the desktop selects the
 * locked objects again right before it runs.
 */
function assertObjectScope(
  code: string,
  selectionIds: readonly string[],
): void {
  const allowed = new Set(selectionIds)
  const access =
    /\bbpy\s*\.\s*(?:data|context\s*\.\s*(?:scene|view_layer))\s*\.\s*objects\b/g
  let match: RegExpExecArray | null
  while ((match = access.exec(code)) !== null) {
    let index = access.lastIndex
    while (index < code.length && /\s/.test(code[index])) index += 1
    const rest = code.slice(index)
    const get = /^\.\s*get\s*\(\s*/.exec(rest)
    if (get) {
      index += get[0].length
    } else if (code[index] === '[') {
      index += 1
      while (index < code.length && /\s/.test(code[index])) index += 1
    } else if (/^\.\s*[A-Za-z_]/.test(rest)) {
      scriptFail(
        'OUT_OF_SCOPE',
        'edit_blender_selection: accessing bpy object registries through methods other than .get() is not allowed',
      )
    } else {
      scriptFail(
        'OUT_OF_SCOPE',
        'edit_blender_selection: bpy object registries must be indexed by a literal name from the selection',
      )
    }

    const literal = readPythonString(code, index)
    if (!literal) {
      scriptFail(
        'INVALID_SCRIPT',
        'edit_blender_selection: object name must be a closed string literal',
      )
    }
    if (!allowed.has(literal.value)) {
      scriptFail(
        'OUT_OF_SCOPE',
        `edit_blender_selection: object "${literal.value}" is not in the locked selection`,
      )
    }
    access.lastIndex = literal.end
  }
}

/**
 * Validate a proposed bpy patch against the locked object scope.
 *
 * Size, balance, forbidden operations and every literal object registry name
 * are checked. A valid script still runs only after the UI applies it; this
 * function never executes it.
 */
export function validateStagedScript(
  script: unknown,
  selectionIds: readonly string[],
): string {
  if (typeof script !== 'string' || script.trim().length === 0) {
    scriptFail(
      'INVALID_SCRIPT',
      'edit_blender_selection: script must be a non-empty string',
    )
  }
  if (script.length > MAX_STAGED_SCRIPT_CHARS) {
    scriptFail(
      'TOO_LARGE',
      `edit_blender_selection: script exceeds ${MAX_STAGED_SCRIPT_CHARS} characters`,
    )
  }
  assertBalancedPython(script)
  for (const [pattern, reason] of FORBIDDEN_CODE_PATTERNS) {
    if (pattern.test(script)) {
      scriptFail('INVALID_SCRIPT', `edit_blender_selection: ${reason}`)
    }
  }
  assertObjectScope(script, selectionIds)
  return script
}
