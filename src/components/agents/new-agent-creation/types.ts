import type { CustomAgentDefinition } from '@claude-code-best/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import type { AgentMemoryScope } from '@claude-code-best/builtin-tools/tools/AgentTool/agentMemory.js'
import type { SettingSource } from '../../../utils/settings/constants.js'

/**
 * 「新建代理」向导在各步骤之间传递的可变状态。
 * 字段随步骤渐进填充；`finalAgent` 在确认前由 Color 步骤合成。
 */
export type AgentWizardData = {
  systemPrompt?: string // 系统提示词终稿
  agentType?: string // 代理类型 slug（目录名）
  generationPrompt?: string // 「生成模式」下用户输入的说明全文
  selectedTools?: string[] // 限制可用工具；undefined 表示全量
  whenToUse?: string // 「何时调用」描述（whenToUse）
  location?: SettingSource // 落盘位置：项目或个人 settings
  selectedModel?: string // 覆盖默认模型（可选）
  selectedColor?: string // 终端高亮色（可选）
  wasGenerated?: boolean // 是否经模型一键生成过配置
  method?: 'generate' | 'manual' // 创建路径：生成 vs 手工
  isGenerating?: boolean // 生成请求进行中（用于 UI 防抖）
  generatedAgent?: {
    identifier: string // 生成器返回的 agentType 候选
    whenToUse: string // 生成器返回的描述
    systemPrompt: string // 生成器返回的系统提示
  }
  selectedMemory?: AgentMemoryScope // Memory 步骤选择的记忆作用域
  finalAgent?: CustomAgentDefinition // 确认保存前的完整代理定义草稿
}
