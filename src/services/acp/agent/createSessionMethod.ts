/**
 * AcpAgent.prototype.createSession implementation, attached via Object.assign.
 * Extracted from sessionLifecycle.ts to keep that module under the 500-line
 * budget. The barrel (./index.ts) imports this module for its side effect.
 */
import { randomUUID } from 'node:crypto'
import type {
  NewSessionRequest,
  NewSessionResponse,
  SessionModeState,
  SessionModelState,
} from '@agentclientprotocol/sdk'
import type { Message } from '../../../types/message.js'
import { QueryEngine } from '../../../QueryEngine.js'
import type { QueryEngineConfig } from '../../../QueryEngine.js'
import type { Tools } from '../../../Tool.js'
import { getTools } from '../../../tools.js'
import { getEmptyToolPermissionContext } from '../../../Tool.js'
import type { PermissionMode } from '../../../types/permissions.js'
import { getCommands } from '../../../commands.js'
import { getAgentDefinitionsWithOverrides } from '@claude-code-best/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import {
  setOriginalCwd,
  switchSession,
  getSessionProjectDir,
} from '../../../bootstrap/state.js'
import type { SessionId } from '../../../types/ids.js'
import { enableConfigs } from '../../../utils/config.js'
import { applySafeConfigEnvironmentVariables } from '../../../utils/managedEnv.js'
import { resetSettingsCache } from '../../../utils/settings/settingsCache.js'
import { FileStateCache } from '../../../utils/fileStateCache.js'
import { getDefaultAppState } from '../../../state/AppStateStore.js'
import type { AppState } from '../../../state/AppStateStore.js'
import { createAcpCanUseTool } from '../permissions.js'
import { computeSessionFingerprint } from '../utils.js'
import { getMainLoopModel } from '../../../utils/model/model.js'
import { getModelOptions } from '../../../utils/model/modelOptions.js'
import { getSettings_DEPRECATED } from '../../../utils/settings/settings.js'
import { AcpAgent } from './AcpAgent.js'
import type { AcpSession } from './sessionTypes.js'
import {
  resolveSessionPermissionMode,
  isAcpBypassPermissionModeAvailable,
  hasOwnField,
} from './permissionMode.js'
import { buildConfigOptions } from './configOptions.js'
import { readClientCapabilities } from './internalAccessors.js'

/**
 * Resolve the effective `permissions.defaultMode` setting by walking the
 * settings object. Lives here so createSession can read it without depending
 * on AcpAgent.getSetting (which is a private instance method on the shell).
 */
function readSettingsPermissionMode(): unknown {
  const settings = getSettings_DEPRECATED() as Record<string, unknown>
  const perms = settings.permissions as Record<string, unknown> | undefined
  return perms?.defaultMode
}

// ── createSession ────────────────────────────────────────────────

async function createSession(
  this: AcpAgent,
  params: NewSessionRequest,
  opts: {
    forceNewId?: boolean
    sessionId?: string
    initialMessages?: Message[]
  } = {},
): Promise<NewSessionResponse> {
  enableConfigs()

  const sessionId = opts.sessionId ?? randomUUID()
  const cwd = params.cwd

  // Align the global session state so that transcript persistence,
  // analytics, and cost tracking use the ACP session ID.
  // Preserve the projectDir set by getOrCreateSession so that
  // getSessionProjectDir() continues to resolve correctly.
  const currentProjectDir = getSessionProjectDir()
  switchSession(sessionId as SessionId, currentProjectDir)

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

  // entry.ts calls applySafeConfigEnvironmentVariables() during handshake so the
  // API client can authenticate before createSession arrives. At that point
  // getOriginalCwd() is still the spawn cwd (not the project dir), so
  // loadSettingsFromDisk() resolves localSettings/projectSettings against the
  // wrong root and caches the empty result. Now that we've set the real project
  // cwd, drop the cache and re-apply so settings.local.json and project env
  // become visible to readSettingsPermissionMode() and downstream consumers.
  resetSettingsCache()
  applySafeConfigEnvironmentVariables()

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
    const settingsPermissionMode = readSettingsPermissionMode()
    const permissionMode = resolveSessionPermissionMode(
      metaPermissionMode,
      hasMetaPermissionMode,
      settingsPermissionMode,
    )

    // The clientCapabilities field on the shell is private; access it via
    // the public initialize() side effect. Since createSession is only ever
    // called after initialize() has run (per ACP protocol), this accessor
    // is safe.
    const clientCapabilities = readClientCapabilities(this)

    // Create the permission bridge canUseTool function. The connection field
    // is private on the shell; access it through the internal accessor.
    const conn = (
      this as unknown as {
        conn: import('@agentclientprotocol/sdk').AgentSideConnection
      }
    ).conn
    const canUseTool = createAcpCanUseTool(
      conn,
      sessionId,
      () => this.sessions.get(sessionId)?.modes.currentModeId ?? 'default',
      clientCapabilities,
      cwd,
      (modeId: string) => {
        this.applySessionMode(sessionId, modeId)
      },
      () =>
        this.sessions.get(sessionId)?.appState.toolPermissionContext
          .isBypassPermissionsModeAvailable ?? false,
    )

    // Parse MCP servers from ACP params
    // MCP server config is handled separately in the tools system

    // bypassPermissions is exposed to ACP clients whenever the process itself allows it
    // (non-root or sandbox). The previous additional opt-in gate made the mode invisible
    // to standard clients and defeated the purpose of listing it. See permissionMode.ts.
    const isBypassAvailable = isAcpBypassPermissionModeAvailable()

    // Create a mutable AppState for the session
    const appState: AppState = {
      ...getDefaultAppState(),
      toolPermissionContext: {
        ...permissionContext,
        mode: permissionMode as PermissionMode,
        isBypassPermissionsModeAvailable: isBypassAvailable,
      },
    }

    // Load commands and agent definitions for subagent support
    const [commands, agentDefinitionsResult] = await Promise.all([
      getCommands(cwd),
      getAgentDefinitionsWithOverrides(cwd),
    ])

    // Inject agent definitions into appState
    appState.agentDefinitions = agentDefinitionsResult

    // Build QueryEngine config
    const engineConfig: QueryEngineConfig = {
      cwd,
      tools,
      commands,
      mcpClients: [],
      agents: agentDefinitionsResult.activeAgents,
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
      clientCapabilities,
      appState,
      commands,
      sessionFingerprint: computeSessionFingerprint({
        cwd,
        mcpServers: params.mcpServers as
          | Array<{ name: string; [key: string]: unknown }>
          | undefined,
      }),
    }

    this.sessions.set(sessionId, session)

    // Return models even though SDK 0.19.2 marks it UNSTABLE. The schema does allow the field
    // (NewSessionResponse.models?: SessionModelState | null), and standard clients (Cursor/Zed/
    // VS Code ACP) rely on it to populate the model selector — omitting it forces
    // supportsModelSelection=false on the client and the user can never switch models.
    // The UNSTABLE marker only means "this field may change in a future schema version", not
    // "agents MUST NOT return it". The previous "v1 compliance" omission was overzealous.
    return {
      sessionId,
      modes,
      models,
      configOptions,
    }
  } finally {
    if (processCwdChanged) {
      process.chdir(previousProcessCwd)
    }
  }
}

// ── Prototype attachment ─────────────────────────────────────────

Object.assign(AcpAgent.prototype, {
  createSession,
})
