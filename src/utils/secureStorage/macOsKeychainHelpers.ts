/**
 * 在 keychainPrefetch.ts 和 macOsKeychainStorage.ts 之间共享的轻量级辅助函数。
 *
 * 本模块不得导入 execa、execFileNoThrow 或 execFileNoThrowPortable。keychainPrefetch.ts 在 main.tsx 的最顶部触发（在约 65ms 的模块评估并行化之前），而 Bun 的 __esm 包装器会在访问任何符号时评估整个模块 —— 因此这里的重量级传递导入会破坏预取。仅 execa → human-signals → cross-spawn 链就有约 58ms 的同步初始化开销。
 *
 * 下面的导入（envUtils、oauth 常量、crypto、os）已经在 startupProfiler.ts 的 main.tsx:5 处被评估，因此当 keychainPrefetch.ts 引入此文件时，不会增加额外的模块初始化成本。
 */

import { createHash } from 'crypto'
import { userInfo } from 'os'
import { getOauthConfig } from 'src/constants/oauth.js'
import { getClaudeConfigHomeDir } from '../envUtils.js'
import type { SecureStorageData } from './types.js'

// 用于区分 OAuth 凭据 keychain 条目与旧版 API 密钥条目（不使用后缀）的后缀。两者共享相同的服务名基础。
// 请勿更改此值 —— 它是 keychain 查找键的一部分，更改会导致现有存储的凭据失效。
export const CREDENTIALS_SERVICE_SUFFIX = '-credentials'

export function getMacOsKeychainStorageServiceName(
  serviceSuffix: string = '',
): string {
  const configDir = getClaudeConfigHomeDir()
  const isDefaultDir = !process.env.CLAUDE_CONFIG_DIR

  // 使用配置目录路径的哈希值创建一个唯一且稳定的后缀
  // 仅为非默认目录添加后缀，以保持向后兼容性
  const dirHash = isDefaultDir
    ? ''
    : `-${createHash('sha256').update(configDir).digest('hex').substring(0, 8)}`
  return `Claude Code${getOauthConfig().OAUTH_FILE_SUFFIX}${serviceSuffix}${dirHash}`
}

export function getUsername(): string {
  try {
    return process.env.USER || userInfo().username
  } catch {
    return 'claude-code-user'
  }
}

// --

// 用于 keychain 读取的缓存，避免重复调用昂贵的 security CLI 命令。
// TTL 限制了跨进程场景（另一个 CC 实例刷新/吊销令牌）的陈旧性，同时不会在每次读取时强制阻塞 spawnSync。
// 进程内写入通过 clearKeychainCache() 直接使缓存失效。
//
// 同步 read() 路径每次 `security` 派生耗时约 500ms。在启动时有 50+ claude.ai MCP 连接器进行认证，一个较短的 TTL 会在风暴中过期并触发重复的同步读取 —— 曾观察到 5.5 秒的事件循环阻塞（go/ccshare/adamj-20260326-212235）。允许 30 秒的跨进程陈旧是可以接受的：OAuth 令牌过期时间以小时计，唯一的跨进程写入者是另一个 CC 实例的 /login 或刷新操作。
//
// 此缓存放在此处（而非 macOsKeychainStorage.ts），以便 keychainPrefetch.ts 能够预填充它而无需引入 execa。包装在一个对象中，因为 ES 模块的 `let` 绑定无法跨模块边界写入 —— 本文件和 macOsKeychainStorage.ts 都需要修改全部三个字段。
export const KEYCHAIN_CACHE_TTL_MS = 30_000

export const keychainCacheState: {
  cache: { data: SecureStorageData | null; cachedAt: number } // cachedAt 0 表示无效
  // 每次缓存失效时递增。readAsync() 在执行派生前捕获此值，并在存在更新的代时跳过自身的缓存写入，从而防止陈旧的子进程结果覆盖由 update() 写入的新鲜数据。
  generation: number
  // 对并发的 readAsync() 调用进行去重，使得在负载下 TTL 过期时只派生一个子进程，而不是 N 个。在失效时被清除，以便新的读取不会加入一个正在进行的陈旧 Promise。
  readInFlight: Promise<SecureStorageData | null> | null
} = {
  cache: { data: null, cachedAt: 0 },
  generation: 0,
  readInFlight: null,
}

export function clearKeychainCache(): void {
  keychainCacheState.cache = { data: null, cachedAt: 0 }
  keychainCacheState.generation++
  keychainCacheState.readInFlight = null
}

/**
 * 从预取结果（keychainPrefetch.ts）预先填充 keychain 缓存。
 * 仅在缓存尚未被触碰时写入 —— 如果同步 read() 或 update() 已经运行，它们的结果是权威的，我们将丢弃此次预取。
 */
export function primeKeychainCacheFromPrefetch(stdout: string | null): void {
  if (keychainCacheState.cache.cachedAt !== 0) return
  let data: SecureStorageData | null = null
  if (stdout) {
    try {
      // eslint-disable-next-line custom-rules/no-direct-json-operations -- jsonParse() 会将 slowOperations（lodash-es/cloneDeep）引入早期启动导入链；参见文件头注释
      data = JSON.parse(stdout)
    } catch {
      // 预取结果格式错误 —— 让同步 read() 重新获取
      return
    }
  }
  keychainCacheState.cache = { data, cachedAt: Date.now() }
}