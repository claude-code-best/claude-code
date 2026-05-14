/**
 * 自定义状态行命令（`settings.statusLine.command`）通过 stdin 接收的 JSON。
 * 与 `buildStatusLineCommandInput` 输出形状一致。
 */
export type StatusLineCommandInput = {
  session_id: string // 会话 id
  transcript_path: string // transcript 路径
  cwd: string // 当前工作目录
  permission_mode?: string // 工具权限模式快照
  agent_id?: string // 子代理 id（若有）
  agent_type?: string // 子代理类型或主线程类型
  session_name?: string // 用户可见会话标题（若有）
  model: {
    id: string // 当前主循环模型 id
    display_name: string // 已本地化的展示名
  }
  workspace: {
    current_dir: string // 进程 cwd
    project_dir: string // 项目根（原始 cwd）
    added_dirs: string[] // 附加工作区目录列表
  }
  version: string // CLI 版本号（MACRO.VERSION）
  output_style: {
    name: string // 当前输出样式名
  }
  cost: {
    total_cost_usd: number // 累计美元成本估计
    total_duration_ms: number // 会话墙钟时长
    total_api_duration_ms: number // API 往返累计
    total_lines_added: number // 归因新增行数
    total_lines_removed: number // 归因删除行数
  }
  context_window: {
    total_input_tokens: number | null // 累计输入 token（未知为 null）
    total_output_tokens: number | null // 累计输出 token
    context_window_size: number // 当前模型上下文上限
    current_usage: {
      input_tokens: number // 最近一条用量快照：输入
      output_tokens: number // 最近一条用量快照：输出
      cache_creation_input_tokens: number // 缓存写入 token
      cache_read_input_tokens: number // 缓存命中读取 token
    } | null // 尚无有效用量时为 null
    used_percentage: number | null // 已用上下文占比
    remaining_percentage: number | null // 剩余占比
  }
  exceeds_200k_tokens: boolean // 是否超过 200k 输入警戒
  rate_limits?: {
    five_hour?: { used_percentage: number; resets_at: number } // 5 小时窗口用量与重置时间戳
    seven_day?: { used_percentage: number; resets_at: number } // 7 天窗口
  }
  vim?: {
    mode: string // 当前 Vim 模式标签（如 INSERT）
  }
  agent?: {
    name: string // `--agent` 或子代理类型名
  }
  remote?: {
    session_id: string // 远程/桥接会话标识
  }
  worktree?: {
    name: string // worktree 展示名
    path: string // worktree 根路径
    branch?: string // 当前分支（可缺省）
    original_cwd: string // 进入 worktree 前 cwd
    original_branch?: string // 进入前分支（可缺省）
  }
}
