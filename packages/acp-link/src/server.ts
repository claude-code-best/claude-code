import { spawn, type ChildProcess } from "node:child_process";
import { createServer as createHttpsServer } from "node:https";
import { Writable, Readable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import type { WSContext } from "hono/ws";
import type { WebSocket as RawWebSocket } from "ws";
import { createLogger } from "./logger.js";
import { getOrCreateCertificate, getLanIPs } from "./cert.js";
import { RcsUpstreamClient, type RcsUpstreamConfig } from "./rcs-upstream.js";
import {
  decodeJsonWsMessage,
  WsPayloadTooLargeError,
} from "./ws-message.js";
import { authTokensEqual, extractWebSocketAuthToken } from "./ws-auth.js";

export { MAX_CLIENT_WS_PAYLOAD_BYTES } from "./ws-message.js";

export interface ServerConfig {
  port: number;
  host: string;
  command: string;
  args: string[];
  cwd: string;
  debug?: boolean;
  token?: string;
  https?: boolean;
  /** Default permission mode for new sessions (e.g. "auto", "default", "bypassPermissions") */
  permissionMode?: string;
  /** Channel group ID for RCS registration */
  group?: string;
}

// Pending permission request
interface PendingPermission {
  resolve: (outcome: { outcome: "cancelled" } | { outcome: "selected"; optionId: string }) => void;
  timeout: ReturnType<typeof setTimeout>;
}

// PromptCapabilities from ACP protocol
// Reference: Zed's prompt_capabilities to check image support
interface PromptCapabilities {
  audio?: boolean;
  embeddedContext?: boolean;
  image?: boolean;
}

// SessionModelState from ACP protocol
// Reference: Zed's AgentModelSelector reads from state.available_models
interface SessionModelState {
  availableModels: Array<{
    modelId: string;
    name: string;
    description?: string | null;
  }>;
  currentModelId: string;
}

// AgentCapabilities from ACP protocol
// Reference: Zed's AcpConnection.agent_capabilities
// Matches SDK's AgentCapabilities exactly
interface AgentCapabilities {
  _meta?: Record<string, unknown> | null;
  loadSession?: boolean;
  mcpCapabilities?: {
    _meta?: Record<string, unknown> | null;
    clientServers?: boolean;
  };
  promptCapabilities?: PromptCapabilities;
  sessionCapabilities?: {
    _meta?: Record<string, unknown> | null;
    fork?: Record<string, unknown> | null;
    list?: Record<string, unknown> | null;
    resume?: Record<string, unknown> | null;
  };
}

// Track connected clients and their agent connections
interface ClientState {
  process: ChildProcess | null;
  connection: acp.ClientSideConnection | null;
  sessionId: string | null;
  pendingPermissions: Map<string, PendingPermission>;
  agentCapabilities: AgentCapabilities | null;
  promptCapabilities: PromptCapabilities | null;
  modelState: SessionModelState | null;
  isAlive: boolean;
}

// Module-level state (set when server starts)
let AGENT_COMMAND: string;
let AGENT_ARGS: string[];
let AGENT_CWD: string;
let SERVER_PORT: number;
let SERVER_HOST: string;
let AUTH_TOKEN: string | undefined;
let DEFAULT_PERMISSION_MODE: string | undefined;

const clients = new Map<WSContext, ClientState>();

// Module-scoped child loggers
const logWs = createLogger("ws");
const logAgent = createLogger("agent");
const logSession = createLogger("session");
const logPrompt = createLogger("prompt");
const logPerm = createLogger("perm");
const logRelay = createLogger("relay");
const logServer = createLogger("server");

// RCS upstream client (optional — enabled via ACP_RCS_URL env var)
let rcsUpstream: RcsUpstreamClient | null = null;

/**
 * Create a virtual WSContext for RCS relay messages.
 * Responses via send() go to RCS upstream (not a local WS).
 */
function createRelayWs(): WSContext {
  return {
    get readyState() { return 1; }, // always OPEN
    send: () => {}, // no-op — responses go through rcsUpstream.send()
    close: () => {},
    raw: null,
    isInner: false,
    url: "",
    origin: "",
    protocol: "",
  } as unknown as WSContext;
}

// Permission request timeout (5 minutes)
const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000;

// Heartbeat interval for WebSocket ping/pong (30 seconds)
const HEARTBEAT_INTERVAL_MS = 30_000;

// Generate unique request ID
function generateRequestId(): string {
  return `perm_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

// Send a message to the WebSocket client (and optionally forward to RCS upstream)
function send(ws: WSContext, type: string, payload?: unknown): void {
  if (ws.readyState === 1) {
    // WebSocket.OPEN
    ws.send(JSON.stringify({ type, payload }));
  }
  // Forward to RCS upstream if connected
  if (rcsUpstream?.isRegistered()) {
    rcsUpstream.send({ type, payload });
  }
}

// Create a Client implementation that forwards events to WebSocket
function createClient(ws: WSContext, clientState: ClientState): acp.Client {
  return {
    async requestPermission(params) {
      const requestId = generateRequestId();
      logPerm.debug({ requestId, title: params.toolCall.title }, "requested");

      const outcomePromise = new Promise<{ outcome: "cancelled" } | { outcome: "selected"; optionId: string }>((resolve) => {
        const timeout = setTimeout(() => {
          logPerm.warn({ requestId }, "timed out");
          clientState.pendingPermissions.delete(requestId);
          resolve({ outcome: "cancelled" });
        }, PERMISSION_TIMEOUT_MS);

        clientState.pendingPermissions.set(requestId, { resolve, timeout });
      });

      send(ws, "permission_request", {
        requestId,
        sessionId: params.sessionId,
        options: params.options,
        toolCall: params.toolCall,
      });

      const outcome = await outcomePromise;
      logPerm.debug({ requestId, outcome: outcome.outcome }, "resolved");

      return { outcome };
    },

    async sessionUpdate(params) {
      send(ws, "session_update", params);
    },

    async readTextFile(params) {
      logWs.debug({ path: params.path }, "readTextFile");
      return { content: "" };
    },

    async writeTextFile(params) {
      logWs.debug({ path: params.path }, "writeTextFile");
      return {};
    },
  };
}

// Handle permission response from client
function handlePermissionResponse(ws: WSContext, payload: { requestId: string; outcome: { outcome: "cancelled" } | { outcome: "selected"; optionId: string } }): void {
  const state = clients.get(ws);
  if (!state) {
    logPerm.warn("response from unknown client");
    return;
  }

  const pending = state.pendingPermissions.get(payload.requestId);
  if (!pending) {
    logPerm.warn({ requestId: payload.requestId }, "response for unknown request");
    return;
  }

  clearTimeout(pending.timeout);
  state.pendingPermissions.delete(payload.requestId);
  pending.resolve(payload.outcome);
}

// Cancel all pending permissions for a client (called on disconnect)
function cancelPendingPermissions(clientState: ClientState): void {
  for (const [requestId, pending] of clientState.pendingPermissions) {
    logPerm.debug({ requestId }, "cancelled on disconnect");
    clearTimeout(pending.timeout);
    pending.resolve({ outcome: "cancelled" });
  }
  clientState.pendingPermissions.clear();
}

async function handleConnect(ws: WSContext): Promise<void> {
  const state = clients.get(ws);
  if (!state) return;

  // If already connected to a running agent, just resend status
  // This handles frontend reconnections without restarting the agent process
  // Check both .killed and .exitCode to detect crashed processes
  if (state.connection && state.process && !state.process.killed && state.process.exitCode === null) {
    logAgent.info("already connected, resending status");
    send(ws, "status", {
      connected: true,
      agentInfo: { name: AGENT_COMMAND },
      capabilities: state.agentCapabilities,
    });
    return;
  }

  // Kill existing process if any (only if not healthy)
  if (state.process) {
    cancelPendingPermissions(state);
    state.process.kill();
    state.process = null;
    state.connection = null;
  }

  try {
    logAgent.info({ command: AGENT_COMMAND, args: AGENT_ARGS }, "spawning");

    const agentProcess = spawn(AGENT_COMMAND, AGENT_ARGS, {
      cwd: AGENT_CWD,
      stdio: ["pipe", "pipe", "inherit"],
      env: buildAgentEnv(),
    });

    state.process = agentProcess;

    // Clean up state when agent process exits unexpectedly
    agentProcess.on("exit", (code) => {
      logAgent.info({ exitCode: code }, "agent process exited");
      // Only clear if this is still the current process
      if (state.process === agentProcess) {
        state.process = null;
        state.connection = null;
        state.sessionId = null;
      }
    });

    const input = Writable.toWeb(agentProcess.stdin!) as unknown as WritableStream<Uint8Array>;
    const output = Readable.toWeb(agentProcess.stdout!) as unknown as ReadableStream<Uint8Array>;

    const stream = acp.ndJsonStream(input, output);
    const connection = new acp.ClientSideConnection(
      (_agent) => createClient(ws, state),
      stream,
    );

    state.connection = connection;

    const initResult = await connection.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientInfo: { name: "zed", version: "1.0.0" },
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
      },
    });

    const agentCaps = initResult.agentCapabilities;
    state.agentCapabilities = agentCaps ? {
      _meta: agentCaps._meta,
      loadSession: agentCaps.loadSession,
      mcpCapabilities: agentCaps.mcpCapabilities,
      promptCapabilities: agentCaps.promptCapabilities,
      sessionCapabilities: agentCaps.sessionCapabilities,
    } : null;
    state.promptCapabilities = agentCaps?.promptCapabilities ?? null;

    logAgent.info({
      protocolVersion: initResult.protocolVersion,
      loadSession: !!state.agentCapabilities?.loadSession,
      sessionList: !!state.agentCapabilities?.sessionCapabilities?.list,
      sessionResume: !!state.agentCapabilities?.sessionCapabilities?.resume,
      hasMcp: !!state.agentCapabilities?.mcpCapabilities,
    }, "initialized");

    send(ws, "status", {
      connected: true,
      agentInfo: initResult.agentInfo,
      capabilities: state.agentCapabilities,
    });

    connection.closed.then(() => {
      logAgent.info("connection closed");
      state.connection = null;
      state.sessionId = null;
      send(ws, "status", { connected: false });
    });
  } catch (error) {
    logAgent.error({ error: (error as Error).message }, "connect failed");
    send(ws, "error", { message: `Failed to connect: ${(error as Error).message}` });
  }
}

async function handleNewSession(
  ws: WSContext,
  params: { cwd?: string; permissionMode?: string },
): Promise<void> {
  const state = clients.get(ws);
  if (!state?.connection) {
    logAgent.warn({ hasState: !!state, hasProcess: !!state?.process, processKilled: state?.process?.killed, exitCode: state?.process?.exitCode }, "handleNewSession: not connected to agent");
    send(ws, "error", { message: "Not connected to agent" });
    return;
  }

  try {
    const sessionCwd = params.cwd || AGENT_CWD;
    let permissionMode: string | undefined;
    try {
      permissionMode = resolveNewSessionPermissionMode(
        params.permissionMode,
        DEFAULT_PERMISSION_MODE,
      );
    } catch (error) {
      send(ws, "error", { message: (error as Error).message });
      return;
    }
    const result = await state.connection.newSession({
      cwd: sessionCwd,
      mcpServers: [],
      ...(permissionMode ? { _meta: { permissionMode } } : {}),
    });

    state.sessionId = result.sessionId;
    state.modelState = result.models ?? null;
    logSession.info({ sessionId: result.sessionId, cwd: sessionCwd, hasModels: !!result.models }, "created");

    send(ws, "session_created", {
      ...result,
      promptCapabilities: state.promptCapabilities,
      models: state.modelState,
    });
  } catch (error) {
    logSession.error({ error: (error as Error).message }, "create failed");
    send(ws, "error", { message: `Failed to create session: ${(error as Error).message}` });
  }
}

// ============================================================================
// Session History Operations
// Reference: Zed's AgentConnection trait - list_sessions, load_session, resume_session
// ============================================================================

async function handleListSessions(
  ws: WSContext,
  params: { cwd?: string; cursor?: string },
): Promise<void> {
  const state = clients.get(ws);
  if (!state?.connection) {
    logAgent.warn({ hasState: !!state, hasProcess: !!state?.process, processKilled: state?.process?.killed, exitCode: state?.process?.exitCode }, "handleListSessions: not connected to agent");
    send(ws, "error", { message: "Not connected to agent" });
    return;
  }

  if (!state.agentCapabilities?.sessionCapabilities?.list) {
    send(ws, "error", { message: "Listing sessions is not supported by this agent" });
    return;
  }

  try {
    const result = await state.connection.listSessions({
      cwd: params.cwd,
      cursor: params.cursor,
    });

    const MAX_SESSIONS = 20;
    const sessions = result.sessions.slice(0, MAX_SESSIONS);
    logSession.info({ total: result.sessions.length, returned: sessions.length, hasMore: !!result.nextCursor }, "listed");

    send(ws, "session_list", {
      sessions: sessions.map((s: acp.SessionInfo) => ({
        _meta: s._meta,
        cwd: s.cwd,
        sessionId: s.sessionId,
        title: s.title,
        updatedAt: s.updatedAt,
      })),
      nextCursor: result.nextCursor,
      _meta: result._meta,
    });
  } catch (error) {
    logSession.error({ error: (error as Error).message }, "list failed");
    send(ws, "error", { message: `Failed to list sessions: ${(error as Error).message}` });
  }
}

async function handleLoadSession(
  ws: WSContext,
  params: { sessionId: string; cwd?: string },
): Promise<void> {
  const state = clients.get(ws);
  if (!state?.connection) {
    logAgent.warn({ hasState: !!state, hasProcess: !!state?.process, processKilled: state?.process?.killed, exitCode: state?.process?.exitCode }, "handleLoadSession: not connected to agent");
    send(ws, "error", { message: "Not connected to agent" });
    return;
  }

  if (!state.agentCapabilities?.loadSession) {
    send(ws, "error", { message: "Loading sessions is not supported by this agent" });
    return;
  }

  try {
    const sessionCwd = params.cwd || AGENT_CWD;
    const sessionId = params.sessionId;
    const result = await state.connection.loadSession({
      sessionId,
      cwd: sessionCwd,
      mcpServers: [],
    });

    state.sessionId = sessionId;
    state.modelState = result.models ?? null;
    logSession.info({ sessionId, cwd: sessionCwd }, "loaded");

    send(ws, "session_loaded", {
      sessionId,
      promptCapabilities: state.promptCapabilities,
      models: state.modelState,
    });
  } catch (error) {
    logSession.error({ error: (error as Error).message }, "load failed");
    send(ws, "error", { message: `Failed to load session: ${(error as Error).message}` });
  }
}

async function handleResumeSession(
  ws: WSContext,
  params: { sessionId: string; cwd?: string },
): Promise<void> {
  const state = clients.get(ws);
  if (!state?.connection) {
    logAgent.warn({ hasState: !!state, hasProcess: !!state?.process, processKilled: state?.process?.killed, exitCode: state?.process?.exitCode }, "handleResumeSession: not connected to agent");
    send(ws, "error", { message: "Not connected to agent" });
    return;
  }

  if (!state.agentCapabilities?.sessionCapabilities?.resume) {
    send(ws, "error", { message: "Resuming sessions is not supported by this agent" });
    return;
  }

  try {
    const sessionCwd = params.cwd || AGENT_CWD;
    const sessionId = params.sessionId;
    const result = await state.connection.unstable_resumeSession({
      sessionId,
      cwd: sessionCwd,
    });

    state.sessionId = sessionId;
    state.modelState = result.models ?? null;
    logSession.info({ sessionId, cwd: sessionCwd }, "resumed");

    send(ws, "session_resumed", {
      sessionId,
      promptCapabilities: state.promptCapabilities,
      models: state.modelState,
    });
  } catch (error) {
    logSession.error({ error: (error as Error).message }, "resume failed");
    send(ws, "error", { message: `Failed to resume session: ${(error as Error).message}` });
  }
}

// Reference: Zed's AcpThread.send() forwards Vec<acp::ContentBlock> to agent
async function handlePrompt(
  ws: WSContext,
  params: { content: ContentBlock[] },
): Promise<void> {
  const state = clients.get(ws);
  if (!state?.connection || !state.sessionId) {
    send(ws, "error", { message: "No active session" });
    return;
  }

  try {
    const firstText = params.content.find(b => b.type === "text")?.text;
    const images = params.content.filter(b => b.type === "image");
    logPrompt.debug({
      text: firstText?.slice(0, 100),
      imageCount: images.length,
      blockCount: params.content.length,
    }, "sending");

    const result = await state.connection.prompt({
      sessionId: state.sessionId,
      prompt: params.content as acp.ContentBlock[],
    });

    logPrompt.info({ stopReason: result.stopReason }, "completed");
    send(ws, "prompt_complete", result);
  } catch (error) {
    logPrompt.error({ error: (error as Error).message }, "failed");
    send(ws, "error", { message: `Prompt failed: ${(error as Error).message}` });
  }
}

function handleDisconnect(ws: WSContext): void {
  const state = clients.get(ws);
  if (!state) return;

  if (state.process) {
    state.process.kill();
    state.process = null;
  }
  state.connection = null;
  state.sessionId = null;

  send(ws, "status", { connected: false });
}

// Handle cancel request from client
async function handleCancel(ws: WSContext): Promise<void> {
  const state = clients.get(ws);
  if (!state?.connection || !state.sessionId) {
    logWs.warn("cancel requested but no active session");
    return;
  }

  logSession.info({ sessionId: state.sessionId }, "cancel requested");
  cancelPendingPermissions(state);

  try {
    await state.connection.cancel({ sessionId: state.sessionId });
    logSession.info({ sessionId: state.sessionId }, "cancel sent");
  } catch (error) {
    logSession.error({ error: (error as Error).message }, "cancel failed");
  }
}

// Reference: Zed's AgentModelSelector.select_model() calls connection.set_session_model()
async function handleSetSessionModel(
  ws: WSContext,
  params: { modelId: string },
): Promise<void> {
  const state = clients.get(ws);
  if (!state?.connection || !state.sessionId) {
    send(ws, "error", { message: "No active session" });
    return;
  }

  if (!state.modelState) {
    send(ws, "error", { message: "Model selection not supported by this agent" });
    return;
  }

  try {
    logSession.info({ sessionId: state.sessionId, modelId: params.modelId }, "setting model");
    await state.connection.unstable_setSessionModel({
      sessionId: state.sessionId,
      modelId: params.modelId,
    });
    state.modelState = { ...state.modelState, currentModelId: params.modelId };
    send(ws, "model_changed", { modelId: params.modelId });
    logSession.info({ modelId: params.modelId }, "model changed");
  } catch (error) {
    logSession.error({ error: (error as Error).message }, "set model failed");
    send(ws, "error", { message: `Failed to set model: ${(error as Error).message}` });
  }
}

// ContentBlock type matching @agentclientprotocol/sdk
interface ContentBlock {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
  uri?: string;
  name?: string;
}

type PermissionResponsePayload = {
  requestId: string;
  outcome: { outcome: "cancelled" } | { outcome: "selected"; optionId: string };
};

type ProxyMessage =
  | { type: "connect" }
  | { type: "disconnect" }
  | { type: "new_session"; payload: { cwd?: string; permissionMode?: string } }
  | { type: "prompt"; payload: { content: ContentBlock[] } }
  | { type: "permission_response"; payload: PermissionResponsePayload }
  | { type: "cancel" }
  | { type: "set_session_model"; payload: { modelId: string } }
  | { type: "list_sessions"; payload: { cwd?: string; cursor?: string } }
  | { type: "load_session"; payload: { sessionId: string; cwd?: string } }
  | { type: "resume_session"; payload: { sessionId: string; cwd?: string } }
  | { type: "ping" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalStringField(
  payload: Record<string, unknown>,
  key: string,
  source: string,
): string | undefined {
  if (!Object.hasOwn(payload, key)) return undefined;
  const value = payload[key];
  if (typeof value === "string") return value;
  throw new Error(`Invalid ${source}: expected a string`);
}

function payloadRecord(value: unknown, type: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Invalid ${type} payload`);
  }
  return value;
}

function optionalPayloadRecord(value: unknown, type: string): Record<string, unknown> {
  if (value === undefined) return {};
  return payloadRecord(value, type);
}

function optionalRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function decodeContentBlocks(value: unknown): ContentBlock[] {
  if (
    !Array.isArray(value) ||
    !value.every(block => isRecord(block) && typeof block.type === "string")
  ) {
    throw new Error("Invalid prompt payload");
  }
  return value as ContentBlock[];
}

function decodePermissionResponsePayload(value: unknown): PermissionResponsePayload {
  const payload = payloadRecord(value, "permission_response");
  if (typeof payload.requestId !== "string" || !isRecord(payload.outcome)) {
    throw new Error("Invalid permission_response payload");
  }
  if (payload.outcome.outcome === "cancelled") {
    return { requestId: payload.requestId, outcome: { outcome: "cancelled" } };
  }
  if (
    payload.outcome.outcome === "selected" &&
    typeof payload.outcome.optionId === "string"
  ) {
    return {
      requestId: payload.requestId,
      outcome: { outcome: "selected", optionId: payload.outcome.optionId },
    };
  }
  throw new Error("Invalid permission_response payload");
}

function decodeClientMessage(message: Record<string, unknown>): ProxyMessage {
  if (typeof message.type !== "string") {
    throw new Error("Invalid WebSocket message payload");
  }

  switch (message.type) {
    case "connect":
    case "disconnect":
    case "cancel":
    case "ping":
      return { type: message.type };
    case "new_session": {
      const payload = optionalPayloadRecord(message.payload, "new_session");
      return {
        type: "new_session",
        payload: {
          cwd: optionalStringField(payload, "cwd", "new_session.cwd"),
          permissionMode: optionalStringField(
            payload,
            "permissionMode",
            "new_session.permissionMode",
          ),
        },
      };
    }
    case "prompt": {
      const payload = payloadRecord(message.payload, "prompt");
      return {
        type: "prompt",
        payload: { content: decodeContentBlocks(payload.content) },
      };
    }
    case "permission_response":
      return {
        type: "permission_response",
        payload: decodePermissionResponsePayload(message.payload),
      };
    case "set_session_model": {
      const payload = payloadRecord(message.payload, "set_session_model");
      if (typeof payload.modelId !== "string") {
        throw new Error("Invalid set_session_model payload");
      }
      return { type: "set_session_model", payload: { modelId: payload.modelId } };
    }
    case "list_sessions": {
      const payload = optionalRecord(message.payload);
      return {
        type: "list_sessions",
        payload: {
          cwd: optionalString(payload.cwd),
          cursor: optionalString(payload.cursor),
        },
      };
    }
    case "load_session":
    case "resume_session": {
      const payload = payloadRecord(message.payload, message.type);
      if (typeof payload.sessionId !== "string") {
        throw new Error(`Invalid ${message.type} payload`);
      }
      return {
        type: message.type,
        payload: {
          sessionId: payload.sessionId,
          cwd: optionalString(payload.cwd),
        },
      };
    }
    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}

export function decodeClientWsMessage(data: unknown): ProxyMessage {
  return decodeClientMessage(decodeJsonWsMessage(data));
}

async function dispatchClientMessage(ws: WSContext, data: ProxyMessage): Promise<void> {
  switch (data.type) {
    case "connect":
      await handleConnect(ws);
      break;
    case "disconnect":
      handleDisconnect(ws);
      break;
    case "new_session":
      await handleNewSession(ws, data.payload);
      break;
    case "prompt":
      await handlePrompt(ws, data.payload);
      break;
    case "permission_response":
      handlePermissionResponse(ws, data.payload);
      break;
    case "cancel":
      await handleCancel(ws);
      break;
    case "set_session_model":
      await handleSetSessionModel(ws, data.payload);
      break;
    case "list_sessions":
      await handleListSessions(ws, data.payload);
      break;
    case "load_session":
      await handleLoadSession(ws, data.payload);
      break;
    case "resume_session":
      await handleResumeSession(ws, data.payload);
      break;
    case "ping":
      send(ws, "pong");
      break;
  }
}

export const __testing = {
  dispatchClientMessage(
    ws: WSContext,
    data: unknown,
  ): Promise<void> {
    assertTestingInternalsEnabled();
    return dispatchClientMessage(ws, data as ProxyMessage);
  },
  registerClient(
    ws: WSContext,
    state: {
      connection?: unknown;
      process?: ChildProcess | null;
      sessionId?: string | null;
    },
  ): () => void {
    assertTestingInternalsEnabled();
    clients.set(ws, {
      process: state.process ?? null,
      connection: (state.connection ?? null) as acp.ClientSideConnection | null,
      sessionId: state.sessionId ?? null,
      pendingPermissions: new Map(),
      agentCapabilities: null,
      promptCapabilities: null,
      modelState: null,
      isAlive: true,
    });
    return () => {
      clients.delete(ws);
    };
  },
  getClientSessionId(ws: WSContext): string | null | undefined {
    assertTestingInternalsEnabled();
    return clients.get(ws)?.sessionId;
  },
  setDefaultPermissionMode(mode: string | undefined): () => void {
    assertTestingInternalsEnabled();
    const previous = DEFAULT_PERMISSION_MODE;
    DEFAULT_PERMISSION_MODE = mode;
    return () => {
      DEFAULT_PERMISSION_MODE = previous;
    };
  },
};

function assertTestingInternalsEnabled(): void {
  if (process.env.ACP_LINK_TEST_INTERNALS === "1") {
    return;
  }

  throw new Error(
    "acp-link test internals are disabled outside test execution.",
  );
}

const ACP_LINK_PERMISSION_MODE_ALIASES = {
  auto: "auto",
  default: "default",
  acceptedits: "acceptEdits",
  dontask: "dontAsk",
  plan: "plan",
  bypasspermissions: "bypassPermissions",
  bypass: "bypassPermissions",
} as const;

type AcpLinkPermissionMode =
  (typeof ACP_LINK_PERMISSION_MODE_ALIASES)[keyof typeof ACP_LINK_PERMISSION_MODE_ALIASES];

export function resolveNewSessionPermissionMode(
  requestedMode: string | undefined,
  defaultMode: string | undefined,
): string | undefined {
  const requested = resolveAcpLinkPermissionMode(requestedMode);
  const localDefault = resolveAcpLinkPermissionMode(defaultMode);

  if (!requested) {
    return localDefault;
  }

  if (requested !== "bypassPermissions") {
    return requested;
  }

  if (localDefault === "bypassPermissions") {
    return "bypassPermissions";
  }

  throw new Error(
    "bypassPermissions requires local ACP_PERMISSION_MODE=bypassPermissions before a client can request it.",
  );
}

function resolveAcpLinkPermissionMode(
  mode: string | undefined,
): AcpLinkPermissionMode | undefined {
  if (mode === undefined) return undefined;

  const normalized = mode?.trim().toLowerCase();
  if (!normalized) {
    throw new Error("Invalid permissionMode: expected a non-empty string.");
  }

  const resolved =
    ACP_LINK_PERMISSION_MODE_ALIASES[
      normalized as keyof typeof ACP_LINK_PERMISSION_MODE_ALIASES
    ];
  if (!resolved) {
    throw new Error(`Invalid permissionMode: ${mode}.`);
  }

  return resolved;
}

function buildAgentEnv(): NodeJS.ProcessEnv {
  if (!DEFAULT_PERMISSION_MODE) {
    return process.env;
  }

  return {
    ...process.env,
    ACP_PERMISSION_MODE: DEFAULT_PERMISSION_MODE,
  };
}

export async function startServer(config: ServerConfig): Promise<void> {
  const { port, host, command, args, cwd, token, https } = config;

  // Set module-level config
  AGENT_COMMAND = command;
  AGENT_ARGS = args;
  AGENT_CWD = cwd;
  SERVER_PORT = port;
  SERVER_HOST = host;
  AUTH_TOKEN = token;
  DEFAULT_PERMISSION_MODE = config.permissionMode || process.env.ACP_PERMISSION_MODE;

  // Initialize RCS upstream client if configured
  const rcsUrl = process.env.ACP_RCS_URL;
  const rcsToken = process.env.ACP_RCS_TOKEN;
  const rcsGroup = config.group || process.env.ACP_RCS_GROUP;
  if (rcsGroup && !/^[a-zA-Z0-9_-]+$/.test(rcsGroup)) {
    throw new Error(`Invalid ACP_RCS_GROUP "${rcsGroup}": only letters, digits, hyphens, and underscores are allowed`);
  }
  if (rcsUrl) {
    rcsUpstream = new RcsUpstreamClient({
      rcsUrl,
      apiToken: rcsToken || "",
      agentName: command,
      channelGroupId: rcsGroup || undefined,
      maxSessions: 1,
    });

    const relayWs = createRelayWs();
    const relayState: ClientState = {
      process: null,
      connection: null,
      sessionId: null,
      pendingPermissions: new Map(),
      agentCapabilities: null,
      promptCapabilities: null,
      modelState: null,
      isAlive: true,
    };
    clients.set(relayWs, relayState);

    rcsUpstream.setMessageHandler(async (msg) => {
      try {
        const data = decodeClientMessage(msg);
        logRelay.debug({ type: data.type }, "processing");
        await dispatchClientMessage(relayWs, data);
      } catch (error) {
        logRelay.error({ error: (error as Error).message }, "handler error");
      }
    });

    rcsUpstream.connect().catch((err) => {
      logRelay.warn({ error: (err as Error).message }, "initial connection failed");
    });
    logRelay.info({ url: rcsUrl }, "upstream enabled");
  }

  const app = new Hono();
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

  // Health check endpoint
  app.get("/health", (c) => {
    return c.json({ status: "ok" });
  });

  // WebSocket endpoint with token validation
  app.get(
    "/ws",
    upgradeWebSocket((c) => {
      if (AUTH_TOKEN) {
        const providedToken = extractWebSocketAuthToken({
          authorization: c.req.header("Authorization"),
          protocol: c.req.header("Sec-WebSocket-Protocol"),
        });
        if (!authTokensEqual(providedToken, AUTH_TOKEN)) {
          logWs.warn("connection rejected: invalid token");
          return {
            onOpen(_event, ws) {
              ws.close(4001, "Unauthorized: Invalid token");
            },
            onMessage() {},
            onClose() {},
          };
        }
      }

      return {
        onOpen(_event, ws) {
          logWs.info("client connected");
          const state: ClientState = {
            process: null,
            connection: null,
            sessionId: null,
            pendingPermissions: new Map(),
            agentCapabilities: null,
            promptCapabilities: null,
            modelState: null,
            isAlive: true,
          };
          clients.set(ws, state);

          const rawWs = ws.raw as RawWebSocket;
          rawWs.on("pong", () => {
            state.isAlive = true;
          });
        },
        async onMessage(event, ws) {
          try {
            const data = decodeClientWsMessage(event.data);
            logWs.debug({ type: data.type }, "received");
            await dispatchClientMessage(ws, data);
          } catch (error) {
            if (error instanceof WsPayloadTooLargeError) {
              logWs.warn({ error: error.message }, "message too large");
              ws.close(1009, "message too large");
              return;
            }
            logWs.error({ error: (error as Error).message }, "message error");
            send(ws, "error", { message: `Error: ${(error as Error).message}` });
          }
        },
        onClose(_event, ws) {
          logWs.info("client disconnected");
          const state = clients.get(ws);
          if (state) {
            cancelPendingPermissions(state);
          }
          handleDisconnect(ws);
          clients.delete(ws);
        },
      };
    }),
  );

  // Create server with optional HTTPS
  let server;
  if (https) {
    const tlsOptions = await getOrCreateCertificate();
    server = serve({
      fetch: app.fetch,
      port,
      hostname: host,
      createServer: createHttpsServer,
      serverOptions: tlsOptions,
    });
  } else {
    server = serve({ fetch: app.fetch, port, hostname: host });
  }
  injectWebSocket(server);

  // Heartbeat: periodically ping all connected clients
  setInterval(() => {
    for (const [ws, state] of clients) {
      // Skip virtual relay connections (no raw socket, always alive)
      if (!ws.raw && state.isAlive) continue;
      if (!ws.raw) {
        // Connection already closed, clean up
        clients.delete(ws);
        continue;
      }
      if (!state.isAlive) {
        logWs.info("heartbeat timeout, terminating");
        (ws.raw as RawWebSocket).terminate();
        continue;
      }
      state.isAlive = false;
      (ws.raw as RawWebSocket).ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  // Protocol strings based on HTTPS mode
  const wsProtocol = https ? "wss" : "ws";

  // Get actual LAN IP when binding to 0.0.0.0
  let displayHost = host;
  if (host === "0.0.0.0") {
    const lanIPs = getLanIPs();
    displayHost = lanIPs[0] || "localhost";
  }

  // Build URLs
  const localWsUrl = `${wsProtocol}://localhost:${port}/ws`;
  const networkWsUrl = `${wsProtocol}://${displayHost}:${port}/ws`;

  // Print startup banner
  console.log();
  console.log(`  🚀 ACP Proxy Server${https ? " (HTTPS)" : ""}`);
  console.log();
  console.log(`  Connection:`);
  if (host === "0.0.0.0") {
    console.log(`    URL:   ${networkWsUrl}`);
  } else {
    console.log(`    URL:   ${localWsUrl}`);
  }
  if (AUTH_TOKEN) {
    console.log(`    Token: configured`);
  }
  console.log();
  if (!AUTH_TOKEN) {
    console.log(`  ⚠️  Authentication disabled (--no-auth)`);
    console.log();
  }

  const agentDisplay = AGENT_ARGS.length > 0
    ? `${AGENT_COMMAND} ${AGENT_ARGS.join(" ")}`
    : AGENT_COMMAND;
  console.log(`  📦 Agent: ${agentDisplay}`);
  console.log(`     CWD:   ${AGENT_CWD}`);
  console.log();
  console.log(`  Press Ctrl+C to stop`);
  console.log();

  logServer.info({
    port,
    host,
    https,
    wsEndpoint: `${wsProtocol}://${displayHost}:${port}/ws`,
    agent: AGENT_COMMAND,
    agentArgs: AGENT_ARGS,
    cwd: AGENT_CWD,
    authEnabled: !!AUTH_TOKEN,
  }, "started");

  // Graceful shutdown — close RCS upstream
  const shutdown = async () => {
    if (rcsUpstream) {
      await rcsUpstream.close();
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep the server running
  await new Promise(() => {});
}
