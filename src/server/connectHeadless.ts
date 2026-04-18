/**
 * Headless connect client — connects to a `claude server` session via WebSocket
 * and runs in non-interactive (pipe) mode.
 *
 * Used by `claude open cc://... -p "prompt"` to send a single prompt and
 * print the response, or in interactive mode to bridge stdin/stdout to the
 * remote session.
 */
import type { DirectConnectConfig } from './directConnectManager.js'
import { DirectConnectSessionManager } from './directConnectManager.js'
import { logForDebugging } from '../utils/debug.js'

/**
 * Run a headless connection to a Claude server session.
 *
 * @param config     - Connection config (serverUrl, sessionId, wsUrl, authToken)
 * @param prompt     - Prompt text to send (empty string for interactive)
 * @param outputFormat - Output format (e.g. 'stream-json', 'text')
 * @param interactive  - If true, read from stdin continuously
 */
export async function runConnectHeadless(
  config: DirectConnectConfig,
  prompt: string,
  outputFormat?: string,
  interactive?: boolean,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const manager = new DirectConnectSessionManager(config, {
      onMessage(message) {
        // Output the message based on format
        if (outputFormat === 'stream-json') {
          process.stdout.write(JSON.stringify(message) + '\n')
        } else {
          // Default: extract text content
          const content = (message as Record<string, unknown>).content
          if (typeof content === 'string') {
            process.stdout.write(content)
          } else if (Array.isArray(content)) {
            for (const block of content) {
              const text = (block as Record<string, unknown>).text
              if (typeof text === 'string') {
                process.stdout.write(text)
              }
            }
          }
        }
      },

      onPermissionRequest(_request, _requestId) {
        // In headless mode, permission requests are logged but not auto-approved.
        // The server-side session should be started with --dangerously-skip-permissions
        // so permission prompts don't occur. If they do, the session will time out.
        logForDebugging(
          `[headless] Permission request received (requestId=${_requestId})`,
        )
      },

      onConnected() {
        logForDebugging(`[headless] Connected to session ${config.sessionId}`)

        // Send the prompt
        if (prompt) {
          manager.sendMessage(prompt)
        }

        // In interactive mode, pipe stdin
        if (interactive) {
          process.stdin.setEncoding('utf-8')
          process.stdin.on('data', (data: string) => {
            manager.sendMessage(data.trim())
          })
          process.stdin.on('end', () => {
            manager.disconnect()
            resolve()
          })
        }
      },

      onDisconnected() {
        logForDebugging('[headless] Disconnected')
        resolve()
      },

      onError(error) {
        logForDebugging(`[headless] Error: ${error.message}`)
        reject(error)
      },
    })

    manager.connect()
  })
}
