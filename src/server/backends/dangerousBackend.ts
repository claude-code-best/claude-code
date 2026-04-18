/**
 * DangerousBackend — no-permission-check backend for `claude server`.
 *
 * All tool calls are auto-approved. Used when the server is started with
 * `--dangerously-skip-permissions` (the default for local server mode,
 * since the server operator controls access via the auth token).
 */

export interface ServerBackend {
  /** Permission mode string passed to spawned CLI sessions. */
  readonly permissionMode: string
}

export class DangerousBackend implements ServerBackend {
  readonly permissionMode = 'bypassPermissions'
}
