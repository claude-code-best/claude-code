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

/** agent 运行中进度快照（onProgress 回调载荷；后端循环累计 token/tool）。 */
export type AgentProgressUpdate = {
  tokenCount: number
  toolCount: number
}

/**
 * AgentRunner 返回。ok 变体携带 model/toolCount 供面板展示（可选，独立后端可不填）。
 *
 * dead 携带可选 reason/detail：journal 历史只记 `{kind:"dead"}` 无信息，
 * 调试时无法区分"agent 跑完没产 StructuredOutput"还是"runAgent 抛错"。
 * reason 让 hooks 重试日志、面板、事后审计能立刻看到死因。
 */
export type AgentRunResult =
  | {
      kind: 'ok'
      output: string | object
      usage: { outputTokens: number }
      /** 实际解析后的 model id（展示用）。 */
      model?: string
      /** agent 运行期间工具调用次数。 */
      toolCount?: number
      /** 完成时的 context 总 token 数（展示用；与 agent_progress 实时口径一致）。 */
      tokenCount?: number
    }
  | { kind: 'skipped' }
  | {
      kind: 'dead'
      /**
       * 死因分类，方便日志聚合 / 事后审计。可选以兼容旧 journal。
       * - no-structured-output：agent 完成但 finalize content 无 StructuredOutput（既没调工具也没在文本里产 JSON）
       * - runagent-threw：runAgent 抛非 abort 错误（API 故障 / context 溢出 / runtime 错误）
       * - worktree-failed：isolation:'worktree' 创建失败（fail-closed 退化）
       * - unknown：未分类（兼容旧 backend / 第三方 adapter）
       */
      reason?:
        | 'no-structured-output'
        | 'runagent-threw'
        | 'worktree-failed'
        | 'unknown'
      /** 详细信息（错误 message / 文本预览），用于日志，不展示给最终用户。 */
      detail?: string
    }

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
  | {
      type: 'agent_progress'
      runId: string
      agentId: number
      label?: string
      phase?: string
      tokenCount: number
      toolCount: number
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
