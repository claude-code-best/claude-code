/**
 * ACP Agent implementation — bridges ACP protocol methods to Claude Code's
 * internal QueryEngine / query() pipeline.
 *
 * Architecture: Uses internal QueryEngine (not @anthropic-ai/claude-agent-sdk)
 * to directly run queries, with a bridge layer converting SDKMessage → ACP SessionUpdate.
 */
import type {
  Agent,
  AgentSideConnection,
  InitializeRequest,
  InitializeResponse,
  AuthenticateRequest,
  AuthenticateResponse,
  NewSessionRequest,
  NewSessionResponse,
  PromptRequest,
  PromptResponse,
  CancelNotification,
  LoadSessionRequest,
  LoadSessionResponse,
  ListSessionsRequest,
  ListSessionsResponse,
  ResumeSessionRequest,
  ResumeSessionResponse,
  ForkSessionRequest,
  ForkSessionResponse,
  CloseSessionRequest,
  CloseSessionResponse,
  SetSessionModeRequest,
  SetSessionModeResponse,
  SetSessionModelRequest,
  SetSessionModelResponse,
  SetSessionConfigOptionRequest,
  SetSessionConfigOptionResponse,
  ClientCapabilities,
  SessionModeState,
  SessionModelState,
  SessionConfigOption,
} from '@agentclientprotocol/sdk'
import { randomUUID, type UUID } from 'node:crypto'
import type { Message } from '../../types/message.js'
import { deserializeMessages } from '../../utils/conversationRecovery.js'
import { getLastSessionLog, sessionIdExists } from '../../utils/sessionStorage.js'
import { QueryEngine } from '../../QueryEngine.js'
import type { QueryEngineConfig } from '../../QueryEngine.js'
import type { Tools } from '../../Tool.js'
import { getTools } from '../../tools.js'
import { getEmptyToolPermissionContext } from '../../Tool.js'
import type { PermissionMode } from '../../types/permissions.js'
import type { Command } from '../../types/command.js'
import { getCommands } from '../../commands.js'
import { setOriginalCwd } from '../../bootstrap/state.js'
import { enableConfigs } from '../../utils/config.js'
import { FileStateCache } from '../../utils/fileStateCache.js'
import { getDefaultAppState } from '../../state/AppStateStore.js'
import type { AppState } from '../../state/AppStateStore.js'
import { createAcpCanUseTool } from './permissions.js'
import { forwardSessionUpdates, replayHistoryMessages, type ToolUseCache } from './bridge.js'
import {
  resolvePermissionMode,
  computeSessionFingerprint,
  sanitizeTitle,
} from './utils.js'
import { promptToQueryInput } from './promptConversion.js'
import {
  listSessionsImpl,
} from '../../utils/listSessionsImpl.js'
import { getMainLoopModel } from '../../utils/model/model.js'
import { getModelOptions } from '../../utils/model/modelOptions.js'
import { getSettings_DEPRECATED } from '../../utils/settings/settings.js'

// ── Session state ─────────────────────────────────────────────────

type AcpSession = {
  queryEngine: QueryEngine
  cancelled: boolean
  cancelGeneration: number
  cwd: string
  sessionFingerprint: string
  modes: SessionModeState
  models: SessionModelState
  configOptions: SessionConfigOption[]
  promptRunning: boolean
  pendingMessages: Map<string, PendingPrompt>
  pendingQueue: string[]
  pendingQueueHead: number
  toolUseCache: ToolUseCache
  clientCapabilities?: ClientCapabilities
  appState: AppState
  commands: Command[]
}

type PendingPrompt = {
  resolve: (cancelled: boolean) => void
}

// ── Agent class ───────────────────────────────────────────────────

export class AcpAgent implements Agent {
  private conn: AgentSideConnection
  sessions = new Map<string, AcpSession>()
  private clientCapabilities?: ClientCapabilities

  constructor(conn: AgentSideConnection) {
    this.conn = conn
  }

  // ── initialize ────────────────────────────────────────────────

  async initialize(params: InitializeRequest): Promise<InitializeResponse> {
    this.clientCapabilities = params.clientCapabilities

    return {
      protocolVersion: 1,
      agentInfo: {
        name: 'claude-code',
        title: 'Claude Code',
        version:
          typeof (globalThis as unknown as Record<string, unknown>).MACRO ===
            'object' &&
          (globalThis as unknown as Record<string, Record<string, unknown>>)
            .MACRO !== null
            ? String(
                (
                  (globalThis as unknown as Record<string, Record<string, unknown>>)
                    .MACRO as Record<string, unknown>
                ).VERSION ?? '0.0.0',
              )
            : '0.0.0',
      },
      agentCapabilities: {
        _meta: {
          claudeCode: {
            promptQueueing: true,
          },
        },
        promptCapabilities: {
          image: true,
          embeddedContext: true,
        },
        mcpCapabilities: {
          http: true,
          sse: true,
        },
        loadSession: true,
        sessionCapabilities: {
          fork: {},
          list: {},
          resume: {},
          close: {},
        },
      },
    }
  }

  // ── authenticate ──────────────────────────────────────────────

  async authenticate(_params: AuthenticateRequest): Promise<AuthenticateResponse> {
    // No authentication required — this is a self-hosted/custom deployment
    return {}
  }

  // ── newSession ────────────────────────────────────────────────

  async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    const result = await this.createSession(params)
    this.scheduleAvailableCommandsUpdate(result.sessionId)
    return result
  }

  // ── resumeSession ──────────────────────────────────────────────

  async unstable_resumeSession(
    params: ResumeSessionRequest,
  ): Promise<ResumeSessionResponse> {
    const result = await this.getOrCreateSession(params)
    this.scheduleAvailableCommandsUpdate(result.sessionId)
    return result
  }

  // ── loadSession ────────────────────────────────────────────────

  async loadSession(params: LoadSessionRequest): Promise<LoadSessionResponse> {
    const result = await this.getOrCreateSession(params)
    this.scheduleAvailableCommandsUpdate(result.sessionId)
    return result
  }

  // ── listSessions ───────────────────────────────────────────────

  async listSessions(params: ListSessionsRequest): Promise<ListSessionsResponse> {
    const candidates = await listSessionsImpl({
      dir: params.cwd ?? undefined,
      limit: 100,
    })

    const sessions = []
    for (const candidate of candidates) {
      if (!candidate.cwd) continue
      sessions.push({
        sessionId: candidate.sessionId,
        cwd: candidate.cwd,
        title: sanitizeTitle(candidate.summary ?? ''),
        updatedAt: new Date(candidate.lastModified).toISOString(),
      })
    }

    return { sessions }
  }

  // ── forkSession ────────────────────────────────────────────────

  async unstable_forkSession(
    params: ForkSessionRequest,
  ): Promise<ForkSessionResponse> {
    const response = await this.createSession(
      {
        cwd: params.cwd,
        mcpServers: params.mcpServers ?? [],
        _meta: params._meta,
      },
    )
    this.scheduleAvailableCommandsUpdate(response.sessionId)
    return response
  }

  // ── closeSession ───────────────────────────────────────────────

  async unstable_closeSession(
    params: CloseSessionRequest,
  ): Promise<CloseSessionResponse> {
    const session = this.sessions.get(params.sessionId)
    if (!session) {
      throw new Error('Session not found')
    }
    await this.teardownSession(params.sessionId)
    return {}
  }

  // ── prompt ────────────────────────────────────────────────────

  async prompt(params: PromptRequest): Promise<PromptResponse> {
    const session = this.sessions.get(params.sessionId)
    if (!session) {
      throw new Error(`Session ${params.sessionId} not found`)
    }

    // Extract text/image content from the prompt
    const promptInput = promptToQueryInput(params.prompt)

    if (!promptInput.trim()) {
      return { stopReason: 'end_turn' }
    }

    const promptCancelGeneration = session.cancelGeneration

    // Handle prompt queuing — if a prompt is already running, queue this one
    if (session.promptRunning) {
      const promptUuid = randomUUID()
      const cancelled = await new Promise<boolean>((resolve) => {
        session.pendingQueue.push(promptUuid)
        session.pendingMessages.set(promptUuid, { resolve })
      })
      if (cancelled) {
        return { stopReason: 'cancelled' }
      }
    }

    if (session.cancelGeneration !== promptCancelGeneration) {
      return { stopReason: 'cancelled' }
    }

    // Reset cancellation only when this prompt is about to run. Queued prompts
    // must not clear the cancellation state for the active prompt.
    session.cancelled = false
    session.promptRunning = true

    try {
      // Reset the query engine's abort controller for a fresh query.
      // After a previous interrupt(), the internal controller is stuck in
      // aborted state — without this, submitMessage() fails immediately.
      session.queryEngine.resetAbortController()

      const sdkMessages = session.queryEngine.submitMessage(promptInput)

      const { stopReason, usage } = await forwardSessionUpdates(
        params.sessionId,
        sdkMessages,
        this.conn,
        session.queryEngine.getAbortSignal(),
        session.toolUseCache,
        this.clientCapabilities,
        session.cwd,
        () => session.cancelled,
      )

      // If the session was cancelled during processing, return cancelled
      if (session.cancelled) {
        return { stopReason: 'cancelled' }
      }

      return {
        stopReason,
        usage: usage
          ? {
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              cachedReadTokens: usage.cachedReadTokens,
              cachedWriteTokens: usage.cachedWriteTokens,
              totalTokens:
                usage.inputTokens +
                usage.outputTokens +
                usage.cachedReadTokens +
                usage.cachedWriteTokens,
            }
          : undefined,
      }
    } catch (err: unknown) {
      if (session.cancelled) {
        return { stopReason: 'cancelled' }
      }

      // Check for process death errors
      if (
        err instanceof Error &&
        (err.message.includes('terminated') ||
          err.message.includes('process exited'))
      ) {
        this.teardownSession(params.sessionId)
        throw new Error(
          'The Claude Agent process exited unexpectedly. Please start a new session.',
        )
      }

      throw err
    } finally {
      // Resolve next pending prompt if any
      const nextPrompt = popNextPendingPrompt(session)
      if (nextPrompt) {
        session.promptRunning = true
        nextPrompt.resolve(false)
      } else {
        session.promptRunning = false
      }
    }
  }

  // ── cancel ────────────────────────────────────────────────────

  async cancel(params: CancelNotification): Promise<void> {
    const session = this.sessions.get(params.sessionId)
    if (!session) return

    // Set cancelled flag — checked by prompt() loop to break out
    session.cancelled = true
    session.cancelGeneration += 1

    // Cancel any queued prompts
    for (const [, pending] of session.pendingMessages) {
      pending.resolve(true)
    }
    session.pendingMessages.clear()
    session.pendingQueue = []
    session.pendingQueueHead = 0

    // Interrupt the query engine to abort the current API call
    session.queryEngine.interrupt()
  }

  // ── setSessionMode ──────────────────────────────────────────────

  async setSessionMode(
    params: SetSessionModeRequest,
  ): Promise<SetSessionModeResponse> {
    const session = this.sessions.get(params.sessionId)
    if (!session) {
      throw new Error('Session not found')
    }

    this.applySessionMode(params.sessionId, params.modeId)
    await this.updateConfigOption(params.sessionId, 'mode', params.modeId)
    return {}
  }

  // ── setSessionModel ─────────────────────────────────────────────

  async unstable_setSessionModel(
    params: SetSessionModelRequest,
  ): Promise<SetSessionModelResponse> {
    const session = this.sessions.get(params.sessionId)
    if (!session) {
      throw new Error('Session not found')
    }
    // Store the raw value — QueryEngine.submitMessage() calls
    // parseUserSpecifiedModel() to resolve aliases (e.g. "sonnet" → "glm-5.1-turbo")
    session.queryEngine.setModel(params.modelId)
    await this.updateConfigOption(params.sessionId, 'model', params.modelId)
    return {}
  }

  // ── setSessionConfigOption ──────────────────────────────────────

  async setSessionConfigOption(
    params: SetSessionConfigOptionRequest,
  ): Promise<SetSessionConfigOptionResponse> {
    const session = this.sessions.get(params.sessionId)
    if (!session) {
      throw new Error('Session not found')
    }
    if (typeof params.value !== 'string') {
      throw new Error(
        `Invalid value for config option ${params.configId}: ${String(params.value)}`,
      )
    }

    const option = session.configOptions.find((o) => o.id === params.configId)
    if (!option) {
      throw new Error(`Unknown config option: ${params.configId}`)
    }

    const value = params.value

    if (params.configId === 'mode') {
      this.applySessionMode(params.sessionId, value)
      await this.conn.sessionUpdate({
        sessionId: params.sessionId,
        update: {
          sessionUpdate: 'current_mode_update',
          currentModeId: value,
        },
      })
    } else if (params.configId === 'model') {
      session.queryEngine.setModel(value)
    }

    this.syncSessionConfigState(session, params.configId, value)

    session.configOptions = session.configOptions.map((o) =>
      o.id === params.configId && typeof o.currentValue === 'string'
        ? { ...o, currentValue: value }
        : o,
    )

    return { configOptions: session.configOptions }
  }

  // ── Private helpers ─────────────────────────────────────────────

  private async createSession(
    params: NewSessionRequest,
    opts: { forceNewId?: boolean; sessionId?: string; initialMessages?: Message[] } = {},
  ): Promise<NewSessionResponse> {
    enableConfigs()

    const sessionId = opts.sessionId ?? randomUUID()
    const cwd = params.cwd

    // Set CWD for the session
    setOriginalCwd(cwd)
    const previousProcessCwd = process.cwd()
    let processCwdChanged = false
    try {
      process.chdir(cwd)
      processCwdChanged = true
    } catch {
      // CWD may not exist yet; best-effort
    }

    try {
    // Build tools with a permissive permission context.
    const permissionContext = getEmptyToolPermissionContext()
    const tools: Tools = getTools(permissionContext)

    // Parse permission mode from _meta (passed by RCS/acp-link) or settings.
    const meta = params._meta as Record<string, unknown> | null | undefined
    const hasMetaPermissionMode = hasOwnField(meta, 'permissionMode')
    const metaPermissionMode = hasMetaPermissionMode
      ? meta?.permissionMode
      : undefined
    const settingsPermissionMode = this.getSetting<string>('permissions.defaultMode')
    const permissionMode = resolveSessionPermissionMode(
      metaPermissionMode,
      hasMetaPermissionMode,
      settingsPermissionMode,
    )

    // Create the permission bridge canUseTool function
    const canUseTool = createAcpCanUseTool(
      this.conn,
      sessionId,
      () => this.sessions.get(sessionId)?.modes.currentModeId ?? 'default',
      this.clientCapabilities,
      cwd,
      (modeId: string) => { this.applySessionMode(sessionId, modeId) },
      () => this.sessions.get(sessionId)?.appState
        .toolPermissionContext.isBypassPermissionsModeAvailable ?? false,
    )

    // Parse MCP servers from ACP params
    // MCP server config is handled separately in the tools system

    // ACP clients can expose bypass only when both the process and local config allow it.
    const isBypassAvailable = isAcpBypassPermissionModeAvailable(settingsPermissionMode)

    // Create a mutable AppState for the session
    const appState: AppState = {
      ...getDefaultAppState(),
      toolPermissionContext: {
        ...permissionContext,
        mode: permissionMode as PermissionMode,
        isBypassPermissionsModeAvailable: isBypassAvailable,
      },
    }

    // Load commands for slash command and skill support
    const commands = await getCommands(cwd)

    // Build QueryEngine config
    const engineConfig: QueryEngineConfig = {
      cwd,
      tools,
      commands,
      mcpClients: [],
      agents: [],
      canUseTool,
      getAppState: () => appState,
      setAppState: (updater: (prev: AppState) => AppState) => {
        const updated = updater(appState)
        Object.assign(appState, updated)
      },
      readFileCache: new FileStateCache(500, 50 * 1024 * 1024),
      includePartialMessages: true,
      replayUserMessages: true,
      initialMessages: opts.initialMessages,
    }

    const queryEngine = new QueryEngine(engineConfig)

    // Build modes — bypassPermissions is opt-in for ACP clients.
    const availableModes = [
      { id: 'default', name: 'Default', description: 'Standard behavior, prompts for dangerous operations' },
      { id: 'acceptEdits', name: 'Accept Edits', description: 'Auto-accept file edit operations' },
      { id: 'plan', name: 'Plan Mode', description: 'Planning mode, no actual tool execution' },
      { id: 'auto', name: 'Auto', description: 'Use a model classifier to approve/deny permission prompts.' },
      ...(isBypassAvailable
        ? [{ id: 'bypassPermissions' as const, name: 'Bypass Permissions', description: 'Skip all permission checks' }]
        : []),
      { id: 'dontAsk', name: "Don't Ask", description: "Don't prompt for permissions, deny if not pre-approved" },
    ]

    const modes: SessionModeState = {
      currentModeId: permissionMode,
      availableModes,
    }

    // Build models
    const modelOptions = getModelOptions()
    const currentModel = getMainLoopModel()
    const models: SessionModelState = {
      availableModels: modelOptions.map((m) => ({
        modelId: String(m.value ?? ''),
        name: m.label ?? String(m.value ?? ''),
        description: m.description ?? undefined,
      })),
      currentModelId: currentModel,
    }

    // Set the model on the engine
    queryEngine.setModel(currentModel)

    // Build config options
    const configOptions = buildConfigOptions(modes, models)

    const session: AcpSession = {
      queryEngine,
      cancelled: false,
      cancelGeneration: 0,
      cwd,
      modes,
      models,
      configOptions,
      promptRunning: false,
      pendingMessages: new Map(),
      pendingQueue: [],
      pendingQueueHead: 0,
      toolUseCache: {},
      clientCapabilities: this.clientCapabilities,
      appState,
      commands,
      sessionFingerprint: computeSessionFingerprint({
        cwd,
        mcpServers: params.mcpServers as Array<{ name: string; [key: string]: unknown }> | undefined,
      }),
    }

    this.sessions.set(sessionId, session)

    return {
      sessionId,
      models,
      modes,
      configOptions,
    }
    } finally {
      if (processCwdChanged) {
        process.chdir(previousProcessCwd)
      }
    }
  }

  private async getOrCreateSession(params: {
    sessionId: string
    cwd: string
    mcpServers?: NewSessionRequest['mcpServers']
    _meta?: NewSessionRequest['_meta']
  }): Promise<NewSessionResponse> {
    const existingSession = this.sessions.get(params.sessionId)
    if (existingSession) {
      const fingerprint = computeSessionFingerprint({
        cwd: params.cwd,
        mcpServers:
          params.mcpServers as Array<{ name: string; [key: string]: unknown }> | undefined,
      })
      if (fingerprint === existingSession.sessionFingerprint) {
        return {
          sessionId: params.sessionId,
          modes: existingSession.modes,
          models: existingSession.models,
          configOptions: existingSession.configOptions,
        }
      }

      // Session-defining params changed — tear down and recreate
      await this.teardownSession(params.sessionId)
    }

    // Set CWD early so session file lookup can find the right project directory
    setOriginalCwd(params.cwd)

    // Try to load session history for resume/load
    let initialMessages: Message[] | undefined
    if (sessionIdExists(params.sessionId)) {
      try {
        const log = await getLastSessionLog(params.sessionId as UUID)
        if (log && log.messages.length > 0) {
          initialMessages = deserializeMessages(log.messages)
        }
      } catch (err) {
        console.error('[ACP] Failed to load session history:', err)
      }
    }

    const response = await this.createSession(
      {
        cwd: params.cwd,
        mcpServers: params.mcpServers ?? [],
        _meta: params._meta,
      },
      { sessionId: params.sessionId, initialMessages },
    )

    // Replay history to client if loaded
    if (initialMessages && initialMessages.length > 0) {
      const session = this.sessions.get(params.sessionId)
      if (session) {
        await replayHistoryMessages(
          params.sessionId,
          initialMessages as unknown as Array<Record<string, unknown>>,
          this.conn,
          session.toolUseCache,
          this.clientCapabilities,
          session.cwd,
        )
      }
    }

    return {
      sessionId: response.sessionId,
      modes: response.modes,
      models: response.models,
      configOptions: response.configOptions,
    }
  }

  private async teardownSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return

    await this.cancel({ sessionId })
    this.sessions.delete(sessionId)
  }

  private applySessionMode(sessionId: string, modeId: string): void {
    if (!isPermissionMode(modeId)) {
      throw new Error(`Invalid mode: ${modeId}`)
    }
    const session = this.sessions.get(sessionId)
    if (session) {
      if (
        modeId === 'bypassPermissions' &&
        !session.appState.toolPermissionContext.isBypassPermissionsModeAvailable
      ) {
        throw new Error(`Mode not available: ${modeId}`)
      }
      const isAvailable = session.modes.availableModes.some(mode => mode.id === modeId)
      if (!isAvailable) {
        throw new Error(`Mode not available: ${modeId}`)
      }

      session.modes = { ...session.modes, currentModeId: modeId }
      // Sync mode to appState so the permission pipeline sees the correct mode
      session.appState.toolPermissionContext = {
        ...session.appState.toolPermissionContext,
        mode: modeId as PermissionMode,
      }
    }
  }

  private async updateConfigOption(
    sessionId: string,
    configId: string,
    value: string,
  ): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return

    this.syncSessionConfigState(session, configId, value)

    session.configOptions = session.configOptions.map((o) =>
      o.id === configId && typeof o.currentValue === 'string'
        ? { ...o, currentValue: value }
        : o,
    )

    await this.conn.sessionUpdate({
      sessionId,
      update: {
        sessionUpdate: 'config_option_update',
        configOptions: session.configOptions,
      },
    })
  }

  private syncSessionConfigState(
    session: AcpSession,
    configId: string,
    value: string,
  ): void {
    if (configId === 'mode') {
      session.modes = { ...session.modes, currentModeId: value }
    } else if (configId === 'model') {
      session.models = { ...session.models, currentModelId: value }
    }
  }

  private async sendAvailableCommandsUpdate(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return

    const availableCommands = session.commands
      .filter(
        cmd =>
          cmd.type === 'prompt' &&
          !cmd.isHidden &&
          cmd.userInvocable !== false,
      )
      .map(cmd => ({
        name: cmd.name,
        description: cmd.description,
        input: cmd.argumentHint ? { hint: cmd.argumentHint } : undefined,
      }))

    await this.conn.sessionUpdate({
      sessionId,
      update: {
        sessionUpdate: 'available_commands_update',
        availableCommands,
      },
    })
  }

  private scheduleAvailableCommandsUpdate(sessionId: string): void {
    setTimeout(() => {
      void this.sendAvailableCommandsUpdate(sessionId).catch(err => {
        console.error('[ACP] Failed to send available commands update:', err)
      })
    }, 0)
  }

  /** Read a setting from Claude config (simplified — no file watching) */
  private getSetting<T>(key: string): T | undefined {
    const settings = getSettings_DEPRECATED() as Record<string, unknown>
    const value = key.split('.').reduce<unknown>((current, segment) => {
      if (!current || typeof current !== 'object') return undefined
      return (current as Record<string, unknown>)[segment]
    }, settings)
    return value as T | undefined
  }
}

// ── Helpers ────────────────────────────────────────────────────────

const permissionModeIds: readonly PermissionMode[] = [
  'auto',
  'default',
  'acceptEdits',
  'bypassPermissions',
  'dontAsk',
  'plan',
]

function isPermissionMode(modeId: string): modeId is PermissionMode {
  return (permissionModeIds as readonly string[]).includes(modeId)
}

function resolveSessionPermissionMode(
  metaMode: unknown,
  hasMetaMode: boolean,
  settingsMode: unknown,
): PermissionMode {
  if (hasMetaMode) {
    const metaResolved = resolveRequiredPermissionMode(
      metaMode,
      '_meta.permissionMode',
    )
    if (
      metaResolved === 'bypassPermissions' &&
      !isAcpBypassPermissionModeAvailable(settingsMode)
    ) {
      throw new Error(
        'Mode not available: bypassPermissions requires a local ACP bypass opt-in.',
      )
    }

    return metaResolved
  }

  const settingsResolved = resolveConfiguredPermissionMode(settingsMode)
  return settingsResolved ?? 'default'
}

function resolveRequiredPermissionMode(
  mode: unknown,
  source: string,
): PermissionMode {
  if (mode === undefined || mode === null) {
    throw new Error(`Invalid ${source}: expected a string.`)
  }

  return resolvePermissionMode(mode, source) as PermissionMode
}

function resolveConfiguredPermissionMode(mode: unknown): PermissionMode | undefined {
  if (mode === undefined || mode === null) return undefined

  try {
    return resolvePermissionMode(mode, 'permissions.defaultMode') as PermissionMode
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err)
    console.error('[ACP] Invalid permissions.defaultMode, using default:', reason)
    return undefined
  }
}

function hasOwnField(
  value: Record<string, unknown> | null | undefined,
  key: string,
): boolean {
  return !!value && Object.hasOwn(value, key)
}

function isAcpBypassPermissionModeAvailable(settingsMode?: unknown): boolean {
  return (
    isProcessBypassPermissionModeAvailable() &&
    (isAcpBypassLocallyEnabled() || isSettingsBypassPermissionMode(settingsMode))
  )
}

function isProcessBypassPermissionModeAvailable(): boolean {
  if (process.env.IS_SANDBOX) return true
  if (typeof process.geteuid === 'function') return process.geteuid() !== 0
  if (typeof process.getuid === 'function') return process.getuid() !== 0
  return true
}

function isAcpBypassLocallyEnabled(): boolean {
  return (
    process.env.ACP_PERMISSION_MODE === 'bypassPermissions' ||
    isTruthyEnv(process.env.CLAUDE_CODE_ACP_ALLOW_BYPASS_PERMISSIONS)
  )
}

function isSettingsBypassPermissionMode(settingsMode: unknown): boolean {
  try {
    return resolvePermissionMode(settingsMode) === 'bypassPermissions'
  } catch {
    return false
  }
}

function isTruthyEnv(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true'
}

function popNextPendingPrompt(session: AcpSession): PendingPrompt | undefined {
  while (session.pendingQueueHead < session.pendingQueue.length) {
    const nextId = session.pendingQueue[session.pendingQueueHead++]
    if (!nextId) continue
    const next = session.pendingMessages.get(nextId)
    if (!next) continue
    session.pendingMessages.delete(nextId)
    compactPendingQueue(session)
    return next
  }

  compactPendingQueue(session)
  return undefined
}

function compactPendingQueue(session: AcpSession): void {
  if (session.pendingQueueHead === 0) return

  if (session.pendingQueueHead >= session.pendingQueue.length) {
    session.pendingQueue = []
    session.pendingQueueHead = 0
    return
  }

  if (
    session.pendingQueueHead > 1024 &&
    session.pendingQueueHead * 2 > session.pendingQueue.length
  ) {
    session.pendingQueue = session.pendingQueue.slice(session.pendingQueueHead)
    session.pendingQueueHead = 0
  }
}

function buildConfigOptions(
  modes: SessionModeState,
  models: SessionModelState,
): SessionConfigOption[] {
  return [
    {
      id: 'mode',
      name: 'Mode',
      description: 'Session permission mode',
      category: 'mode',
      type: 'select' as const,
      currentValue: modes.currentModeId,
      options: modes.availableModes.map((m: SessionModeState['availableModes'][number]) => ({
        value: m.id,
        name: m.name,
        description: m.description,
      })),
    },
    {
      id: 'model',
      name: 'Model',
      description: 'AI model to use',
      category: 'model',
      type: 'select' as const,
      currentValue: models.currentModelId,
      options: models.availableModels.map((m: SessionModelState['availableModels'][number]) => ({
        value: m.modelId,
        name: m.name,
        description: m.description ?? undefined,
      })),
    },
  ] as SessionConfigOption[]
}
