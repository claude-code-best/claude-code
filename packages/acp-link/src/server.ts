import { spawn, type ChildProcess } from "node:child_process";
import { createServer as createHttpsServer } from "node:https";
import { Writable, Readable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import type { WSContext } from "hono/ws";
import type { WebSocket as RawWebSocket } from "ws";
import { log } from "./logger.js";
import { getOrCreateCertificate, getLanIPs } from "./cert.js";

export interface ServerConfig {
  port: number;
  host: string;
  command: string;
  args: string[];
  cwd: string;
  debug?: boolean;
  token?: string;
  https?: boolean;
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
  // Reference: Zed stores full agentCapabilities from initialize response
  agentCapabilities: AgentCapabilities | null;
  // Reference: Zed stores promptCapabilities from initialize response (convenience accessor)
  promptCapabilities: PromptCapabilities | null;
  // Reference: Zed stores model state from NewSessionResponse.models
  modelState: SessionModelState | null;
  // Heartbeat: tracks whether client responded to the last ping
  isAlive: boolean;
}

// Module-level state (set when server starts)
let AGENT_COMMAND: string;
let AGENT_ARGS: string[];
let AGENT_CWD: string;
let SERVER_PORT: number;
let SERVER_HOST: string;
let AUTH_TOKEN: string | undefined;

const clients = new Map<WSContext, ClientState>();

// Permission request timeout (5 minutes)
const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000;

// Heartbeat interval for WebSocket ping/pong (30 seconds)
const HEARTBEAT_INTERVAL_MS = 30_000;

// Generate unique request ID
function generateRequestId(): string {
  return `perm_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

// Send a message to the WebSocket client
function send(ws: WSContext, type: string, payload?: unknown): void {
  if (ws.readyState === 1) {
    // WebSocket.OPEN
    ws.send(JSON.stringify({ type, payload }));
  }
}

// Create a Client implementation that forwards events to WebSocket
function createClient(ws: WSContext, clientState: ClientState): acp.Client {
  return {
    async requestPermission(params) {
      const requestId = generateRequestId();
      log.debug("Permission requested", { requestId, title: params.toolCall.title });

      // Create a promise that will be resolved when user responds
      const outcomePromise = new Promise<{ outcome: "cancelled" } | { outcome: "selected"; optionId: string }>((resolve) => {
        // Set timeout to auto-cancel if no response
        const timeout = setTimeout(() => {
          log.warn("Permission request timed out", { requestId });
          clientState.pendingPermissions.delete(requestId);
          resolve({ outcome: "cancelled" });
        }, PERMISSION_TIMEOUT_MS);

        // Store the pending request in client's map
        clientState.pendingPermissions.set(requestId, { resolve, timeout });
      });

      // Send permission request to client with our requestId
      send(ws, "permission_request", {
        requestId,
        sessionId: params.sessionId,
        options: params.options,
        toolCall: params.toolCall,
      });

      // Wait for user response
      const outcome = await outcomePromise;
      log.debug("Permission response received", { requestId, outcome });

      return { outcome };
    },

    async sessionUpdate(params) {
      send(ws, "session_update", params);
    },

    async readTextFile(params) {
      log.debug("Read file", { path: params.path });
      // TODO: Forward to extension to read file
      return { content: "" };
    },

    async writeTextFile(params) {
      log.debug("Write file", { path: params.path });
      // TODO: Forward to extension to write file
      return {};
    },
  };
}

// Handle permission response from client
function handlePermissionResponse(ws: WSContext, payload: { requestId: string; outcome: { outcome: "cancelled" } | { outcome: "selected"; optionId: string } }): void {
  const state = clients.get(ws);
  if (!state) {
    log.warn("Permission response from unknown client");
    return;
  }

  const pending = state.pendingPermissions.get(payload.requestId);
  if (!pending) {
    log.warn("Permission response for unknown request", { requestId: payload.requestId });
    return;
  }

  // Clear timeout and resolve the promise
  clearTimeout(pending.timeout);
  state.pendingPermissions.delete(payload.requestId);
  pending.resolve(payload.outcome);
}

// Cancel all pending permissions for a client (called on disconnect)
function cancelPendingPermissions(clientState: ClientState): void {
  for (const [requestId, pending] of clientState.pendingPermissions) {
    log.debug("Cancelling pending permission due to disconnect", { requestId });
    clearTimeout(pending.timeout);
    pending.resolve({ outcome: "cancelled" });
  }
  clientState.pendingPermissions.clear();
}

async function handleConnect(ws: WSContext): Promise<void> {
  const state = clients.get(ws);
  if (!state) return;

  // Kill existing process if any
  if (state.process) {
    // Cancel any pending permission requests from previous connection
    cancelPendingPermissions(state);
    state.process.kill();
    state.process = null;
    state.connection = null;
  }

  try {
    log.info("Spawning agent", { command: AGENT_COMMAND, args: AGENT_ARGS });

    // Spawn the agent process using Node.js child_process
    const agentProcess = spawn(AGENT_COMMAND, AGENT_ARGS, {
      cwd: AGENT_CWD,
      stdio: ["pipe", "pipe", "inherit"],
    });

    state.process = agentProcess;

    // Create streams for ACP SDK
    const input = Writable.toWeb(
      agentProcess.stdin!,
    ) as unknown as WritableStream<Uint8Array>;
    const output = Readable.toWeb(
      agentProcess.stdout!,
    ) as unknown as ReadableStream<Uint8Array>;

    // Create ACP connection
    const stream = acp.ndJsonStream(input, output);
    const connection = new acp.ClientSideConnection(
      (_agent) => createClient(ws, state),
      stream,
    );

    state.connection = connection;

    // Initialize the connection
    const initResult = await connection.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientInfo: {
        name: "zed",
        version: "1.0.0",
      },
      clientCapabilities: {
        fs: {
          readTextFile: true,
          writeTextFile: true,
        },
      },
    });

    // Reference: Zed stores full agentCapabilities from initialize response
    // This includes loadSession, promptCapabilities, sessionCapabilities, etc.
    const agentCaps = initResult.agentCapabilities;
    state.agentCapabilities = agentCaps ? {
      _meta: agentCaps._meta,
      loadSession: agentCaps.loadSession,
      mcpCapabilities: agentCaps.mcpCapabilities,
      promptCapabilities: agentCaps.promptCapabilities,
      sessionCapabilities: agentCaps.sessionCapabilities,
    } : null;
    state.promptCapabilities = agentCaps?.promptCapabilities ?? null;

    log.info("Agent initialized", {
      protocolVersion: initResult.protocolVersion,
      loadSession: state.agentCapabilities?.loadSession,
      sessionList: !!state.agentCapabilities?.sessionCapabilities?.list,
      sessionResume: !!state.agentCapabilities?.sessionCapabilities?.resume,
      promptCapabilities: state.promptCapabilities,
      mcpCapabilities: state.agentCapabilities?.mcpCapabilities,
    });

    send(ws, "status", {
      connected: true,
      agentInfo: initResult.agentInfo,
      capabilities: state.agentCapabilities,
    });

    // Handle connection close
    connection.closed.then(() => {
      log.info("Agent connection closed");
      state.connection = null;
      state.sessionId = null;
      send(ws, "status", { connected: false });
    });
  } catch (error) {
    log.error("Failed to connect", { error: (error as Error).message });
    send(ws, "error", {
      message: `Failed to connect: ${(error as Error).message}`,
    });
  }
}

async function handleNewSession(
  ws: WSContext,
  params: { cwd?: string },
): Promise<void> {
  const state = clients.get(ws);
  if (!state?.connection) {
    send(ws, "error", { message: "Not connected to agent" });
    return;
  }

  try {
    const sessionCwd = params.cwd || AGENT_CWD;
    const result = await state.connection.newSession({
      cwd: sessionCwd,
    });

    state.sessionId = result.sessionId;
    // Reference: Zed stores model state from NewSessionResponse.models
    state.modelState = result.models ?? null;
    log.info("Session created", { sessionId: result.sessionId, cwd: sessionCwd, hasModels: !!result.models });

    // Reference: Include promptCapabilities so client can check image support
    // This matches Zed's behavior of checking prompt_capabilities.image
    // Also include models state for model selection support
    send(ws, "session_created", {
      ...result,
      promptCapabilities: state.promptCapabilities,
      models: state.modelState,
    });
  } catch (error) {
    log.error("Failed to create session", { error: (error as Error).message });
    send(ws, "error", {
      message: `Failed to create session: ${(error as Error).message}`,
    });
  }
}

// ============================================================================
// Session History Operations
// Reference: Zed's AgentConnection trait - list_sessions, load_session, resume_session
// ============================================================================

/**
 * List sessions from the agent.
 * Reference: Zed's AcpSessionList.list_sessions()
 */
async function handleListSessions(
  ws: WSContext,
  params: { cwd?: string; cursor?: string },
): Promise<void> {
  const state = clients.get(ws);
  if (!state?.connection) {
    send(ws, "error", { message: "Not connected to agent" });
    return;
  }

  // Check if agent supports listing sessions
  // Reference: Zed checks agent_capabilities.session_capabilities.list
  if (!state.agentCapabilities?.sessionCapabilities?.list) {
    send(ws, "error", { message: "Listing sessions is not supported by this agent" });
    return;
  }

  try {
    // Note: SDK uses unstable_listSessions until API is finalized
    const result = await state.connection.listSessions({
      cwd: params.cwd,
      cursor: params.cursor,
    });

    log.info("Sessions listed", { count: result.sessions.length, hasMore: !!result.nextCursor });

    // Map SDK's SessionInfo to our AgentSessionInfo
    // Reference: Zed's AgentSessionList.list_sessions maps acp::SessionInfo -> AgentSessionInfo
    send(ws, "session_list", {
      sessions: result.sessions.map((s: acp.SessionInfo) => ({
        _meta: s._meta,
        cwd: s.cwd,  // Required field in SDK's SessionInfo
        sessionId: s.sessionId,
        title: s.title,
        updatedAt: s.updatedAt,
      })),
      nextCursor: result.nextCursor,
      _meta: result._meta,
    });
  } catch (error) {
    log.error("Failed to list sessions", { error: (error as Error).message });
    send(ws, "error", {
      message: `Failed to list sessions: ${(error as Error).message}`,
    });
  }
}

/**
 * Load an existing session with history replay.
 * Reference: Zed's AcpConnection.load_session()
 */
async function handleLoadSession(
  ws: WSContext,
  params: { sessionId: string; cwd?: string },
): Promise<void> {
  const state = clients.get(ws);
  if (!state?.connection) {
    send(ws, "error", { message: "Not connected to agent" });
    return;
  }

  // Check if agent supports loading sessions
  // Reference: Zed checks agent_capabilities.load_session
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
    });

    state.sessionId = sessionId;
    // TODO: Zed also stores result.modes and result.configOptions
    // Reference: acp.rs line 659-665 - config_state(response.modes, response.models, response.config_options)
    state.modelState = result.models ?? null;
    log.info("Session loaded", { sessionId, cwd: sessionCwd });

    send(ws, "session_loaded", {
      sessionId,
      promptCapabilities: state.promptCapabilities,
      models: state.modelState,
    });
  } catch (error) {
    log.error("Failed to load session", { error: (error as Error).message });
    send(ws, "error", {
      message: `Failed to load session: ${(error as Error).message}`,
    });
  }
}

/**
 * Resume an existing session without history replay.
 * Reference: Zed's AcpConnection.resume_session()
 */
async function handleResumeSession(
  ws: WSContext,
  params: { sessionId: string; cwd?: string },
): Promise<void> {
  const state = clients.get(ws);
  if (!state?.connection) {
    send(ws, "error", { message: "Not connected to agent" });
    return;
  }

  // Check if agent supports resuming sessions
  // Reference: Zed checks agent_capabilities.session_capabilities.resume
  if (!state.agentCapabilities?.sessionCapabilities?.resume) {
    send(ws, "error", { message: "Resuming sessions is not supported by this agent" });
    return;
  }

  try {
    const sessionCwd = params.cwd || AGENT_CWD;
    const sessionId = params.sessionId;
    // Note: SDK uses unstable_resumeSession until API is finalized
    const result = await state.connection.unstable_resumeSession({
      sessionId,
      cwd: sessionCwd,
    });

    state.sessionId = sessionId;
    // TODO: Zed also stores result.modes and result.configOptions
    // Reference: acp.rs line 736-742 - config_state(response.modes, response.models, response.config_options)
    state.modelState = result.models ?? null;
    log.info("Session resumed", { sessionId, cwd: sessionCwd });

    send(ws, "session_resumed", {
      sessionId,
      promptCapabilities: state.promptCapabilities,
      models: state.modelState,
    });
  } catch (error) {
    log.error("Failed to resume session", { error: (error as Error).message });
    send(ws, "error", {
      message: `Failed to resume session: ${(error as Error).message}`,
    });
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
    // Log content blocks for debugging
    const firstText = params.content.find(b => b.type === "text")?.text;
    const images = params.content.filter(b => b.type === "image");
    log.debug("Sending prompt", {
      text: firstText?.slice(0, 100),
      imageCount: images.length,
      blockCount: params.content.length,
    });

    // Log image details for debugging
    for (const img of images) {
      log.debug("Image block", {
        mimeType: img.mimeType,
        dataLength: img.data?.length,
        dataSizeKB: img.data ? Math.round(img.data.length * 0.75 / 1024) : 0, // base64 to bytes approx
        dataPrefix: img.data?.slice(0, 50),
      });
    }

    // Forward ContentBlock[] directly to agent (matches Zed's behavior)
    const result = await state.connection.prompt({
      sessionId: state.sessionId,
      prompt: params.content as acp.ContentBlock[],
    });

    log.info("Prompt completed", { stopReason: result.stopReason });
    send(ws, "prompt_complete", result);
  } catch (error) {
    log.error("Prompt failed", { error: (error as Error).message });
    send(ws, "error", {
      message: `Prompt failed: ${(error as Error).message}`,
    });
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

// Handle cancel request from client - matches Zed's cancel() logic
// 1. Cancel any pending permission requests
// 2. Send session/cancel notification to agent via ACP SDK
// The agent should respond to the original prompt with stopReason="cancelled"
async function handleCancel(ws: WSContext): Promise<void> {
  const state = clients.get(ws);
  if (!state?.connection || !state.sessionId) {
    log.warn("Cancel requested but no active session");
    return;
  }

  log.info("Cancel requested", { sessionId: state.sessionId });

  // Cancel any pending permission requests (like Zed does)
  // This ensures permission dialogs are dismissed
  cancelPendingPermissions(state);

  try {
    // Send cancel notification to agent via ACP SDK
    // The agent should:
    // 1. Stop all language model requests
    // 2. Abort all tool call invocations in progress
    // 3. Send any pending session/update notifications
    // 4. Respond to the original session/prompt with stopReason="cancelled"
    await state.connection.cancel({ sessionId: state.sessionId });
    log.debug("Cancel notification sent to agent");
  } catch (error) {
    log.error("Failed to send cancel notification", { error: (error as Error).message });
    // Don't send error to client - the prompt will complete with appropriate status
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
    log.info("Setting session model", { sessionId: state.sessionId, modelId: params.modelId });
    await state.connection.unstable_setSessionModel({
      sessionId: state.sessionId,
      modelId: params.modelId,
    });
    // Update local model state
    state.modelState = {
      ...state.modelState,
      currentModelId: params.modelId,
    };
    send(ws, "model_changed", { modelId: params.modelId });
    log.info("Model changed successfully", { modelId: params.modelId });
  } catch (error) {
    log.error("Failed to set model", { error: (error as Error).message });
    send(ws, "error", {
      message: `Failed to set model: ${(error as Error).message}`,
    });
  }
}

// ContentBlock type matching @agentclientprotocol/sdk
// Reference: Zed's acp::ContentBlock
interface ContentBlock {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
  uri?: string;
  name?: string;
}

interface ProxyMessage {
  type: "connect" | "disconnect" | "new_session" | "prompt" | "cancel" | "set_session_model";
  payload?: { cwd?: string } | { content: ContentBlock[] } | { modelId: string };
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
      // Validate token before upgrade if auth is enabled
      if (AUTH_TOKEN) {
        const url = new URL(c.req.url);
        const providedToken = url.searchParams.get("token");
        if (providedToken !== AUTH_TOKEN) {
          log.warn("WebSocket connection rejected: invalid token");
          // Return empty handlers - connection will be rejected
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
          log.info("Client connected");
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

          // Listen for protocol-level pong frames to track liveness
          const rawWs = ws.raw as RawWebSocket;
          rawWs.on("pong", () => {
            state.isAlive = true;
          });

        },
      async onMessage(event, ws) {
        try {
          const data = JSON.parse(event.data.toString());
          log.debug("Received message", { type: data.type });

          switch (data.type) {
            case "connect":
              await handleConnect(ws);
              break;
            case "disconnect":
              handleDisconnect(ws);
              break;
            case "new_session":
              await handleNewSession(
                ws,
                (data.payload as { cwd?: string }) || {},
              );
              break;
            case "prompt":
              await handlePrompt(ws, data.payload as { content: ContentBlock[] });
              break;
            case "permission_response":
              // Handle user's permission decision
              handlePermissionResponse(ws, data.payload);
              break;
            case "cancel":
              // Handle cancel request - send session/cancel to agent
              await handleCancel(ws);
              break;
            case "set_session_model":
              // Handle model selection request
              await handleSetSessionModel(ws, data.payload as { modelId: string });
              break;
            // Session history operations - Reference: Zed's AgentSessionList
            case "list_sessions":
              await handleListSessions(ws, (data.payload as { cwd?: string; cursor?: string }) || {});
              break;
            case "load_session":
              await handleLoadSession(ws, data.payload as { sessionId: string; cwd?: string });
              break;
            case "resume_session":
              await handleResumeSession(ws, data.payload as { sessionId: string; cwd?: string });
              break;
            case "ping":
              send(ws, "pong");
              break;
            default:
              send(ws, "error", {
                message: `Unknown message type: ${data.type}`,
              });
          }
        } catch (error) {
          log.error("WebSocket message error", { error: (error as Error).message });
          send(ws, "error", { message: `Error: ${(error as Error).message}` });
        }
      },
      onClose(_event, ws) {
        log.info("Client disconnected");
        const state = clients.get(ws);
        if (state) {
          // Cancel any pending permission requests
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

  // Heartbeat: periodically ping all connected clients to keep
  // connections alive through intermediate gateways and detect dead clients.
  setInterval(() => {
    for (const [ws, state] of clients) {
      if (!state.isAlive) {
        log.info("Client heartbeat timeout, terminating connection");
        const rawWs = ws.raw as RawWebSocket;
        rawWs.terminate();
        continue;
      }
      state.isAlive = false;
      (ws.raw as RawWebSocket).ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  // Protocol strings based on HTTPS mode
  const httpProtocol = https ? "https" : "http";
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

  // Manual connection info
  console.log(`  Connection:`);
  if (host === "0.0.0.0") {
    console.log(`    URL:   ${networkWsUrl}`);
  } else {
    console.log(`    URL:   ${localWsUrl}`);
  }
  if (AUTH_TOKEN) {
    console.log(`    Token: ${AUTH_TOKEN}`);
  }
  console.log();

  if (!AUTH_TOKEN) {
    console.log(`  ⚠️  Authentication disabled (--no-auth)`);
    console.log();
  }

  // Agent info
  const agentDisplay = AGENT_ARGS.length > 0
    ? `${AGENT_COMMAND} ${AGENT_ARGS.join(" ")}`
    : AGENT_COMMAND;
  console.log(`  📦 Agent: ${agentDisplay}`);
  console.log(`     CWD:   ${AGENT_CWD}`);
  console.log();
  console.log(`  Press Ctrl+C to stop`);
  console.log();

  // Also log to file when debug is enabled
  log.info("Server started", {
    port,
    host,
    https,
    wsEndpoint: `${wsProtocol}://${displayHost}:${port}/ws`,
    agent: AGENT_COMMAND,
    agentArgs: AGENT_ARGS,
    cwd: AGENT_CWD,
    authEnabled: !!AUTH_TOKEN,
  });

  // Keep the server running
  await new Promise(() => {});
}
