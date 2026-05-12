/**
 * Parse the args string for the /skill-store command.
 *
 * Supported sub-commands:
 *   list                               → { action: 'list' }
 *   get <id>                           → { action: 'get', id }
 *   versions <id>                      → { action: 'versions', id }
 *   version <id> <version>             → { action: 'version', id, version }
 *   create <name> <markdown>           → { action: 'create', name, markdown }
 *   delete <id>                        → { action: 'delete', id }
 *   install <id>                       → { action: 'install', id, version: undefined }
 *   install <id>@<version>             → { action: 'install', id, version }
 *   (empty)                            → { action: 'list' }
 *   anything else                      → { action: 'invalid', reason }
 */

export type SkillStoreArgs =
  | { action: 'list' }
  | { action: 'get'; id: string }
  | { action: 'versions'; id: string }
  | { action: 'version'; id: string; version: string }
  | { action: 'create'; name: string; markdown: string }
  | { action: 'delete'; id: string }
  | { action: 'install'; id: string; version: string | undefined }
  | { action: 'invalid'; reason: string }

const USAGE =
  'Usage: /skill-store list | get ID | versions ID | version ID VER | create NAME MARKDOWN | delete ID | install ID[@VERSION]'

export function parseSkillStoreArgs(args: string): SkillStoreArgs {
  const trimmed = args.trim()

  if (trimmed === '' || trimmed === 'list') {
    return { action: 'list' }
  }

  const spaceIdx = trimmed.indexOf(' ')
  const subCmd = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)
  const rest = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim()

  // ── get ───────────────────────────────────────────────────────────────────
  if (subCmd === 'get') {
    if (!rest) {
      return { action: 'invalid', reason: 'get requires a skill id' }
    }
    const id = rest.split(/\s+/)[0]
    if (!id) {
      return { action: 'invalid', reason: 'get requires a skill id' }
    }
    return { action: 'get', id }
  }

  // ── versions ──────────────────────────────────────────────────────────────
  if (subCmd === 'versions') {
    if (!rest) {
      return { action: 'invalid', reason: 'versions requires a skill id' }
    }
    const id = rest.split(/\s+/)[0]
    if (!id) {
      return { action: 'invalid', reason: 'versions requires a skill id' }
    }
    return { action: 'versions', id }
  }

  // ── version ───────────────────────────────────────────────────────────────
  if (subCmd === 'version') {
    const parts = rest.split(/\s+/)
    if (parts.length < 2 || !parts[0] || !parts[1]) {
      return {
        action: 'invalid',
        reason:
          'version requires a skill id and version, e.g. version sk_123 v1',
      }
    }
    return { action: 'version', id: parts[0], version: parts[1] }
  }

  // ── create ────────────────────────────────────────────────────────────────
  if (subCmd === 'create') {
    const spaceInRest = rest.indexOf(' ')
    if (!rest || spaceInRest === -1) {
      return {
        action: 'invalid',
        reason:
          'create requires a skill name and markdown body, e.g. create my-skill "# My Skill\\nContent"',
      }
    }
    const name = rest.slice(0, spaceInRest).trim()
    const markdown = rest.slice(spaceInRest + 1).trim()
    if (!name) {
      return {
        action: 'invalid',
        reason: 'create requires a non-empty skill name',
      }
    }
    if (!markdown) {
      return {
        action: 'invalid',
        reason: 'create requires a non-empty markdown body',
      }
    }
    return { action: 'create', name, markdown }
  }

  // ── delete ────────────────────────────────────────────────────────────────
  if (subCmd === 'delete') {
    if (!rest) {
      return { action: 'invalid', reason: 'delete requires a skill id' }
    }
    const id = rest.split(/\s+/)[0]
    if (!id) {
      return { action: 'invalid', reason: 'delete requires a skill id' }
    }
    return { action: 'delete', id }
  }

  // ── install ───────────────────────────────────────────────────────────────
  if (subCmd === 'install') {
    if (!rest) {
      return {
        action: 'invalid',
        reason:
          'install requires a skill id (optionally with @version), e.g. install sk_123 or install sk_123@v2',
      }
    }
    const token = rest.split(/\s+/)[0]
    if (!token) {
      return { action: 'invalid', reason: 'install requires a skill id' }
    }
    const atIdx = token.indexOf('@')
    if (atIdx === -1) {
      return { action: 'install', id: token, version: undefined }
    }
    const id = token.slice(0, atIdx)
    const version = token.slice(atIdx + 1)
    if (!id) {
      return {
        action: 'invalid',
        reason: 'install requires a non-empty skill id before @',
      }
    }
    if (!version) {
      return {
        action: 'invalid',
        reason: 'install requires a non-empty version after @',
      }
    }
    return { action: 'install', id, version }
  }

  return {
    action: 'invalid',
    reason: `Unknown sub-command "${subCmd}". ${USAGE}`,
  }
}
