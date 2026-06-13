import {
  createWorkflowTool,
  type WorkflowToolDescriptor,
} from '@claude-code-best/workflow-engine'
import { buildTool, type Tool } from '../Tool.js'
import { getWorkflowService } from './service.js'

/**
 * 把引擎自包含描述符适配为 buildTool 兼容的 Tool。
 * 描述符统一走 service 单例（共享 ports/registry/store）。
 */
function buildWorkflowTool(): Tool {
  const { ports } = getWorkflowService()
  const descriptor: WorkflowToolDescriptor = createWorkflowTool(ports)
  return buildTool({
    name: descriptor.name,
    maxResultSizeChars: 50_000,
    inputSchema: descriptor.inputSchema,
    isEnabled: () => descriptor.isEnabled(),
    isReadOnly: input => descriptor.isReadOnly(input),
    isConcurrencySafe: () => true,
    async description() {
      return descriptor.description()
    },
    async prompt() {
      return descriptor.prompt()
    },
    async call(input, context, canUseTool, parentMessage, onProgress) {
      const result = await descriptor.call(
        input,
        context,
        canUseTool,
        parentMessage,
        onProgress,
      )
      return { data: result.data }
    },
    renderToolUseMessage: input => descriptor.renderToolUseMessage(input),
    mapToolResultToToolResultBlockParam: (data, toolUseId) =>
      descriptor.mapToolResultToToolResultBlockParam(data, toolUseId),
  })
}

// 单例：tools.ts 注册与 PermissionRequest 引用需为同一实例（switch 按引用匹配）。
let cached: Tool | null = null

export function createWorkflowToolCore(): Tool {
  if (!cached) cached = buildWorkflowTool()
  return cached
}
