import { randomUUID } from 'crypto'
import { unlinkSync } from 'fs'
import { getClaudeAIOAuthTokens } from 'src/utils/auth.js'
import { getOauthConfig } from 'src/constants/oauth.js'
import { logForDebugging } from 'src/utils/debug.js'

export interface SSHAuthProxy {
  stop(): void
}

export interface AuthProxyInfo {
  proxy: SSHAuthProxy
  /** Unix socket path or 127.0.0.1:<port> */
  localAddress: string
  /** Environment variables to inject into the remote/child CLI process */
  authEnv: Record<string, string>
}

const isWindows = process.platform === 'win32'

function resolveAuthHeaders(): Record<string, string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (apiKey) {
    return { 'x-api-key': apiKey }
  }

  const oauthTokens = getClaudeAIOAuthTokens()
  if (oauthTokens?.accessToken) {
    return { Authorization: `Bearer ${oauthTokens.accessToken}` }
  }

  return {}
}

function resolveUpstreamBaseUrl(): string {
  return process.env.ANTHROPIC_BASE_URL || getOauthConfig().BASE_API_URL
}

async function proxyFetch(
  req: Request,
  nonce: string | null,
): Promise<Response> {
  if (nonce && req.headers.get('x-auth-nonce') !== nonce) {
    return new Response('Forbidden', { status: 403 })
  }

  const upstreamBase = resolveUpstreamBaseUrl()
  const url = new URL(req.url)
  const upstreamUrl = `${upstreamBase}${url.pathname}${url.search}`

  const authHeaders = resolveAuthHeaders()
  if (Object.keys(authHeaders).length === 0) {
    return new Response(
      JSON.stringify({
        error: 'No API credentials available on local machine',
      }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    )
  }

  const forwardHeaders = new Headers(req.headers)
  for (const [k, v] of Object.entries(authHeaders)) {
    forwardHeaders.set(k, v)
  }
  forwardHeaders.delete('host')
  forwardHeaders.delete('x-auth-nonce')

  logForDebugging(
    `[SSHAuthProxy] ${req.method} ${url.pathname} -> ${upstreamUrl}`,
  )

  try {
    const upstreamRes = await fetch(upstreamUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: req.body,
      // @ts-expect-error Bun supports duplex for streaming request bodies
      duplex: 'half',
    })

    const responseHeaders = new Headers(upstreamRes.headers)
    responseHeaders.delete('content-encoding')
    responseHeaders.delete('content-length')

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: responseHeaders,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logForDebugging(`[SSHAuthProxy] upstream error: ${message}`)
    return new Response(
      JSON.stringify({ error: `Proxy upstream error: ${message}` }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    )
  }
}

export async function createAuthProxy(): Promise<AuthProxyInfo> {
  const id = randomUUID()

  if (isWindows) {
    return createTcpAuthProxy(id)
  }
  return createUnixSocketAuthProxy(id)
}

async function createUnixSocketAuthProxy(id: string): Promise<AuthProxyInfo> {
  const socketPath = `/tmp/claude-ssh-auth-${id}.sock`

  const server = Bun.serve({
    unix: socketPath,
    fetch: req => proxyFetch(req, null),
  })

  logForDebugging(`[SSHAuthProxy] listening on unix:${socketPath}`)

  const proxy: SSHAuthProxy = {
    stop() {
      server.stop(true)
      try {
        unlinkSync(socketPath)
      } catch {
        // Socket file may already be cleaned up
      }
    },
  }

  return {
    proxy,
    localAddress: socketPath,
    authEnv: { ANTHROPIC_AUTH_SOCKET: socketPath },
  }
}

async function createTcpAuthProxy(id: string): Promise<AuthProxyInfo> {
  const nonce = randomUUID()

  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: req => proxyFetch(req, nonce),
  })

  const port = server.port
  logForDebugging(
    `[SSHAuthProxy] listening on TCP 127.0.0.1:${port} (nonce-protected)`,
  )

  const proxy: SSHAuthProxy = {
    stop() {
      server.stop(true)
    },
  }

  return {
    proxy,
    localAddress: `127.0.0.1:${port}`,
    authEnv: {
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
      ANTHROPIC_AUTH_NONCE: nonce,
    },
  }
}
