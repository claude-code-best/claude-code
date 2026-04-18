/**
 * Claude Code Server — HTTP + WebSocket API for local/remote IDE integration.
 *
 * Endpoints:
 *   POST /sessions              — Create a new Claude session
 *   GET  /sessions              — List active sessions
 *   GET  /sessions/:id          — Get session info
 *   DELETE /sessions/:id        — Destroy a session
 *   WS   /ws/:sessionId         — WebSocket connection to a session (NDJSON)
 *   GET  /health                — Health check
 *
 * Authentication: Bearer token via Authorization header or ?token= query param.
 */
import type { ServerConfig } from './types.js'
import type { SessionManager } from './sessionManager.js'
import type { ServerLogger } from './serverLog.js'

interface ServerHandle {
  port?: number
  stop: (closeActiveConnections: boolean) => void
}

/** Minimal WebSocket interface matching Bun's ServerWebSocket. */
interface WS {
  data: { sessionId: string }
  send(data: string | ArrayBuffer): void
  close(code?: number, reason?: string): void
}

/**
 * Start the Claude Code server.
 */
export function startServer(
  config: ServerConfig,
  sessionManager: SessionManager,
  logger: ServerLogger,
): ServerHandle {
  function checkAuth(req: Request): boolean {
    const authHeader = req.headers.get('authorization')
    if (authHeader === `Bearer ${config.authToken}`) return true
    const url = new URL(req.url, 'http://localhost')
    if (url.searchParams.get('token') === config.authToken) return true
    return false
  }

  function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const server = (Bun.serve as any)({
    port: config.port,
    hostname: config.host,
    ...(config.unix ? { unix: config.unix } : {}),

    async fetch(
      req: Request,
      server: {
        upgrade(req: Request, opts?: Record<string, unknown>): boolean
      },
    ) {
      const url = new URL(req.url, `http://${config.host}:${config.port}`)
      const path = url.pathname

      // Health check — no auth required
      if (path === '/health' && req.method === 'GET') {
        return jsonResponse({
          status: 'ok',
          sessions: sessionManager.listSessions().length,
        })
      }

      // All other endpoints require auth
      if (!checkAuth(req)) {
        return jsonResponse({ error: 'Unauthorized' }, 401)
      }

      // POST /sessions — create a new session
      if (path === '/sessions' && req.method === 'POST') {
        try {
          const body = (await req.json()) as {
            cwd?: string
            dangerously_skip_permissions?: boolean
          }
          const session = sessionManager.createSession(body.cwd)
          const wsUrl = config.unix
            ? `ws+unix://${config.unix}/ws/${session.id}`
            : `ws://${config.host}:${config.port}/ws/${session.id}`

          logger.info('Session created', {
            sessionId: session.id,
            workDir: session.workDir,
          })

          return jsonResponse({
            session_id: session.id,
            ws_url: wsUrl,
            work_dir: session.workDir,
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          logger.error('Session creation failed', { error: msg })
          return jsonResponse({ error: msg }, 400)
        }
      }

      // GET /sessions — list sessions
      if (path === '/sessions' && req.method === 'GET') {
        const sessions = sessionManager.listSessions().map(s => ({
          session_id: s.id,
          status: s.status,
          work_dir: s.workDir,
          created_at: s.createdAt,
        }))
        return jsonResponse({ sessions })
      }

      // GET/DELETE /sessions/:id
      const sessionMatch = path.match(/^\/sessions\/([^/]+)$/)
      if (sessionMatch) {
        const sessionId = sessionMatch[1]!
        if (req.method === 'GET') {
          const session = sessionManager.getSession(sessionId)
          if (!session) return jsonResponse({ error: 'Session not found' }, 404)
          return jsonResponse({
            session_id: session.id,
            status: session.status,
            work_dir: session.workDir,
            created_at: session.createdAt,
          })
        }
        if (req.method === 'DELETE') {
          await sessionManager.destroySession(sessionId)
          logger.info('Session destroyed', { sessionId })
          return jsonResponse({ ok: true })
        }
      }

      // WebSocket upgrade: /ws/:sessionId
      const wsMatch = path.match(/^\/ws\/([^/]+)$/)
      if (wsMatch && req.method === 'GET') {
        const sessionId = wsMatch[1]!
        const session = sessionManager.getSession(sessionId)
        if (!session || !session.process) {
          return jsonResponse(
            { error: 'Session not found or not running' },
            404,
          )
        }

        const upgraded = server.upgrade(req, { data: { sessionId } })
        if (!upgraded) {
          return new Response('WebSocket upgrade failed', { status: 400 })
        }
        return undefined as unknown as Response
      }

      return jsonResponse({ error: 'Not found' }, 404)
    },

    websocket: {
      open(ws: WS) {
        const { sessionId } = ws.data
        const session = sessionManager.getSession(sessionId)
        if (!session?.process) {
          ws.close(1008, 'Session not running')
          return
        }

        logger.info('WebSocket connected', { sessionId })

        // Pipe child stdout → WebSocket
        session.process.stdout?.on('data', (chunk: Buffer) => {
          ws.send(chunk.toString())
        })

        // Pipe child stderr → WebSocket (as error messages)
        session.process.stderr?.on('data', (chunk: Buffer) => {
          ws.send(
            JSON.stringify({ type: 'stderr', text: chunk.toString() }) + '\n',
          )
        })

        session.process.on('exit', code => {
          ws.send(JSON.stringify({ type: 'exit', code }) + '\n')
          ws.close(1000, 'Session exited')
        })
      },

      message(ws: WS, message: string | ArrayBuffer) {
        const { sessionId } = ws.data
        const session = sessionManager.getSession(sessionId)
        if (!session?.process?.stdin) {
          ws.close(1008, 'Session not running')
          return
        }

        // Parse incoming WS message and convert to SDK NDJSON format for child stdin.
        // The child runs with --input-format=stream-json and expects SDKUserMessage format.
        const raw = typeof message === 'string' ? message : message.toString()
        try {
          const parsed = JSON.parse(raw) as Record<string, unknown>
          let sdkLine: string

          if (parsed.type === 'user' && parsed.message) {
            // Already in SDK format — pass through
            sdkLine = raw
          } else {
            // Convert simple message to SDK user message format
            const content =
              (parsed.content as string) ?? (parsed.text as string) ?? raw
            sdkLine = JSON.stringify({
              type: 'user',
              content,
              uuid: '',
              session_id: '',
              message: { role: 'user', content },
              parent_tool_use_id: null,
            })
          }

          session.process.stdin.write(sdkLine + '\n')
        } catch {
          // Not valid JSON — treat as raw text user message
          const sdkLine = JSON.stringify({
            type: 'user',
            content: raw,
            uuid: '',
            session_id: '',
            message: { role: 'user', content: raw },
            parent_tool_use_id: null,
          })
          session.process.stdin.write(sdkLine + '\n')
        }
      },

      close(ws: WS) {
        const { sessionId } = ws.data
        logger.info('WebSocket disconnected', { sessionId })
      },
    },
  })

  logger.info('Server started', {
    port: server.port,
    host: config.host,
    unix: config.unix,
  })

  return {
    port: server.port,
    stop(closeActiveConnections: boolean) {
      server.stop(closeActiveConnections)
      logger.info('Server stopped')
    },
  }
}
