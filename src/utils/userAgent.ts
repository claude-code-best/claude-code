/**
 * User-Agent string helpers.
 *
 * Kept dependency-free so SDK-bundled code (bridge, cli/transports) can
 * import without pulling in auth.ts and its transitive dependency tree.
 */

import { APP_USER_AGENT_PREFIX } from './appIdentity.js'

export function getClaudeCodeUserAgent(): string {
  return `${APP_USER_AGENT_PREFIX}/${MACRO.VERSION}`
}
