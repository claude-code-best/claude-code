// @claude-code-best/weixin — WeChat channel integration

// Types
export {
  MessageType,
  MessageItemType,
  MessageState,
  UploadMediaType,
  TypingStatus,
} from './types.js'
export type {
  BaseInfo,
  CDNMedia,
  TextItem,
  ImageItem,
  VoiceItem,
  FileItem,
  VideoItem,
  RefMessage,
  MessageItem,
  WeixinMessage,
  GetUpdatesReq,
  GetUpdatesResp,
  SendMessageReq,
  GetUploadUrlReq,
  GetUploadUrlResp,
  GetConfigResp,
  SendTypingReq,
  SendTypingResp,
} from './types.js'

// API client
export {
  getUpdates,
  sendMessage,
  getUploadUrl,
  getConfig,
  sendTyping,
} from './api.js'

// Account management
export {
  DEFAULT_BASE_URL,
  CDN_BASE_URL,
  getStateDir,
  loadAccount,
  saveAccount,
  clearAccount,
} from './accounts.js'
export type { AccountData } from './accounts.js'

// Login
export { startLogin, waitForLogin } from './login.js'
export type { QRCodeResult, LoginResult } from './login.js'

// Pairing / access control
export {
  loadAccessConfig,
  saveAccessConfig,
  isAllowed,
  addPendingPairing,
  confirmPairing,
} from './pairing.js'
export type { AccessConfig } from './pairing.js'

// Media encryption / upload
export {
  encryptAesEcb,
  decryptAesEcb,
  aesEcbPaddedSize,
  buildCdnDownloadUrl,
  buildCdnUploadUrl,
  parseAesKey,
  downloadAndDecrypt,
  uploadFile,
  guessMediaType,
  downloadRemoteToTemp,
} from './media.js'
export type { UploadedFileInfo } from './media.js'

// Message sending
export { markdownToPlainText, sendText, sendMediaFile } from './send.js'

// Monitor (message polling)
export {
  getContextToken,
  extractPermissionReply,
  startPollLoop,
} from './monitor.js'
export type {
  ParsedMessage,
  OnMessageCallback,
  PermissionResponse,
  OnPermissionResponseCallback,
} from './monitor.js'

// Permission state
export {
  setActivePermissionChat,
  getActivePermissionChat,
  savePendingPermission,
  consumePendingPermission,
} from './permissions.js'
export type {
  ChannelPermissionRequestParams,
  PendingPermissionRequest,
  ActivePermissionChat,
} from './permissions.js'

// Server (MCP)
export { createWeixinMcpServer, runWeixinMcpServer } from './server.js'
export type { WeixinServerDeps } from './server.js'

// CLI
export { handleWeixinCli } from './cli.js'
