import type { OAuthTokens } from '../../services/oauth/types.js'

/**
 * MCP OAuth 在发现阶段持久化到钥匙串的精简形态（仅 URL，避免元数据体积撑爆 `security -i` 缓冲区）。
 * 完整元数据可在下次鉴权时由 SDK 重新拉取。
 */
export type McpOAuthDiscoveryStateStored = {
  authorizationServerUrl?: string // 授权服务器 issuer / 元数据根 URL
  resourceMetadataUrl?: string // 受保护资源元数据（RFC 9728）文档地址
  resourceMetadata?: Record<string, unknown> // 历史磁盘缓存中的资源元数据摘要（运行时按需再拉取）
  authorizationServerMetadata?: Record<string, unknown> // 历史磁盘缓存中的授权服务器元数据摘要
}

/**
 * 单个 MCP 服务器在 OAuth / XAA 流程中的钥匙串槽位内容（键为 `getServerKey` 派生的稳定 id）。
 */
export type McpOAuthServerEntry = {
  serverName: string // 配置中的 MCP 服务器显示名
  serverUrl: string // 服务器基础 URL（SSE/HTTP 传输）
  accessToken: string // 当前访问令牌（Bearer）
  expiresAt: number // access_token 过期时刻（毫秒时间戳）
  refreshToken?: string // 刷新令牌；jwt-bearer 等场景可能缺失
  scope?: string // 已授权 scope（空格分隔，与令牌端点一致）
  clientId?: string // 动态注册或预置的 OAuth 客户端 id
  clientSecret?: string // 动态注册得到的客户端密钥（与 clientId 配对）
  stepUpScope?: string // 403 后待补授权的增量 scope（步进鉴权）
  discoveryState?: McpOAuthDiscoveryStateStored // 发现阶段缓存的 URL 与可选元数据
}

/** 预置 OAuth 客户端时单独存放的 AS 侧 client_secret（与 DCR 结果分槽） */
export type McpOAuthClientConfigEntry = {
  clientSecret?: string // 授权服务器颁发的客户端密钥
}

/** XAA IdP 浏览器登录后缓存的 id_token 及其过期时间 */
export type McpXaaIdpTokenEntry = {
  idToken: string // OIDC id_token（JWT）
  expiresAt: number // id_token 过期时刻（毫秒时间戳）
}

/** XAA 企业 IdP 机密客户端的 client_secret（按规范化 issuer 分桶，与 MCP AS secret 不同域） */
export type McpXaaIdpSecretEntry = {
  clientSecret: string // IdP 控制台注册的客户端密钥
}

/** `secureStorage.update` 的返回值：是否写入成功及可选的人可读警告 */
export type SecureStorageUpdateResult = {
  success: boolean // 底层存储（钥匙串/明文文件）是否接受写入
  warning?: string // 例如降级为明文存储时的提示文案
}

/**
 * 与 `.credentials.json` / macOS 钥匙串中 JSON 负载一一对应的根对象。
 * 各顶级键均为可选，按子系统按需合并写入。
 */
export type SecureStorageData = {
  claudeAiOauth?: OAuthTokens // Claude.ai / Console 主站 OAuth 令牌与订阅摘要
  mcpOAuth?: Record<string, McpOAuthServerEntry> // 各 MCP 服务器的 OAuth 会话与发现状态
  mcpOAuthClientConfig?: Record<string, McpOAuthClientConfigEntry> // 各 MCP 预置客户端密钥
  mcpXaaIdp?: Record<string, McpXaaIdpTokenEntry> // XAA：按 IdP issuer 缓存的 id_token
  mcpXaaIdpConfig?: Record<string, McpXaaIdpSecretEntry> // XAA：按 IdP issuer 缓存的 IdP client_secret
  pluginSecrets?: Record<string, Record<string, string>> // 插件敏感项：`pluginId` 或 `pluginId/serverName` → 键值均为字符串密文
  trustedDeviceToken?: string // 桥接升权：受信设备 API 返回的长期 device_token
}

/**
 * 平台安全存储抽象：同步/异步读、整对象写、删除整条凭据。
 */
export type SecureStorage = {
  name: string // 实现名称（如 `keychain`、`plaintext`），用于日志与遥测
  read(): SecureStorageData | null // 同步读取；无条目或解析失败时为 null
  readAsync(): Promise<SecureStorageData | null> // 异步读取，避免 UI 线程阻塞
  update(data: SecureStorageData): SecureStorageUpdateResult // 原子替换整份 JSON 负载
  delete(): boolean // 删除凭据文件或钥匙串条目；成功返回 true
}
