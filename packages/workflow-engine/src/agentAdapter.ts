// Agent 后端适配器抽象。引擎通过 registry 取 adapter 再调 run，不关心具体实现
// （Anthropic SDK / 核心 runAgent / OpenAI / 本地模型 / mock 均为 adapter 的实现）。
import type {
  AgentProgressUpdate,
  AgentRunParams,
  AgentRunResult,
} from './types.js'
import type { HostHandle } from './ports.js'

/** adapter 能力声明。引擎/脚本据此降级（如后端不支持 schema 则改文本 + 解析）。 */
export type AgentAdapterCapabilities = {
  /** 支持 schema 结构化输出（agent(schema) 直接返回对象）。 */
  structuredOutput: boolean
  /** 支持工具调用（仅核心 agent 后端有）。 */
  tools?: boolean
  /** 支持流式（v1 引擎不消费，预留）。 */
  stream?: boolean
}

/** adapter.run 的上下文。 */
export type AgentAdapterContext = {
  /** 透传的不透明 host 句柄（核心 adapter 用；独立后端忽略）。 */
  host: HostHandle
  /** 取消信号（与 workflow signal 一致）。 */
  signal: AbortSignal
  /** 当前 workflow runId（日志/追踪用）。 */
  runId: string
  /**
   * 引擎层 agent 序号（hooks.agentIdSeq 递增；面板 RunProgress.agents[].id 同源）。
   * 注意：与 backend 内部创建的 core AgentId（字符串，子 agent 跟踪用）是两个不同概念，
   * 不可混用。本字段用于 registerAgentAbort/unregisterAgentAbort 的 key，让 service
   * .kill(runId, agentId) 能精确路由到 backend 创建的 AbortController。
   */
  agentId: number
  /**
   * 运行中进度上报（后端循环累计 token/tool 时调用）。可选：独立后端可不实现；
   * 引擎据此发 agent_progress 事件（闭包带 agentId/runId 关联），面板实时刷新。
   */
  onProgress?: (update: AgentProgressUpdate) => void
  /**
   * 注册 agent 级 AbortController（可选）。后端创建 controller 后调此注入 Map，
   * 让 service.kill(runId, agentId) 能精确中断单个 agent 而不影响其他。
   * 由 hooks.agent 在 backend.run 调用前注入。
   */
  registerAgentAbort?: (agentId: number, ac: AbortController) => void
  /**
   * 注销 agent 级 AbortController（agent 完成或失败时调；幂等）。
   * 与 registerAgentAbort 配对。
   */
  unregisterAgentAbort?: (agentId: number) => void
}

/**
 * Agent 后端适配器。引擎只依赖此接口；具体后端实现它并注册到 registry。
 * initialize/dispose 为可选生命周期（连接池/资源管理），由调用方通过
 * registry.initializeAll/disposeAll 触发。
 */
export interface AgentAdapter {
  /** 唯一标识（registry 路由 / 日志）。 */
  readonly id: string
  /** 能力声明。 */
  readonly capabilities: AgentAdapterCapabilities
  /** 执行一次 agent 调用。 */
  run(params: AgentRunParams, ctx: AgentAdapterContext): Promise<AgentRunResult>
  /** 初始化（由 registry.initializeAll 触发）。 */
  initialize?(): Promise<void>
  /** 销毁（由 registry.disposeAll 触发）。 */
  dispose?(): Promise<void>
}

/** 路由规则：决定哪些 params 走哪个 adapter。按添加顺序匹配，先命中先用。 */
export type AdapterRouteRule =
  | { kind: 'agentType'; agentType: string; adapter: string }
  | { kind: 'model'; pattern: string; adapter: string }
  | {
      kind: 'custom'
      match: (params: AgentRunParams) => boolean
      adapter: string
    }

/** registry 找不到匹配 adapter 时抛出。 */
export class AdapterNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdapterNotFoundError'
  }
}

/**
 * 多后端 registry。register 注册 adapter，route/default 配路由，resolve 按
 * 规则顺序匹配选 adapter。adapter 的 lifecycle（initialize/dispose）通过
 * initializeAll/disposeAll 统一触发（由调用方在运行前后调）。
 */
export class AgentAdapterRegistry {
  private readonly adapters = new Map<string, AgentAdapter>()
  private readonly rules: AdapterRouteRule[] = []
  private defaultId: string | null = null

  /** 注册一个 adapter（id 重复则覆盖）。链式。 */
  register(adapter: AgentAdapter): this {
    this.adapters.set(adapter.id, adapter)
    return this
  }

  /** 设默认 adapter（无规则命中时用）。链式。 */
  default(adapterId: string): this {
    this.defaultId = adapterId
    return this
  }

  /** 加一条路由规则（按添加顺序匹配）。链式。 */
  route(rule: AdapterRouteRule): this {
    this.rules.push(rule)
    return this
  }

  has(id: string): boolean {
    return this.adapters.has(id)
  }

  get(id: string): AgentAdapter | undefined {
    return this.adapters.get(id)
  }

  /** 按规则匹配；第一个命中返回；无命中走 default；都没有抛 AdapterNotFoundError。 */
  resolve(params: AgentRunParams): AgentAdapter {
    for (const rule of this.rules) {
      if (matchRule(rule, params)) {
        const hit = this.adapters.get(rule.adapter)
        if (hit) return hit
      }
    }
    if (this.defaultId) {
      const fallback = this.adapters.get(this.defaultId)
      if (fallback) return fallback
    }
    throw new AdapterNotFoundError(
      `无 adapter 匹配（rules=${this.rules.length}, default=${this.defaultId ?? '无'}）`,
    )
  }

  /** 触发所有 adapter 的 initialize（跳过未实现的）。 */
  async initializeAll(): Promise<void> {
    for (const a of this.adapters.values()) {
      await a.initialize?.()
    }
  }

  /** 触发所有 adapter 的 dispose（跳过未实现的）。 */
  async disposeAll(): Promise<void> {
    for (const a of this.adapters.values()) {
      await a.dispose?.()
    }
  }
}

function matchRule(rule: AdapterRouteRule, params: AgentRunParams): boolean {
  if (rule.kind === 'agentType') return params.agentType === rule.agentType
  if (rule.kind === 'model') {
    return (
      typeof params.model === 'string' && params.model.startsWith(rule.pattern)
    )
  }
  return rule.match(params) // custom
}
