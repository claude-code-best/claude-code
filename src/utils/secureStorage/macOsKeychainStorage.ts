import { execaSync } from 'execa'
import { logForDebugging } from '../debug.js'
import { execFileNoThrow } from '../execFileNoThrow.js'
import { execSyncWithDefaults_DEPRECATED } from '../execFileNoThrowPortable.js'
import { jsonParse, jsonStringify } from '../slowOperations.js'
import {
  CREDENTIALS_SERVICE_SUFFIX,
  clearKeychainCache,
  getMacOsKeychainStorageServiceName,
  getUsername,
  KEYCHAIN_CACHE_TTL_MS,
  keychainCacheState,
} from './macOsKeychainHelpers.js'
import type { SecureStorage, SecureStorageData } from './types.js'

// `security -i` 使用一个 4096 字节的 fgets() 缓冲区（darwin 上的 BUFSIZ）读取标准输入。
// 超过此长度的命令行会在参数中间被截断：前 4096 字节被当作一个命令（未闭合的引号 → 失败），
// 溢出的部分被解释为第二个未知命令。结果是：非零退出且没有数据写入，但 *之前* 的 keychain 条目保持不变 ——
// 然后后备存储会将其读取为过期数据。参见 #30337。
// 在限制之下保留 64 字节的余量，以应对边界情况下的行终止符计算差异。
const SECURITY_STDIN_LINE_LIMIT = 4096 - 64

export const macOsKeychainStorage = {
  name: 'keychain',
  read(): SecureStorageData | null {
    const prev = keychainCacheState.cache
    if (Date.now() - prev.cachedAt < KEYCHAIN_CACHE_TTL_MS) {
      return prev.data
    }

    try {
      const storageServiceName = getMacOsKeychainStorageServiceName(
        CREDENTIALS_SERVICE_SUFFIX,
      )
      const username = getUsername()
      const result = execSyncWithDefaults_DEPRECATED(
        `security find-generic-password -a "${username}" -w -s "${storageServiceName}"`,
      )
      if (result) {
        const data = jsonParse(result)
        keychainCacheState.cache = { data, cachedAt: Date.now() }
        return data
      }
    } catch (_e) {
      // 忽略
    }
    // 出错时仍使用过期值：如果之前有值但刷新失败，继续提供过期值，而不是缓存 null。
    // 自 #23192 起，每次 API 请求（macOS 路径）都会清除上游的 memoize，
    // 否则一次瞬时的 `security` 派生失败会污染缓存，并在所有子系统中显示为“未登录”，直到下一次用户交互。
    // clearKeychainCache() 设置 data=null，因此显式失效（登出、删除）仍然能够读取到 null。
    if (prev.data !== null) {
      logForDebugging('[keychain] 读取失败；提供过期的缓存值', {
        level: 'warn',
      })
      keychainCacheState.cache = { data: prev.data, cachedAt: Date.now() }
      return prev.data
    }
    keychainCacheState.cache = { data: null, cachedAt: Date.now() }
    return null
  },
  async readAsync(): Promise<SecureStorageData | null> {
    const prev = keychainCacheState.cache
    if (Date.now() - prev.cachedAt < KEYCHAIN_CACHE_TTL_MS) {
      return prev.data
    }
    if (keychainCacheState.readInFlight) {
      return keychainCacheState.readInFlight
    }

    const gen = keychainCacheState.generation
    const promise = doReadAsync().then(data => {
      // 如果在读取过程中缓存被失效或更新，我们的子进程结果已过期 —— 不要覆盖更新的条目。
      if (gen === keychainCacheState.generation) {
        // 出错时仍使用过期值 —— 与上面的 read() 行为一致。
        if (data === null && prev.data !== null) {
          logForDebugging('[keychain] readAsync 失败；提供过期的缓存值', {
            level: 'warn',
          })
        }
        const next = data ?? prev.data
        keychainCacheState.cache = { data: next, cachedAt: Date.now() }
        keychainCacheState.readInFlight = null
        return next
      }
      return data
    })
    keychainCacheState.readInFlight = promise
    return promise
  },
  update(data: SecureStorageData): { success: boolean; warning?: string } {
    // 更新前使缓存失效
    clearKeychainCache()

    try {
      const storageServiceName = getMacOsKeychainStorageServiceName(
        CREDENTIALS_SERVICE_SUFFIX,
      )
      const username = getUsername()
      const jsonString = jsonStringify(data)

      // 转换为十六进制以避免转义问题
      const hexValue = Buffer.from(jsonString, 'utf-8').toString('hex')

      // 首选标准输入（`security -i`），这样进程监控工具（CrowdStrike 等）
      // 只能看到 "security -i"，而看不到负载内容（INC-3028）。
      // 当负载会溢出标准输入行缓冲区时，回退到 argv。
      // 通过 argv 传递的十六进制字符串可被有心的观察者恢复，但可以欺骗简单的纯文本 grep 规则，
      // 而替代方案 —— 静默的凭据损坏 —— 则更糟糕。darwin 上的 ARG_MAX 是 1MB，因此 argv 对于我们来说实际上没有大小限制。
      const command = `add-generic-password -U -a "${username}" -s "${storageServiceName}" -X "${hexValue}"\n`

      let result
      if (command.length <= SECURITY_STDIN_LINE_LIMIT) {
        result = execaSync('security', ['-i'], {
          input: command,
          stdio: ['pipe', 'pipe', 'pipe'],
          reject: false,
        })
      } else {
        logForDebugging(
          `Keychain 负载（${jsonString.length}B JSON）超过 security -i 标准输入限制；改用 argv`,
          { level: 'warn' },
        )
        result = execaSync(
          'security',
          [
            'add-generic-password',
            '-U',
            '-a',
            username,
            '-s',
            storageServiceName,
            '-X',
            hexValue,
          ],
          { stdio: ['ignore', 'pipe', 'pipe'], reject: false },
        )
      }

      if (result.exitCode !== 0) {
        return { success: false }
      }

      // 成功时用新数据更新缓存
      keychainCacheState.cache = { data, cachedAt: Date.now() }
      return { success: true }
    } catch (_e) {
      return { success: false }
    }
  },
  delete(): boolean {
    // 删除前使缓存失效
    clearKeychainCache()

    try {
      const storageServiceName = getMacOsKeychainStorageServiceName(
        CREDENTIALS_SERVICE_SUFFIX,
      )
      const username = getUsername()
      execSyncWithDefaults_DEPRECATED(
        `security delete-generic-password -a "${username}" -s "${storageServiceName}"`,
      )
      return true
    } catch (_e) {
      return false
    }
  },
} satisfies SecureStorage

async function doReadAsync(): Promise<SecureStorageData | null> {
  try {
    const storageServiceName = getMacOsKeychainStorageServiceName(
      CREDENTIALS_SERVICE_SUFFIX,
    )
    const username = getUsername()
    const { stdout, code } = await execFileNoThrow(
      'security',
      ['find-generic-password', '-a', username, '-w', '-s', storageServiceName],
      { useCwd: false, preserveOutputOnError: false },
    )
    if (code === 0 && stdout) {
      return jsonParse(stdout.trim())
    }
  } catch (_e) {
    // 忽略
  }
  return null
}

let keychainLockedCache: boolean | undefined

/**
 * 检查 macOS keychain 是否已锁定。
 * 如果在 macOS 上且 keychain 已锁定（`security show-keychain-info` 退出码 36），返回 true。
 * 这种情况常见于 SSH 会话中，keychain 不会自动解锁。
 *
 * 结果在整个进程生命周期内缓存 —— execaSync('security', ...) 是一个约 27ms 的同步子进程派生，
 * 而该函数在渲染（AssistantTextMessage）中被调用。在包含“未登录”消息的会话进行虚拟滚动重新挂载时，
 * 每次重新挂载都会重新派生 security(1)，每次消息增加 27ms 的提交时间。
 * Keychain 锁定状态在 CLI 会话期间不会改变。
 */
export function isMacOsKeychainLocked(): boolean {
  if (keychainLockedCache !== undefined) return keychainLockedCache
  // 仅在 macOS 上检查
  if (process.platform !== 'darwin') {
    keychainLockedCache = false
    return false
  }

  try {
    const result = execaSync('security', ['show-keychain-info'], {
      reject: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    // 退出码 36 表示 keychain 已锁定
    keychainLockedCache = result.exitCode === 36
  } catch {
    // 如果命令因任何原因失败，假定 keychain 未锁定
    keychainLockedCache = false
  }
  return keychainLockedCache
}