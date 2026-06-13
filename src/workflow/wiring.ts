import {
  createWorkflowTool,
  workflowInputSchema,
  WORKFLOW_TOOL_NAME,
  type WorkflowToolDescriptor,
} from '@claude-code-best/workflow-engine'
import { buildTool, type Tool } from '../Tool.js'
import { getWorkflowService } from './service.js'

/**
 * 把引擎自包含描述符适配为 buildTool 兼容的 Tool。
 * 描述符统一走 service 单例（共享 ports/registry/store）。
 *
 * ports 解析延迟到首次实际方法调用（lazy）：tools.ts 在模块加载阶段（feature-gated）
 * 调用 createWorkflowToolCore()，若此时立即解析 ports 会触发 service 实例化，
 * 进而调用 getProjectRoot 等模块级副作用——这在 bootstrap 完成前可能拿到错误路径。
 * Tool 对象本身的单例由 createWorkflowToolCore 的 cached 保证（PermissionRequest
 * 按引用匹配），ports 单例由 getWorkflowService 保证。
 */
function buildWorkflowTool(): Tool {
  let cachedDescriptor: WorkflowToolDescriptor | null = null
  const descriptor = (): WorkflowToolDescriptor => {
    if (!cachedDescriptor) {
      const { ports } = getWorkflowService()
      cachedDescriptor = createWorkflowTool(ports)
    }
    return cachedDescriptor
  }
  return buildTool({
    name: WORKFLOW_TOOL_NAME,
    maxResultSizeChars: 50_000,
    inputSchema: workflowInputSchema,
    isEnabled: () => descriptor().isEnabled(),
    isReadOnly: input => descriptor().isReadOnly(input),
    isConcurrencySafe: () => true,
    async description() {
      return descriptor().description()
    },
    async prompt() {
      return descriptor().prompt()
    },
    async call(input, context, canUseTool, parentMessage, onProgress) {
      const result = await descriptor().call(
        input,
        context,
        canUseTool,
        parentMessage,
        onProgress,
      )
      return { data: result.data }
    },
    renderToolUseMessage: input => descriptor().renderToolUseMessage(input),
    mapToolResultToToolResultBlockParam: (data, toolUseId) =>
      descriptor().mapToolResultToToolResultBlockParam(data, toolUseId),
  })
}

// 单例：tools.ts 注册与 PermissionRequest 引用需为同一实例（switch 按引用匹配）。
let cached: Tool | null = null

export function createWorkflowToolCore(): Tool {
  if (!cached) cached = buildWorkflowTool()
  return cached
}
