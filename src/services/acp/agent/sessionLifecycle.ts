/**
 * Session-lifecycle methods for AcpAgent (excluding createSession, which
 * lives in ./createSessionMethod.ts), attached to the prototype via
 * Object.assign. The barrel (./index.ts) imports this module for its side
 * effect so the prototype is populated before any instance is built.
 *
 * Methods attached here: getOrCreateSession, teardownSession,
 * replaySessionHistory, applySessionMode, updateConfigOption.
 */
import { type UUID } from 'node:crypto'
import { dirname } from 'node:path'
import type {
  NewSessionRequest,
  NewSessionResponse,
} from '@agentclientprotocol/sdk'
import type { Message } from '../../../types/message.js'
import { deserializeMessages } from '../../../utils/conversationRecovery.js'
import { getLastSessionLog } from '../../../utils/sessionStorage.js'
import type { PermissionMode } from '../../../types/permissions.js'
import { setOriginalCwd, switchSession } from '../../../bootstrap/state.js'
import type { SessionId } from '../../../types/ids.js'
import { replayHistoryMessages } from '../bridge.js'
import { computeSessionFingerprint } from '../utils.js'
import { resolveSessionFilePath } from '../../../utils/sessionStoragePortable.js'
import { AcpAgent } from './AcpAgent.js'
import type { AcpSession } from './sessionTypes.js'
import { isPermissionMode } from './permissionMode.js'
import {
  getConnection,
  readClientCapabilities,
  syncSessionConfigState,
} from './internalAccessors.js'

// ── getOrCreateSession ───────────────────────────────────────────

async function getOrCreateSession(
  this: AcpAgent,
  params: {
    sessionId: string
    cwd: string
    mcpServers?: NewSessionRequest['mcpServers']
    _meta?: NewSessionRequest['_meta']
    // replay:true (default, session/load) streams the conversation history back
    // to the client via session/update. replay:false (session/resume) only
    // restores the in-process context — per session-setup.mdx the Agent MUST
    // NOT replay history when resuming.
    replay?: boolean
  },
): Promise<NewSessionResponse> {
  const shouldReplay = params.replay !== false
  const existingSession = this.sessions.get(params.sessionId)
  if (existingSession) {
    const fingerprint = computeSessionFingerprint({
      cwd: params.cwd,
      mcpServers: params.mcpServers as
        | Array<{ name: string; [key: string]: unknown }>
        | undefined,
    })
    if (fingerprint === existingSession.sessionFingerprint) {
      const resolved = await resolveSessionFilePath(
        params.sessionId,
        params.cwd,
      )
      switchSession(
        params.sessionId as SessionId,
        resolved ? dirname(resolved.filePath) : null,
      )
      setOriginalCwd(params.cwd)

      if (shouldReplay) {
        await this.replaySessionHistory(params)
      }

      return {
        sessionId: params.sessionId,
        modes: existingSession.modes,
        // Carry models over on reconnect so the client keeps its model selector
        // populated (standard clients gate supportsModelSelection on this field).
        models: existingSession.models,
        configOptions: existingSession.configOptions,
      }
    }

    await this.teardownSession(params.sessionId)
  }

  // Locate the session file by sessionId. resolveSessionFilePath searches
  // the requested cwd's project dir first, then falls back to sibling git
  // worktrees — sessions created inside a repo (including from subdirectories
  // or ephemeral test envs nested in the repo) all persist under the same
  // parent project dir.
  const resolved = await resolveSessionFilePath(params.sessionId, params.cwd)
  const projectDir = resolved ? dirname(resolved.filePath) : null

  switchSession(params.sessionId as SessionId, projectDir)
  setOriginalCwd(params.cwd)

  let initialMessages: Message[] | undefined
  if (resolved) {
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

  // Replay history to client if loaded. session/resume skips this block.
  if (shouldReplay && initialMessages && initialMessages.length > 0) {
    const session = this.sessions.get(params.sessionId)
    if (session) {
      await replayHistoryMessages(
        params.sessionId,
        initialMessages as unknown as Array<Record<string, unknown>>,
        getConnection(this),
        session.toolUseCache,
        readClientCapabilities(this),
        session.cwd,
      )
    }
  }

  return {
    sessionId: response.sessionId,
    modes: response.modes,
    // createSession already returns models; pass it through. Same reason as above.
    models: response.models,
    configOptions: response.configOptions,
  }
}

// ── teardownSession ──────────────────────────────────────────────

async function teardownSession(
  this: AcpAgent,
  sessionId: string,
): Promise<void> {
  const session = this.sessions.get(sessionId)
  if (!session) return

  await this.cancel({ sessionId })
  this.sessions.delete(sessionId)
}

// ── replaySessionHistory ─────────────────────────────────────────

/**
 * Load session history from disk and replay it to the ACP client.
 * Used when switching back to a session that is already in memory
 * (the client needs the conversation replayed to display it).
 */
async function replaySessionHistory(
  this: AcpAgent,
  params: {
    sessionId: string
    cwd: string
  },
): Promise<void> {
  try {
    const log = await getLastSessionLog(params.sessionId as UUID)
    if (!log || log.messages.length === 0) return
    const messages = deserializeMessages(log.messages)
    if (messages.length === 0) return

    const session = this.sessions.get(params.sessionId)
    if (!session) return

    await replayHistoryMessages(
      params.sessionId,
      messages as unknown as Array<Record<string, unknown>>,
      getConnection(this),
      session.toolUseCache,
      readClientCapabilities(this),
      session.cwd,
    )
  } catch (err) {
    console.error('[ACP] Failed to replay session history:', err)
  }
}

// ── applySessionMode ─────────────────────────────────────────────

function applySessionMode(
  this: AcpAgent,
  sessionId: string,
  modeId: string,
): void {
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
    const isAvailable = session.modes.availableModes.some(
      mode => mode.id === modeId,
    )
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

// ── updateConfigOption ───────────────────────────────────────────

async function updateConfigOption(
  this: AcpAgent,
  sessionId: string,
  configId: string,
  value: string,
): Promise<void> {
  const session = this.sessions.get(sessionId)
  if (!session) return

  // Delegate to the shell's private syncSessionConfigState via a typed cast.
  // The shell declares syncSessionConfigState as a private method; it is not
  // part of the merged public interface, so we access it through the shared
  // internal accessor to preserve exact original behavior.
  syncSessionConfigState(this, session, configId, value)

  session.configOptions = session.configOptions.map(o =>
    o.id === configId && typeof o.currentValue === 'string'
      ? { ...o, currentValue: value }
      : o,
  )

  await getConnection(this).sessionUpdate({
    sessionId,
    update: {
      sessionUpdate: 'config_option_update',
      configOptions: session.configOptions,
    },
  })
}

// ── Prototype attachment ─────────────────────────────────────────

Object.assign(AcpAgent.prototype, {
  getOrCreateSession,
  teardownSession,
  replaySessionHistory,
  applySessionMode,
  updateConfigOption,
})
