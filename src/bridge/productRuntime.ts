import { mkdir, readFile, readdir, realpath, rm, stat } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'

import { deriveWorkspaceKey } from './bridgeIdentity.js'
import { findGitRoot } from '../utils/git.js'
import { getRemoteUrlForDir } from '../utils/git/gitFilesystem.js'
import type {
  EnvironmentCommandWorkData,
  ProviderEnvironmentCommandWorkData,
} from './types.js'

type ProductEnvironmentCommandWorkData = Exclude<
  EnvironmentCommandWorkData,
  ProviderEnvironmentCommandWorkData | { type: 'terminate_session' }
>

export type RemoteDirectoryEntry = {
  name: string
  kind: 'directory' | 'file'
}

export type RemoteDirectoryListing = {
  path: string
  entries: RemoteDirectoryEntry[]
}

export type ResolvedRemoteWorkspace = {
  deviceId: string
  canonicalPath: string
  workspaceKey: string
  gitRoot: string | null
  gitRepoUrl: string | null
}

export type EnvironmentCommandResult =
  | { kind: 'list_directory'; value: RemoteDirectoryListing }
  | { kind: 'resolve_workspace'; value: ResolvedRemoteWorkspace }
  | {
      kind: 'cleanup_chat_session'
      value: { removed: boolean; closedTabIds: number[] }
    }
  | {
      kind: 'probe_workspace'
      value: { exists: boolean; canonicalPath: string | null }
    }

type ResolveWorkspaceDependencies = {
  isPathTrusted?: (path: string) => boolean
}

type ExecuteEnvironmentCommandDependencies = {
  closeBrowserScope?: (
    browserScopeId: string,
    dataDirectory: string,
  ) => Promise<number[]>
}

type BrowserCleanupClient = {
  ensureConnected: () => Promise<boolean>
  callTool: (
    name: string,
    args: Record<string, unknown>,
    permissionOverrides?: { permissionMode: 'skip_all_permission_checks' },
  ) => Promise<unknown>
  getTabOwnerIdentity?: (tabId: number) => string | null
  disconnect: () => void
}

type CloseOwnedBrowserTabsDependencies = {
  createClient?: () => BrowserCleanupClient | Promise<BrowserCleanupClient>
}

async function createDefaultBrowserCleanupClient(): Promise<BrowserCleanupClient> {
  const [{ createChromeSocketClient }, { createChromeContext }] =
    await Promise.all([
      import('@ant/claude-for-chrome-mcp'),
      import('../utils/claudeInChrome/mcpServer.js'),
    ])
  return createChromeSocketClient(createChromeContext())
}

function toolResponseError(response: unknown): string | null {
  if (!response || typeof response !== 'object' || !('error' in response)) {
    return null
  }
  try {
    return JSON.stringify(response.error) ?? String(response.error)
  } catch {
    return String(response.error)
  }
}

function collectTabIds(value: unknown, found = new Set<number>()): Set<number> {
  if (typeof value === 'string') {
    try {
      collectTabIds(JSON.parse(value), found)
    } catch {
      // Human-readable browser output is intentionally ignored.
    }
    return found
  }
  if (Array.isArray(value)) {
    for (const item of value) collectTabIds(item, found)
    return found
  }
  if (!value || typeof value !== 'object') return found
  for (const [key, item] of Object.entries(value)) {
    if (
      (key === 'tabId' || key === 'tab_id') &&
      typeof item === 'number' &&
      Number.isSafeInteger(item)
    ) {
      found.add(item)
    } else {
      collectTabIds(item, found)
    }
  }
  return found
}

function isAlreadyClosedTabError(message: string): boolean {
  return /(?:tab|target).*(?:not found|does not exist|already closed|no longer exists|invalid)/i.test(
    message,
  )
}

export async function closeOwnedBrowserTabs(
  browserScopeId: string,
  dataDirectory: string,
  dependencies: CloseOwnedBrowserTabsDependencies = {},
): Promise<number[]> {
  let rawRegistry: string
  try {
    rawRegistry = await readFile(
      join(
        getChatBrowserStateDirectory(dataDirectory),
        'browser-owned-tabs.json',
      ),
      'utf8',
    )
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return []
    }
    throw error
  }

  let registry: { scopeId?: unknown; tabs?: unknown; tabIds?: unknown }
  try {
    registry = JSON.parse(rawRegistry) as typeof registry
  } catch {
    throw new Error('Chat browser ownership registry is invalid')
  }
  if (registry.scopeId !== browserScopeId) {
    throw new Error('Chat browser ownership scope does not match cleanup')
  }
  if (!Array.isArray(registry.tabs)) {
    if (Array.isArray(registry.tabIds)) return []
    throw new Error('Chat browser ownership registry is invalid')
  }
  const tabs = registry.tabs.filter(
    (value): value is { tabId: number; ownerId: string } =>
      Boolean(
        value &&
          typeof value === 'object' &&
          'tabId' in value &&
          typeof value.tabId === 'number' &&
          Number.isSafeInteger(value.tabId) &&
          'ownerId' in value &&
          typeof value.ownerId === 'string' &&
          value.ownerId.length > 0,
      ),
  )
  if (tabs.length === 0) return []

  const client = await (
    dependencies.createClient ?? createDefaultBrowserCleanupClient
  )()
  const closed: number[] = []
  try {
    if (!(await client.ensureConnected())) {
      throw new Error('Browser cleanup is unavailable; owned tabs will retry')
    }
    const snapshot = await client.callTool(
      'tabs_context_mcp',
      { createIfEmpty: false },
      { permissionMode: 'skip_all_permission_checks' },
    )
    const snapshotError = toolResponseError(snapshot)
    if (snapshotError) {
      throw new Error(
        'Browser cleanup could not obtain a complete tab snapshot',
      )
    }
    if (!snapshot || typeof snapshot !== 'object' || !('result' in snapshot)) {
      throw new Error('Browser cleanup received an invalid tab snapshot')
    }
    const availableTabIds = collectTabIds(snapshot)
    for (const tab of tabs) {
      if (
        !availableTabIds.has(tab.tabId) ||
        client.getTabOwnerIdentity?.(tab.tabId) !== tab.ownerId
      ) {
        closed.push(tab.tabId)
        continue
      }
      const response = await client.callTool(
        'javascript_tool',
        {
          action: 'javascript_exec',
          text: 'window.close()',
          tabId: tab.tabId,
        },
        { permissionMode: 'skip_all_permission_checks' },
      )
      const responseError = toolResponseError(response)
      if (responseError) {
        if (isAlreadyClosedTabError(responseError)) {
          closed.push(tab.tabId)
          continue
        }
        throw new Error(`Failed to close owned browser tab ${tab.tabId}`)
      }
      closed.push(tab.tabId)
    }
  } finally {
    client.disconnect()
  }
  return closed
}

async function entryKind(
  root: string,
  entry: Dirent<string>,
): Promise<RemoteDirectoryEntry['kind']> {
  if (entry.isDirectory()) return 'directory'
  if (!entry.isSymbolicLink()) return 'file'

  try {
    return (await stat(`${root}/${entry.name}`)).isDirectory()
      ? 'directory'
      : 'file'
  } catch {
    return 'file'
  }
}

export async function listRemoteDirectory(
  requestedPath: string,
): Promise<RemoteDirectoryListing> {
  const canonicalPath = await realpath(requestedPath)
  if (!(await stat(canonicalPath)).isDirectory()) {
    throw new Error(`Remote path is not a directory: ${requestedPath}`)
  }

  const dirents = await readdir(canonicalPath, { withFileTypes: true })
  const entries = await Promise.all(
    dirents.map(async entry => ({
      name: entry.name,
      kind: await entryKind(canonicalPath, entry),
    })),
  )
  entries.sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'directory' ? -1 : 1
    }
    return left.name.localeCompare(right.name)
  })

  return { path: canonicalPath, entries }
}

export async function resolveRemoteWorkspace(
  requestedPath: string,
  deviceId: string,
  dependencies: ResolveWorkspaceDependencies = {},
): Promise<ResolvedRemoteWorkspace> {
  const canonicalPath = await realpath(requestedPath)
  if (!(await stat(canonicalPath)).isDirectory()) {
    throw new Error(`Remote path is not a directory: ${requestedPath}`)
  }

  const isPathTrusted =
    dependencies.isPathTrusted ??
    (await import('../utils/config.js')).isPathTrusted
  if (!isPathTrusted(canonicalPath)) {
    throw new Error(`Remote workspace is not trusted: ${canonicalPath}`)
  }

  const gitRoot = findGitRoot(canonicalPath)
  const gitRepoUrl = await getRemoteUrlForDir(canonicalPath)
  return {
    deviceId,
    canonicalPath,
    workspaceKey: deriveWorkspaceKey(canonicalPath, gitRepoUrl),
    gitRoot: gitRoot ? await realpath(gitRoot) : null,
    gitRepoUrl,
  }
}

export async function ensureCodeArtifactRoot(
  workspacePath: string,
  sessionId: string,
): Promise<string> {
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    throw new Error('Invalid session ID for Code artifact root')
  }
  const canonicalWorkspace = await realpath(workspacePath)
  if (!(await stat(canonicalWorkspace)).isDirectory()) {
    throw new Error(`Code workspace is not a directory: ${workspacePath}`)
  }
  const platformRoot = join(canonicalWorkspace, '.real-agentc')
  const sessionRoot = join(platformRoot, 'sessions', sessionId)
  await Promise.all([
    mkdir(join(sessionRoot, 'downloads'), { recursive: true }),
    mkdir(join(sessionRoot, 'screenshots'), { recursive: true }),
    mkdir(join(sessionRoot, 'temp'), { recursive: true }),
    mkdir(join(sessionRoot, 'logs'), { recursive: true }),
    mkdir(join(platformRoot, 'project'), { recursive: true }),
  ])
  return sessionRoot
}

export async function createChatDataRoot(
  sessionId: string,
  homeDirectory = homedir(),
): Promise<string> {
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    throw new Error('Invalid session ID for Chat data root')
  }
  const root = join(homeDirectory, '.real-agentc', 'chat-sessions', sessionId)
  await Promise.all([
    mkdir(root, { recursive: true }),
    mkdir(join(root, 'temp'), { recursive: true }),
    mkdir(join(root, 'downloads'), { recursive: true }),
  ])
  return root
}

export function getChatBrowserStateDirectory(dataDirectory: string): string {
  const normalized = resolve(dataDirectory)
  const sessionId = basename(normalized)
  const sessionsRoot = dirname(normalized)
  const platformRoot = dirname(sessionsRoot)
  if (
    !/^[a-zA-Z0-9_-]+$/.test(sessionId) ||
    basename(sessionsRoot) !== 'chat-sessions' ||
    basename(platformRoot) !== '.real-agentc'
  ) {
    throw new Error('Invalid Chat session data directory')
  }
  return join(platformRoot, 'chat-browser-state', sessionId)
}

export async function prepareCodeSessionRuntime(
  requestedPath: string,
  sessionId: string,
  dependencies: ResolveWorkspaceDependencies = {},
): Promise<{ directory: string; artifactDirectory: string }> {
  const canonicalPath = await realpath(requestedPath)
  if (!(await stat(canonicalPath)).isDirectory()) {
    throw new Error(`Code workspace is not a directory: ${requestedPath}`)
  }
  const isPathTrusted =
    dependencies.isPathTrusted ??
    (await import('../utils/config.js')).isPathTrusted
  if (!isPathTrusted(canonicalPath)) {
    throw new Error(`Code workspace is not trusted: ${canonicalPath}`)
  }
  return {
    directory: canonicalPath,
    artifactDirectory: await ensureCodeArtifactRoot(canonicalPath, sessionId),
  }
}

function isChatSessionDataDirectory(path: string): boolean {
  try {
    getChatBrowserStateDirectory(path)
    return true
  } catch {
    return false
  }
}

export async function executeEnvironmentCommand(
  command: ProductEnvironmentCommandWorkData,
  dependencies: ExecuteEnvironmentCommandDependencies = {},
): Promise<EnvironmentCommandResult> {
  switch (command.type) {
    case 'list_directory':
      return {
        kind: command.type,
        value: await listRemoteDirectory(command.path),
      }
    case 'resolve_workspace':
      return {
        kind: command.type,
        value: await resolveRemoteWorkspace(command.path, command.device_id),
      }
    case 'probe_workspace':
      try {
        const canonicalPath = await realpath(command.path)
        return {
          kind: command.type,
          value: {
            exists: (await stat(canonicalPath)).isDirectory(),
            canonicalPath,
          },
        }
      } catch (error) {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          (error.code === 'ENOENT' || error.code === 'ENOTDIR')
        ) {
          return {
            kind: command.type,
            value: { exists: false, canonicalPath: null },
          }
        }
        throw error
      }
    case 'cleanup_chat_session': {
      const requestedDirectory = command.data_directory.replace(/^~/, homedir())
      getChatBrowserStateDirectory(requestedDirectory)
      let canonicalPath: string | null = null
      try {
        canonicalPath = await realpath(requestedDirectory)
      } catch (error) {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          (error.code === 'ENOENT' || error.code === 'ENOTDIR')
        ) {
          canonicalPath = null
        } else {
          throw error
        }
      }
      if (canonicalPath && !isChatSessionDataDirectory(canonicalPath)) {
        throw new Error('Refusing to remove a non-Chat session directory')
      }
      const cleanupPath = canonicalPath ?? resolve(requestedDirectory)
      const closedTabIds = await (
        dependencies.closeBrowserScope ?? closeOwnedBrowserTabs
      )(command.browser_scope_id, cleanupPath)
      await Promise.all([
        rm(cleanupPath, { recursive: true, force: true }),
        rm(getChatBrowserStateDirectory(cleanupPath), {
          recursive: true,
          force: true,
        }),
      ])
      return {
        kind: command.type,
        value: { removed: canonicalPath !== null, closedTabIds },
      }
    }
  }
}
