import type { TaskType } from '../Task.js'
import type { AgentId } from './ids.js'
import type { AssistantMessage, UserMessage } from './message.js'

/** Bash 工具轮询命令输出时上报的载荷，用于终端内展示执行进度与尾部输出。 */
export type BashProgress = {
  type: 'bash_progress' // discriminant，区分其它工具进度
  output: string // 当前用于展示的尾部输出（可能被截断）
  fullOutput: string // 累积的完整 stdout（用于 verbose 或统计）
  elapsedTimeSeconds: number // 已运行秒数，用于计时 UI
  totalLines: number // 累计行数估计（用于「+N lines」提示）
  totalBytes?: number // 累计字节估计（用于体积提示）
  taskId?: string // 关联的后台 shell 任务 ID（若已注册）
  timeoutMs?: number // 命令超时上限，用于与时间显示联动
}

/** PowerShell 工具轮询输出时的载荷，语义与 Bash 进度一致，仅 discriminant 不同。 */
export type PowerShellProgress = {
  type: 'powershell_progress' // discriminant
  output: string // 当前用于展示的尾部输出
  fullOutput: string // 累积完整输出
  elapsedTimeSeconds: number // 已运行秒数
  totalLines: number // 累计行数
  totalBytes: number // 累计字节（PS 路径上始终计算）
  timeoutMs?: number // 超时上限
  taskId?: string // 后台任务 ID
}

/** Bash / PowerShell 共享的 shell 进度联合类型；子代理转发 bash/ps 进度或 `!` 命令 UI 使用。 */
export type ShellProgress = BashProgress | PowerShellProgress

/** Agent 子工具在运行过程中推送的中间消息载荷，用于侧栏/折叠展示子对话与工具调用。 */
export type AgentToolProgress = {
  type: 'agent_progress' // discriminant
  message: AssistantMessage | UserMessage // normalizeMessages 产生的单块用户/助手消息
  prompt: string // 子代理初始提示；首条进度可含全文，后续常为空字符串去重
  agentId: AgentId // 子代理作用域 ID，用于区分并发代理
}

/** Skill 工具分叉执行技能时的进度载荷，结构与 agent_progress 类似但标识技能流水线。 */
export type SkillToolProgress = {
  type: 'skill_progress' // discriminant
  message: AssistantMessage | UserMessage // 技能代理管线中的单块用户/助手消息
  prompt: string // 技能正文或指令，用于进度卡片展示上下文
  agentId: AgentId // 技能执行所用代理 ID
}

/**
 * MCP 工具生命周期与 SDK `onprogress` 回调的统一载荷（MCPTool/UI 会解构 progress/total）。
 * `status` 区分阶段；流式数值字段仅在 SDK 上报时出现。
 */
export type MCPProgress = {
  type: 'mcp_progress' // discriminant
  status: 'started' | 'completed' | 'failed' | 'progress' // 调用生命周期阶段
  serverName: string // MCP 服务器名称（连接配置中的逻辑名）
  toolName: string // 正在执行的远程工具名
  elapsedTimeMs?: number // 完成或失败时从发起调用起算的耗时（毫秒）
  progress?: number // SDK 流式进度当前值（用于进度条）
  total?: number // SDK 流式进度总值（若可得）
  progressMessage?: string // 服务器或 SDK 提供的进度说明
}

/** TaskOutput 在阻塞等待后台任务完成时发出的等待提示（尚未拿到最终结果）。 */
export type TaskOutputProgress = {
  type: 'waiting_for_task' // discriminant
  taskDescription: string // 任务的人类可读描述（来自 AppState）
  taskType: TaskType // 任务类别（如 local_agent），用于 UI 解释
}

/** Web 搜索适配器在检索过程中上报的中间状态（查询变化与结果统计）。 */
export type WebSearchProgress =
  | {
      type: 'query_update' // 查询被规范化或重写后的更新
      query?: string // 当前生效的搜索查询文本
    }
  | {
      type: 'search_results_received' // 已从提供商收到一批结果
      query?: string // 对应的查询文本
      resultCount?: number // 本批或累计结果数量，用于展示 Found N results
    }

/**
 * REPL 工具当前实现不调用 `onProgress`；使用 `never` 表示无运行时载荷，
 * 仅占位以满足 Tool 泛型与统一导出。
 */
export type REPLToolProgress = never

/**
 * SDK `task_progress` 事件中 `workflow_progress` 数组的元素：
 * 客户端按注释约定用 `${type}:${index}` 做 upsert，并按 `phaseIndex` 聚合阶段。
 * （工作流详细字段可在后续接入时扩展。）
 */
export type SdkWorkflowProgress = {
  type: string // 事件类别，与 index 组成稳定键
  index: number // 同类事件的序号
  phaseIndex: number // 所属工作流阶段的索引
}

/** 所有内置工具在 `ToolProgress.data` 中可能出现的 discriminated 联合（不含 hook_progress）。 */
export type ToolProgressData =
  | AgentToolProgress
  | SkillToolProgress
  | BashProgress
  | PowerShellProgress
  | MCPProgress
  | TaskOutputProgress
  | WebSearchProgress
