import { createFallbackStorage } from './fallbackStorage.js'
import { macOsKeychainStorage } from './macOsKeychainStorage.js'
import { plainTextStorage } from './plainTextStorage.js'
import type { SecureStorage } from './types.js'

/**
 * 获取适用于当前平台的适当安全存储实现
 * 从什么地方读取OAuthToken，从什么地方读取APIKey。
 * macOS 上是钥匙串 + 明文文件的 fallback，其它平台当前主要是明文存储
 */
export function getSecureStorage(): SecureStorage {
  if (process.platform === 'darwin') {//是不是苹果系统。
    return createFallbackStorage(macOsKeychainStorage, plainTextStorage)
  }

  // TODO：添加对 Linux 的 libsecret 支持
  return plainTextStorage
}