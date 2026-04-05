import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { spawn } from 'child_process'
import { getSessionId } from '../../bootstrap/state.js'
import { getCwd } from '../../utils/cwd.js'
import { logForDebugging } from '../../utils/debug.js'
import { createAssistantAPIErrorMessage, createAssistantMessage } from '../../utils/messages.js'
import { normalizeModelStringForAPI } from '../../utils/model/model.js'
import type {
  AssistantMessage,
  Message,
  StreamEvent,
  SystemAPIErrorMessage,
} from '../../types/message.js'
import type { MainLoopStreamArgs } from './backend.js'

type JsonRpcResponse = {
  id?: number
  result?: unknown
  error?: { message?: string }
  method?: string
  params?: Record<string, unknown>
}

type CodexThreadSession = {
  threadId: string
  promptHash: string
}

type CodexAuthState = {
  accessToken: string
  accountId: string
  planType: string | null
}

const DEFAULT_CODEX_APP_SERVER_URL = 'ws://127.0.0.1:7788'
const CODEX_AUTH_PATH = join(homedir(), '.codex', 'auth.json')
const RETRY_DELAY_MS = 300
const MAX_CONNECT_ATTEMPTS = 12
const REQUEST_TIMEOUT_MS = 15000

const codexSessions = new Map<string, CodexThreadSession>()

function getCodexAppServerUrl(): string {
  return process.env.CLAUDE_CODE_CODEX_APP_SERVER_URL ?? 'stdio://'
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isStdioTransport(url: string): boolean {
  return url === 'stdio://'
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const [, payload] = token.split('.')
  if (!payload) return null

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
    const decoded = Buffer.from(normalized + padding, 'base64').toString('utf8')
    return JSON.parse(decoded) as Record<string, unknown>
  } catch {
    return null
  }
}

function readCodexAuthState(): CodexAuthState | null {
  try {
    const raw = readFileSync(CODEX_AUTH_PATH, 'utf8')
    const parsed = JSON.parse(raw) as {
      tokens?: {
        access_token?: string
        account_id?: string
      }
    }

    const accessToken = parsed.tokens?.access_token
    const accountId = parsed.tokens?.account_id
    if (!accessToken || !accountId) {
      return null
    }

    const payload = decodeJwtPayload(accessToken)
    const authPayload = payload?.['https://api.openai.com/auth']
    const planType =
      authPayload && typeof authPayload === 'object'
        ? ((authPayload as Record<string, unknown>).chatgpt_plan_type as string | null | undefined) ?? null
        : null

    return { accessToken, accountId, planType }
  } catch {
    return null
  }
}

function extractVisibleText(message: Message): string {
  if (!message.message?.content) {
    return ''
  }

  if (typeof message.message.content === 'string') {
    return message.message.content.trim()
  }

  const parts: string[] = []
  for (const block of message.message.content) {
    if (typeof block !== 'string' && block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text)
    }
  }
  return parts.join('\n').trim()
}

function buildSeedPrompt(messages: Message[]): string {
  const lines: string[] = []

  for (const message of messages) {
    if (message.type !== 'user' && message.type !== 'assistant') {
      continue
    }
    if (message.isMeta) {
      continue
    }

    const text = extractVisibleText(message)
    if (!text) {
      continue
    }

    const role = message.type === 'assistant' ? 'Assistant' : 'User'
    lines.push(`${role}: ${text}`)
  }

  const transcript = lines.join('\n\n').trim()
  return transcript || 'Continue.'
}

function getLatestUserPrompt(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (!message || message.type !== 'user' || message.isMeta) {
      continue
    }

    const text = extractVisibleText(message)
    if (text) {
      return text
    }
  }

  return buildSeedPrompt(messages)
}

function hashSystemPrompt(systemPrompt: readonly string[]): string {
  return createHash('sha1').update(systemPrompt.join('\n\n')).digest('hex')
}

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
}

class CodexAppServerClient {
  private static instance: CodexAppServerClient | null = null

  static async getInstance(): Promise<CodexAppServerClient> {
    if (!CodexAppServerClient.instance) {
      const client = new CodexAppServerClient(getCodexAppServerUrl())
      await client.ensureConnected()
      CodexAppServerClient.instance = client
    }

    return CodexAppServerClient.instance
  }

  static async createEphemeral(): Promise<CodexAppServerClient> {
    const client = new CodexAppServerClient(getCodexAppServerUrl())
    await client.ensureConnected()
    return client
  }

  private child: ReturnType<typeof spawn> | null = null
  private initialized = false
  private nextId = 1
  private pending = new Map<number, PendingRequest>()
  private listeners = new Set<(message: JsonRpcResponse) => void>()
  private connectPromise: Promise<void> | null = null
  private stdoutBuffer = ''

  private constructor(private readonly url: string) {}

  subscribe(listener: (message: JsonRpcResponse) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async close(): Promise<void> {
    this.initialized = false
    this.pending.clear()
    this.listeners.clear()

    if (this.child) {
      const child = this.child
      this.child = null
      await new Promise<void>(resolve => {
        const onClose = () => {
          child.removeListener('close', onClose)
          resolve()
        }
        child.once('close', onClose)
        child.kill('SIGTERM')
        setTimeout(() => resolve(), RETRY_DELAY_MS).unref?.()
      })
    }

    if (CodexAppServerClient.instance === this) {
      CodexAppServerClient.instance = null
    }
  }

  async request<T>(method: string, params: Record<string, unknown>): Promise<T> {
    if (!this.child || this.child.killed) {
      await this.ensureConnected()
    }

    const id = this.nextId++
    logForDebugging(`[codex] rpc request -> ${method}`)
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params,
    })

    const response = await new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Codex app-server request timed out: ${method}`))
      }, REQUEST_TIMEOUT_MS)
      try {
        this.child?.stdin?.write(`${payload}\n`)
      } catch (error) {
        this.pending.delete(id)
        clearTimeout(timeout)
        reject(error)
        return
      }
      this.pending.set(id, {
        resolve: value => {
          clearTimeout(timeout)
          resolve(value as T)
        },
        reject: reason => {
          clearTimeout(timeout)
          reject(reason)
        },
      })
    })

    return response
  }

  private async ensureConnected(): Promise<void> {
    if (this.child && !this.child.killed && this.initialized) {
      return
    }

    if (this.connectPromise) {
      return this.connectPromise
    }

    this.connectPromise = this.connectWithRetry()
    try {
      await this.connectPromise
    } finally {
      this.connectPromise = null
    }
  }

  private async connectWithRetry(): Promise<void> {
    let lastError: unknown

    for (let attempt = 0; attempt < MAX_CONNECT_ATTEMPTS; attempt++) {
      try {
        logForDebugging(`[codex] connect attempt ${attempt + 1}/${MAX_CONNECT_ATTEMPTS}`)
        await this.openTransport()
        await this.initialize()
        return
      } catch (error) {
        lastError = error
        logForDebugging(`[codex] connect attempt failed: ${String(error)}`)
        await delay(RETRY_DELAY_MS)
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Unable to connect to codex app-server')
  }

  private async openTransport(): Promise<void> {
    if (!isStdioTransport(this.url)) {
      throw new Error(`Unsupported Codex transport: ${this.url}`)
    }

    await new Promise<void>((resolve, reject) => {
      const child = spawn('codex', ['app-server', '--listen', this.url], {
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      this.child = child
      this.stdoutBuffer = ''
      logForDebugging(`[codex] opening stdio transport ${this.url}`)
      this.bindProcess(child)

      const onSpawn = () => {
        cleanup()
        logForDebugging('[codex] stdio transport open')
        resolve()
      }
      const onError = (error: Error) => {
        cleanup()
        reject(error)
      }
      const cleanup = () => {
        child.removeListener('spawn', onSpawn)
        child.removeListener('error', onError)
      }

      child.once('spawn', onSpawn)
      child.once('error', onError)
    })
  }

  private bindProcess(child: ReturnType<typeof spawn>): void {
    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', chunk => {
      this.stdoutBuffer += chunk
      let newlineIndex = this.stdoutBuffer.indexOf('\n')
      while (newlineIndex !== -1) {
        const line = this.stdoutBuffer.slice(0, newlineIndex).trim()
        this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1)
        if (line) {
          this.handleMessage(line)
        }
        newlineIndex = this.stdoutBuffer.indexOf('\n')
      }
    })
    child.on('close', () => {
      this.initialized = false
      this.child = null
    })
    child.on('error', error => {
      logForDebugging(`Codex transport error: ${String(error)}`, {
        level: 'warn',
      })
    })
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', chunk => {
      const text = chunk.trim()
      if (text) {
        logForDebugging(`[codex] stderr: ${text}`, { level: 'warn' })
      }
    })
  }

  private async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    logForDebugging('[codex] initialize start')
    await this.request('initialize', {
      clientInfo: {
        name: 'ccb',
        title: 'Claude Code Best',
        version: typeof MACRO !== 'undefined' ? MACRO.VERSION : '0.0.0',
      },
      capabilities: {
        experimentalApi: false,
      },
    })

    this.initialized = true
    logForDebugging('[codex] initialize ok')
  }

  private async handleServerRequest(message: JsonRpcResponse): Promise<void> {
    if (!this.child || typeof message.id !== 'number' || !message.method) {
      return
    }

    if (message.method === 'account/chatgptAuthTokens/refresh') {
      const auth = readCodexAuthState()
      if (auth) {
        this.child.stdin?.write(
          JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            result: {
              accessToken: auth.accessToken,
              chatgptAccountId: auth.accountId,
              chatgptPlanType: auth.planType,
            },
          }) + '\n',
        )
        return
      }
    }

    const deniedResponse =
      message.method === 'item/commandExecution/requestApproval'
        ? { decision: 'decline' }
        : message.method === 'item/fileChange/requestApproval'
          ? { decision: 'decline' }
          : message.method === 'item/permissions/requestApproval'
            ? { permissions: {}, scope: 'turn' }
            : message.method === 'execCommandApproval' ||
                message.method === 'applyPatchApproval'
              ? { decision: 'denied' }
              : null

    if (deniedResponse) {
      this.child.stdin?.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: message.id,
          result: deniedResponse,
        }) + '\n',
      )
      return
    }

    this.child.stdin?.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: -32001,
          message: `Unsupported Codex app-server request: ${message.method}`,
        },
      }) + '\n',
    )
  }

  private handleMessage(raw: string): void {
    let message: JsonRpcResponse
    try {
      message = JSON.parse(raw) as JsonRpcResponse
    } catch (error) {
      logForDebugging(`[codex] failed to parse websocket payload: ${String(error)}`, {
        level: 'warn',
      })
      return
    }

    if (typeof message.id === 'number' && !message.method) {
      logForDebugging(`[codex] rpc response <- ${message.id}${message.error ? ' error' : ''}`)
      const pending = this.pending.get(message.id)
      if (!pending) {
        return
      }

      this.pending.delete(message.id)
      if (message.error) {
        pending.reject(new Error(message.error.message || 'Codex app-server request failed'))
      } else {
        pending.resolve(message.result)
      }
      return
    }

    if (typeof message.id === 'number' && message.method) {
      void this.handleServerRequest(message)
      return
    }

    if (message.method) {
      for (const listener of this.listeners) {
        listener(message)
      }
    }
  }
}

function toStreamEvent(event: Record<string, unknown>, ttftMs?: number): StreamEvent {
  return {
    type: 'stream_event',
    event,
    ...(ttftMs !== undefined ? { ttftMs } : {}),
  }
}

function buildAssistantMessage(text: string, itemId: string, model: string): AssistantMessage {
  const assistant = createAssistantMessage({ content: text })
  assistant.message.id = itemId
  assistant.message.model = model
  assistant.message.stop_reason = 'stop_sequence'
  return assistant
}

async function startCodexThread(
  client: CodexAppServerClient,
  currentModel: string,
  systemPrompt: readonly string[],
): Promise<string> {
  logForDebugging(`[codex] starting thread with model=${currentModel}`)
  const response = await client.request<{
    thread: { id: string }
  }>('thread/start', {
    cwd: getCwd(),
    model: currentModel,
    modelProvider: 'openai',
    developerInstructions: systemPrompt.join('\n\n'),
    experimentalRawEvents: false,
    persistExtendedHistory: false,
  })
  logForDebugging(`[codex] thread started: ${response.thread.id}`)
  return response.thread.id
}

export async function* queryCodexWithStreaming({
  messages,
  systemPrompt,
  signal,
  options,
}: MainLoopStreamArgs): AsyncGenerator<
  StreamEvent | AssistantMessage | SystemAPIErrorMessage,
  void
> {
  logForDebugging('[codex] queryCodexWithStreaming start')
  const codexAuth = readCodexAuthState()
  if (!codexAuth) {
    yield createAssistantAPIErrorMessage({
      content:
        'Codex backend requires an active local Codex login. Run `codex login` and try again.',
      apiError: 'authentication_error',
    })
    return
  }

  let client: CodexAppServerClient
  try {
    client = options.isNonInteractiveSession
      ? await CodexAppServerClient.createEphemeral()
      : await CodexAppServerClient.getInstance()
    logForDebugging('[codex] app-server connected')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    yield createAssistantAPIErrorMessage({
      content: `Unable to start or connect to codex app-server: ${message}`,
      apiError: 'connection_error',
    })
    return
  }

  const sessionId = getSessionId()
  const promptHash = hashSystemPrompt(systemPrompt)
  const currentModel = normalizeModelStringForAPI(options.model)
  const existingSession = codexSessions.get(sessionId)
  const needsFreshThread =
    !existingSession || existingSession.promptHash !== promptHash

  let threadId = existingSession?.threadId
  if (needsFreshThread) {
    try {
      threadId = await startCodexThread(client, currentModel, systemPrompt)
      codexSessions.set(sessionId, {
        threadId,
        promptHash,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      yield createAssistantAPIErrorMessage({
        content: `Failed to create a Codex session: ${message}`,
        apiError: 'authentication_error',
      })
      return
    }
  }

  if (!threadId) {
    yield createAssistantAPIErrorMessage({
      content: 'Failed to resolve a Codex thread for this session.',
      apiError: 'internal_error',
    })
    return
  }

  const promptText = needsFreshThread
    ? buildSeedPrompt(messages)
    : getLatestUserPrompt(messages)

  const notifications: JsonRpcResponse[] = []
  let resolveNextNotification: (() => void) | null = null
  const pushNotification = (notification: JsonRpcResponse) => {
    notifications.push(notification)
    resolveNextNotification?.()
  }
  const unsubscribe = client.subscribe(notification => {
    if (!notification.params || notification.params.threadId !== threadId) {
      return
    }
    pushNotification(notification)
  })

  let activeTurnId: string | null = null
  let textItemId: string | null = null
  let textBlockStarted = false
  let textBuffer = ''
  let emittedMessageStart = false
  let streamDone = false
  let turnErrorMessage: string | null = null
  const blockIndexByItemId = new Map<string, number>()
  let nextBlockIndex = 0
  const startedAt = Date.now()

  const abortHandler = () => {
    if (activeTurnId) {
      void client
        .request('turn/interrupt', { threadId, turnId: activeTurnId })
        .catch(error => {
          logForDebugging(`Failed to interrupt Codex turn: ${String(error)}`, {
            level: 'warn',
          })
        })
    }
  }
  signal.addEventListener('abort', abortHandler, { once: true })

  try {
    logForDebugging(`[codex] starting turn on thread=${threadId}`)
    let turnStart
    try {
      turnStart = await client.request<{
        turn: { id: string }
      }>('turn/start', {
        threadId,
        model: currentModel,
        input: [{ type: 'text', text: promptText, text_elements: [] }],
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('thread not found')) {
        threadId = await startCodexThread(client, currentModel, systemPrompt)
        codexSessions.set(sessionId, {
          threadId,
          promptHash,
        })
        turnStart = await client.request<{
          turn: { id: string }
        }>('turn/start', {
          threadId,
          model: currentModel,
          input: [{ type: 'text', text: buildSeedPrompt(messages), text_elements: [] }],
        })
      } else {
        throw error
      }
    }
    activeTurnId = turnStart.turn.id
    logForDebugging(`[codex] turn started: ${activeTurnId}`)

    while (!streamDone) {
      if (notifications.length === 0) {
        await new Promise<void>(resolve => {
          resolveNextNotification = resolve
        })
        resolveNextNotification = null
      }

      while (notifications.length > 0) {
        const notification = notifications.shift()!
        const method = notification.method
        const params = notification.params ?? {}

        if (method === 'turn/started' && params.turn && typeof params.turn === 'object') {
          activeTurnId = (params.turn as { id?: string }).id ?? activeTurnId
          logForDebugging(`[codex] turn/started notification: ${activeTurnId}`)
          continue
        }

        if (method === 'item/started' && params.item && typeof params.item === 'object') {
          const item = params.item as { id?: string; type?: string }
          const itemId = item.id
          if (!itemId) {
            continue
          }

          const blockIndex = nextBlockIndex++
          blockIndexByItemId.set(itemId, blockIndex)

          if (item.type === 'reasoning') {
            logForDebugging(`[codex] reasoning item started: ${itemId}`)
            yield toStreamEvent({
              type: 'content_block_start',
              index: blockIndex,
              content_block: { type: 'thinking' },
            })
          } else if (item.type === 'agentMessage') {
            logForDebugging(`[codex] agent message item started: ${itemId}`)
            textItemId = itemId
            if (!emittedMessageStart) {
              emittedMessageStart = true
              yield toStreamEvent(
                {
                  type: 'message_start',
                  message: {
                    id: itemId,
                    usage: { input_tokens: 0, output_tokens: 0 },
                  },
                },
                Date.now() - startedAt,
              )
            }
            textBlockStarted = true
            yield toStreamEvent({
              type: 'content_block_start',
              index: blockIndex,
              content_block: { type: 'text' },
            })
          }
          continue
        }

        if (method === 'item/agentMessage/delta') {
          const itemId = typeof params.itemId === 'string' ? params.itemId : null
          const delta = typeof params.delta === 'string' ? params.delta : ''
          if (!itemId || !delta) {
            continue
          }

          textBuffer += delta
          logForDebugging(`[codex] text delta length=${delta.length}`)
          yield toStreamEvent({
            type: 'content_block_delta',
            index: blockIndexByItemId.get(itemId) ?? 0,
            delta: { type: 'text_delta', text: delta },
          })
          continue
        }

        if (method === 'reasoningTextDelta') {
          const itemId = typeof params.itemId === 'string' ? params.itemId : null
          const delta = typeof params.delta === 'string' ? params.delta : ''
          if (!itemId || !delta) {
            continue
          }

          logForDebugging(`[codex] reasoning delta length=${delta.length}`)
          yield toStreamEvent({
            type: 'content_block_delta',
            index: blockIndexByItemId.get(itemId) ?? 0,
            delta: { type: 'thinking_delta', thinking: delta },
          })
          continue
        }

        if (method === 'item/completed' && params.item && typeof params.item === 'object') {
          const item = params.item as { id?: string; type?: string; text?: string }
          const itemId = item.id
          if (!itemId) {
            continue
          }

          if (item.type === 'reasoning') {
            logForDebugging(`[codex] reasoning item completed: ${itemId}`)
            yield toStreamEvent({
              type: 'content_block_stop',
              index: blockIndexByItemId.get(itemId) ?? 0,
            })
          } else if (item.type === 'agentMessage') {
            logForDebugging(`[codex] agent message item completed: ${itemId}`)
            if (textBlockStarted) {
              yield toStreamEvent({
                type: 'content_block_stop',
                index: blockIndexByItemId.get(itemId) ?? 0,
              })
              textBlockStarted = false
            }

            const assistantText = item.text ?? textBuffer
            yield buildAssistantMessage(assistantText, itemId, currentModel)
          }
          continue
        }

        if (method === 'error') {
          const error = params.error as { message?: string } | undefined
          turnErrorMessage = error?.message ?? 'Codex runtime error'
          logForDebugging(`[codex] error notification: ${turnErrorMessage}`)
          streamDone = true
          break
        }

        if (method === 'turn/completed') {
          logForDebugging(
            `[codex] turn/completed notification: ${
              (params.turn as { status?: string } | undefined)?.status ?? 'unknown'
            }`,
          )
          if (emittedMessageStart) {
            yield toStreamEvent({
              type: 'message_delta',
              delta: { stop_reason: signal.aborted ? 'end_turn' : 'stop_sequence' },
              usage: { input_tokens: 0, output_tokens: 0 },
            })
            yield toStreamEvent({ type: 'message_stop' })
          }
          streamDone = true
          break
        }
      }
    }

    if (turnErrorMessage) {
      yield createAssistantAPIErrorMessage({
        content: turnErrorMessage,
        apiError: 'server_error',
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    yield createAssistantAPIErrorMessage({
      content:
        message.includes('401') || message.includes('unauthorized')
          ? 'Codex backend authentication failed. Re-run `codex login` and try again.'
          : `Codex backend error: ${message}`,
      apiError: message.includes('auth') ? 'authentication_error' : 'server_error',
    })
  } finally {
    signal.removeEventListener('abort', abortHandler)
    unsubscribe()
    if (options.isNonInteractiveSession) {
      logForDebugging('[codex] closing app-server client for turn')
      await client.close()
    }
  }
}
