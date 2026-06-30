/**
 * ACP Agent implementation — bridges ACP protocol methods to Claude Code's
 * internal QueryEngine / query() pipeline.
 *
 * Architecture: Uses internal QueryEngine (not @anthropic-ai/claude-agent-sdk)
 * to directly run queries, with a bridge layer converting SDKMessage → ACP SessionUpdate.
 *
 * NOTE: The AcpAgent class is split across three modules for line-budget reasons.
 * The class shell + lightweight protocol handlers live here; the heavy
 * session-lifecycle methods (createSession / getOrCreateSession /
 * replaySessionHistory / teardownSession / applySessionMode / updateConfigOption)
 * are attached to the prototype in `./sessionLifecycle.js`, and the prompt
 * flow (prompt / setSessionConfigOption) in `./promptFlow.js`. The barrel
 * `./index.js` imports those side-effect modules so the prototype is fully
 * populated before any AcpAgent instance is constructed.
 */
import {
  RequestError,
  type Agent,
  type AgentSideConnection,
  type InitializeRequest,
  type InitializeResponse,
  type AuthenticateRequest,
  type AuthenticateResponse,
  type NewSessionRequest,
  type NewSessionResponse,
  type PromptRequest,
  type PromptResponse,
  type CancelNotification,
  type LoadSessionRequest,
  type LoadSessionResponse,
  type ListSessionsRequest,
  type ListSessionsResponse,
  type ResumeSessionRequest,
  type ResumeSessionResponse,
  type ForkSessionRequest,
  type ForkSessionResponse,
  type CloseSessionRequest,
  type CloseSessionResponse,
  type SetSessionModeRequest,
  type SetSessionModeResponse,
  type SetSessionModelRequest,
  type SetSessionModelResponse,
  type SetSessionConfigOptionRequest,
  type SetSessionConfigOptionResponse,
  type ClientCapabilities,
} from '@agentclientprotocol/sdk'
import { unlink } from 'node:fs/promises'
import type { Message } from '../../../types/message.js'
import { sanitizeTitle } from '../utils.js'
import { listSessionsImpl } from '../../../utils/listSessionsImpl.js'
import {
  resolveSessionFilePath,
  canonicalizePath,
} from '../../../utils/sessionStoragePortable.js'
import { getOriginalCwd } from '../../../bootstrap/state.js'
import type { AcpSession } from './sessionTypes.js'

// ── Agent class ───────────────────────────────────────────────────
//
// NOTE: This class is intentionally merged with the `AcpAgent` interface
// declared at the bottom of this file. The merged interface declares methods
// that are attached to AcpAgent.prototype at module load time by the sibling
// side-effect modules (createSessionMethod.ts / sessionLifecycle.ts /
// promptFlow.ts) imported by the barrel (./agent.ts). This is the standard
// prototype-augmentation pattern and is safe because the barrel guarantees
// the side-effect imports run before any instance is constructed.
// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: prototype-augmentation pattern — merged interface methods are attached to AcpAgent.prototype by sibling side-effect modules imported by the barrel (./agent.ts) before any instance is constructed.
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
      // Explicit empty authMethods signals "no authentication required" to
      // Clients rather than "capability unknown". Matches authenticate() no-op.
      authMethods: [],
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
            // session/fork is UNSTABLE — not part of stable v1 SessionCapabilities.
            // Advertise via _meta namespace per extensibility.mdx "Advertising
            // Custom Capabilities" instead of the standard sessionCapabilities map.
            forkSession: true,
          },
        },
        // image:false — promptToQueryInput() does not parse ContentBlock::Image
        // blocks yet. Re-enable only after multimodal query input support lands.
        promptCapabilities: {
          image: false,
          embeddedContext: true,
        },
        mcpCapabilities: {
          http: true,
          sse: true,
        },
        loadSession: true,
        sessionCapabilities: {
          list: {},
          resume: {},
          close: {},
          // UNSTABLE per session-delete.mdx: capability-gated session/delete.
          // SDK 0.19.0's SessionCapabilities type predates this field — clients
          // implementing the RFD read `sessionCapabilities.delete`, so we
          // advertise it at the standard path via type augmentation.
          ...({ delete: {} } as { delete: Record<string, never> }),
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
    const result = await this.createSession(params)
    this.scheduleAvailableCommandsUpdate(result.sessionId)
    return result
  }

  // ── resumeSession ──────────────────────────────────────────────

  async unstable_resumeSession(
    params: ResumeSessionRequest,
  ): Promise<ResumeSessionResponse> {
    // Per session-setup.mdx "Resuming a Session": the Agent MUST NOT replay the
    // conversation history via session/update notifications before responding.
    // Only restore context + MCP connections, then return immediately. This
    // differs from session/load which DOES replay history.
    const result = await this.getOrCreateSession({ ...params, replay: false })
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

  async listSessions(
    params: ListSessionsRequest,
  ): Promise<ListSessionsResponse> {
    // Pagination is not implemented: we always return all available sessions
    // for the requested cwd (no nextCursor). Per session-list.mdx the Agent
    // SHOULD return an error if the cursor is invalid, so explicitly reject
    // any client-supplied cursor rather than silently accepting it.
    if (params.cursor !== undefined && params.cursor !== null) {
      throw new Error(
        'Pagination cursor not supported: listSessions returns all results in a single page.',
      )
    }

    // Resolve the effective cwd: client-provided wins, fall back to the
    // agent's current working directory (set by the most recent session/new
    // or session/load). Standard ACP clients (e.g. Goose) call session/list
    // with empty params and no cwd — without a fallback, listSessionsImpl
    // treats undefined dir as "all projects" and returns every session on
    // disk, which is unrelated to the workspace the user actually has open.
    const requestedCwd = params.cwd || getOriginalCwd()
    const canonicalRequested = await canonicalizePath(requestedCwd)

    const candidates = await listSessionsImpl({
      dir: requestedCwd,
    })

    const sessions = []
    for (const candidate of candidates) {
      if (!candidate.cwd) continue
      // Per session-list.mdx: "Only sessions with a matching cwd are
      // returned." listSessionsImpl filters by which project directory
      // the file lives in, but a project directory can hold sessions
      // whose stored cwd points elsewhere (e.g. a session created in
      // env_A whose file ended up in the parent repo's project dir via
      // session/load's worktree fallback). Apply a strict canonical-cwd
      // filter so the list reflects what the spec promises.
      const canonicalCandidate = await canonicalizePath(candidate.cwd)
      if (canonicalCandidate !== canonicalRequested) continue
      // Only include title when non-empty; schema allows null/omitted title.
      const title = sanitizeTitle(candidate.summary ?? '')
      sessions.push({
        sessionId: candidate.sessionId,
        cwd: candidate.cwd,
        ...(title ? { title } : {}),
        updatedAt: new Date(candidate.lastModified).toISOString(),
      })
    }

    return { sessions }
  }

  // ── forkSession ────────────────────────────────────────────────

  async unstable_forkSession(
    params: ForkSessionRequest,
  ): Promise<ForkSessionResponse> {
    // Load the source session's messages so the fork actually branches from
    // the source conversation rather than starting a blank session. Per the
    // unstable ForkSessionRequest, params.sessionId is the ID to fork from.
    const { initialMessages } = await loadForkSourceMessages(params.sessionId)
    const response = await this.createSession(
      {
        cwd: params.cwd,
        mcpServers: params.mcpServers ?? [],
        _meta: params._meta,
      },
      { initialMessages },
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

  // ── deleteSession (UNSTABLE, routed via extMethod) ──────────────

  async unstable_deleteSession(params: {
    sessionId: string
  }): Promise<Record<string, never>> {
    // Per session-delete.mdx §Semantics: idempotent — deleting a session
    // that doesn't exist (or was already deleted) MUST succeed silently.
    const resolved = await resolveSessionFilePath(params.sessionId)
    if (resolved) {
      try {
        await unlink(resolved.filePath)
      } catch (err) {
        // ENOENT is fine — file was concurrently removed. Any other error
        // (EACCES, EISDIR, ...) we propagate.
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      }
    }
    // Tear down in-memory session if present (e.g., session was active in
    // another connection). teardownSession is a no-op if not loaded.
    if (this.sessions.has(params.sessionId)) {
      await this.teardownSession(params.sessionId)
    }
    return {}
  }

  // ── extMethod (UNSTABLE method dispatch) ────────────────────────

  async extMethod(
    method: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    // SDK 0.19.0 routes unknown methods here (acp.js:139 default branch).
    // We surface UNSTABLE capabilities that the SDK hasn't typed yet.
    if (method === 'session/delete') {
      const sessionId = params.sessionId
      if (typeof sessionId !== 'string' || sessionId.length === 0) {
        throw new Error('session/delete requires a non-empty sessionId')
      }
      return this.unstable_deleteSession({ sessionId })
    }
    // Unknown method — surface as JSON-RPC methodNotFound so clients see a
    // standard error code (-32601) rather than a generic internal error.
    throw RequestError.methodNotFound(method)
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
    // Per session-modes.mdx: when the Agent changes its own mode it MUST send
    // a current_mode_update notification so mode-only Clients learn the
    // switch. Mirrors the current_mode_update sent by setSessionConfigOption
    // when configId === 'mode'.
    await this.conn.sessionUpdate({
      sessionId: params.sessionId,
      update: {
        sessionUpdate: 'current_mode_update',
        currentModeId: params.modeId,
      },
    })
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

  // ── Private helpers (lightweight, kept with the class) ──────────

  private async sendAvailableCommandsUpdate(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return

    const availableCommands = session.commands
      .filter(
        cmd =>
          cmd.type === 'prompt' && !cmd.isHidden && cmd.userInvocable !== false,
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
}

// ── Prototype-attached methods (declared here for type safety) ────
//
// The following methods are implemented in sibling modules
// (createSessionMethod.ts / sessionLifecycle.ts / promptFlow.ts) and attached
// to AcpAgent.prototype via Object.assign at module load time. They are
// declared on the class via TypeScript declaration merging so `this` is
// typed correctly in the prototype-augmentation modules.
export interface AcpAgent {
  // ── prompt flow (promptFlow.ts) ───────────────────────────────
  prompt(params: PromptRequest): Promise<PromptResponse>
  setSessionConfigOption(
    params: SetSessionConfigOptionRequest,
  ): Promise<SetSessionConfigOptionResponse>

  // ── session lifecycle (sessionLifecycle.ts) ───────────────────
  createSession(
    params: NewSessionRequest,
    opts?: {
      forceNewId?: boolean
      sessionId?: string
      initialMessages?: Message[]
    },
  ): Promise<NewSessionResponse>
  getOrCreateSession(params: {
    sessionId: string
    cwd: string
    mcpServers?: NewSessionRequest['mcpServers']
    _meta?: NewSessionRequest['_meta']
    replay?: boolean
  }): Promise<NewSessionResponse>
  teardownSession(sessionId: string): Promise<void>
  replaySessionHistory(params: {
    sessionId: string
    cwd: string
  }): Promise<void>
  applySessionMode(sessionId: string, modeId: string): void
  updateConfigOption(
    sessionId: string,
    configId: string,
    value: string,
  ): Promise<void>
}

// ── Module-local helpers used only by the class shell ────────────

import { type UUID } from 'node:crypto'
import { deserializeMessages } from '../../../utils/conversationRecovery.js'
import { getLastSessionLog } from '../../../utils/sessionStorage.js'

/**
 * Load the source session's persisted messages for forkSession.
 * Extracted as a module-local helper to keep the fork handler compact.
 */
async function loadForkSourceMessages(
  sessionId: string,
): Promise<{ initialMessages: Message[] | undefined }> {
  let initialMessages: Message[] | undefined
  try {
    const log = await getLastSessionLog(sessionId as UUID)
    if (log && log.messages.length > 0) {
      initialMessages = deserializeMessages(log.messages)
    }
  } catch (err) {
    console.error('[ACP] fork source load failed:', err)
  }
  return { initialMessages }
}
