import { readFile } from 'fs/promises'
import { join } from 'path'
import { roughTokenCountEstimation } from '../../services/tokenEstimation.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { getErrnoCode, toError } from '../../utils/errors.js'
import { logError } from '../../utils/log.js'

const MAX_SECTION_LENGTH = 2000
const MAX_TOTAL_SESSION_MEMORY_TOKENS = 12000

export const DEFAULT_SESSION_MEMORY_TEMPLATE = `
# 会话标题
_一个简短而独特、5-10 个词的会话描述性标题。信息密度极高，无冗余_

# 当前状态
_当前正在积极进行什么工作？尚未完成的待办任务。立即的下一步计划。_

# 任务规范
_用户要求构建什么？任何设计决策或其他解释性上下文_

# 文件和函数
_哪些是重要的文件？简要说明它们包含什么以及为什么相关？_

# 工作流程
_通常按什么顺序运行哪些 bash 命令？如果不明显，如何解释它们的输出？_

# 错误与修正
_遇到的错误以及如何修复。用户纠正了什么？哪些方法失败且不应再尝试？_

# 代码库与系统文档
_重要的系统组件有哪些？它们如何工作/组合在一起？_

# 经验教训
_什么方法有效？什么无效？应避免什么？不要重复其他部分的内容_

# 关键结果
_如果用户要求了特定输出，例如问题的答案、表格或其他文档，请在此处重复确切的结果_

# 工作日志
_逐步记录尝试了什么、完成了什么。每个步骤非常简短的总结_
`

function getDefaultUpdatePrompt(): string {
  return `重要提示：此消息及其指令并非实际用户对话的一部分。请勿在笔记内容中提及任何“做笔记”、“会话笔记提取”或这些更新指令。

根据上述用户对话（不包括此做笔记指令消息以及系统提示、claude.md 条目或任何过去的会话摘要），更新会话笔记文件。

文件 {{notesPath}} 已经为您读取。以下是其当前内容：
<current_notes_content>
{{currentNotes}}
</current_notes_content>

您唯一的任务是使用 Edit 工具更新笔记文件，然后停止。您可以进行多次编辑（根据需要更新每个部分）—— 在单条消息中并行执行所有 Edit 工具调用。不要调用任何其他工具。

编辑的关键规则：
- 文件必须保持其确切的结构，包含所有部分、标题和斜体描述
-- 绝不要修改、删除或添加章节标题（以 '#' 开头的行，如 # 任务规范）
-- 绝不要修改或删除斜体的 _章节描述_ 行（这些是紧跟在每个标题后的斜体行，以和下划线开头和结尾）
-- 斜体的 _章节描述_ 是模板指令，必须原样保留 —— 它们指导每个部分应包含什么内容
-- 仅更新出现在斜体 _章节描述_ 行下方、每个现有部分内的实际内容
-- 不要在现有结构之外添加任何新的部分、摘要或信息
- 在笔记的任何地方都不要提及此做笔记过程或指令
- 如果某个部分没有实质性的新见解可以添加，可以跳过更新。不要添加如“暂无信息”之类的填充内容，如果合适就让部分留空/不编辑。
- 为每个部分编写详细、信息密集的内容 —— 包括具体的细节，如文件路径、函数名、错误消息、确切的命令、技术细节等。
- 对于“关键结果”，包含用户请求的完整、确切的输出（例如完整的表格、完整的答案等）
- 不要包含已经存在于上下文中的 CLAUDE.md 文件中的信息
- 保持每个部分不超过约 ${MAX_SECTION_LENGTH} 个令牌/单词 —— 如果一个部分接近此限制，通过淘汰不太重要的细节来压缩它，同时保留最关键的信息
- 专注于可操作的、具体的信息，这些信息将帮助某人理解或重现对话中讨论的工作
- 重要提示：始终更新“当前状态”以反映最近的工作 —— 这对于压缩后的连续性至关重要

使用带有 file_path: {{notesPath}} 的 Edit 工具

结构保留提醒：
每个部分有两个必须原样保留的部分，正如它们在当前文件中出现的那样：
1. 章节标题（以 # 开头的行）
2. 斜体描述行（标题后紧跟的 _斜体文本_ —— 这是一个模板指令）

您只更新这两个保留行之后出现的实际内容。以和下划线开头和结尾的斜体描述行是模板结构的一部分，而不是要编辑或删除的内容。

记住：并行使用 Edit 工具，然后停止。编辑后不要继续。仅包含来自实际用户对话的见解，绝不要来自这些做笔记指令。不要删除或更改章节标题或斜体的 _章节描述_。`
}

/**
 * 如果存在自定义会话内存模板文件，则加载它
 */
export async function loadSessionMemoryTemplate(): Promise<string> {
  const templatePath = join(
    getClaudeConfigHomeDir(),
    'session-memory',
    'config',
    'template.md',
  )

  try {
    return await readFile(templatePath, { encoding: 'utf-8' })
  } catch (e: unknown) {
    const code = getErrnoCode(e)
    if (code === 'ENOENT') {
      return DEFAULT_SESSION_MEMORY_TEMPLATE
    }
    logError(toError(e))
    return DEFAULT_SESSION_MEMORY_TEMPLATE
  }
}

/**
 * 如果存在自定义会话内存提示文件，则加载它
 * 自定义提示可以放置在 ~/.claude/session-memory/prompt.md
 * 使用 {{variableName}} 语法进行变量替换（例如 {{currentNotes}}、{{notesPath}}）
 */
export async function loadSessionMemoryPrompt(): Promise<string> {
  const promptPath = join(
    getClaudeConfigHomeDir(),
    'session-memory',
    'config',
    'prompt.md',
  )

  try {
    return await readFile(promptPath, { encoding: 'utf-8' })
  } catch (e: unknown) {
    const code = getErrnoCode(e)
    if (code === 'ENOENT') {
      return getDefaultUpdatePrompt()
    }
    logError(toError(e))
    return getDefaultUpdatePrompt()
  }
}

/**
 * 解析会话内存文件并分析各部分的大小
 */
function analyzeSectionSizes(content: string): Record<string, number> {
  const sections: Record<string, number> = {}
  const lines = content.split('\n')
  let currentSection = ''
  let currentContent: string[] = []

  for (const line of lines) {
    if (line.startsWith('# ')) {
      if (currentSection && currentContent.length > 0) {
        const sectionContent = currentContent.join('\n').trim()
        sections[currentSection] = roughTokenCountEstimation(sectionContent)
      }
      currentSection = line
      currentContent = []
    } else {
      currentContent.push(line)
    }
  }

  if (currentSection && currentContent.length > 0) {
    const sectionContent = currentContent.join('\n').trim()
    sections[currentSection] = roughTokenCountEstimation(sectionContent)
  }

  return sections
}

/**
 * 为过长的部分生成提醒
 */
function generateSectionReminders(
  sectionSizes: Record<string, number>,
  totalTokens: number,
): string {
  const overBudget = totalTokens > MAX_TOTAL_SESSION_MEMORY_TOKENS
  const oversizedSections = Object.entries(sectionSizes)
    .filter(([_, tokens]) => tokens > MAX_SECTION_LENGTH)
    .sort(([, a], [, b]) => b - a)
    .map(
      ([section, tokens]) =>
        `- “${section}” 约为 ${tokens} 个令牌（限制：${MAX_SECTION_LENGTH}）`,
    )

  if (oversizedSections.length === 0 && !overBudget) {
    return ''
  }

  const parts: string[] = []

  if (overBudget) {
    parts.push(
      `\n\n关键提示：会话内存文件当前约为 ${totalTokens} 个令牌，超过了最大限制 ${MAX_TOTAL_SESSION_MEMORY_TOKENS} 个令牌。您必须将文件压缩到此预算内。通过删除不太重要的细节、合并相关条目以及总结较旧的条目来积极缩短过长的部分。优先保持“当前状态”和“错误与修正”准确且详细。`,
    )
  }

  if (oversizedSections.length > 0) {
    parts.push(
      `\n\n${overBudget ? '需要压缩的过长部分' : '重要提示：以下部分超过了每部分的限制，必须压缩'}：\n${oversizedSections.join('\n')}`,
    )
  }

  return parts.join('')
}

/**
 * 使用 {{variable}} 语法在提示模板中替换变量
 */
function substituteVariables(
  template: string,
  variables: Record<string, string>,
): string {
  // 单次替换避免两个错误：(1) $ 反向引用损坏（替换函数将 $ 视为字面量），以及 (2) 当用户内容恰好包含 {{varName}} 匹配后续变量时的双重替换。
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.hasOwn(variables, key) ? variables[key]! : match,
  )
}

/**
 * 检查会话内存内容是否基本上为空（与模板匹配）。
 * 用于检测是否尚未提取实际内容，
 * 这意味着我们应该回退到旧的压缩行为。
 */
export async function isSessionMemoryEmpty(content: string): Promise<boolean> {
  const template = await loadSessionMemoryTemplate()
  // 比较修剪后的内容以检测是否仅仅是模板
  return content.trim() === template.trim()
}

export async function buildSessionMemoryUpdatePrompt(
  currentNotes: string,
  notesPath: string,
): Promise<string> {
  const promptTemplate = await loadSessionMemoryPrompt()

  // 分析各部分大小并在需要时生成提醒
  const sectionSizes = analyzeSectionSizes(currentNotes)
  const totalTokens = roughTokenCountEstimation(currentNotes)
  const sectionReminders = generateSectionReminders(sectionSizes, totalTokens)

  // 在提示中替换变量
  const variables = {
    currentNotes,
    notesPath,
  }

  const basePrompt = substituteVariables(promptTemplate, variables)

  // 添加部分大小提醒和/或总预算警告
  return basePrompt + sectionReminders
}

/**
 * 压缩会话内存中超过每部分令牌限制的部分。
 * 在将会话内存插入压缩消息时使用，以防止过大的会话内存消耗压缩后的令牌预算。
 *
 * 返回压缩后的内容以及是否发生了压缩。
 */
export function truncateSessionMemoryForCompact(content: string): {
  truncatedContent: string
  wasTruncated: boolean
} {
  const lines = content.split('\n')
  const maxCharsPerSection = MAX_SECTION_LENGTH * 4 // roughTokenCountEstimation 使用 length/4
  const outputLines: string[] = []
  let currentSectionLines: string[] = []
  let currentSectionHeader = ''
  let wasTruncated = false

  for (const line of lines) {
    if (line.startsWith('# ')) {
      const result = flushSessionSection(
        currentSectionHeader,
        currentSectionLines,
        maxCharsPerSection,
      )
      outputLines.push(...result.lines)
      wasTruncated = wasTruncated || result.wasTruncated
      currentSectionHeader = line
      currentSectionLines = []
    } else {
      currentSectionLines.push(line)
    }
  }

  // 刷新最后一个部分
  const result = flushSessionSection(
    currentSectionHeader,
    currentSectionLines,
    maxCharsPerSection,
  )
  outputLines.push(...result.lines)
  wasTruncated = wasTruncated || result.wasTruncated

  return {
    truncatedContent: outputLines.join('\n'),
    wasTruncated,
  }
}

function flushSessionSection(
  sectionHeader: string,
  sectionLines: string[],
  maxCharsPerSection: number,
): { lines: string[]; wasTruncated: boolean } {
  if (!sectionHeader) {
    return { lines: sectionLines, wasTruncated: false }
  }

  const sectionContent = sectionLines.join('\n')
  if (sectionContent.length <= maxCharsPerSection) {
    return { lines: [sectionHeader, ...sectionLines], wasTruncated: false }
  }

  // 在接近限制的行边界处截断
  let charCount = 0
  const keptLines: string[] = [sectionHeader]
  for (const line of sectionLines) {
    if (charCount + line.length + 1 > maxCharsPerSection) {
      break
    }
    keptLines.push(line)
    charCount += line.length + 1
  }
  keptLines.push('\n[... 部分因长度过长已截断 ...]')
  return { lines: keptLines, wasTruncated: true }
}
