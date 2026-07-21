import { afterEach, describe, expect, test } from 'bun:test'
import {
  mkdirSync,
  mkdtempSync,
  existsSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { deriveWorkspaceKey } from '../bridgeIdentity.js'
import {
  executeEnvironmentCommand,
  closeOwnedBrowserTabs,
  createChatDataRoot,
  ensureCodeArtifactRoot,
  getChatBrowserStateDirectory,
  listRemoteDirectory,
  prepareCodeSessionRuntime,
  resolveRemoteWorkspace,
} from '../productRuntime.js'

const tempRoots: string[] = []

function makeTempRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix))
  tempRoots.push(root)
  return root
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('product runtime workspace inspection', () => {
  test('lists names and kinds without file contents', async () => {
    const root = makeTempRoot('product-runtime-')
    mkdirSync(join(root, 'src'))
    mkdirSync(join(root, 'assets'))
    writeFileSync(join(root, 'README.md'), 'secret body')
    writeFileSync(join(root, 'package.json'), '{"private":true}')

    expect(await listRemoteDirectory(root)).toEqual({
      path: realpathSync(root),
      entries: [
        { name: 'assets', kind: 'directory' },
        { name: 'src', kind: 'directory' },
        { name: 'package.json', kind: 'file' },
        { name: 'README.md', kind: 'file' },
      ],
    })
  })

  test('resolves symlinks to one stable workspace identity', async () => {
    const root = makeTempRoot('workspace-identity-')
    const realPath = join(root, 'repo')
    const aliasPath = join(root, 'repo-link')
    mkdirSync(realPath)
    symlinkSync(realPath, aliasPath, 'dir')

    const resolved = await resolveRemoteWorkspace(aliasPath, 'device-1', {
      isPathTrusted: () => true,
    })

    expect(resolved.canonicalPath).toBe(realpathSync(realPath))
    expect(resolved.workspaceKey).toBe(
      deriveWorkspaceKey(realpathSync(realPath), resolved.gitRepoUrl),
    )
    expect(resolved.deviceId).toBe('device-1')
  })

  test('rejects files and untrusted directories', async () => {
    const root = makeTempRoot('workspace-validation-')
    const file = join(root, 'README.md')
    writeFileSync(file, 'body')

    await expect(
      resolveRemoteWorkspace(file, 'device-1', { isPathTrusted: () => true }),
    ).rejects.toThrow(/directory/i)
    await expect(
      resolveRemoteWorkspace(root, 'device-1', { isPathTrusted: () => false }),
    ).rejects.toThrow(/trusted/i)
  })

  test('executes probe and cleanup commands with structured results', async () => {
    const root = makeTempRoot('product-command-')
    const scratch = join(root, '.real-agentc', 'chat-sessions', 'session-1')
    const browserState = getChatBrowserStateDirectory(scratch)
    mkdirSync(scratch, { recursive: true })
    mkdirSync(browserState, { recursive: true })
    writeFileSync(join(scratch, 'result.txt'), 'temporary')
    writeFileSync(join(browserState, 'browser-owned-tabs.json'), 'temporary')

    await expect(
      executeEnvironmentCommand({ type: 'probe_workspace', path: scratch }),
    ).resolves.toEqual({
      kind: 'probe_workspace',
      value: { exists: true, canonicalPath: realpathSync(scratch) },
    })
    await expect(
      executeEnvironmentCommand(
        {
          type: 'cleanup_chat_session',
          data_directory: scratch,
          browser_scope_id: 'session-1',
        },
        {
          closeBrowserScope: async (scopeId, directory) => {
            expect(scopeId).toBe('session-1')
            expect(directory).toBe(realpathSync(scratch))
            return [41, 42]
          },
        },
      ),
    ).resolves.toEqual({
      kind: 'cleanup_chat_session',
      value: { removed: true, closedTabIds: [41, 42] },
    })
    expect(existsSync(browserState)).toBe(false)
    await expect(
      executeEnvironmentCommand({ type: 'probe_workspace', path: scratch }),
    ).resolves.toEqual({
      kind: 'probe_workspace',
      value: { exists: false, canonicalPath: null },
    })
  })

  test('preserves browser ownership and Chat scratch data when owned tabs cannot be closed', async () => {
    const root = makeTempRoot('product-command-retry-')
    const scratch = join(root, '.real-agentc', 'chat-sessions', 'session-retry')
    mkdirSync(scratch, { recursive: true })
    const browserState = getChatBrowserStateDirectory(scratch)
    mkdirSync(browserState, { recursive: true })
    writeFileSync(
      join(browserState, 'browser-owned-tabs.json'),
      JSON.stringify({
        scopeId: 'session-retry',
        tabs: [{ tabId: 71, ownerId: 'profile-retry' }],
      }),
    )

    await expect(
      closeOwnedBrowserTabs('session-retry', scratch, {
        createClient: async () => ({
          ensureConnected: async () => false,
          callTool: async () => null,
          disconnect: () => {},
        }),
      }),
    ).rejects.toThrow(/browser.*unavailable/i)

    await expect(
      executeEnvironmentCommand(
        {
          type: 'cleanup_chat_session',
          data_directory: scratch,
          browser_scope_id: 'session-retry',
        },
        {
          closeBrowserScope: async () => {
            throw new Error('owned tab close failed')
          },
        },
      ),
    ).rejects.toThrow('owned tab close failed')
    expect(existsSync(scratch)).toBe(true)
    expect(existsSync(join(browserState, 'browser-owned-tabs.json'))).toBe(true)
  })

  test('trusts only bridge-owned browser state and ignores a forged scratch registry', async () => {
    const root = makeTempRoot('product-command-owned-state-')
    const scratch = join(root, '.real-agentc', 'chat-sessions', 'session-safe')
    const browserState = getChatBrowserStateDirectory(scratch)
    mkdirSync(scratch, { recursive: true })
    mkdirSync(browserState, { recursive: true })
    writeFileSync(
      join(browserState, 'browser-owned-tabs.json'),
      JSON.stringify({
        scopeId: 'session-safe',
        tabs: [{ tabId: 71, ownerId: 'profile-safe' }],
      }),
    )
    writeFileSync(
      join(scratch, 'browser-owned-tabs.json'),
      JSON.stringify({ scopeId: 'session-safe', tabIds: [999] }),
    )

    const requestedTabIds: number[] = []
    const toolCalls: string[] = []
    await expect(
      closeOwnedBrowserTabs('session-safe', scratch, {
        createClient: async () => ({
          ensureConnected: async () => true,
          callTool: async (name, args) => {
            toolCalls.push(name)
            if (name === 'tabs_context_mcp') {
              return {
                result: {
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify({ availableTabs: [{ tabId: 71 }] }),
                    },
                  ],
                },
              }
            }
            requestedTabIds.push(args.tabId as number)
            return { result: { content: [] } }
          },
          getTabOwnerIdentity: () => 'profile-safe',
          disconnect: () => {},
        }),
      }),
    ).resolves.toEqual([71])
    expect(toolCalls).toEqual(['tabs_context_mcp', 'javascript_tool'])
    expect(requestedTabIds).toEqual([71])
  })

  test('does not close a reused tab ID from a new browser incarnation', async () => {
    const root = makeTempRoot('product-command-missing-tab-')
    const scratch = join(root, '.real-agentc', 'chat-sessions', 'session-gone')
    const browserState = getChatBrowserStateDirectory(scratch)
    mkdirSync(scratch, { recursive: true })
    mkdirSync(browserState, { recursive: true })
    writeFileSync(
      join(browserState, 'browser-owned-tabs.json'),
      JSON.stringify({
        scopeId: 'session-gone',
        tabs: [{ tabId: 71, ownerId: 'bridge:device-stable:100' }],
      }),
    )

    const calls: string[] = []
    await expect(
      closeOwnedBrowserTabs('session-gone', scratch, {
        createClient: async () => ({
          ensureConnected: async () => true,
          callTool: async name => {
            calls.push(name)
            if (name !== 'tabs_context_mcp') {
              throw new Error('must not close an unverified tab ID')
            }
            return {
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({ availableTabs: [{ tabId: 71 }] }),
                  },
                ],
              },
            }
          },
          getTabOwnerIdentity: () => 'bridge:device-stable:200',
          disconnect: () => {},
        }),
      }),
    ).resolves.toEqual([71])
    expect(calls).toEqual(['tabs_context_mcp'])
  })

  test('creates platform-owned Code artifacts only under workspace .real-agentc', async () => {
    const workspace = makeTempRoot('code-artifacts-')
    const artifactRoot = await ensureCodeArtifactRoot(workspace, 'session-1')

    expect(artifactRoot).toBe(
      join(realpathSync(workspace), '.real-agentc', 'sessions', 'session-1'),
    )
    expect(await listRemoteDirectory(artifactRoot)).toEqual({
      path: realpathSync(artifactRoot),
      entries: [
        { name: 'downloads', kind: 'directory' },
        { name: 'logs', kind: 'directory' },
        { name: 'screenshots', kind: 'directory' },
        { name: 'temp', kind: 'directory' },
      ],
    })
    expect(await listRemoteDirectory(join(workspace, '.real-agentc'))).toEqual({
      path: realpathSync(join(workspace, '.real-agentc')),
      entries: [
        { name: 'project', kind: 'directory' },
        { name: 'sessions', kind: 'directory' },
      ],
    })
  })

  test('prepares product-aware Code sessions fail-closed with no fallback path', async () => {
    const workspace = makeTempRoot('code-session-runtime-')
    const file = join(workspace, 'README.md')
    writeFileSync(file, 'body')

    await expect(
      prepareCodeSessionRuntime(file, 'session-1', {
        isPathTrusted: () => true,
      }),
    ).rejects.toThrow(/directory/i)
    await expect(
      prepareCodeSessionRuntime(workspace, 'session-1', {
        isPathTrusted: () => false,
      }),
    ).rejects.toThrow(/trusted/i)
    await expect(
      prepareCodeSessionRuntime(workspace, 'session-1', {
        isPathTrusted: () => true,
      }),
    ).resolves.toEqual({
      directory: realpathSync(workspace),
      artifactDirectory: join(
        realpathSync(workspace),
        '.real-agentc',
        'sessions',
        'session-1',
      ),
    })
  })

  test('creates each Chat session in an isolated platform scratch root', async () => {
    const home = makeTempRoot('chat-home-')
    const first = await createChatDataRoot('session-1', home)
    const second = await createChatDataRoot('session-2', home)

    expect(first).toBe(join(home, '.real-agentc', 'chat-sessions', 'session-1'))
    expect(second).toBe(
      join(home, '.real-agentc', 'chat-sessions', 'session-2'),
    )
    expect(first).not.toBe(second)
    expect(await listRemoteDirectory(first)).toEqual({
      path: realpathSync(first),
      entries: [
        { name: 'downloads', kind: 'directory' },
        { name: 'temp', kind: 'directory' },
      ],
    })
  })
})
