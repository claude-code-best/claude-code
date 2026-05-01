export { BridgeClient, createBridgeClient } from './bridgeClient.js'
export { BROWSER_TOOLS } from './browserTools.js'
export {
  createChromeSocketClient,
  createClaudeForChromeMcpServer,
} from './mcpServer.js'
export { localPlatformLabel } from './types.js'
export type {
  BridgeConfig,
  ChromeExtensionInfo,
  ClaudeForChromeContext,
  Logger,
  PermissionMode,
  SocketClient,
} from './types.js'
