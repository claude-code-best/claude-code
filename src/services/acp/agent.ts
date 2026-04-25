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
  ContentBlock,
  ClientCapabilities,
  CreateElicitationResponse,
  ElicitationSchema,
  SessionModeState,
  SessionModelState,
  SessionConfigOption,
  AvailableCommand,
} from '@agentclientprotocol/sdk'
import { randomUUID, type UUID } from 'node:crypto'
import { existsSync, realpathSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Message } from '../../types/message.js'
import { deserializeMessages } from '../../utils/conversationRecovery.js'
import {
  getLastSessionLogForCwd,
  sessionIdExistsForCwd,
} from '../../utils/sessionStorage.js'
import { QueryEngine } from '../../QueryEngine.js'
import type { QueryEngineConfig } from '../../QueryEngine.js'
import type { Tools } from '../../Tool.js'
import { getTools } from '../../tools.js'
import { getEmptyToolPermissionContext } from '../../Tool.js'
import type { PermissionMode } from '../../types/permissions.js'
import type { Command } from '../../types/command.js'
import { getCommandName, isCommandEnabled } from '../../types/command.js'
import { getCommands } from '../../commands.js'
import { enableConfigs } from '../../utils/config.js'
import { getInitialSettings } from '../../utils/settings/settings.js'
import { FileStateCache } from '../../utils/fileStateCache.js'
import { getDefaultAppState } from '../../state/AppStateStore.js'
import type { AppState } from '../../state/AppStateStore.js'
import { createAcpCanUseTool } from './permissions.js'
import {
  forwardSessionUpdates,
  replayHistoryMessages,
  type ToolUseCache,
} from './bridge.js'
import {
  resolvePermissionMode,
  computeSessionFingerprint,
  sanitizeTitle,
} from './utils.js'
import { listSessionsImpl } from '../../utils/listSessionsImpl.js'
import { getMainLoopModel } from '../../utils/model/model.js'
import { getModelOptions } from '../../utils/model/modelOptions.js'
import {
  getAllMcpConfigs,
  getClaudeCodeMcpConfigs,
  isMcpServerDisabled,
} from '../mcp/config.js'
import {
  clearServerCache,
  getMcpToolsCommandsAndResources,
} from '../mcp/client.js'
import type {
  MCPServerConnection,
  ScopedMcpServerConfig,
  ServerResource,
} from '../mcp/types.js'
import {
  excludeCommandsByServer,
  excludeResourcesByServer,
  excludeToolsByServer,
} from '../mcp/utils.js'
import { buildAcpDynamicMcpConfig } from './mcpDynamicConfig.js'
import { logForDebugging } from '../../utils/debug.js'

// ── Session state ─────────────────────────────────────────────────

type AcpSession = {
  queryEngine: QueryEngine
  cancelled: boolean
  cwd: string
  sessionFingerprint: string
  dynamicMcpConfig: Record<string, ScopedMcpServerConfig>
  modes: SessionModeState
  models: SessionModelState
  configOptions: SessionConfigOption[]
  promptRunning: boolean
  pendingMessages: Map<
    string,
    { resolve: (cancelled: boolean) => void; order: number }
  >
  nextPendingOrder: number
  toolUseCache: ToolUseCache
  clientCapabilities?: ClientCapabilities
  appState: AppState
  commands: Command[]
  mcpClosed: boolean
  mcpUpdateQueue: Promise<void>
  mcpConnectionTask?: Promise<void>
}

const MAX_ACP_PROMPT_BLOCKS = 50
const MAX_ACP_PROMPT_CHARS = 1_000_000
const MAX_PENDING_PROMPTS = 32
const MCP_CONNECTION_TEARDOWN_TIMEOUT_MS = 5_000

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
                  (
                    globalThis as unknown as Record<
                      string,
                      Record<string, unknown>
                    >
                  ).MACRO as Record<string, unknown>
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

  async authenticate(
    _params: AuthenticateRequest,
  ): Promise<AuthenticateResponse> {
    // No authentication required — this is a self-hosted/custom deployment
    return {}
  }

  // ── newSession ────────────────────────────────────────────────

  async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    return this.createSession(params)
  }

  // ── resumeSession ──────────────────────────────────────────────

  async unstable_resumeSession(
    params: ResumeSessionRequest,
  ): Promise<ResumeSessionResponse> {
    const result = await this.getOrCreateSession(params)
    setTimeout(() => {
      this.sendAvailableCommandsUpdate(params.sessionId).catch(error => {
        logForDebugging(
          `[ACP] Failed to send resume command metadata: ${error instanceof Error ? error.message : 'unknown error'}`,
        )
      })
    }, 0)
    return result
  }

  // ── loadSession ────────────────────────────────────────────────

  async loadSession(params: LoadSessionRequest): Promise<LoadSessionResponse> {
    const result = await this.getOrCreateSession(params)
    setTimeout(() => {
      this.sendAvailableCommandsUpdate(params.sessionId).catch(error => {
        logForDebugging(
          `[ACP] Failed to send load command metadata: ${error instanceof Error ? error.message : 'unknown error'}`,
        )
      })
    }, 0)
    return result
  }

  // ── listSessions ───────────────────────────────────────────────

  async listSessions(
    params: ListSessionsRequest,
  ): Promise<ListSessionsResponse> {
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
    const response = await this.createSession({
      cwd: params.cwd,
      mcpServers: params.mcpServers ?? [],
      _meta: params._meta,
    })
    setTimeout(() => {
      this.sendAvailableCommandsUpdate(response.sessionId).catch(error => {
        logForDebugging(
          `[ACP] Failed to send fork command metadata: ${error instanceof Error ? error.message : 'unknown error'}`,
        )
      })
    }, 0)
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

    // Reset cancelled state at the start of each prompt (matches official impl)
    session.cancelled = false

    // Extract text/image content from the prompt
    const promptInput = promptToQueryInput(params.prompt)

    if (!promptInput.trim()) {
      return { stopReason: 'end_turn' }
    }

    // Handle prompt queuing — if a prompt is already running, queue this one
    if (session.promptRunning) {
      if (session.pendingMessages.size >= MAX_PENDING_PROMPTS) {
        throw new Error('Too many queued prompts for this ACP session')
      }
      const order = session.nextPendingOrder++
      const promptUuid = randomUUID()
      const cancelled = await new Promise<boolean>(resolve => {
        session.pendingMessages.set(promptUuid, { resolve, order })
      })
      if (cancelled) {
        return { stopReason: 'cancelled' }
      }
    }

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

      console.error('[ACP] prompt error:', err)
      throw err
    } finally {
      if (promptInput.trim().startsWith('/mcp')) {
        await this.sendAvailableCommandsUpdate(params.sessionId).catch(() => {})
      }
      session.promptRunning = false
      // Resolve next pending prompt if any
      if (session.pendingMessages.size > 0) {
        const next = [...session.pendingMessages.entries()].sort(
          (a, b) => a[1].order - b[1].order,
        )[0]
        if (next) {
          next[1].resolve(false)
          session.pendingMessages.delete(next[0])
        }
      }
    }
  }

  // ── cancel ────────────────────────────────────────────────────

  async cancel(params: CancelNotification): Promise<void> {
    const session = this.sessions.get(params.sessionId)
    if (!session) return

    // Set cancelled flag — checked by prompt() loop to break out
    session.cancelled = true

    // Cancel any queued prompts
    for (const [, pending] of session.pendingMessages) {
      pending.resolve(true)
    }
    session.pendingMessages.clear()

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
  ): Promise<SetSessionModelResponse | undefined> {
    const session = this.sessions.get(params.sessionId)
    if (!session) {
      throw new Error('Session not found')
    }
    // Store the raw value — QueryEngine.submitMessage() calls
    // parseUserSpecifiedModel() to resolve aliases (e.g. "sonnet" → "glm-5.1-turbo")
    session.queryEngine.setModel(params.modelId)
    await this.updateConfigOption(params.sessionId, 'model', params.modelId)
    return undefined
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

    const option = session.configOptions.find(o => o.id === params.configId)
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

    session.configOptions = session.configOptions.map(o =>
      o.id === params.configId && typeof o.currentValue === 'string'
        ? { ...o, currentValue: value }
        : o,
    )

    return { configOptions: session.configOptions }
  }

  // ── Private helpers ─────────────────────────────────────────────

  private async createSession(
    params: NewSessionRequest,
    opts: {
      forceNewId?: boolean
      sessionId?: string
      initialMessages?: Message[]
    } = {},
  ): Promise<NewSessionResponse> {
    enableConfigs()

    const sessionId = opts.sessionId ?? randomUUID()
    const cwd = resolveAcpCwd(params.cwd)

    // Build tools with a permissive permission context.
    const permissionContext = getEmptyToolPermissionContext()
    const tools: Tools = getTools(permissionContext)

    // Parse permission mode from _meta (passed by RCS/acp-link) or fall back to settings
    const metaPermissionMode = (
      params._meta as Record<string, unknown> | null | undefined
    )?.permissionMode as string | undefined
    const permissionMode = resolvePermissionMode(
      metaPermissionMode ?? this.getSetting<string>('permissions.defaultMode'),
    )

    // Create the permission bridge canUseTool function
    const canUseTool = createAcpCanUseTool(
      this.conn,
      sessionId,
      () => this.sessions.get(sessionId)?.modes.currentModeId ?? 'default',
      this.clientCapabilities,
      cwd,
      (modeId: string) => {
        this.applySessionMode(sessionId, modeId)
      },
    )

    // Check if bypass permissions is available (not running as root unless in sandbox)
    const isBypassAvailable =
      (typeof process.geteuid === 'function'
        ? process.geteuid() !== 0
        : true) || !!process.env.IS_SANDBOX

    const dynamicMcpConfig = await buildAcpDynamicMcpConfig()
    const initialMcpConfig = await getInitialAcpMcpConfig(dynamicMcpConfig)
    const initialMcpClients = buildConfiguredMcpClients(initialMcpConfig)

    // Create a mutable AppState for the session
    const defaultAppState = getDefaultAppState()
    const appState: AppState = {
      ...defaultAppState,
      mcp: {
        ...(defaultAppState.mcp ?? {
          clients: [],
          tools: [],
          commands: [],
          resources: {},
          pluginReconnectKey: 0,
        }),
        clients: initialMcpClients,
      },
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
      mcpClients: initialMcpClients,
      agents: [],
      dynamicMcpConfig,
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
      useCwdOverrideOnly: true,
      elicit: this.clientCapabilities?.elicitation?.form
        ? (message, schema) => this.elicit(sessionId, message, schema)
        : undefined,
    }

    const queryEngine = new QueryEngine(engineConfig)

    // Build modes — bypassPermissions only available when not running as root (or in sandbox)
    const availableModes = [
      {
        id: 'default',
        name: 'Default',
        description: 'Standard behavior, prompts for dangerous operations',
      },
      {
        id: 'acceptEdits',
        name: 'Accept Edits',
        description: 'Auto-accept file edit operations',
      },
      {
        id: 'plan',
        name: 'Plan Mode',
        description: 'Planning mode, no actual tool execution',
      },
      {
        id: 'auto',
        name: 'Auto',
        description:
          'Use a model classifier to approve/deny permission prompts.',
      },
      ...(isBypassAvailable
        ? [
            {
              id: 'bypassPermissions' as const,
              name: 'Bypass Permissions',
              description: 'Skip all permission checks',
            },
          ]
        : []),
      {
        id: 'dontAsk',
        name: "Don't Ask",
        description: "Don't prompt for permissions, deny if not pre-approved",
      },
    ]

    const modes: SessionModeState = {
      currentModeId: permissionMode,
      availableModes,
    }

    // Build models
    const modelOptions = getModelOptions()
    const currentModel = getMainLoopModel()
    const models: SessionModelState = {
      availableModels: modelOptions.map(m => ({
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
      cwd,
      dynamicMcpConfig,
      modes,
      models,
      configOptions,
      promptRunning: false,
      pendingMessages: new Map(),
      nextPendingOrder: 0,
      toolUseCache: {},
      clientCapabilities: this.clientCapabilities,
      appState,
      commands,
      mcpClosed: false,
      mcpUpdateQueue: Promise.resolve(),
      sessionFingerprint: computeSessionFingerprint({
        cwd,
        mcpServers: params.mcpServers as
          | Array<{ name: string; [key: string]: unknown }>
          | undefined,
      }),
    }

    this.sessions.set(sessionId, session)

    this.startMcpConnections(sessionId, initialMcpConfig)

    // Send available commands after session creation
    setTimeout(() => {
      this.sendAvailableCommandsUpdate(sessionId).catch(error => {
        logForDebugging(
          `[ACP] Failed to send initial command metadata: ${error instanceof Error ? error.message : 'unknown error'}`,
        )
      })
    }, 0)

    return {
      sessionId,
      models,
      modes,
      configOptions,
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
        mcpServers: params.mcpServers as
          | Array<{ name: string; [key: string]: unknown }>
          | undefined,
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

    // Try to load session history for resume/load
    let initialMessages: Message[] | undefined
    if (sessionIdExistsForCwd(params.sessionId, params.cwd)) {
      try {
        const log = await getLastSessionLogForCwd(
          params.sessionId as UUID,
          params.cwd,
        )
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

    session.mcpClosed = true
    await this.cancel({ sessionId })
    await waitForMcpTask(session.mcpConnectionTask)
    await session.mcpUpdateQueue.catch(() => {})
    await this.closeMcpClients(session)
    this.sessions.delete(sessionId)
  }

  private async closeMcpClients(session: AcpSession): Promise<void> {
    await Promise.allSettled(
      session.appState.mcp.clients
        .filter(client => client.type === 'connected')
        .map(client => cleanupAcpMcpClient(client)),
    )
  }

  private applySessionMode(sessionId: string, modeId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      const resolvedMode = resolvePermissionMode(modeId) as PermissionMode
      if (
        resolvedMode === 'bypassPermissions' &&
        !session.appState.toolPermissionContext
          .isBypassPermissionsModeAvailable
      ) {
        throw new Error('bypassPermissions is not available in this session')
      }
      session.modes = { ...session.modes, currentModeId: resolvedMode }
      // Sync mode to appState so the permission pipeline sees the correct mode
      session.appState.toolPermissionContext = {
        ...session.appState.toolPermissionContext,
        mode: resolvedMode,
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

    session.configOptions = session.configOptions.map(o =>
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

    const availableCommands = buildAvailableCommands(
      session.commands,
      await getMcpServersForMetadata(session),
    )

    await this.conn.sessionUpdate({
      sessionId,
      update: {
        sessionUpdate: 'available_commands_update',
        availableCommands,
      },
    })
  }

  private startMcpConnections(
    sessionId: string,
    configs: Record<string, ScopedMcpServerConfig>,
  ): void {
    if (Object.keys(configs).length === 0) return
    const session = this.sessions.get(sessionId)
    if (!session) return

    session.mcpConnectionTask = getMcpToolsCommandsAndResources(({ client, tools, commands, resources }) => {
      const session = this.sessions.get(sessionId)
      if (!session || session.mcpClosed) {
        if (client.type === 'connected') {
          if (session) {
            session.mcpUpdateQueue = session.mcpUpdateQueue.then(() =>
              cleanupAcpMcpClient(client),
            )
          } else {
            void cleanupAcpMcpClient(client)
          }
        }
        return
      }

      session.mcpUpdateQueue = session.mcpUpdateQueue
        .then(async () => {
          const current = this.sessions.get(sessionId)
          if (!current || current.mcpClosed) {
            if (client.type === 'connected') {
              await cleanupAcpMcpClient(client)
            }
            return
          }

          applyAcpMcpUpdate(current.appState, {
            client,
            tools,
            commands,
            resources: resources ?? [],
          })

          await this.sendAvailableCommandsUpdate(sessionId).catch(error => {
            logForDebugging(
              `[ACP MCP] Failed to send command metadata update: ${error instanceof Error ? error.message : 'unknown error'}`,
            )
          })
        })
        .catch(error => {
          logForDebugging(
            `[ACP MCP] MCP state update failed: ${error instanceof Error ? error.message : 'unknown error'}`,
          )
        })
    }, configs, {
      shouldAbort: () => this.sessions.get(sessionId)?.mcpClosed !== false,
    }).catch(error => {
      logForDebugging(
        `[ACP MCP] Background MCP connection failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      )
    })
  }

  private async elicit(
    sessionId: string,
    message: string,
    schema: ElicitationSchema,
  ): Promise<CreateElicitationResponse> {
    return this.conn.unstable_createElicitation({
      mode: 'form',
      sessionId,
      message,
      requestedSchema: schema,
    })
  }

  /** Read a setting from Claude config (simplified — no file watching) */
  private getSetting<T>(key: string): T | undefined {
    if (key === 'permissions.defaultMode') {
      return getInitialSettings().permissions?.defaultMode as T | undefined
    }
    return undefined as T | undefined
  }
}

type McpServerMetadata = {
  name: string
  status: MCPServerConnection['type'] | 'configured'
  scope?: string
  transport?: string
  actions: string[]
}

async function getInitialAcpMcpConfig(
  dynamicMcpConfig: Record<string, ScopedMcpServerConfig>,
): Promise<Record<string, ScopedMcpServerConfig>> {
  try {
    const { servers } = await getClaudeCodeMcpConfigs(dynamicMcpConfig)
    return mergeAcpMcpConfigs(servers, dynamicMcpConfig)
  } catch {
    return dynamicMcpConfig
  }
}

function applyAcpMcpUpdate(
  appState: AppState,
  update: {
    client: MCPServerConnection
    tools: Tools
    commands: Command[]
    resources: ServerResource[]
  },
): void {
  const { client, tools, commands, resources } = update
  const clients = appState.mcp.clients.some(c => c.name === client.name)
    ? appState.mcp.clients.map(c => (c.name === client.name ? client : c))
    : [...appState.mcp.clients, client]

  Object.assign(appState, {
    ...appState,
    mcp: {
      ...appState.mcp,
      clients,
      tools: [...excludeToolsByServer(appState.mcp.tools, client.name), ...tools],
      commands: [
        ...excludeCommandsByServer(appState.mcp.commands, client.name),
        ...commands,
      ],
      resources:
        resources.length > 0
          ? {
              ...excludeResourcesByServer(appState.mcp.resources, client.name),
              [client.name]: resources,
            }
          : excludeResourcesByServer(appState.mcp.resources, client.name),
    },
  })
}

async function cleanupAcpMcpClient(
  client: Extract<MCPServerConnection, { type: 'connected' }>,
): Promise<void> {
  client.client.onclose = undefined
  await clearServerCache(client.name, client.config).catch(() => {})
  await client.client.close().catch(() => {})
  await client.cleanup().catch(() => {})
}

async function waitForMcpTask(task: Promise<void> | undefined): Promise<void> {
  if (!task) return
  await Promise.race([
    task.catch(() => {}),
    new Promise<void>(resolve =>
      setTimeout(resolve, MCP_CONNECTION_TEARDOWN_TIMEOUT_MS),
    ),
  ])
}

function mergeAcpMcpConfigs(
  configuredServers: Record<string, ScopedMcpServerConfig>,
  dynamicServers: Record<string, ScopedMcpServerConfig>,
): Record<string, ScopedMcpServerConfig> {
  const overriddenNames = Object.keys(dynamicServers).filter(name =>
    Object.hasOwn(configuredServers, name),
  )
  if (overriddenNames.length > 0) {
    logForDebugging(
      `[ACP MCP] Dynamic MCP config overrides configured server names: ${overriddenNames.join(', ')}`,
    )
  }
  return { ...configuredServers, ...dynamicServers }
}

function buildConfiguredMcpClients(
  configs: Record<string, ScopedMcpServerConfig>,
): MCPServerConnection[] {
  return Object.entries(configs)
    .filter(([name]) => name !== 'ide')
    .map(([name, config]) => ({
      name,
      type: isMcpServerDisabled(name) ? 'disabled' : 'pending',
      config,
    }))
}

async function getMcpServersForMetadata(
  session: AcpSession,
): Promise<McpServerMetadata[]> {
  const servers = new Map<string, McpServerMetadata>()

  const addConfiguredServer = (
    name: string,
    config: ScopedMcpServerConfig,
  ): void => {
    if (name === 'ide' || servers.has(name)) return
    const status = isMcpServerDisabled(name) ? 'disabled' : 'configured'
    servers.set(name, {
      name,
      status,
      scope: config.scope,
      transport: config.type ?? 'stdio',
      actions: mcpActionsFor(status, config.type),
    })
  }

  for (const [name, config] of Object.entries(session.dynamicMcpConfig)) {
    addConfiguredServer(name, config)
  }

  try {
    const { servers: allConfigs } = await getAllMcpConfigs()
    for (const [name, config] of Object.entries(allConfigs)) {
      addConfiguredServer(name, config)
    }
  } catch {
    try {
      const { servers: claudeCodeConfigs } = await getClaudeCodeMcpConfigs(
        session.dynamicMcpConfig,
      )
      for (const [name, config] of Object.entries(claudeCodeConfigs)) {
        addConfiguredServer(name, config)
      }
    } catch {
      // Keep the dynamic/app-state entries already collected.
    }
  }

  for (const client of session.appState.mcp?.clients ?? []) {
    if (client.name === 'ide') continue
    servers.set(client.name, {
      name: client.name,
      status: client.type,
      scope: client.config.scope,
      transport: client.config.type ?? 'stdio',
      actions: mcpActionsFor(client.type, client.config.type),
    })
  }

  return [...servers.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function mcpActionsFor(status: string, transport?: string): string[] {
  const actions = ['status']
  if (status === 'connected') actions.push('tools')
  if (status === 'disabled') {
    actions.push('enable')
    return actions
  }
  if (transport !== 'claudeai-proxy') actions.push('reconnect')
  actions.push('disable')
  return actions
}

function buildAvailableCommands(
  commands: Command[],
  mcpServers: McpServerMetadata[] = [],
): AvailableCommand[] {
  const visibleCommands = commands.filter(
    cmd =>
      !cmd.isHidden && cmd.userInvocable !== false && isCommandEnabled(cmd),
  )
  const primaryNames = new Set(visibleCommands.map(cmd => getCommandName(cmd)))
  const result = new Map<string, AvailableCommand>()

  for (const cmd of visibleCommands) {
    const name = getCommandName(cmd)
    if (!name || result.has(name)) continue
    result.set(name, toAvailableCommand(cmd, name, undefined, mcpServers))
  }

  for (const cmd of visibleCommands) {
    const aliases = cmd.aliases ?? []
    for (const alias of aliases) {
      if (!alias || primaryNames.has(alias) || result.has(alias)) continue
      result.set(
        alias,
        toAvailableCommand(cmd, alias, getCommandName(cmd), mcpServers),
      )
    }
  }

  return [...result.values()]
}

function toAvailableCommand(
  cmd: Command,
  name: string,
  aliasFor?: string,
  mcpServers: McpServerMetadata[] = [],
): AvailableCommand {
  return {
    name,
    description: cmd.description ?? '',
    input: commandInputHint(cmd.argumentHint),
    _meta: commandMetadata(cmd, aliasFor, mcpServers),
  }
}

function commandMetadata(
  cmd: Command,
  aliasFor?: string,
  mcpServers: McpServerMetadata[] = [],
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    ccbCommandType: cmd.type,
    ccbCanonicalName: cmd.name,
  }

  const aliases = cmd.aliases ?? []
  if (aliases.length > 0) {
    metadata.ccbAliases = aliases
  }
  if (aliasFor) {
    metadata.ccbAliasFor = aliasFor
  }
  if (cmd.loadedFrom) {
    metadata.ccbLoadedFrom = cmd.loadedFrom
  }
  if (cmd.kind) {
    metadata.ccbKind = cmd.kind
  }
  if (cmd.type === 'prompt') {
    metadata.ccbSource = cmd.source
  }
  if (cmd.name === 'mcp') {
    metadata.ccbMcpServerNames = mcpServers.map(server => server.name)
    metadata.ccbMcpServers = mcpServers
  }

  return metadata
}

function commandInputHint(argumentHint: unknown): { hint: string } | null {
  if (typeof argumentHint === 'string') {
    return argumentHint ? { hint: argumentHint } : null
  }
  if (Array.isArray(argumentHint)) {
    const hint = argumentHint
      .filter(item => typeof item === 'string')
      .join(' | ')
    return hint ? { hint } : null
  }
  return null
}

// ── Helpers ────────────────────────────────────────────────────────

/** Extract prompt text from ACP ContentBlock array for QueryEngine input */
function promptToQueryInput(prompt: Array<ContentBlock> | undefined): string {
  if (!prompt || prompt.length === 0) return ''

  const parts: string[] = []
  let totalChars = 0
  const appendPart = (part: string): void => {
    if (totalChars >= MAX_ACP_PROMPT_CHARS) return
    const remaining = MAX_ACP_PROMPT_CHARS - totalChars
    const clipped = part.slice(0, remaining)
    parts.push(clipped)
    totalChars += clipped.length
  }

  for (const block of prompt.slice(0, MAX_ACP_PROMPT_BLOCKS)) {
    const b = block as Record<string, unknown>
    if (b.type === 'text') {
      appendPart(typeof b.text === 'string' ? b.text : '')
    } else if (b.type === 'resource_link') {
      appendPart(
        `[${escapeMarkdownLinkText(String(b.name ?? ''))}](${escapeMarkdownLinkTarget(String(b.uri ?? ''))})`,
      )
    } else if (b.type === 'resource') {
      const resource = b.resource as Record<string, unknown> | undefined
      if (resource && typeof resource.text === 'string') {
        appendPart(resource.text)
      }
    }
    // Ignore image and other types for text-based prompt
  }
  return parts.join('\n')
}

function escapeMarkdownLinkText(text: string): string {
  return text.replace(/[\\[\]]/g, '\\$&').replace(/[\r\n]+/g, ' ')
}

function escapeMarkdownLinkTarget(target: string): string {
  return target.replace(/[()\s\r\n]/g, encodeURIComponent)
}

function resolveAcpCwd(rawCwd: string): string {
  try {
    const resolved = realpathSync(resolve(rawCwd))
    if (existsSync(resolved) && statSync(resolved).isDirectory()) {
      return resolved
    }
  } catch {
    // Fall through to the current process cwd.
  }
  return process.cwd()
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
      options: modes.availableModes.map(
        (m: SessionModeState['availableModes'][number]) => ({
          value: m.id,
          name: m.name,
          description: m.description,
        }),
      ),
    },
    {
      id: 'model',
      name: 'Model',
      description: 'AI model to use',
      category: 'model',
      type: 'select' as const,
      currentValue: models.currentModelId,
      options: models.availableModels.map(
        (m: SessionModelState['availableModels'][number]) => ({
          value: m.modelId,
          name: m.name,
          description: m.description ?? undefined,
        }),
      ),
    },
  ] as SessionConfigOption[]
}
