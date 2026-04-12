// Host dependency injection interfaces
// The MCP client package uses these interfaces to decouple from host infrastructure.

/** Logging interface */
export interface Logger {
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}

/** Analytics/telemetry callback */
export interface AnalyticsSink {
  trackEvent(event: string, metadata: Record<string, unknown>): void
}

/** Feature flag check */
export interface FeatureGate {
  isEnabled(flag: string): boolean
}

/** OAuth token provider */
export interface AuthProvider {
  getTokens(): Promise<{ accessToken: string } | null>
  refreshTokens(): Promise<void>
  handleOAuthError?(error: unknown): Promise<void>
}

/** HTTP/WebSocket proxy configuration */
export interface ProxyConfig {
  getFetchOptions?(): Record<string, unknown>
  getWebSocketAgent?(url: string): unknown
  getWebSocketUrl?(url: string): string | undefined
  getTLSOptions?(): Record<string, unknown> | undefined
}

/** Binary/image content persistence */
export interface ContentStorage {
  persistBinaryContent(data: Buffer, ext: string): Promise<string>
  persistToolResult?(toolUseId: string, content: unknown): Promise<void>
}

/** Image processing (resize, downsample) */
export interface ImageProcessor {
  resizeAndDownsample?(buffer: Buffer): Promise<Buffer>
}

/** HTTP configuration (user agent, session ID) */
export interface HttpConfig {
  getUserAgent(): string
  getSessionId?(): string
}

/** Subprocess environment variable provider */
export interface SubprocessEnvProvider {
  getEnv(additional?: Record<string, string>): Record<string, string>
}

/**
 * Complete set of host dependencies required by the MCP client.
 * All fields except `logger` and `httpConfig` are optional —
 * the client degrades gracefully when they're not provided.
 */
export interface McpClientDependencies {
  logger: Logger
  analytics?: AnalyticsSink
  featureGate?: FeatureGate
  auth?: AuthProvider
  proxy?: ProxyConfig
  storage?: ContentStorage
  imageProcessor?: ImageProcessor
  httpConfig: HttpConfig
  subprocessEnv?: SubprocessEnvProvider
}
