import { createServer as createHttpsServer } from 'node:https'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import type { WebSocket as RawWebSocket } from 'ws'
import { getOrCreateCertificate, getLanIPs } from '../cert.js'
import { RcsUpstreamClient } from '../rcs-upstream.js'
import {
  WsPayloadTooLargeError,
  decodeJsonWsMessage,
  isJsonRpc2Message,
} from '../ws-message.js'
import { authTokensEqual, extractWebSocketAuthToken } from '../ws-auth.js'
import { cancelPendingPermissions } from './acp-client.js'
import { sendJsonRpcError } from './client-send.js'
import { dispatchClientMessage, dispatchJsonRpcMessage } from './dispatch.js'
import { handleDisconnect } from './handlers-agent.js'
import { decodeClientMessage } from './payload-decode.js'
import {
  HEARTBEAT_INTERVAL_MS,
  clients,
  createRelayWs,
  getAuthToken,
  getRcsUpstream,
  logRelay,
  logServer,
  logWs,
  setRcsUpstream,
  setServerConfig,
} from './runtime-state.js'
import {
  JSONRPC_PARSE_ERROR,
  createClientState,
  type ServerConfig,
} from './types.js'

export async function startServer(config: ServerConfig): Promise<void> {
  const { port, host, command, args, cwd, token, https } = config

  // Set module-level config
  setServerConfig({
    command,
    args,
    cwd,
    port,
    host,
    token,
    permissionMode: config.permissionMode || process.env.ACP_PERMISSION_MODE,
  })

  // Initialize RCS upstream client if configured
  const rcsUrl = process.env.ACP_RCS_URL
  const rcsToken = process.env.ACP_RCS_TOKEN
  const rcsGroup = config.group || process.env.ACP_RCS_GROUP
  if (rcsGroup && !/^[a-zA-Z0-9_-]+$/.test(rcsGroup)) {
    throw new Error(
      `Invalid ACP_RCS_GROUP "${rcsGroup}": only letters, digits, hyphens, and underscores are allowed`,
    )
  }
  let rcsUpstream = null
  if (rcsUrl) {
    rcsUpstream = new RcsUpstreamClient({
      rcsUrl,
      apiToken: rcsToken || '',
      agentName: command,
      channelGroupId: rcsGroup || undefined,
      maxSessions: 1,
    })

    const relayWs = createRelayWs()
    const relayState = createClientState()
    clients.set(relayWs, relayState)

    rcsUpstream.setMessageHandler(async msg => {
      try {
        // The RCS relay forwards messages from the Web UI. Accept both
        // JSON-RPC 2.0 (audit §8.12) and the legacy `{type, payload}` envelope.
        if (isJsonRpc2Message(msg)) {
          logRelay.debug({ method: msg.method }, 'processing jsonrpc')
          await dispatchJsonRpcMessage(relayWs, msg)
        } else {
          const data = decodeClientMessage(msg)
          logRelay.debug({ type: data.type }, 'processing')
          await dispatchClientMessage(relayWs, data)
        }
      } catch (error) {
        logRelay.error({ error: (error as Error).message }, 'handler error')
      }
    })

    rcsUpstream.connect().catch(err => {
      logRelay.warn(
        { error: (err as Error).message },
        'initial connection failed',
      )
    })
    logRelay.info({ url: rcsUrl }, 'upstream enabled')
  }
  // Publish rcsUpstream back to runtime-state so send() can forward.
  setRcsUpstream(rcsUpstream)

  const app = new Hono()
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

  // Health check endpoint
  app.get('/health', c => {
    return c.json({ status: 'ok' })
  })

  // WebSocket endpoint with token validation
  app.get(
    '/ws',
    upgradeWebSocket(c => {
      const AUTH_TOKEN = getAuthToken()
      if (AUTH_TOKEN) {
        const providedToken = extractWebSocketAuthToken({
          authorization: c.req.header('Authorization'),
          protocol: c.req.header('Sec-WebSocket-Protocol'),
        })
        if (!authTokensEqual(providedToken, AUTH_TOKEN)) {
          logWs.warn('connection rejected: invalid token')
          return {
            onOpen(_event, ws) {
              ws.close(4001, 'Unauthorized: Invalid token')
            },
            onMessage() {},
            onClose() {},
          }
        }
      }

      return {
        onOpen(_event, ws) {
          logWs.info('client connected')
          const state = createClientState()
          clients.set(ws, state)

          const rawWs = ws.raw as RawWebSocket
          rawWs.on('pong', () => {
            state.isAlive = true
          })
        },
        async onMessage(event, ws) {
          try {
            // Decode the raw frame once. JSON-RPC 2.0 messages are routed by
            // method name (audit §8.1, §8.4, §8.5); legacy `{type, payload}`
            // messages keep the existing dispatch path for backwards compat.
            const decoded = decodeJsonWsMessage(event.data)
            if (isJsonRpc2Message(decoded)) {
              logWs.debug({ method: decoded.method }, 'received jsonrpc')
              await dispatchJsonRpcMessage(ws, decoded)
            } else {
              const data = decodeClientMessage(decoded)
              logWs.debug({ type: data.type }, 'received')
              await dispatchClientMessage(ws, data)
            }
          } catch (error) {
            if (error instanceof WsPayloadTooLargeError) {
              logWs.warn({ error: error.message }, 'message too large')
              ws.close(1009, 'message too large')
              return
            }
            logWs.error({ error: (error as Error).message }, 'message error')
            const state = clients.get(ws)
            sendJsonRpcError(
              ws,
              state,
              state?.pendingJsonRpc?.id ?? null,
              JSONRPC_PARSE_ERROR,
              `Error: ${(error as Error).message}`,
            )
          }
        },
        onClose(_event, ws) {
          logWs.info('client disconnected')
          const state = clients.get(ws)
          if (state) {
            cancelPendingPermissions(state)
          }
          handleDisconnect(ws)
          clients.delete(ws)
        },
      }
    }),
  )

  // Create server with optional HTTPS
  let server
  if (https) {
    const tlsOptions = await getOrCreateCertificate()
    server = serve({
      fetch: app.fetch,
      port,
      hostname: host,
      createServer: createHttpsServer,
      serverOptions: tlsOptions,
    })
  } else {
    server = serve({ fetch: app.fetch, port, hostname: host })
  }
  injectWebSocket(server)

  // Heartbeat: periodically ping all connected clients
  setInterval(() => {
    for (const [ws, state] of clients) {
      // Skip virtual relay connections (no raw socket, always alive)
      if (!ws.raw && state.isAlive) continue
      if (!ws.raw) {
        // Connection already closed, clean up
        clients.delete(ws)
        continue
      }
      if (!state.isAlive) {
        logWs.info('heartbeat timeout, terminating')
        ;(ws.raw as RawWebSocket).terminate()
        continue
      }
      state.isAlive = false
      ;(ws.raw as RawWebSocket).ping()
    }
  }, HEARTBEAT_INTERVAL_MS)

  // Protocol strings based on HTTPS mode
  const wsProtocol = https ? 'wss' : 'ws'

  // Get actual LAN IP when binding to 0.0.0.0
  let displayHost = host
  if (host === '0.0.0.0') {
    const lanIPs = getLanIPs()
    displayHost = lanIPs[0] || 'localhost'
  }

  // Build URLs
  const localWsUrl = `${wsProtocol}://localhost:${port}/ws`
  const networkWsUrl = `${wsProtocol}://${displayHost}:${port}/ws`

  // Print startup banner
  console.log()
  console.log(`  🚀 ACP Proxy Server${https ? ' (HTTPS)' : ''}`)
  console.log()
  console.log(`  Connection:`)
  if (host === '0.0.0.0') {
    console.log(`    URL:   ${networkWsUrl}`)
  } else {
    console.log(`    URL:   ${localWsUrl}`)
  }
  if (token) {
    console.log(`    Token: configured`)
  }
  console.log()
  if (!token) {
    console.log(`  ⚠️  Authentication disabled (--no-auth)`)
    console.log()
  }

  const agentDisplay =
    args.length > 0 ? `${command} ${args.join(' ')}` : command
  console.log(`  📦 Agent: ${agentDisplay}`)
  console.log(`     CWD:   ${cwd}`)
  console.log()
  console.log(`  Press Ctrl+C to stop`)
  console.log()

  logServer.info(
    {
      port,
      host,
      https,
      wsEndpoint: `${wsProtocol}://${displayHost}:${port}/ws`,
      agent: command,
      agentArgs: args,
      cwd,
      authEnabled: !!token,
    },
    'started',
  )

  // Graceful shutdown — close RCS upstream
  const shutdown = async () => {
    const upstream = getRcsUpstream()
    if (upstream) {
      await upstream.close()
    }
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  // Keep the server running
  await new Promise(() => {})
}
