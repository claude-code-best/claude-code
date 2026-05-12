/**
 * WebSocket bridge client for the Chrome extension MCP server.
 * Communicates with the Chrome extension via the office bridge server's /chrome path.
 */

import WebSocket from 'ws'

import { SocketConnectionError } from './mcpSocketClient.js'
import {
  localPlatformLabel,
  type BridgePermissionRequest,
  type ChromeExtensionInfo,
  type ClaudeForChromeContext,
  type PermissionMode,
  type PermissionOverrides,
  type SocketClient,
} from './types.js'

/** Timeout for list_extensions response from the bridge. */
const DISCOVERY_TIMEOUT_MS = 5000

/** How long to wait for a peer_connected event when 0 extensions are found. */
const PEER_WAIT_TIMEOUT_MS = 10_000

interface PendingToolCall {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: NodeJS.Timeout
  results: unknown[]
  isTabsContext: boolean
  onPermissionRequest?: (request: BridgePermissionRequest) => Promise<boolean>
  startTime: number
  toolName: string
}

export class BridgeClient implements SocketClient {
  private ws: WebSocket | null = null
  private connected = false
  private authenticated = false
  private connecting = false
  private reconnectTimer: NodeJS.Timeout | null = null
  private reconnectAttempts = 0
  private pendingCalls = new Map<string, PendingToolCall>()
  private notificationHandler:
    | ((notification: {
        method: string
        params?: Record<string, unknown>
      }) => void)
    | null = null
  private context: ClaudeForChromeContext
  private permissionMode: PermissionMode = 'ask'
  private allowedDomains: string[] | undefined
  private tabsContextCollectionTimeoutMs = 2000
  private toolCallTimeoutMs = 120_000
  private connectionStartTime: number | null = null
  private connectionEstablishedTime: number | null = null
  /** The device_id of the selected Chrome extension for targeted routing. */
  private selectedDeviceId: string | undefined
  /** True after first discovery attempt completes (success or timeout). */
  private discoveryComplete = false
  /** Shared promise so concurrent callTool invocations join the same discovery. */
  private discoveryPromise: Promise<void> | null = null
  /** Pending discovery response from bridge. */
  private pendingDiscovery: {
    resolve: (extensions: ChromeExtensionInfo[]) => void
    timeout: NodeJS.Timeout
  } | null = null
  /** The device_id we had selected before a peer_disconnected — for auto-reselect. */
  private previousSelectedDeviceId: string | undefined
  /** Callbacks waiting for the next peer_connected event. Receives `true` on peer arrival, `false` on abort. */
  private peerConnectedWaiters: Array<(arrived: boolean) => void> = []
  /** The request_id of the current pending pairing broadcast. */
  private pendingPairingRequestId: string | undefined
  /** Whether a pairing broadcast is in progress (multiple extensions, no persisted selection). */
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: state flag — written in multiple places, read planned for future routing logic
  private pairingInProgress = false
  /** The deviceId from a previous persisted pairing. */
  private persistedDeviceId: string | undefined
  /** Resolve callback for a blocking switchBrowser() call. */
  private pendingSwitchResolve:
    | ((result: { deviceId: string; name: string } | null) => void)
    | null = null

  constructor(context: ClaudeForChromeContext) {
    this.context = context
    if (context.initialPermissionMode) {
      this.permissionMode = context.initialPermissionMode
    }
  }

  public async ensureConnected(): Promise<boolean> {
    const { logger, serverName } = this.context
    logger.info(
      `[${serverName}] ensureConnected called, connected=${this.connected}, authenticated=${this.authenticated}, wsState=${this.ws?.readyState}`,
    )

    if (
      this.connected &&
      this.authenticated &&
      this.ws?.readyState === WebSocket.OPEN
    ) {
      logger.info(`[${serverName}] Already connected and authenticated`)
      return true
    }

    if (!this.connecting) {
      logger.info(`[${serverName}] Not connecting, starting connection...`)
      await this.connect()
    } else {
      logger.info(`[${serverName}] Already connecting, waiting...`)
    }

    // Wait for authentication with timeout
    return new Promise(resolve => {
      const timeout = setTimeout(() => {
        logger.info(
          `[${serverName}] Connection timeout, connected=${this.connected}, authenticated=${this.authenticated}`,
        )
        resolve(false)
      }, 10_000)
      const check = () => {
        if (this.connected && this.authenticated) {
          logger.info(`[${serverName}] Connection successful`)
          clearTimeout(timeout)
          resolve(true)
        } else if (!this.connecting) {
          logger.info(`[${serverName}] No longer connecting, giving up`)
          clearTimeout(timeout)
          resolve(false)
        } else {
          setTimeout(check, 200)
        }
      }
      check()
    })
  }

  public async callTool(
    name: string,
    args: Record<string, unknown>,
    permissionOverrides?: PermissionOverrides,
  ): Promise<unknown> {
    const { logger, serverName, trackEvent } = this.context

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new SocketConnectionError(`[${serverName}] Bridge not connected`)
    }

    // Lazy discovery: run on first tool call if no extension selected yet.
    // Use a shared promise so concurrent callers join the same discovery.
    if (!this.selectedDeviceId && !this.discoveryComplete) {
      this.discoveryPromise ??= this.discoverAndSelectExtension().finally(
        () => {
          this.discoveryPromise = null
        },
      )
      await this.discoveryPromise
    }

    // TODO: Once all extensions support pairing, throw here for multi-extension
    // cases where pairingInProgress is true. For now, let the bridge handle
    // routing — it auto-routes to a single extension or returns an error for
    // multiple extensions without a target_device_id.

    const toolUseId = crypto.randomUUID()
    const isTabsContext = name === 'tabs_context_mcp'
    const startTime = Date.now()
    const timeoutMs = isTabsContext
      ? this.tabsContextCollectionTimeoutMs
      : this.toolCallTimeoutMs

    // Track tool call start
    trackEvent?.('chrome_bridge_tool_call_started', {
      tool_name: name,
      tool_use_id: toolUseId,
    })

    // Per-call overrides (from session context) take priority over
    // instance values (from set_permission_mode on the singleton).
    const effectivePermissionMode =
      permissionOverrides?.permissionMode ?? this.permissionMode
    const effectiveAllowedDomains =
      permissionOverrides?.allowedDomains ?? this.allowedDomains

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const pending = this.pendingCalls.get(toolUseId)
        if (pending) {
          this.pendingCalls.delete(toolUseId)
          const durationMs = Date.now() - pending.startTime

          if (isTabsContext && pending.results.length > 0) {
            // For tabs_context, resolve with collected results even on timeout
            trackEvent?.('chrome_bridge_tool_call_completed', {
              tool_name: name,
              tool_use_id: toolUseId,
              duration_ms: durationMs,
            })
            resolve(this.mergeTabsResults(pending.results))
          } else {
            logger.warn(
              `[${serverName}] Tool call timeout: ${name} (${toolUseId.slice(0, 8)}) after ${durationMs}ms, pending calls: ${this.pendingCalls.size}`,
            )
            trackEvent?.('chrome_bridge_tool_call_timeout', {
              tool_name: name,
              tool_use_id: toolUseId,
              duration_ms: durationMs,
              timeout_ms: timeoutMs,
            })
            reject(
              new SocketConnectionError(
                `[${serverName}] Tool call timed out: ${name}`,
              ),
            )
          }
        }
      }, timeoutMs)

      this.pendingCalls.set(toolUseId, {
        resolve,
        reject,
        timer,
        results: [],
        isTabsContext,
        onPermissionRequest: permissionOverrides?.onPermissionRequest,
        startTime,
        toolName: name,
      })

      const message: Record<string, unknown> = {
        type: 'tool_call',
        tool_use_id: toolUseId,
        client_type: this.context.clientTypeId,
        tool: name,
        args,
      }

      // Target the selected extension for routing
      if (this.selectedDeviceId) {
        message.target_device_id = this.selectedDeviceId
      }

      // Only include permission fields when a value exists.
      // Priority: per-call override (from session context) > instance value (from set_permission_mode).
      if (effectivePermissionMode) {
        message.permission_mode = effectivePermissionMode
      }
      if (effectiveAllowedDomains?.length) {
        message.allowed_domains = effectiveAllowedDomains
      }
      if (permissionOverrides?.onPermissionRequest) {
        message.handle_permission_prompts = true
      }

      logger.debug(
        `[${serverName}] Sending tool_call: ${name} (${toolUseId.slice(0, 8)})`,
      )
      this.ws!.send(JSON.stringify(message))
    })
  }

  public isConnected(): boolean {
    return (
      this.connected &&
      this.authenticated &&
      this.ws?.readyState === WebSocket.OPEN
    )
  }

  public disconnect(): void {
    this.cleanup()
  }

  public setNotificationHandler(
    handler: (notification: {
      method: string
      params?: Record<string, unknown>
    }) => void,
  ): void {
    this.notificationHandler = handler
  }

  public async setPermissionMode(
    mode: PermissionMode,
    allowedDomains?: string[],
  ): Promise<void> {
    this.permissionMode = mode
    this.allowedDomains = allowedDomains
  }

  // ===========================================================================
  // Extension discovery and selection
  // ===========================================================================

  /**
   * Discover connected extensions and auto-select one, or broadcast a pairing request.
   * Called lazily on the first tool call.
   */
  private async discoverAndSelectExtension(): Promise<void> {
    const { logger, serverName } = this.context

    this.persistedDeviceId ??= this.context.getPersistedDeviceId?.()

    let extensions = await this.queryBridgeExtensions()

    if (extensions.length === 0) {
      logger.info(
        `[${serverName}] No extensions connected, waiting up to ${PEER_WAIT_TIMEOUT_MS}ms for peer_connected`,
      )
      const peerArrived = await this.waitForPeerConnected(PEER_WAIT_TIMEOUT_MS)
      if (peerArrived) {
        extensions = await this.queryBridgeExtensions()
      }
    }

    this.discoveryComplete = true

    if (extensions.length === 0) {
      // Still nothing — callTool will throw a clear error
      logger.info(`[${serverName}] No extensions found after waiting`)
      return
    }

    // Single extension: auto-select silently
    if (extensions.length === 1) {
      const ext = extensions[0]!
      if (!this.isLocalExtension(ext)) {
        this.context.onRemoteExtensionWarning?.(ext)
      }
      this.selectExtension(ext.deviceId)
      return
    }

    // Multiple extensions: check for persisted selection
    if (this.persistedDeviceId) {
      const persisted = extensions.find(
        e => e.deviceId === this.persistedDeviceId,
      )
      if (persisted) {
        logger.info(
          `[${serverName}] Auto-connecting to persisted extension: ${persisted.name || persisted.deviceId.slice(0, 8)}`,
        )
        this.selectExtension(persisted.deviceId)
        return
      }
    }

    // Multiple extensions, no valid persisted selection: broadcast and fail fast
    this.broadcastPairingRequest()
    this.pairingInProgress = true
  }

  /**
   * Query the bridge for connected extensions. Returns empty array on timeout.
   * Deduplicates by deviceId, keeping the most recent connection — the bridge
   * may report stale duplicates (e.g. after a service worker restart).
   */
  private async queryBridgeExtensions(): Promise<ChromeExtensionInfo[]> {
    const raw: ChromeExtensionInfo[] = await new Promise(resolve => {
      const timeout = setTimeout(() => {
        this.pendingDiscovery = null
        resolve([])
      }, DISCOVERY_TIMEOUT_MS)

      this.pendingDiscovery = { resolve, timeout }
      this.ws?.send(JSON.stringify({ type: 'list_extensions' }))
    })

    const byDeviceId = new Map<string, ChromeExtensionInfo>()
    for (const ext of raw) {
      const existing = byDeviceId.get(ext.deviceId)
      if (!existing || ext.connectedAt > existing.connectedAt) {
        byDeviceId.set(ext.deviceId, ext)
      }
    }
    return [...byDeviceId.values()]
  }

  /**
   * Select an extension by device ID for per-message targeted routing.
   */
  private selectExtension(deviceId: string): void {
    const { logger, serverName } = this.context
    this.selectedDeviceId = deviceId
    this.previousSelectedDeviceId = undefined
    logger.info(
      `[${serverName}] Selected Chrome extension: ${deviceId.slice(0, 8)}...`,
    )
  }

  /**
   * Check if an extension might be on the same machine as this MCP client
   * by comparing OS platform. Extensions can't provide a real hostname from
   * the service worker sandbox, so platform is a weak heuristic. The profile
   * email is the primary differentiator shown in the selection dialog.
   */
  private isLocalExtension(ext: ChromeExtensionInfo): boolean {
    if (!ext.osPlatform) return false
    return ext.osPlatform === localPlatformLabel()
  }

  /**
   * Returns a promise that resolves to `true` when a peer_connected event
   * fires, or `false` if the timeout elapses first.
   */
  private waitForPeerConnected(timeoutMs: number): Promise<boolean> {
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        this.peerConnectedWaiters = this.peerConnectedWaiters.filter(
          w => w !== onPeer,
        )
        resolve(false)
      }, timeoutMs)

      const onPeer = (arrived: boolean) => {
        clearTimeout(timer)
        resolve(arrived)
      }

      this.peerConnectedWaiters.push(onPeer)
    })
  }

  /**
   * Broadcast a pairing request to all connected extensions.
   * Non-blocking — the pairing_response handler will select the extension.
   */
  private broadcastPairingRequest(): void {
    const requestId = crypto.randomUUID()
    this.pendingPairingRequestId = requestId
    this.ws?.send(
      JSON.stringify({
        type: 'pairing_request',
        request_id: requestId,
        client_type: this.context.clientTypeId,
      }),
    )
  }

  /**
   * Switch to a different browser. Broadcasts a pairing request and blocks
   * until a response arrives or timeout (120s). Returns the paired extension
   * info, or null on timeout.
   */
  public async switchBrowser(): Promise<
    | {
        deviceId: string
        name: string
      }
    | 'no_other_browsers'
    | null
  > {
    const extensions = await this.queryBridgeExtensions()
    const currentDeviceId =
      this.selectedDeviceId ?? this.previousSelectedDeviceId
    if (
      extensions.length === 0 ||
      (extensions.length === 1 &&
        (!currentDeviceId || extensions[0]!.deviceId === currentDeviceId))
    ) {
      return 'no_other_browsers'
    }

    this.previousSelectedDeviceId = this.selectedDeviceId
    this.selectedDeviceId = undefined
    this.discoveryComplete = false
    this.pairingInProgress = false

    const requestId = crypto.randomUUID()
    this.pendingPairingRequestId = requestId
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return null
    }
    this.ws.send(
      JSON.stringify({
        type: 'pairing_request',
        request_id: requestId,
        client_type: this.context.clientTypeId,
      }),
    )

    // Resolve any previous pending switch so the caller doesn't hang forever
    if (this.pendingSwitchResolve) {
      this.pendingSwitchResolve(null)
    }

    // Block for switch_browser since user is actively engaged
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        if (this.pendingPairingRequestId === requestId) {
          this.pendingPairingRequestId = undefined
        }
        this.pendingSwitchResolve = null
        resolve(null)
      }, 120_000)

      this.pendingSwitchResolve = result => {
        clearTimeout(timer)
        this.pendingSwitchResolve = null
        resolve(result)
      }
    })
  }

  private async connect(): Promise<void> {
    const { logger, serverName, bridgeConfig, trackEvent } = this.context

    if (!bridgeConfig) {
      logger.error(`[${serverName}] No bridge config provided`)
      return
    }

    if (this.connecting) {
      return
    }

    this.connecting = true
    this.authenticated = false
    this.connectionStartTime = Date.now()
    this.closeSocket()

    // Get user ID for the connection path
    let userId: string
    let token: string | undefined

    if (bridgeConfig.devUserId) {
      userId = bridgeConfig.devUserId
      logger.debug(`[${serverName}] Using dev user ID for bridge connection`)
    } else {
      logger.debug(`[${serverName}] Fetching user ID for bridge connection`)
      const fetchedUserId = await bridgeConfig.getUserId()
      if (!fetchedUserId) {
        const durationMs = Date.now() - this.connectionStartTime
        logger.error(
          `[${serverName}] No user ID available after ${durationMs}ms`,
        )
        trackEvent?.('chrome_bridge_connection_failed', {
          duration_ms: durationMs,
          error_type: 'no_user_id',
          reconnect_attempt: this.reconnectAttempts,
        })
        this.connecting = false
        this.context.onAuthenticationError?.()
        return
      }
      userId = fetchedUserId

      logger.debug(`[${serverName}] Fetching OAuth token for bridge connection`)
      token = await bridgeConfig.getOAuthToken()
      if (!token) {
        const durationMs = Date.now() - this.connectionStartTime
        logger.error(
          `[${serverName}] No OAuth token available after ${durationMs}ms`,
        )
        trackEvent?.('chrome_bridge_connection_failed', {
          duration_ms: durationMs,
          error_type: 'no_oauth_token',
          reconnect_attempt: this.reconnectAttempts,
        })
        this.connecting = false
        this.context.onAuthenticationError?.()
        return
      }
    }

    // Connect to user-specific endpoint: /chrome/<user_id>
    const wsUrl = `${bridgeConfig.url}/chrome/${userId}`
    logger.info(`[${serverName}] Connecting to bridge: ${wsUrl}`)

    // Track connection started
    trackEvent?.('chrome_bridge_connection_started', {
      bridge_url: wsUrl,
    })

    try {
      this.ws = new WebSocket(wsUrl)
    } catch (error) {
      const durationMs = Date.now() - this.connectionStartTime
      logger.error(
        `[${serverName}] Failed to create WebSocket after ${durationMs}ms:`,
        error,
      )
      trackEvent?.('chrome_bridge_connection_failed', {
        duration_ms: durationMs,
        error_type: 'websocket_error',
        reconnect_attempt: this.reconnectAttempts,
      })
      this.connecting = false
      this.scheduleReconnect()
      return
    }

    this.ws.on('open', () => {
      logger.info(
        `[${serverName}] WebSocket connected, sending connect message`,
      )

      // First message must be connect (same format as office path)
      const connectMessage: Record<string, unknown> = {
        type: 'connect',
        client_type: this.context.clientTypeId,
      }

      if (bridgeConfig.devUserId) {
        connectMessage.dev_user_id = bridgeConfig.devUserId
      } else {
        connectMessage.oauth_token = token
      }

      this.ws?.send(JSON.stringify(connectMessage))
    })

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString()) as Record<string, unknown>
        logger.debug(
          `[${serverName}] Bridge received: ${JSON.stringify(message)}`,
        )
        this.handleMessage(message)
      } catch (error) {
        logger.error(`[${serverName}] Failed to parse bridge message:`, error)
      }
    })

    this.ws.on('close', (code: number) => {
      const durationSinceConnect = this.connectionEstablishedTime
        ? Date.now() - this.connectionEstablishedTime
        : 0
      logger.info(
        `[${serverName}] Bridge connection closed (code: ${code}, duration: ${durationSinceConnect}ms)`,
      )
      trackEvent?.('chrome_bridge_disconnected', {
        close_code: code,
        duration_since_connect_ms: durationSinceConnect,
        reconnect_attempt: this.reconnectAttempts + 1,
      })
      this.connected = false
      this.authenticated = false
      this.connecting = false
      this.connectionEstablishedTime = null
      this.scheduleReconnect()
    })

    this.ws.on('error', (error: Error) => {
      const durationMs = this.connectionStartTime
        ? Date.now() - this.connectionStartTime
        : 0
      logger.error(
        `[${serverName}] Bridge WebSocket error after ${durationMs}ms: ${error.message}`,
      )
      trackEvent?.('chrome_bridge_connection_failed', {
        duration_ms: durationMs,
        error_type: 'websocket_error',
        reconnect_attempt: this.reconnectAttempts,
      })
      this.connected = false
      this.authenticated = false
      this.connecting = false
    })
  }

  private handleMessage(message: Record<string, unknown>): void {
    const { logger, serverName, trackEvent } = this.context

    switch (message.type) {
      case 'paired': {
        const durationMs = this.connectionStartTime
          ? Date.now() - this.connectionStartTime
          : 0
        logger.info(
          `[${serverName}] Paired with Chrome extension (duration: ${durationMs}ms)`,
        )
        this.connected = true
        this.authenticated = true
        this.connecting = false
        this.reconnectAttempts = 0
        this.connectionEstablishedTime = Date.now()
        trackEvent?.('chrome_bridge_connection_succeeded', {
          duration_ms: durationMs,
          status: 'paired',
        })
        break
      }

      case 'waiting': {
        const durationMs = this.connectionStartTime
          ? Date.now() - this.connectionStartTime
          : 0
        logger.info(
          `[${serverName}] Waiting for Chrome extension to connect (duration: ${durationMs}ms)`,
        )
        this.connected = true
        this.authenticated = true
        this.connecting = false
        this.reconnectAttempts = 0
        this.connectionEstablishedTime = Date.now()
        trackEvent?.('chrome_bridge_connection_succeeded', {
          duration_ms: durationMs,
          status: 'waiting',
        })
        break
      }

      case 'peer_connected':
        logger.info(`[${serverName}] Chrome extension connected to bridge`)
        trackEvent?.('chrome_bridge_peer_connected', null)
        // If no extension selected, mark discovery as needed (next tool call will discover)
        if (!this.selectedDeviceId) {
          this.discoveryComplete = false
        }
        // Auto-reselect if the previously selected extension reconnected (e.g., service worker restart)
        if (
          this.previousSelectedDeviceId &&
          message.deviceId === this.previousSelectedDeviceId &&
          !this.pendingSwitchResolve
        ) {
          logger.info(
            `[${serverName}] Previously selected extension reconnected, auto-reselecting`,
          )
          this.selectExtension(this.previousSelectedDeviceId)
          this.previousSelectedDeviceId = undefined
        }
        if (this.peerConnectedWaiters.length > 0) {
          const waiters = this.peerConnectedWaiters
          this.peerConnectedWaiters = []
          for (const waiter of waiters) {
            waiter(true)
          }
        }
        break

      case 'peer_disconnected':
        logger.info(`[${serverName}] Chrome extension disconnected from bridge`)
        trackEvent?.('chrome_bridge_peer_disconnected', null)
        // If the selected extension disconnected, clear selection for re-discovery
        if (message.deviceId && message.deviceId === this.selectedDeviceId) {
          logger.info(
            `[${serverName}] Selected extension disconnected, clearing selection`,
          )
          this.previousSelectedDeviceId = this.selectedDeviceId
          this.selectedDeviceId = undefined
          this.discoveryComplete = false
        }
        break

      case 'extensions_list':
        // Response to list_extensions — resolve pending discovery
        if (this.pendingDiscovery) {
          clearTimeout(this.pendingDiscovery.timeout)
          this.pendingDiscovery.resolve(
            (message.extensions as ChromeExtensionInfo[]) ?? [],
          )
          this.pendingDiscovery = null
        }
        break

      case 'pairing_response': {
        const requestId = message.request_id as string
        const responseDeviceId = message.device_id as string
        const responseName = message.name as string
        if (
          this.pendingPairingRequestId === requestId &&
          responseDeviceId &&
          responseName
        ) {
          this.pendingPairingRequestId = undefined
          this.pairingInProgress = false
          this.selectExtension(responseDeviceId)
          this.context.onExtensionPaired?.(responseDeviceId, responseName)
          logger.info(
            `[${serverName}] Paired with "${responseName}" (${responseDeviceId.slice(0, 8)})`,
          )
          if (this.pendingSwitchResolve) {
            this.pendingSwitchResolve({
              deviceId: responseDeviceId,
              name: responseName,
            })
            this.pendingSwitchResolve = null
          }
        }
        break
      }

      case 'ping':
        this.ws?.send(JSON.stringify({ type: 'pong' }))
        break

      case 'pong':
        // Response to our keepalive, nothing to do
        break

      case 'tool_result':
        this.handleToolResult(message)
        break

      case 'permission_request':
        void this.handlePermissionRequest(message)
        break

      case 'notification':
        if (this.notificationHandler) {
          this.notificationHandler({
            method: message.method as string,
            params: message.params as Record<string, unknown> | undefined,
          })
        }
        break

      case 'error':
        logger.warn(`[${serverName}] Bridge error: ${message.error}`)
        // If we had a selected extension, the error may indicate it's gone
        // (e.g., extension disconnected between list and select). Clear state
        // so the next tool call re-discovers.
        if (this.selectedDeviceId) {
          this.selectedDeviceId = undefined
          this.discoveryComplete = false
        }
        break

      default:
        logger.warn(
          `[${serverName}] Unrecognized bridge message type: ${message.type}`,
        )
    }
  }

  private async handlePermissionRequest(
    message: Record<string, unknown>,
  ): Promise<void> {
    const { logger, serverName } = this.context
    const toolUseId = message.tool_use_id as string
    const requestId = message.request_id as string

    if (!toolUseId || !requestId) {
      logger.warn(
        `[${serverName}] permission_request missing tool_use_id or request_id`,
      )
      return
    }

    const pending = this.pendingCalls.get(toolUseId)
    if (!pending?.onPermissionRequest) {
      // Don't auto-deny — the bridge broadcasts permission_request to all
      // connected MCP clients, and only the client that made the tool call
      // has the pending entry. Auto-denying here would race with the correct
      // client's handler when multiple Desktop instances are connected.
      logger.debug(
        `[${serverName}] Ignoring permission_request for unknown tool_use_id ${toolUseId.slice(0, 8)} (not our call)`,
      )
      return
    }

    const request: BridgePermissionRequest = {
      toolUseId,
      requestId,
      toolType: (message.tool_type as string) ?? 'unknown',
      url: (message.url as string) ?? '',
      actionData: message.action_data as Record<string, unknown> | undefined,
    }

    try {
      const allowed = await pending.onPermissionRequest(request)
      this.sendPermissionResponse(requestId, allowed)
    } catch (error) {
      logger.error(`[${serverName}] Error handling permission request:`, error)
      this.sendPermissionResponse(requestId, false)
    }
  }

  private sendPermissionResponse(requestId: string, allowed: boolean): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const message: Record<string, unknown> = {
        type: 'permission_response',
        request_id: requestId,
        allowed,
      }
      if (this.selectedDeviceId) {
        message.target_device_id = this.selectedDeviceId
      }
      this.ws.send(JSON.stringify(message))
    }
  }

  private handleToolResult(message: Record<string, unknown>): void {
    const { logger, serverName, trackEvent } = this.context
    const toolUseId = message.tool_use_id as string
    if (!toolUseId) {
      logger.warn(`[${serverName}] Received tool_result without tool_use_id`)
      return
    }

    const pending = this.pendingCalls.get(toolUseId)
    if (!pending) {
      logger.debug(
        `[${serverName}] Received tool_result for unknown call: ${toolUseId.slice(0, 8)}`,
      )
      return
    }

    const durationMs = Date.now() - pending.startTime

    // Normalize bridge response format to match socket client format.
    // Bridge sends: { type, tool_use_id, content: [...], is_error?: boolean }
    // Socket sends: { result: { content: [...] } } or { error: { content: [...] } }
    const normalized = this.normalizeBridgeResponse(message)
    const isError = Boolean(message.is_error) || 'error' in normalized

    if (pending.isTabsContext && !this.selectedDeviceId) {
      // No extension selected: collect results from all extensions (pre-selection / backward compat)
      pending.results.push(normalized)
      // Don't resolve yet — let the timer handle collection
    } else {
      // For other tools, resolve on first result
      clearTimeout(pending.timer)
      this.pendingCalls.delete(toolUseId)

      if (isError) {
        // Extract error message for telemetry
        const errorContent = (normalized as { error?: { content?: unknown[] } })
          .error?.content
        let errorMessage = 'Unknown error'
        if (Array.isArray(errorContent)) {
          const textItem = errorContent.find(
            item => typeof item === 'object' && item !== null && 'text' in item,
          ) as { text?: string } | undefined
          if (textItem?.text) {
            errorMessage = textItem.text.slice(0, 200)
          }
        }

        logger.warn(
          `[${serverName}] Tool call error: ${pending.toolName} (${toolUseId.slice(0, 8)}) after ${durationMs}ms`,
        )
        trackEvent?.('chrome_bridge_tool_call_error', {
          tool_name: pending.toolName,
          tool_use_id: toolUseId,
          duration_ms: durationMs,
          error_message: errorMessage,
        })
      } else {
        logger.debug(
          `[${serverName}] Tool call completed: ${pending.toolName} (${toolUseId.slice(0, 8)}) in ${durationMs}ms`,
        )
        trackEvent?.('chrome_bridge_tool_call_completed', {
          tool_name: pending.toolName,
          tool_use_id: toolUseId,
          duration_ms: durationMs,
        })
      }

      pending.resolve(normalized)
    }
  }

  private normalizeBridgeResponse(
    message: Record<string, unknown>,
  ): Record<string, unknown> {
    // Already has result/error wrapper (socket format) — pass through
    if (message.result || message.error) {
      return message
    }

    // Bridge format has content at top level — wrap it
    if (message.content) {
      if (message.is_error) {
        return { error: { content: message.content } }
      }
      return { result: { content: message.content } }
    }

    return message
  }

  private mergeTabsResults(results: unknown[]): unknown {
    const mergedTabs: unknown[] = []

    for (const result of results) {
      const msg = result as Record<string, unknown>
      const resultData = msg.result as
        | { content?: Array<{ type: string; text?: string }> }
        | undefined
      const content = resultData?.content

      if (!content || !Array.isArray(content)) continue

      for (const item of content) {
        if (item.type === 'text' && item.text) {
          try {
            const parsed = JSON.parse(item.text)
            if (Array.isArray(parsed)) {
              mergedTabs.push(...parsed)
            } else if (
              parsed?.availableTabs &&
              Array.isArray(parsed.availableTabs)
            ) {
              mergedTabs.push(...parsed.availableTabs)
            }
          } catch {
            // Not JSON, skip
          }
        }
      }
    }

    if (mergedTabs.length > 0) {
      const tabListText = mergedTabs
        .map(t => {
          const tab = t as { tabId: number; title: string; url: string }
          return `  \u2022 tabId ${tab.tabId}: "${tab.title}" (${tab.url})`
        })
        .join('\n')

      return {
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ availableTabs: mergedTabs }),
            },
            {
              type: 'text',
              text: `\n\nTab Context:\n- Available tabs:\n${tabListText}`,
            },
          ],
        },
      }
    }

    // Return first result as fallback
    return results[0]
  }

  private scheduleReconnect(): void {
    const { logger, serverName, trackEvent } = this.context

    if (this.reconnectTimer) return

    this.reconnectAttempts++

    if (this.reconnectAttempts > 100) {
      logger.warn(
        `[${serverName}] Giving up bridge reconnection after 100 attempts`,
      )
      trackEvent?.('chrome_bridge_reconnect_exhausted', {
        total_attempts: 100,
      })
      this.reconnectAttempts = 0
      return
    }

    const delay = Math.min(2000 * 1.5 ** (this.reconnectAttempts - 1), 30_000)

    if (this.reconnectAttempts <= 10 || this.reconnectAttempts % 10 === 0) {
      logger.info(
        `[${serverName}] Bridge reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts})`,
      )
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.connect()
    }, delay)
  }

  private closeSocket(): void {
    if (this.ws) {
      this.ws.removeAllListeners()
      this.ws.close()
      this.ws = null
    }
    this.connected = false
    this.authenticated = false
    // Clear extension selection state so reconnections start fresh
    this.selectedDeviceId = undefined
    this.discoveryComplete = false
    this.pendingPairingRequestId = undefined
    this.pairingInProgress = false
    if (this.pendingSwitchResolve) {
      this.pendingSwitchResolve(null)
      this.pendingSwitchResolve = null
    }
    if (this.pendingDiscovery) {
      clearTimeout(this.pendingDiscovery.timeout)
      this.pendingDiscovery.resolve([])
      this.pendingDiscovery = null
    }
    // Unblock any in-progress waitForPeerConnected so it doesn't hang until its timeout
    if (this.peerConnectedWaiters.length > 0) {
      const waiters = this.peerConnectedWaiters
      this.peerConnectedWaiters = []
      for (const waiter of waiters) {
        waiter(false)
      }
    }
  }

  private cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    // Reject all pending calls
    for (const [id, pending] of this.pendingCalls) {
      clearTimeout(pending.timer)
      pending.reject(new SocketConnectionError('Bridge client disconnected'))
      this.pendingCalls.delete(id)
    }

    this.closeSocket()
    this.reconnectAttempts = 0
  }
}

export function createBridgeClient(
  context: ClaudeForChromeContext,
): BridgeClient {
  return new BridgeClient(context)
}
