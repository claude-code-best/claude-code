import type { AvailableCommand } from '../acp/types'

// =============================================================================
// RCS 会话斜杠命令目录
//
// CLI 在 bridge 连接时通过 system/init 下发 bridge-safe 命令列表（已按
// isBridgeSafeCommand 过滤）；init 到达前用下面的静态兜底列表 —— 它只包含
// src/commands.ts BRIDGE_SAFE_COMMANDS 中确认可远程执行的 local 命令。
// 命令以普通用户消息发送（如 "/compact"），由 CLI 端 REPL 解析执行，
// 与终端输入行为一致。
// =============================================================================

/** 已知命令的中文描述（动态列表命中时展示，未命中回退通用文案）。 */
const KNOWN_COMMAND_DESCRIPTIONS: Record<string, string> = {
  compact: '压缩会话上下文，保留摘要继续对话',
  clear: '清空当前会话记录',
  cost: '查看本会话 token 用量与花费',
  usage: '查看会话花费与订阅用量统计',
  summary: '生成当前会话的摘要',
  'release-notes': '查看 Claude Code 版本更新说明',
  files: '列出本会话跟踪的文件',
  context: '查看当前上下文窗口占用',
  todos: '列出当前任务清单',
  review: '审查一个 GitHub Pull Request',
  'security-review': '对当前改动做安全审查',
  'pr-comments': '获取当前 PR 的评论',
  init: '生成 CLAUDE.md 项目说明',
}

/** init 到达前的静态兜底命令（均为 CLI 侧确认 bridge-safe 的 local 命令）。 */
export const FALLBACK_BRIDGE_COMMANDS: AvailableCommand[] = [
  'compact',
  'clear',
  'cost',
  'summary',
  'release-notes',
  'files',
].map(name => ({
  name,
  description: KNOWN_COMMAND_DESCRIPTIONS[name] ?? '斜杠命令',
}))

/**
 * 将 system/init 下发的命令名列表转换为带描述的命令目录。
 * 列表为空/未到达时返回静态兜底。
 */
export function buildCommandCatalog(
  dynamicNames?: string[],
): AvailableCommand[] {
  if (!dynamicNames || dynamicNames.length === 0) {
    return FALLBACK_BRIDGE_COMMANDS
  }
  return dynamicNames.map(name => ({
    name,
    description: KNOWN_COMMAND_DESCRIPTIONS[name] ?? '斜杠命令（由 CLI 提供）',
  }))
}
