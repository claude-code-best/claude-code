import { AgentAdapterRegistry } from '@claude-code-best/workflow-engine'
import { claudeCodeBackend } from './backends/claudeCodeBackend.js'

/**
 * 构建多后端 registry。v1（depth B）只注册单一 claude-code adapter 为默认，
 * 不预填路由规则——扩第二个 provider adapter 时再补 .route(...)。
 */
export function buildRegistry(): AgentAdapterRegistry {
  const reg = new AgentAdapterRegistry()
  reg.register(claudeCodeBackend).default('claude-code')
  return reg
}
