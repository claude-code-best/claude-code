/**
 * 启动 Remote Control Server（开发 / 个人自托管入口）
 *
 * 开发默认值（显式设置环境变量即可覆盖）：
 *   - RCS_SINGLE_USER 未设置 → '1'：单用户模式，所有会话对任意设备可见，
 *     不做浏览器 UUID 身份隔离（个人自托管的预期行为）。
 *     需要多租户隔离时显式传 RCS_SINGLE_USER=0。
 *   - RCS_API_KEYS 未设置 → 'test-key'：供 CLI bridge（ccb remote-control）
 *     接入认证的开发默认 key。
 *
 * 数据库路径按进程 cwd 解析（默认 ./data/rcs.sqlite）——请从仓库根目录
 * 通过 `bun run rcs` 启动，保证始终使用同一个数据库文件。
 *
 * Usage:
 *   bun run rcs
 *   RCS_SINGLE_USER=0 RCS_API_KEYS=key1,key2 RCS_PORT=4000 bun run rcs
 */
import { resolve } from 'node:path'

// config.ts 在模块加载时读取环境变量——开发默认值必须写在动态 import 之前，
// 不能用静态 import（ESM 提升会让 config 先于本文件代码求值）。
const apiKeysFromEnv = process.env.RCS_API_KEYS !== undefined
if (process.env.RCS_SINGLE_USER === undefined) {
  process.env.RCS_SINGLE_USER = '1'
}
if (!apiKeysFromEnv) {
  process.env.RCS_API_KEYS = 'test-key'
}

const { config } = await import('../packages/remote-control-server/src/config')

console.log(`[RCS] Starting Remote Control Server...`)
console.log(`[RCS] Port: ${config.port}`)
console.log(
  `[RCS] Single-user mode: ${
    config.singleUser
      ? 'ON — 所有会话跨设备共享，无身份隔离'
      : 'OFF — 会话按浏览器 UUID 隔离'
  }`,
)
console.log(`[RCS] Database: ${resolve(config.dbPath)}`)
console.log(
  `[RCS] API keys: ${
    apiKeysFromEnv
      ? `${config.apiKeys.length} 个（来自 RCS_API_KEYS）`
      : `开发默认 'test-key'（bridge 接入用 CLAUDE_BRIDGE_OAUTH_TOKEN=test-key）`
  }`,
)

const server = await import('../packages/remote-control-server/src/index.ts')

Bun.serve(server.default)
