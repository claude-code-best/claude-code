// Agent backend adapter abstraction. The engine takes an adapter from the registry via resolve then calls run; it does not care about the concrete implementation
// (Anthropic SDK / core runAgent / OpenAI / local model / mock are all adapter implementations).
import type {
  AgentProgressUpdate,
  AgentRunParams,
  AgentRunResult,
} from './types.js'
import type { HostHandle } from './ports.js'

/** Adapter capability declaration. The engine/script degrades based on this (e.g. if the backend does not support schema, switch to text + parse). */
export type AgentAdapterCapabilities = {
  /** Supports schema structured output (agent(schema) returns an object directly). */
  structuredOutput: boolean
  /** Supports tool calling (only the core agent backend has this). */
  tools?: boolean
  /** Supports streaming (the v1 engine does not consume it; reserved). */
  stream?: boolean
}

/** Context for adapter.run. */
export type AgentAdapterContext = {
  /** Opaque host handle passed through (used by the core adapter; ignored by standalone backends). */
  host: HostHandle
  /** Cancellation signal (same as the workflow signal). */
  signal: AbortSignal
  /** Current workflow runId (for logging/tracing). */
  runId: string
  /**
   * Engine-layer agent sequence number (incremented by hooks.agentIdSeq; same source as panel RunProgress.agents[].id).
   * Note: this is a different concept from the core AgentId (a string, used for sub-agent tracking) created internally by the backend;
   * do not mix them. This field is the key for registerAgentAbort/unregisterAgentAbort, so that service
   * .kill(runId, agentId) can precisely route to the AbortController created by the backend.
   */
  agentId: number
  /**
   * In-progress reporting (called by the backend loop as it accumulates tokens/tools). Optional: standalone backends may not implement it;
   * the engine emits the agent_progress event based on this (closure carries agentId/runId for correlation), and the panel refreshes in real time.
   */
  onProgress?: (update: AgentProgressUpdate) => void
  /**
   * Register an agent-level AbortController (optional). The backend calls this after creating the controller to inject it into a Map,
   * so that service.kill(runId, agentId) can precisely abort a single agent without affecting others.
   * Injected by hooks.agent before backend.run is called.
   */
  registerAgentAbort?: (agentId: number, ac: AbortController) => void
  /**
   * Unregister an agent-level AbortController (called when the agent completes or fails; idempotent).
   * Paired with registerAgentAbort.
   */
  unregisterAgentAbort?: (agentId: number) => void
}

/**
 * Agent backend adapter. The engine only depends on this interface; concrete backends implement it and register into the registry.
 * initialize/dispose are optional lifecycle hooks (connection pool / resource management), triggered by the caller via
 * registry.initializeAll/disposeAll.
 */
export interface AgentAdapter {
  /** Unique identifier (registry routing / logging). */
  readonly id: string
  /** Capability declaration. */
  readonly capabilities: AgentAdapterCapabilities
  /** Execute one agent call. */
  run(params: AgentRunParams, ctx: AgentAdapterContext): Promise<AgentRunResult>
  /** Initialize (triggered by registry.initializeAll). */
  initialize?(): Promise<void>
  /** Dispose (triggered by registry.disposeAll). */
  dispose?(): Promise<void>
}

/** Routing rule: decides which params go to which adapter. Matched in insertion order; first hit wins. */
export type AdapterRouteRule =
  | { kind: 'agentType'; agentType: string; adapter: string }
  | { kind: 'model'; pattern: string; adapter: string }
  | {
      kind: 'custom'
      match: (params: AgentRunParams) => boolean
      adapter: string
    }

/** Thrown when the registry cannot find a matching adapter. */
export class AdapterNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdapterNotFoundError'
  }
}

/**
 * Multi-backend registry. register registers an adapter, route/default configure routing, and resolve picks an adapter by
 * matching rules in order. The adapter lifecycle (initialize/dispose) is triggered uniformly via
 * initializeAll/disposeAll (called by the caller before/after the run).
 */
export class AgentAdapterRegistry {
  private readonly adapters = new Map<string, AgentAdapter>()
  private readonly rules: AdapterRouteRule[] = []
  private defaultId: string | null = null

  /** Register an adapter (duplicate id overwrites). Chainable. */
  register(adapter: AgentAdapter): this {
    this.adapters.set(adapter.id, adapter)
    return this
  }

  /** Set the default adapter (used when no rule matches). Chainable. */
  default(adapterId: string): this {
    this.defaultId = adapterId
    return this
  }

  /** Add a routing rule (matched in insertion order). Chainable. */
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

  /** Match by rules; return the first hit; if no hit, go to default; if neither, throw AdapterNotFoundError. */
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
      `No adapter matched (rules=${this.rules.length}, default=${this.defaultId ?? 'none'})`,
    )
  }

  /** Trigger initialize on all adapters (skips unimplemented ones). */
  async initializeAll(): Promise<void> {
    for (const a of this.adapters.values()) {
      await a.initialize?.()
    }
  }

  /** Trigger dispose on all adapters (skips unimplemented ones). */
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
  return rule.match(params) // custom rule
}
