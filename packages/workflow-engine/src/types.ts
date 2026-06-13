// 纯类型定义。无运行时依赖。
// WorkflowInput 已迁移到 tool/schema.ts，用 z.infer 派生避免与 schema 漂移。

/** 脚本 `export const meta = {...}` 的形状（必须是纯字面量）。 */
export type WorkflowMeta = {
  name: string
  description: string
  whenToUse?: string
  phases?: Array<{ title: string; detail?: string }>
}

/** agent() 传给 AgentRunner 的参数。 */
export type AgentRunParams = {
  prompt: string
  /** JSON Schema；提供时 agent 返回校验对象而非文本。 */
  schema?: object
  model?: string
  /** 输出 token 上限（透传给 agent 后端，如 LLM 的 max_tokens）。 */
  maxTokens?: number
  /** 自定义子 agent 类型（从 registry 解析）。 */
  agentType?: string
  isolation?: 'worktree'
  allowedTools?: string[]
  /** 仅展示用，不计入 journal key。 */
  label?: string
  /** 仅展示用，不计入 journal key。 */
  phase?: string
}

/** AgentRunner 返回。 */
export type AgentRunResult =
  | { kind: 'ok'; output: string | object; usage: { outputTokens: number } }
  | { kind: 'skipped' }
  | { kind: 'dead' }

/** journal 中单条记录。seq = agent() 调用序号，read() 据此重排以稳定 resume。 */
export type JournalEntry = {
  key: string
  /** agent() 调用顺序（来自 agentIdSeq，跨 sub-workflow 单调递增）。 */
  seq: number
  result: AgentRunResult
}

/** 进度事件。所有变体携带 runId，供 adapter 路由到对应 task（多并发 workflow）。 */
export type ProgressEvent =
  | {
      type: 'run_started'
      runId: string
      workflowName: string
      meta: WorkflowMeta | null
    }
  | { type: 'phase_started'; runId: string; phase: string }
  | { type: 'phase_done'; runId: string; phase: string }
  | {
      type: 'agent_started'
      runId: string
      agentId: number
      label?: string
      phase?: string
    }
  | {
      type: 'agent_done'
      runId: string
      agentId: number
      label?: string
      phase?: string
      result: AgentRunResult
    }
  | { type: 'log'; runId: string; message: string }
  | {
      type: 'run_done'
      runId: string
      status: 'completed' | 'failed' | 'killed'
      returnValue?: unknown
      error?: string
    }

/** 引擎运行结果。 */
export type WorkflowRunResult = {
  status: 'completed' | 'failed' | 'killed'
  returnValue?: unknown
  error?: string
}
