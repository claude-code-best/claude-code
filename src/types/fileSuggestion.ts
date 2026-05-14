/**
 * `FileSuggestion` 自定义命令通过 stdin 接收的 JSON 负载，
 * 字段与 `createBaseHookInput()` 一致并附加当前路径前缀 `query`。
 */
export type FileSuggestionCommandInput = {
  session_id: string // 当前会话 id
  transcript_path: string // 会话 transcript 文件路径
  cwd: string // 工作目录
  permission_mode?: string // 权限模式快照（若有）
  agent_id?: string // 子代理 id（若在 agent 内触发）
  agent_type?: string // 子代理类型或主线程类型
  query: string // 用户当前输入的路径前缀（待补全部分）
}
