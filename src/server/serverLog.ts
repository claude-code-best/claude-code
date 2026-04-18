/**
 * Server logger — structured logging for `claude server`.
 * Passed to startServer() and used for request/session lifecycle logging.
 */

export interface ServerLogger {
  info(msg: string, meta?: Record<string, unknown>): void
  warn(msg: string, meta?: Record<string, unknown>): void
  error(msg: string, meta?: Record<string, unknown>): void
  debug(msg: string, meta?: Record<string, unknown>): void
}

function formatMeta(meta?: Record<string, unknown>): string {
  if (!meta || Object.keys(meta).length === 0) return ''
  return (
    ' ' +
    Object.entries(meta)
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(' ')
  )
}

/**
 * Create a server logger that writes to stderr with timestamps.
 */
export function createServerLogger(): ServerLogger {
  return {
    info(msg, meta) {
      process.stderr.write(
        `[server] ${new Date().toISOString()} INFO ${msg}${formatMeta(meta)}\n`,
      )
    },
    warn(msg, meta) {
      process.stderr.write(
        `[server] ${new Date().toISOString()} WARN ${msg}${formatMeta(meta)}\n`,
      )
    },
    error(msg, meta) {
      process.stderr.write(
        `[server] ${new Date().toISOString()} ERROR ${msg}${formatMeta(meta)}\n`,
      )
    },
    debug(msg, meta) {
      if (process.env.CLAUDE_CODE_DEBUG) {
        process.stderr.write(
          `[server] ${new Date().toISOString()} DEBUG ${msg}${formatMeta(meta)}\n`,
        )
      }
    },
  }
}
