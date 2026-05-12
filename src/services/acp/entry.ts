import { AgentSideConnection, ndJsonStream } from '@agentclientprotocol/sdk'
import type { Stream } from '@agentclientprotocol/sdk'
import { Readable, Writable } from 'node:stream'
import { AcpAgent } from './agent.js'
import { enableConfigs } from '../../utils/config.js'
import { applySafeConfigEnvironmentVariables } from '../../utils/managedEnv.js'

/**
 * Creates an ACP Stream from a pair of Node.js streams.
 */
export function createAcpStream(
  nodeReadable: NodeJS.ReadableStream,
  nodeWritable: NodeJS.WritableStream,
): Stream {
  const readableFromClient = Readable.toWeb(
    nodeReadable as typeof process.stdin,
  ) as unknown as ReadableStream<Uint8Array>
  const writableToClient = Writable.toWeb(
    nodeWritable as typeof process.stdout,
  ) as unknown as WritableStream<Uint8Array>
  return ndJsonStream(writableToClient, readableFromClient)
}

/**
 * Entry point for the ACP (Agent Client Protocol) agent mode.
 */
export async function runAcpAgent(): Promise<void> {
  enableConfigs()

  // Apply environment variables from settings.json (ANTHROPIC_BASE_URL,
  // ANTHROPIC_AUTH_TOKEN, model overrides, etc.) so the API client can
  // authenticate. Without this, Zed-launched processes won't have these
  // env vars in process.env.
  applySafeConfigEnvironmentVariables()

  const stream = createAcpStream(process.stdin, process.stdout)

  let agent!: AcpAgent
  const connection = new AgentSideConnection(conn => {
    agent = new AcpAgent(conn)
    return agent
  }, stream)

  // stdout is used for ACP messages — redirect console to stderr
  console.log = console.error
  console.info = console.error
  console.warn = console.error
  console.debug = console.error

  async function shutdown(): Promise<void> {
    // Clean up all active sessions
    for (const [sessionId] of agent.sessions) {
      try {
        await agent.unstable_closeSession({ sessionId })
      } catch {
        // Best-effort cleanup
      }
    }
    process.exit(0)
  }

  // Exit cleanly when the ACP connection closes
  connection.closed.then(shutdown).catch(shutdown)

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  })

  // Keep process alive while connection is open
  process.stdin.resume()
}
