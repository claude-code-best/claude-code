import type { SecureStorage, SecureStorageData } from './types.js'

/**
 * 创建一个后备存储，首先尝试使用主存储，如果失败则回退到辅助存储
 */
export function createFallbackStorage(
  primary: SecureStorage,
  secondary: SecureStorage,
): SecureStorage {
  return {
    name: `${primary.name}-with-${secondary.name}-fallback`,
    read(): SecureStorageData {
      const result = primary.read()
      if (result !== null && result !== undefined) {
        return result
      }
      return secondary.read() || {}
    },
    async readAsync(): Promise<SecureStorageData | null> {
      const result = await primary.readAsync()
      if (result !== null && result !== undefined) {
        return result
      }
      return (await secondary.readAsync()) || {}
    },
    update(data: SecureStorageData): { success: boolean; warning?: string } {
      // 更新前捕获主存储的状态
      const primaryDataBefore = primary.read()

      const result = primary.update(data)

      if (result.success) {
        // 首次迁移到主存储时删除辅助存储
        // 这样在主机和容器之间共享 .claude 目录时可以保留凭据
        // 参见：https://github.com/anthropics/claude-code/issues/1414
        if (primaryDataBefore === null) {
          secondary.delete()
        }
        return result
      }

      const fallbackResult = secondary.update(data)

      if (fallbackResult.success) {
        // 主存储写入失败，但主存储可能仍然持有一个*较旧的*有效条目。
        // read() 在返回非 null 时会优先选择主存储，因此那个陈旧条目会隐藏我们刚刚写入辅助存储的新鲜数据 ——
        // 例如一个服务器已经轮换掉的刷新令牌，会导致 /login 循环（#30337）。
        // 尽力删除；如果这也失败，说明用户的 keychain 处于我们无法从此处修复的糟糕状态。
        if (primaryDataBefore !== null) {
          primary.delete()
        }
        return {
          success: true,
          warning: fallbackResult.warning,
        }
      }

      return { success: false }
    },
    delete(): boolean {
      const primarySuccess = primary.delete()
      const secondarySuccess = secondary.delete()

      return primarySuccess || secondarySuccess
    },
  }
}