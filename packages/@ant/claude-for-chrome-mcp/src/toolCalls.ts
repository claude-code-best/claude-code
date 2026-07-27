import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { SocketConnectionError } from './mcpSocketClient.js'
import type {
  ClaudeForChromeContext,
  PermissionMode,
  PermissionOverrides,
  SocketClient,
} from './types.js'
import { toLoggerDetail } from './types.js'

export const handleToolCall = async (
  context: ClaudeForChromeContext,
  socketClient: SocketClient,
  name: string,
  args: Record<string, unknown>,
  permissionOverrides?: PermissionOverrides,
): Promise<CallToolResult> => {
  // Handle permission mode changes locally (not forwarded to extension)
  if (name === 'set_permission_mode') {
    return handleSetPermissionMode(socketClient, args)
  }

  // Handle switch_browser outside the normal tool call flow (manages its own connection)
  if (name === 'switch_browser') {
    return handleSwitchBrowser(context, socketClient)
  }

  try {
    const isConnected = await socketClient.ensureConnected()

    context.logger.silly(
      `[${context.serverName}] Server is connected: ${isConnected}. Received tool call: ${name} with args: ${JSON.stringify(args)}.`,
    )

    if (isConnected) {
      return await handleToolCallConnected(
        context,
        socketClient,
        name,
        args,
        permissionOverrides,
      )
    }

    return handleToolCallDisconnected(context)
  } catch (error) {
    context.logger.info(
      `[${context.serverName}] Error calling tool:`,
      toLoggerDetail(error),
    )

    if (error instanceof SocketConnectionError) {
      return handleToolCallDisconnected(context)
    }

    return {
      content: [
        {
          type: 'text',
          text: `Error calling tool, please try again. : ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    }
  }
}

async function handleToolCallConnected(
  context: ClaudeForChromeContext,
  socketClient: SocketClient,
  name: string,
  args: Record<string, unknown>,
  permissionOverrides?: PermissionOverrides,
): Promise<CallToolResult> {
  const tracksCreatedTabs =
    Boolean(
      process.env.CLAUDE_CODE_BROWSER_SCOPE_ID &&
        process.env.CLAUDE_CODE_BROWSER_STATE_DIR,
    ) &&
    (name === 'tabs_create_mcp' ||
      (name === 'tabs_context_mcp' && args.createIfEmpty === true))
  let tabsBefore: Set<number> | null = null
  if (tracksCreatedTabs) {
    try {
      const snapshot = await socketClient.callTool(
        'tabs_context_mcp',
        { createIfEmpty: false },
        permissionOverrides,
      )
      tabsBefore =
        hasToolError(snapshot) || !hasToolResult(snapshot)
          ? null
          : collectTabIds(snapshot)
    } catch {
      // Without a reliable before-snapshot we cannot distinguish user tabs
      // from tabs created by this call, so fail closed and claim none.
      tabsBefore = null
    }
  }
  const response = await socketClient.callTool(name, args, permissionOverrides)

  if (tabsBefore && !hasToolError(response)) {
    const createdTabs = [...collectTabIds(response)]
      .filter(tabId => !tabsBefore.has(tabId))
      .flatMap(tabId => {
        const ownerId = socketClient.getTabOwnerIdentity?.(tabId)
        return ownerId ? [{ tabId, ownerId }] : []
      })
    await recordOwnedBrowserTabs(createdTabs)
  }

  context.logger.silly(
    `[${context.serverName}] Received result from socket bridge: ${JSON.stringify(response)}`,
  )

  if (response === null || response === undefined) {
    return {
      content: [{ type: 'text', text: 'Tool execution completed' }],
    }
  }

  // Response will have either result or error field
  const { result, error } = response as {
    result?: { content: unknown[] | string }
    error?: { content: unknown[] | string }
  }

  // Determine which field has the content and whether it's an error
  const contentData = error || result
  const isError = !!error

  if (!contentData) {
    return {
      content: [{ type: 'text', text: 'Tool execution completed' }],
    }
  }

  if (isError && isAuthenticationError(contentData.content)) {
    context.onAuthenticationError()
  }

  const { content } = contentData

  if (content && Array.isArray(content)) {
    if (isError) {
      return {
        content: content.map((item: unknown) => {
          if (typeof item === 'object' && item !== null && 'type' in item) {
            return item
          }

          return { type: 'text', text: String(item) }
        }),
        isError: true,
      } as CallToolResult
    }

    const convertedContent = content.map((item: unknown) => {
      if (
        typeof item === 'object' &&
        item !== null &&
        'type' in item &&
        'source' in item
      ) {
        const typedItem = item
        if (
          typedItem.type === 'image' &&
          typeof typedItem.source === 'object' &&
          typedItem.source !== null &&
          'data' in typedItem.source
        ) {
          return {
            type: 'image',
            data: typedItem.source.data,
            mimeType:
              'media_type' in typedItem.source
                ? typedItem.source.media_type || 'image/png'
                : 'image/png',
          }
        }
      }

      if (typeof item === 'object' && item !== null && 'type' in item) {
        return item
      }

      return { type: 'text', text: String(item) }
    })

    return {
      content: convertedContent,
      isError,
    } as CallToolResult
  }

  // Handle string content
  if (typeof content === 'string') {
    return {
      content: [{ type: 'text', text: content }],
      isError,
    } as CallToolResult
  }

  // Fallback for unexpected result format
  context.logger.warn(
    `[${context.serverName}] Unexpected result format from socket bridge: ${JSON.stringify(response)}`,
  )

  return {
    content: [{ type: 'text', text: JSON.stringify(response) }],
    isError,
  }
}

function handleToolCallDisconnected(
  context: ClaudeForChromeContext,
): CallToolResult {
  const text = context.onToolCallDisconnected()
  return {
    content: [{ type: 'text', text }],
  }
}

/**
 * Handle set_permission_mode tool call locally.
 * This is security-sensitive as it controls whether permission prompts are shown.
 */
async function handleSetPermissionMode(
  socketClient: SocketClient,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  // Validate permission mode at runtime
  const validModes = [
    'ask',
    'skip_all_permission_checks',
    'follow_a_plan',
  ] as const
  const mode = args.mode as string | undefined
  const permissionMode: PermissionMode =
    mode && validModes.includes(mode as PermissionMode)
      ? (mode as PermissionMode)
      : 'ask'

  if (socketClient.setPermissionMode) {
    await socketClient.setPermissionMode(
      permissionMode,
      args.allowed_domains as string[] | undefined,
    )
  }

  return {
    content: [
      { type: 'text', text: `Permission mode set to: ${permissionMode}` },
    ],
  }
}

/**
 * Handle switch_browser tool call. Broadcasts a pairing request and blocks
 * until a browser responds or timeout.
 */
async function handleSwitchBrowser(
  context: ClaudeForChromeContext,
  socketClient: SocketClient,
): Promise<CallToolResult> {
  if (!context.bridgeConfig) {
    return {
      content: [
        {
          type: 'text',
          text: 'Browser switching is only available with bridge connections.',
        },
      ],
      isError: true,
    }
  }

  const isConnected = await socketClient.ensureConnected()
  if (!isConnected) {
    return handleToolCallDisconnected(context)
  }

  const result = (await socketClient.switchBrowser?.()) ?? null

  if (result === 'no_other_browsers') {
    return {
      content: [
        {
          type: 'text',
          text: 'No other browsers available to switch to. Open Chrome with the Claude extension in another browser to switch.',
        },
      ],
      isError: true,
    }
  }

  if (result) {
    return {
      content: [
        { type: 'text', text: `Connected to browser "${result.name}".` },
      ],
    }
  }

  return {
    content: [
      {
        type: 'text',
        text: 'No browser responded within the timeout. Make sure Chrome is open with the Claude extension installed, then try again.',
      },
    ],
    isError: true,
  }
}

/**
 * Check if the error content indicates an authentication issue
 */
function isAuthenticationError(content: unknown[] | string): boolean {
  const errorText = Array.isArray(content)
    ? content
        .map(item => {
          if (typeof item === 'string') return item
          if (
            typeof item === 'object' &&
            item !== null &&
            'text' in item &&
            typeof item.text === 'string'
          ) {
            return item.text
          }
          return ''
        })
        .join(' ')
    : String(content)

  return errorText.toLowerCase().includes('re-authenticated')
}

const OWNED_TABS_FILE = 'browser-owned-tabs.json'
let ownedTabsWrite = Promise.resolve()

type OwnedBrowserTab = { tabId: number; ownerId: string }

function hasToolError(response: unknown): boolean {
  return Boolean(
    response && typeof response === 'object' && 'error' in response,
  )
}

function hasToolResult(response: unknown): boolean {
  return Boolean(
    response && typeof response === 'object' && 'result' in response,
  )
}

async function recordOwnedBrowserTabs(tabs: OwnedBrowserTab[]): Promise<void> {
  const scopeId = process.env.CLAUDE_CODE_BROWSER_SCOPE_ID
  const stateDirectory = process.env.CLAUDE_CODE_BROWSER_STATE_DIR
  if (!scopeId || !stateDirectory) return
  if (tabs.length === 0) return

  ownedTabsWrite = ownedTabsWrite.then(async () => {
    await mkdir(stateDirectory, { recursive: true })
    const path = join(stateDirectory, OWNED_TABS_FILE)
    let existing: OwnedBrowserTab[] = []
    try {
      const parsed = JSON.parse(await readFile(path, 'utf8')) as {
        scopeId?: unknown
        tabs?: unknown
      }
      if (parsed.scopeId === scopeId && Array.isArray(parsed.tabs)) {
        existing = parsed.tabs.filter((value): value is OwnedBrowserTab =>
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
      }
    } catch {
      // First owned tab for this session, or a stale/corrupt registry.
    }
    const nextByIdentity = new Map(
      [...existing, ...tabs].map(
        tab => [`${tab.ownerId}\u0000${tab.tabId}`, tab] as const,
      ),
    )
    const next = [...nextByIdentity.values()]
    const temporaryPath = `${path}.${process.pid}.tmp`
    await writeFile(
      temporaryPath,
      JSON.stringify({ scopeId, tabs: next }),
      'utf8',
    )
    await rename(temporaryPath, path)
  })
  await ownedTabsWrite
}

function collectTabIds(value: unknown, found = new Set<number>()): Set<number> {
  if (typeof value === 'string') {
    try {
      collectTabIds(JSON.parse(value), found)
    } catch {
      // Human-readable tool output is intentionally ignored.
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
