/**
 * Server startup banner — prints connection info to stderr.
 */
import type { ServerConfig } from './types.js'

/**
 * Print the server startup banner with connection details.
 */
export function printBanner(
  config: ServerConfig,
  authToken: string,
  port: number,
): void {
  const httpUrl = config.unix
    ? `unix:${config.unix}`
    : `http://${config.host}:${port}`
  const ccUrl = config.unix
    ? `cc+unix://${config.unix}?token=${authToken}`
    : `cc://${config.host}:${port}?token=${authToken}`

  process.stderr.write('\n')
  process.stderr.write(`  Claude Code Server\n`)
  process.stderr.write(`  ${'─'.repeat(40)}\n`)
  process.stderr.write(`  HTTP:    ${httpUrl}\n`)
  process.stderr.write(`  Connect: ${ccUrl}\n`)
  process.stderr.write(`  Token:   ${authToken}\n`)
  if (config.maxSessions) {
    process.stderr.write(`  Max sessions: ${config.maxSessions}\n`)
  }
  process.stderr.write(`  ${'─'.repeat(40)}\n`)
  process.stderr.write(`  Use: claude open ${ccUrl}\n`)
  process.stderr.write('\n')
}
