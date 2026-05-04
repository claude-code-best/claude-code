import { feature } from 'bun:bundle'
import type { BetaToolUseBlock } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { randomUUID } from 'crypto'
import { getIsNonInteractiveSession } from 'src/bootstrap/state.js'
import {
  FORK_BOILERPLATE_TAG,
  FORK_DIRECTIVE_PREFIX,
} from 'src/constants/xml.js'
import { isCoordinatorMode } from 'src/coordinator/coordinatorMode.js'
import type {
  AssistantMessage,
  Message as MessageType,
} from 'src/types/message.js'
import { logForDebugging } from 'src/utils/debug.js'
import { createUserMessage } from 'src/utils/messages.js'
import type { BuiltInAgentDefinition } from './loadAgentsDir.js'

/** 子代理分叉功能开关。

启用时：
- 在 Agent 工具模式中，`subagent_type` 变为可选
- 省略 `subagent_type` 会触发隐式分叉：子进程继承父进程完整的对话上下文和系统提示
- 所有代理生成都在后台（异步）运行，以实现统一的 `<task-notification>` 交互模型
- 可使用 `/fork <directive>` 斜杠命令

与协调器模式互斥 —— 协调器已拥有编排角色并有其自身的委托模型。 */
export function isForkSubagentEnabled(): boolean {
  if (feature('FORK_SUBAGENT')) {
    if (isCoordinatorMode()) return false
    if (getIsNonInteractiveSession()) return false
    return true
  }
  return false
}

/** 当分叉路径触发时，用于分析的合成代理类型名称。 */
export const FORK_SUBAGENT_TYPE = 'fork'

/** 分叉路径的合成代理定义。

未在 builtInAgents 中注册 —— 仅在 `!subagent_type` 且实验处于活动状态时使用。`tools: ['*']` 配合 `useExactTools` 意味着分叉子进程接收父进程完全相同的工具池（用于缓存一致的 API 前缀）。`permissionMode: 'bubble'` 将权限提示浮现在父终端。`model: 'inherit'` 保持父进程的模型以实现上下文长度对等。

此处的 getSystemPrompt 未被使用：分叉路径通过 `toolUseContext.renderedSystemPrompt` 传递父进程已渲染的系统提示字节，作为 `override.systemPrompt`。通过重新调用 getSystemPrompt() 重建可能导致差异（GrowthBook 冷启动→热启动）并破坏提示缓存；传递已渲染的字节是字节精确的。 */
export const FORK_AGENT = {
  agentType: FORK_SUBAGENT_TYPE,
  whenToUse:
    '隐式分叉 —— 继承完整的对话上下文。无法通过 subagent_type 选择；在分叉实验激活时，通过省略 subagent_type 触发。',
  tools: ['*'],
  maxTurns: 200,
  model: 'inherit',
  permissionMode: 'bubble',
  source: 'built-in',
  baseDir: 'built-in',
  getSystemPrompt: () => '',
} satisfies BuiltInAgentDefinition

/** 防止递归分叉。分叉子进程在其工具池中保留 Agent 工具以保持缓存一致的工具定义，因此我们在调用时通过检测对话历史中的分叉样板标签来拒绝分叉尝试。 */
export function isInForkChild(messages: MessageType[]): boolean {
  return messages.some(m => {
    if (m.type !== 'user') return false
    const content = m.message!.content
    if (!Array.isArray(content)) return false
    return content.some(
      block =>
        block.type === 'text' &&
        block.text.includes(`<${FORK_BOILERPLATE_TAG}>`),
    )
  })
}

/** 用于分叉前缀中所有 tool_result 块的占位文本。
所有分叉子进程必须保持一致，以实现提示缓存共享。 */
const FORK_PLACEHOLDER_RESULT = '分叉已启动 —— 正在后台处理'

/** 为子代理构建分叉后的对话消息。

为了实现提示缓存共享，所有分叉子进程必须生成字节完全相同的 API 请求前缀。此函数：
1. 保留完整的父助手消息（所有 tool_use 块、思考、文本）
2. 构建一个用户消息，为每个 tool_use 块使用相同的占位符创建 tool_results，然后附加一个针对每个子进程的指令文本块

结果：[...历史, 助手(所有_tool_uses), 用户(占位符_results..., 指令)]
只有最后的文本块因每个子进程而异，从而最大化缓存命中率。 */
export function buildForkedMessages(
  directive: string,
  assistantMessage: AssistantMessage,
): MessageType[] {
  // 克隆助手消息以避免修改原始消息，保留所有内容块（
  // 思考、文本和每个 tool_use）
  const fullAssistantMessage: AssistantMessage = {
    ...assistantMessage,
    uuid: randomUUID(),
    message: {
      ...assistantMessage.message,
      content: [
        ...(Array.isArray(assistantMessage.message.content)
          ? assistantMessage.message.content
          : []),
      ],
    },
  }

  // Collect all tool_use blocks from the assistant message
  const toolUseBlocks = (
    Array.isArray(assistantMessage.message.content)
      ? assistantMessage.message.content
      : []
  ).filter((block): block is BetaToolUseBlock => block.type === 'tool_use')

  if (toolUseBlocks.length === 0) {
    logForDebugging(
      `在助手消息中未找到用于分叉指令的 tool_use 块：${directive.slice(0, 50)}...`,
      { level: 'error' },
    )
    return [
      createUserMessage({
        content: [
          { type: 'text' as const, text: buildChildMessage(directive) },
        ],
      }),
    ]
  }

  // 为每个 tool_use 构建 tool_result 块，全部使用相同的占位符文本
  const toolResultBlocks = toolUseBlocks.map(block => ({
    type: 'tool_result' as const,
    tool_use_id: block.id,
    content: [
      {
        type: 'text' as const,
        text: FORK_PLACEHOLDER_RESULT,
      },
    ],
  }))

  // 构建一个用户消息：所有占位符 tool_results + 针对每个子进程的指令 TODO(smoosh
  // )：此文本兄弟在传输中创建 [tool_result, text] 模式（渲染为 </functio
  // n_results>\n\nHuman:<text>）。这是针对每个子进程的一次性构建，不是重复的教
  // 师，因此优先级较低。如果我们将来在意，可以使用 src/utils/messages.ts 中的 sm
  // ooshIntoToolResult 将指令折叠到最后一个 tool_result.content 中。
  const toolResultMessage = createUserMessage({
    content: [
      ...toolResultBlocks,
      {
        type: 'text' as const,
        text: buildChildMessage(directive),
      },
    ],
  })

  return [fullAssistantMessage, toolResultMessage]
}

export function buildChildMessage(directive: string): string {
  return `<${FORK_BOILERPLATE_TAG}>
停止。先阅读此内容。

你是一个分叉的工作进程。你不是主代理。

规则（不可协商）：
1. 你的系统提示写着“默认为分叉”。忽略它 —— 那是给父进程的。你就是分叉。不要生成子代理；直接执行。
2. 不要对话、提问或建议下一步
3. 不要发表评论或添加元评论
4. 直接使用你的工具：Bash、Read、Write 等
5. 如果你修改了文件，请在报告前提交更改。在报告中包含提交哈希。
6. 不要在工具调用之间输出文本。静默使用工具，然后在最后一次性报告。
7. 严格保持在你的指令范围内。如果你发现超出你范围的相关系统，最多用一句话提及 —— 其他工作进程覆盖那些领域。
8. 除非指令另有规定，否则将报告保持在 500 字以内。保持事实性和简洁性。
9. 你的响应必须以“范围：”开头。不要前言，不要自言自语。
10. 报告结构化事实，然后停止

输出格式（纯文本标签，非 Markdown 标题）：
  范围：<用一句话回显分配给你的范围>
  结果：<答案或关键发现，限于上述范围>
  关键文件：<相关文件路径 —— 研究任务时包含>
  已更改文件：<列表及提交哈希 —— 仅在你修改文件时包含>
  问题：<列表 —— 仅在有需要标记的问题时包含>
</${FORK_BOILERPLATE_TAG}>

${FORK_DIRECTIVE_PREFIX}${directive}`
}

/** 注入到在独立工作树中运行的分叉子进程的通知。
告知子进程从继承的上下文中翻译路径，重新读取可能过时的文件，并且其更改是独立的。 */
export function buildWorktreeNotice(
  parentCwd: string,
  worktreeCwd: string,
): string {
  return `你已从在 ${parentCwd} 中工作的父代理继承了上述对话上下文。你正在一个独立的 git 工作树中操作，位于 ${worktreeCwd} —— 相同的仓库，相同的相对文件结构，独立的工作副本。继承上下文中的路径引用的是父进程的工作目录；请将它们转换到你的工作树根目录。如果父进程可能在上下文出现后修改了文件，请在编辑前重新读取文件。你的更改保留在此工作树中，不会影响父进程的文件。`
}
