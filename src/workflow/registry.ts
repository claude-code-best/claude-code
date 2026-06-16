import { AgentAdapterRegistry } from '@claude-code-best/workflow-engine'
import { claudeCodeBackend } from './backends/claudeCodeBackend.js'

/**
 * Build a multi-backend registry. v1 (depth B) only registers a single
 * claude-code adapter as default, without prefilling routing rules — add
 * .route(...) when extending with a second provider adapter.
 */
export function buildRegistry(): AgentAdapterRegistry {
  const reg = new AgentAdapterRegistry()
  reg.register(claudeCodeBackend).default('claude-code')
  return reg
}
