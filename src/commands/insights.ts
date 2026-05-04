import { execFileSync } from 'child_process'
import { diffLines } from 'diff'
import { constants as fsConstants, type Dirent } from 'fs'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  unlink,
  writeFile,
} from 'fs/promises'
import { tmpdir } from 'os'
import { extname, join } from 'path'
import type { Command } from '../commands.js'
import { queryWithModel } from '../services/api/claude.js'
import {
  AGENT_TOOL_NAME,
  LEGACY_AGENT_TOOL_NAME,
} from '@claude-code-best/builtin-tools/tools/AgentTool/constants.js'
import type { LogOption } from '../types/logs.js'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import { toError } from '../utils/errors.js'
import { execFileNoThrow } from '../utils/execFileNoThrow.js'
import { logError } from '../utils/log.js'
import { extractTextContent } from '../utils/messages.js'
import { getDefaultOpusModel } from '../utils/model/model.js'
import {
  getProjectsDir,
  getSessionFilesWithMtime,
  getSessionIdFromLog,
  loadAllLogsFromSessionFile,
} from '../utils/sessionStorage.js'
import { jsonParse, jsonStringify } from '../utils/slowOperations.js'
import { countCharInString } from '../utils/stringUtils.js'
import { asSystemPrompt } from '../utils/systemPromptType.js'
import { escapeXmlAttr as escapeHtml } from '../utils/xml.js'

// 用于方面提取和摘要的模型（Opus - 最佳质量）
function getAnalysisModel(): string {
  return getDefaultOpusModel()
}

// 用于叙事洞察的模型（Opus - 最佳质量）
function getInsightsModel(): string {
  return getDefaultOpusModel()
}

// ============================================================================
// Homespace 数据收集
// ============================================================================

type RemoteHostInfo = {
  name: string
  sessionCount: number
}

/* eslint-disable custom-rules/no-process-env-top-level */
const getRunningRemoteHosts: () => Promise<string[]> =
  process.env.USER_TYPE === 'ant'
    ? async () => {
        const { stdout, code } = await execFileNoThrow(
          'coder',
          ['list', '-o', 'json'],
          { timeout: 30000 },
        )
        if (code !== 0) return []
        try {
          const workspaces = jsonParse(stdout) as Array<{
            name: string
            latest_build?: { status?: string }
          }>
          return workspaces
            .filter(w => w.latest_build?.status === 'running')
            .map(w => w.name)
        } catch {
          return []
        }
      }
    : async () => []

const getRemoteHostSessionCount: (hs: string) => Promise<number> =
  process.env.USER_TYPE === 'ant'
    ? async (homespace: string) => {
        const { stdout, code } = await execFileNoThrow(
          'ssh',
          [
            `${homespace}.coder`,
            'find /root/.claude/projects -name "*.jsonl" 2>/dev/null | wc -l',
          ],
          { timeout: 30000 },
        )
        if (code !== 0) return 0
        return parseInt(stdout.trim(), 10) || 0
      }
    : async () => 0

const collectFromRemoteHost: (
  hs: string,
  destDir: string,
) => Promise<{ copied: number; skipped: number }> =
  process.env.USER_TYPE === 'ant'
    ? async (homespace: string, destDir: string) => {
        const result = { copied: 0, skipped: 0 }

        // 创建临时目录
        const tempDir = await mkdtemp(join(tmpdir(), 'claude-hs-'))

        try {
          // SCP 项目文件夹
          const scpResult = await execFileNoThrow(
            'scp',
            ['-rq', `${homespace}.coder:/root/.claude/projects/`, tempDir],
            { timeout: 300000 },
          )
          if (scpResult.code !== 0) {
            // SCP 失败
            return result
          }

          const projectsDir = join(tempDir, 'projects')
          let projectDirents: Dirent<string>[]
          try {
            projectDirents = await readdir(projectsDir, { withFileTypes: true })
          } catch {
            return result
          }

          // 合并到目标目录（按项目目录并行处理）
          await Promise.all(
            projectDirents.map(async dirent => {
              const projectName = dirent.name
              const projectPath = join(projectsDir, projectName)

              // 如果不是目录则跳过
              if (!dirent.isDirectory()) return

              const destProjectName = `${projectName}__${homespace}`
              const destProjectPath = join(destDir, destProjectName)

              try {
                await mkdir(destProjectPath, { recursive: true })
              } catch {
                // 目录可能已存在
              }

              // 复制会话文件（跳过已存在的）
              let files: Dirent<string>[]
              try {
                files = await readdir(projectPath, { withFileTypes: true })
              } catch {
                return
              }
              await Promise.all(
                files.map(async fileDirent => {
                  const fileName = fileDirent.name
                  if (!fileName.endsWith('.jsonl')) return

                  const srcFile = join(projectPath, fileName)
                  const destFile = join(destProjectPath, fileName)

                  try {
                    await copyFile(srcFile, destFile, fsConstants.COPYFILE_EXCL)
                    result.copied++
                  } catch {
                    // COPYFILE_EXCL 返回的 EEXIST 表示目标已存在
                    result.skipped++
                  }
                }),
              )
            }),
          )
        } finally {
          try {
            await rm(tempDir, { recursive: true, force: true })
          } catch {
            // 忽略清理错误
          }
        }

        return result
      }
    : async () => ({ copied: 0, skipped: 0 })

const collectAllRemoteHostData: (destDir: string) => Promise<{
  hosts: RemoteHostInfo[]
  totalCopied: number
  totalSkipped: number
}> =
  process.env.USER_TYPE === 'ant'
    ? async (destDir: string) => {
        const rHosts = await getRunningRemoteHosts()
        const result: RemoteHostInfo[] = []
        let totalCopied = 0
        let totalSkipped = 0

        // 并行从所有主机收集（每台主机的 SCP 可能需要几秒钟）
        const hostResults = await Promise.all(
          rHosts.map(async hs => {
            const sessionCount = await getRemoteHostSessionCount(hs)
            if (sessionCount > 0) {
              const { copied, skipped } = await collectFromRemoteHost(
                hs,
                destDir,
              )
              return { name: hs, sessionCount, copied, skipped }
            }
            return { name: hs, sessionCount, copied: 0, skipped: 0 }
          }),
        )

        for (const hr of hostResults) {
          result.push({ name: hr.name, sessionCount: hr.sessionCount })
          totalCopied += hr.copied
          totalSkipped += hr.skipped
        }

        return { hosts: result, totalCopied, totalSkipped }
      }
    : async () => ({ hosts: [], totalCopied: 0, totalSkipped: 0 })
/* eslint-enable custom-rules/no-process-env-top-level */

// ============================================================================
// 类型
// ============================================================================

type SessionMeta = {
  session_id: string
  project_path: string
  start_time: string
  duration_minutes: number
  user_message_count: number
  assistant_message_count: number
  tool_counts: Record<string, number>
  languages: Record<string, number>
  git_commits: number
  git_pushes: number
  input_tokens: number
  output_tokens: number
  first_prompt: string
  summary?: string
  // 新统计信息
  user_interruptions: number
  user_response_times: number[]
  tool_errors: number
  tool_error_categories: Record<string, number>
  uses_task_agent: boolean
  uses_mcp: boolean
  uses_web_search: boolean
  uses_web_fetch: boolean
  // 附加统计信息
  lines_added: number
  lines_removed: number
  files_modified: number
  message_hours: number[]
  user_message_timestamps: string[] // 用于检测多 Claude 实例的 ISO 时间戳
}

type SessionFacets = {
  session_id: string
  underlying_goal: string
  goal_categories: Record<string, number>
  outcome: string
  user_satisfaction_counts: Record<string, number>
  claude_helpfulness: string
  session_type: string
  friction_counts: Record<string, number>
  friction_detail: string
  primary_success: string
  brief_summary: string
  user_instructions_to_claude?: string[]
}

type AggregatedData = {
  total_sessions: number
  total_sessions_scanned?: number
  sessions_with_facets: number
  date_range: { start: string; end: string }
  total_messages: number
  total_duration_hours: number
  total_input_tokens: number
  total_output_tokens: number
  tool_counts: Record<string, number>
  languages: Record<string, number>
  git_commits: number
  git_pushes: number
  projects: Record<string, number>
  goal_categories: Record<string, number>
  outcomes: Record<string, number>
  satisfaction: Record<string, number>
  helpfulness: Record<string, number>
  session_types: Record<string, number>
  friction: Record<string, number>
  success: Record<string, number>
  session_summaries: Array<{
    id: string
    date: string
    summary: string
    goal?: string
  }>
  // 新的聚合统计信息
  total_interruptions: number
  total_tool_errors: number
  tool_error_categories: Record<string, number>
  user_response_times: number[]
  median_response_time: number
  avg_response_time: number
  sessions_using_task_agent: number
  sessions_using_mcp: number
  sessions_using_web_search: number
  sessions_using_web_fetch: number
  // 来自 Python 参考的附加统计信息
  total_lines_added: number
  total_lines_removed: number
  total_files_modified: number
  days_active: number
  messages_per_day: number
  message_hours: number[] // 每条用户消息的小时（用于一天中的时间图表）多 Claud
  // e 实例统计信息（与 Python 参考匹配）
  multi_clauding: {
    overlap_events: number
    sessions_involved: number
    user_messages_during: number
  }
}

// ============================================================================
// 常量
// ============================================================================

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.py': 'Python',
  '.rb': 'Ruby',
  '.go': 'Go',
  '.rs': 'Rust',
  '.java': 'Java',
  '.md': 'Markdown',
  '.json': 'JSON',
  '.yaml': 'YAML',
  '.yml': 'YAML',
  '.sh': 'Shell',
  '.css': 'CSS',
  '.html': 'HTML',
}

// 用于清理类别名称的标签映射（与 Python 参考匹配）
const LABEL_MAP: Record<string, string> = {
  // 目标类别
  debug_investigate: 'Debug/Investigate',
  implement_feature: '实现功能',
  fix_bug: '修复缺陷',
  write_script_tool: '编写脚本/工具',
  refactor_code: '重构代码',
  configure_system: '配置系统',
  create_pr_commit: '创建 PR/提交',
  analyze_data: '分析数据',
  understand_codebase: '理解代码库',
  write_tests: '编写测试',
  write_docs: '编写文档',
  deploy_infra: 'Deploy/Infra',
  warmup_minimal: '缓存预热',
  // 成功因素
  fast_accurate_search: '快速/准确的搜索',
  correct_code_edits: '正确的代码编辑',
  good_explanations: '清晰的解释',
  proactive_help: '主动帮助',
  multi_file_changes: '多文件变更',
  handled_complexity: '多文件变更',
  good_debugging: '良好的调试',
  // 摩擦类型
  misunderstood_request: '误解请求',
  wrong_approach: '错误的方法',
  buggy_code: '有缺陷的代码',
  user_rejected_action: '用户拒绝操作',
  claude_got_blocked: 'Claude 被阻止',
  user_stopped_early: '用户提前停止',
  wrong_file_or_location: '错误的文件/位置',
  excessive_changes: '过度变更',
  slow_or_verbose: 'Slow/Verbose',
  tool_failed: '工具失败',
  user_unclear: '用户表述不清',
  external_issue: '外部问题',
  // 满意度标签
  frustrated: 'Frustrated',
  dissatisfied: 'Dissatisfied',
  likely_satisfied: '可能满意',
  satisfied: 'Satisfied',
  happy: 'Happy',
  unsure: 'Unsure',
  neutral: 'Neutral',
  delighted: 'Delighted',
  // 会话类型
  single_task: '单任务',
  multi_task: '多任务',
  iterative_refinement: '迭代优化',
  exploration: 'Exploration',
  quick_question: '快速提问',
  // 成果
  fully_achieved: '完全达成',
  mostly_achieved: '基本达成',
  partially_achieved: '部分达成',
  not_achieved: '未达成',
  unclear_from_transcript: 'Unclear',
  // 帮助程度
  unhelpful: 'Unhelpful',
  slightly_helpful: '略有帮助',
  moderately_helpful: '中等帮助',
  very_helpful: '非常有帮助',
  essential: 'Essential',
}

// 惰性 getter：getClaudeConfigHomeDir() 已做记忆化处理，会
// 读取 process.env。在模块作用域调用它，会在入口点设置 CLAUDE_
// CONFIG_DIR 之前就填充记忆化缓存，从而导致其他 150 多个调用者全部失效。
function getDataDir(): string {
  return join(getClaudeConfigHomeDir(), 'usage-data')
}
function getFacetsDir(): string {
  return join(getDataDir(), 'facets')
}
function getSessionMetaDir(): string {
  return join(getDataDir(), 'session-meta')
}

const FACET_EXTRACTION_PROMPT = `分析此 Claude Code 会话并提取结构化信息。

关键指南：

1. **goal_categories**：仅统计用户明确提出的要求。
   - 不要统计 Claude 自主进行的代码库探索
   - 不要统计 Claude 自行决定执行的工作
   - 仅当用户说“你能...”、“请...”、“我需要...”、“让我们...”时才统计

2. **user_satisfaction_counts**：仅基于明确的用户信号。
   - “太好了！”、“很棒！”、“完美！” → 高兴
   - “谢谢”、“看起来不错”、“可以了” → 满意
   - “好的，现在让我们...”（无抱怨地继续） → 可能满意
   - “不对”、“再试一次” → 不满意
   - “这坏了”、“我放弃了” → 沮丧

3. **friction_counts**：具体说明出了什么问题。
   - misunderstood_request：Claude 理解错误
   - wrong_approach：目标正确，但解决方法错误
   - buggy_code：代码无法正常工作
   - user_rejected_action：用户对工具调用说“不”/“停止”
   - excessive_changes：过度设计或改动过多

4. 如果会话非常简短或只是热身，则 goal_category 使用 warmup_minimal

会话：`

// ============================================================================
// 辅助函数
// ============================================================================

function getLanguageFromPath(filePath: string): string | null {
  const ext = extname(filePath).toLowerCase()
  return EXTENSION_TO_LANGUAGE[ext] || null
}

function extractToolStats(log: LogOption): {
  toolCounts: Record<string, number>
  languages: Record<string, number>
  gitCommits: number
  gitPushes: number
  inputTokens: number
  outputTokens: number
  // 新统计数据
  userInterruptions: number
  userResponseTimes: number[]
  toolErrors: number
  toolErrorCategories: Record<string, number>
  usesTaskAgent: boolean
  usesMcp: boolean
  usesWebSearch: boolean
  usesWebFetch: boolean
  // 附加统计数据
  linesAdded: number
  linesRemoved: number
  filesModified: Set<string>
  messageHours: number[]
  userMessageTimestamps: string[] // 用于检测多 Claude 实例的 ISO 时间戳
} {
  const toolCounts: Record<string, number> = {}
  const languages: Record<string, number> = {}
  let gitCommits = 0
  let gitPushes = 0
  let inputTokens = 0
  let outputTokens = 0

  // 新统计数据
  let userInterruptions = 0
  const userResponseTimes: number[] = []
  let toolErrors = 0
  const toolErrorCategories: Record<string, number> = {}
  let usesTaskAgent = false

  // 附加统计数据
  let linesAdded = 0
  let linesRemoved = 0
  const filesModified = new Set<string>()
  const messageHours: number[] = []
  const userMessageTimestamps: string[] = [] // 用于检测多 Claude 实例
  let usesMcp = false
  let usesWebSearch = false
  let usesWebFetch = false
  let lastAssistantTimestamp: string | null = null

  for (const msg of log.messages) {
    // 获取消息时间戳以计算响应时间
    const msgTimestamp = (msg as { timestamp?: string }).timestamp

    if (msg.type === 'assistant' && msg.message) {
      // 跟踪时间戳以计算响应时间
      if (msgTimestamp) {
        lastAssistantTimestamp = msgTimestamp
      }

      const usage = (
        msg.message as {
          usage?: { input_tokens?: number; output_tokens?: number }
        }
      ).usage
      if (usage) {
        inputTokens += usage.input_tokens || 0
        outputTokens += usage.output_tokens || 0
      }

      const content = msg.message.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_use' && 'name' in block) {
            const toolName = block.name as string
            toolCounts[toolName] = (toolCounts[toolName] || 0) + 1

            // 检查特殊工具使用情况
            if (
              toolName === AGENT_TOOL_NAME ||
              toolName === LEGACY_AGENT_TOOL_NAME
            )
              usesTaskAgent = true
            if (toolName.startsWith('mcp__')) usesMcp = true
            if (toolName === 'WebSearch') usesWebSearch = true
            if (toolName === 'WebFetch') usesWebFetch = true

            const input = (block as { input?: Record<string, unknown> }).input

            if (input) {
              const filePath = (input.file_path as string) || ''
              if (filePath) {
                const lang = getLanguageFromPath(filePath)
                if (lang) {
                  languages[lang] = (languages[lang] || 0) + 1
                }
                // 跟踪由编辑/写入工具修改的文件
                if (toolName === 'Edit' || toolName === 'Write') {
                  filesModified.add(filePath)
                }
              }

              if (toolName === 'Edit') {
                const oldString = (input.old_string as string) || ''
                const newString = (input.new_string as string) || ''
                for (const change of diffLines(oldString, newString)) {
                  if (change.added) linesAdded += change.count || 0
                  if (change.removed) linesRemoved += change.count || 0
                }
              }

              // 跟踪来自写入工具的行（全部为新增）
              if (toolName === 'Write') {
                const writeContent = (input.content as string) || ''
                if (writeContent) {
                  linesAdded += countCharInString(writeContent, '\n') + 1
                }
              }

              const command = (input.command as string) || ''
              if (command.includes('git commit')) gitCommits++
              if (command.includes('git push')) gitPushes++
            }
          }
        }
      }
    }

    // 检查用户消息
    if (msg.type === 'user' && msg.message) {
      const content = msg.message.content

      // 检查这是否为真实的人类消息（包含文本），而非仅匹配 Pyt
      // hon 参考逻辑的工具结果
      let isHumanMessage = false
      if (typeof content === 'string' && content.trim()) {
        isHumanMessage = true
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && 'text' in block) {
            isHumanMessage = true
            break
          }
        }
      }

      // 仅跟踪真实人类消息的小时数和响应时间
      if (isHumanMessage) {
        // 跟踪消息小时用于时间分析，跟踪时间戳用于多轮对话检测
        if (msgTimestamp) {
          try {
            const msgDate = new Date(msgTimestamp)
            const hour = msgDate.getHours() // 本地小时 0-23
            messageHours.push(hour)
            // 收集时间戳用于多轮对话检测（与 Python 逻辑匹配）
            userMessageTimestamps.push(msgTimestamp)
          } catch {
            // 跳过无效的时间戳
          }
        }

        // 计算响应时间（从上一条助手消息到当前用户消息的时间间隔）仅统计间
        // 隔大于 2 秒的情况（真实用户思考时间，而非工具结果）
        if (lastAssistantTimestamp && msgTimestamp) {
          const assistantTime = new Date(lastAssistantTimestamp).getTime()
          const userTime = new Date(msgTimestamp).getTime()
          const responseTimeSec = (userTime - assistantTime) / 1000
          // 仅统计合理的响应时间（2 秒至 1 小时），与 Python 逻辑匹配
          if (responseTimeSec > 2 && responseTimeSec < 3600) {
            userResponseTimes.push(responseTimeSec)
          }
        }
      }

      // 处理工具结果（用于错误跟踪）
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_result' && 'content' in block) {
            const isError = (block as { is_error?: boolean }).is_error

            // 统计并分类工具错误（匹配 Python 参考逻辑）
            if (isError) {
              toolErrors++
              const resultContent = (block as { content?: string }).content
              let category = 'Other'
              if (typeof resultContent === 'string') {
                const lowerContent = resultContent.toLowerCase()
                if (lowerContent.includes('exit code')) {
                  category = 'Command Failed'
                } else if (
                  lowerContent.includes('rejected') ||
                  lowerContent.includes("doesn't want")
                ) {
                  category = 'User Rejected'
                } else if (
                  lowerContent.includes('string to replace not found') ||
                  lowerContent.includes('no changes')
                ) {
                  category = 'Edit Failed'
                } else if (lowerContent.includes('modified since read')) {
                  category = 'File Changed'
                } else if (
                  lowerContent.includes('exceeds maximum') ||
                  lowerContent.includes('too large')
                ) {
                  category = 'File Too Large'
                } else if (
                  lowerContent.includes('file not found') ||
                  lowerContent.includes('does not exist')
                ) {
                  category = 'File Not Found'
                }
              }
              toolErrorCategories[category] =
                (toolErrorCategories[category] || 0) + 1
            }
          }
        }
      }

      // 检查中断情况（匹配 Python 参考逻辑）
      if (typeof content === 'string') {
        if (content.includes('[Request interrupted by user')) {
          userInterruptions++
        }
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (
            block.type === 'text' &&
            'text' in block &&
            (block.text as string).includes('[Request interrupted by user')
          ) {
            userInterruptions++
            break
          }
        }
      }
    }
  }

  return {
    toolCounts,
    languages,
    gitCommits,
    gitPushes,
    inputTokens,
    outputTokens,
    // New stats
    userInterruptions,
    userResponseTimes,
    toolErrors,
    toolErrorCategories,
    usesTaskAgent,
    usesMcp,
    usesWebSearch,
    usesWebFetch,
    // Additional stats
    linesAdded,
    linesRemoved,
    filesModified,
    messageHours,
    userMessageTimestamps,
  }
}

function hasValidDates(log: LogOption): boolean {
  return (
    !Number.isNaN(log.created.getTime()) &&
    !Number.isNaN(log.modified.getTime())
  )
}

function logToSessionMeta(log: LogOption): SessionMeta {
  const stats = extractToolStats(log)
  const sessionId = getSessionIdFromLog(log) || 'unknown'
  const startTime = log.created.toISOString()
  const durationMinutes = Math.round(
    (log.modified.getTime() - log.created.getTime()) / 1000 / 60,
  )

  let userMessageCount = 0
  let assistantMessageCount = 0
  for (const msg of log.messages) {
    if (msg.type === 'assistant') assistantMessageCount++
    // 仅统计包含实际文本内容的用户消息（人类消息），而非仅工具
    // 结果消息（与 Python 参考实现保持一致）
    if (msg.type === 'user' && msg.message) {
      const content = msg.message.content
      let isHumanMessage = false
      if (typeof content === 'string' && content.trim()) {
        isHumanMessage = true
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && 'text' in block) {
            isHumanMessage = true
            break
          }
        }
      }
      if (isHumanMessage) {
        userMessageCount++
      }
    }
  }

  return {
    session_id: sessionId,
    project_path: log.projectPath || '',
    start_time: startTime,
    duration_minutes: durationMinutes,
    user_message_count: userMessageCount,
    assistant_message_count: assistantMessageCount,
    tool_counts: stats.toolCounts,
    languages: stats.languages,
    git_commits: stats.gitCommits,
    git_pushes: stats.gitPushes,
    input_tokens: stats.inputTokens,
    output_tokens: stats.outputTokens,
    first_prompt: log.firstPrompt || '',
    summary: log.summary,
    // 新增统计
    user_interruptions: stats.userInterruptions,
    user_response_times: stats.userResponseTimes,
    tool_errors: stats.toolErrors,
    tool_error_categories: stats.toolErrorCategories,
    uses_task_agent: stats.usesTaskAgent,
    uses_mcp: stats.usesMcp,
    uses_web_search: stats.usesWebSearch,
    uses_web_fetch: stats.usesWebFetch,
    // 附加统计
    lines_added: stats.linesAdded,
    lines_removed: stats.linesRemoved,
    files_modified: stats.filesModified.size,
    message_hours: stats.messageHours,
    user_message_timestamps: stats.userMessageTimestamps,
  }
}

/** 在同一会话内对对话分支进行去重。

当会话文件包含多条叶节点消息（来自重试或分支）时，loadAllLogsFromSessionFile 会为每个叶节点生成一个 LogOption。每个分支共享相同的根消息，因此其持续时间与兄弟分支重叠。此操作仅保留每个 session_id 下用户消息最多的分支（若数量相同，则取持续时间最长的分支）。 */
export function deduplicateSessionBranches(
  entries: Array<{ log: LogOption; meta: SessionMeta }>,
): Array<{ log: LogOption; meta: SessionMeta }> {
  const bestBySession = new Map<string, { log: LogOption; meta: SessionMeta }>()
  for (const entry of entries) {
    const id = entry.meta.session_id
    const existing = bestBySession.get(id)
    if (
      !existing ||
      entry.meta.user_message_count > existing.meta.user_message_count ||
      (entry.meta.user_message_count === existing.meta.user_message_count &&
        entry.meta.duration_minutes > existing.meta.duration_minutes)
    ) {
      bestBySession.set(id, entry)
    }
  }
  return [...bestBySession.values()]
}

function formatTranscriptForFacets(log: LogOption): string {
  const lines: string[] = []
  const meta = logToSessionMeta(log)

  lines.push(`Session: ${meta.session_id.slice(0, 8)}`)
  lines.push(`Date: ${meta.start_time}`)
  lines.push(`Project: ${meta.project_path}`)
  lines.push(`时长：${meta.duration_minutes} 分钟`)
  lines.push('')

  for (const msg of log.messages) {
    if (msg.type === 'user' && msg.message) {
      const content = msg.message.content
      if (typeof content === 'string') {
        lines.push(`[User]: ${content.slice(0, 500)}`)
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && 'text' in block) {
            lines.push(`[User]: ${(block.text as string).slice(0, 500)}`)
          }
        }
      }
    } else if (msg.type === 'assistant' && msg.message) {
      const content = msg.message.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && 'text' in block) {
            lines.push(`[Assistant]: ${(block.text as string).slice(0, 300)}`)
          } else if (block.type === 'tool_use' && 'name' in block) {
            lines.push(`[工具：${block.name}]`)
          }
        }
      }
    }
  }

  return lines.join('\n')
}

const SUMMARIZE_CHUNK_PROMPT = `总结 Claude Code 会话记录的此部分内容。重点关注：
1. 用户提出的需求
2. Claude 执行的操作（使用的工具、修改的文件）
3. 遇到的摩擦或问题
4. 最终结果

保持简洁 - 3-5 句话。保留具体细节，如文件名、错误信息和用户反馈。

会话记录片段：`

async function summarizeTranscriptChunk(chunk: string): Promise<string> {
  try {
    const result = await queryWithModel({
      systemPrompt: asSystemPrompt([]),
      userPrompt: SUMMARIZE_CHUNK_PROMPT + chunk,
      signal: new AbortController().signal,
      options: {
        model: getAnalysisModel(),
        querySource: 'insights',
        agents: [],
        isNonInteractiveSession: true,
        hasAppendSystemPrompt: false,
        mcpTools: [],
        maxOutputTokensOverride: 500,
      },
    })

    const text = extractTextContent(
      result.message.content as readonly { readonly type: string }[],
    )
    return text || chunk.slice(0, 2000)
  } catch {
    // 出错时，仅返回截断的片段
    return chunk.slice(0, 2000)
  }
}

async function formatTranscriptWithSummarization(
  log: LogOption,
): Promise<string> {
  const fullTranscript = formatTranscriptForFacets(log)

  // 若字符数少于 3 万，直接使用
  if (fullTranscript.length <= 30000) {
    return fullTranscript
  }

  // 对于长会话记录，拆分成多个片段并行总结
  const CHUNK_SIZE = 25000
  const chunks: string[] = []

  for (let i = 0; i < fullTranscript.length; i += CHUNK_SIZE) {
    chunks.push(fullTranscript.slice(i, i + CHUNK_SIZE))
  }

  // 并行总结所有片段
  const summaries = await Promise.all(chunks.map(summarizeTranscriptChunk))

  // 将总结与会话头部信息合并
  const meta = logToSessionMeta(log)
  const header = [
    `Session: ${meta.session_id.slice(0, 8)}`,
    `Date: ${meta.start_time}`,
    `Project: ${meta.project_path}`,
    `时长：${meta.duration_minutes} 分钟`,
    `[长会话 - 已总结 ${chunks.length} 个部分]`,
    '',
  ].join('\n')

  return header + summaries.join('\n\n---\n\n')
}

async function loadCachedFacets(
  sessionId: string,
): Promise<SessionFacets | null> {
  const facetPath = join(getFacetsDir(), `${sessionId}.json`)
  try {
    const content = await readFile(facetPath, { encoding: 'utf-8' })
    const parsed: unknown = jsonParse(content)
    if (!isValidSessionFacets(parsed)) {
      // 删除损坏的缓存文件，以便下次运行时重新提取
      try {
        await unlink(facetPath)
      } catch {
        // 忽略删除错误
      }
      return null
    }
    return parsed
  } catch {
    return null
  }
}

async function saveFacets(facets: SessionFacets): Promise<void> {
  try {
    await mkdir(getFacetsDir(), { recursive: true })
  } catch {
    // 目录可能已存在
  }
  const facetPath = join(getFacetsDir(), `${facets.session_id}.json`)
  await writeFile(facetPath, jsonStringify(facets, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  })
}

async function loadCachedSessionMeta(
  sessionId: string,
): Promise<SessionMeta | null> {
  const metaPath = join(getSessionMetaDir(), `${sessionId}.json`)
  try {
    const content = await readFile(metaPath, { encoding: 'utf-8' })
    return jsonParse(content)
  } catch {
    return null
  }
}

async function saveSessionMeta(meta: SessionMeta): Promise<void> {
  try {
    await mkdir(getSessionMetaDir(), { recursive: true })
  } catch {
    // 目录可能已存在
  }
  const metaPath = join(getSessionMetaDir(), `${meta.session_id}.json`)
  await writeFile(metaPath, jsonStringify(meta, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  })
}

async function extractFacetsFromAPI(
  log: LogOption,
  sessionId: string,
): Promise<SessionFacets | null> {
  try {
    // 对长会话记录使用总结功能
    const transcript = await formatTranscriptWithSummarization(log)

    // 构建直接请求 JSON 的提示（不使用工具）
    const jsonPrompt = `${FACET_EXTRACTION_PROMPT}${transcript}

仅返回符合此架构的有效 JSON 对象：
{
  "underlying_goal": "用户根本想要实现的目标",
  "goal_categories": {"category_name": count, ...},
  "outcome": "fully_achieved|mostly_achieved|partially_achieved|not_achieved|unclear_from_transcript",
  "user_satisfaction_counts": {"level": count, ...},
  "claude_helpfulness": "unhelpful|slightly_helpful|moderately_helpful|very_helpful|essential",
  "session_type": "single_task|multi_task|iterative_refinement|exploration|quick_question",
  "friction_counts": {"friction_type": count, ...},
  "friction_detail": "一句描述摩擦的话，若无则为空",
  "primary_success": "none|fast_accurate_search|correct_code_edits|good_explanations|proactive_help|multi_file_changes|good_debugging",
  "brief_summary": "一句话：用户想要什么以及是否得到满足"
}`

    const result = await queryWithModel({
      systemPrompt: asSystemPrompt([]),
      userPrompt: jsonPrompt,
      signal: new AbortController().signal,
      options: {
        model: getAnalysisModel(),
        querySource: 'insights',
        agents: [],
        isNonInteractiveSession: true,
        hasAppendSystemPrompt: false,
        mcpTools: [],
        maxOutputTokensOverride: 4096,
      },
    })

    const text = extractTextContent(
      result.message.content as readonly { readonly type: string }[],
    )

    // 从响应中解析 JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed: unknown = jsonParse(jsonMatch[0])
    if (!isValidSessionFacets(parsed)) return null
    const facets: SessionFacets = { ...parsed, session_id: sessionId }
    return facets
  } catch (err) {
    logError(new Error(`分面提取失败：${toError(err).message}`))
    return null
  }
}

/** 检测多会话并发使用（同时使用多个 Claude 会话）。
使用滑动窗口查找模式：在 30 分钟窗口内，出现 session1 -> session2 -> session1 的序列。 */
export function detectMultiClauding(
  sessions: Array<{
    session_id: string
    user_message_timestamps: string[]
  }>,
): {
  overlap_events: number
  sessions_involved: number
  user_messages_during: number
} {
  const OVERLAP_WINDOW_MS = 30 * 60000
  const allSessionMessages: Array<{ ts: number; sessionId: string }> = []

  for (const session of sessions) {
    for (const timestamp of session.user_message_timestamps) {
      try {
        const ts = new Date(timestamp).getTime()
        allSessionMessages.push({ ts, sessionId: session.session_id })
      } catch {
        // 跳过无效时间戳
      }
    }
  }

  allSessionMessages.sort((a, b) => a.ts - b.ts)

  const multiClaudeSessionPairs = new Set<string>()
  const messagesDuringMulticlaude = new Set<string>()

  // 滑动窗口：sessionLastIndex 跟踪每个会话在窗口中的最新索引
  let windowStart = 0
  const sessionLastIndex = new Map<string, number>()

  for (let i = 0; i < allSessionMessages.length; i++) {
    const msg = allSessionMessages[i]!

    // 从左侧收缩窗口
    while (
      windowStart < i &&
      msg.ts - allSessionMessages[windowStart]!.ts > OVERLAP_WINDOW_MS
    ) {
      const expiring = allSessionMessages[windowStart]!
      if (sessionLastIndex.get(expiring.sessionId) === windowStart) {
        sessionLastIndex.delete(expiring.sessionId)
      }
      windowStart++
    }

    // 检查此会话是否在窗口内更早出现过（模式：s1 -> s2 -> s1）
    const prevIndex = sessionLastIndex.get(msg.sessionId)
    if (prevIndex !== undefined) {
      for (let j = prevIndex + 1; j < i; j++) {
        const between = allSessionMessages[j]!
        if (between.sessionId !== msg.sessionId) {
          const pair = [msg.sessionId, between.sessionId].sort().join(':')
          multiClaudeSessionPairs.add(pair)
          messagesDuringMulticlaude.add(
            `${allSessionMessages[prevIndex]!.ts}:${msg.sessionId}`,
          )
          messagesDuringMulticlaude.add(`${between.ts}:${between.sessionId}`)
          messagesDuringMulticlaude.add(`${msg.ts}:${msg.sessionId}`)
          break
        }
      }
    }

    sessionLastIndex.set(msg.sessionId, i)
  }

  const sessionsWithOverlaps = new Set<string>()
  for (const pair of multiClaudeSessionPairs) {
    const [s1, s2] = pair.split(':')
    if (s1) sessionsWithOverlaps.add(s1)
    if (s2) sessionsWithOverlaps.add(s2)
  }

  return {
    overlap_events: multiClaudeSessionPairs.size,
    sessions_involved: sessionsWithOverlaps.size,
    user_messages_during: messagesDuringMulticlaude.size,
  }
}

function aggregateData(
  sessions: SessionMeta[],
  facets: Map<string, SessionFacets>,
): AggregatedData {
  const result: AggregatedData = {
    total_sessions: sessions.length,
    sessions_with_facets: facets.size,
    date_range: { start: '', end: '' },
    total_messages: 0,
    total_duration_hours: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    tool_counts: {},
    languages: {},
    git_commits: 0,
    git_pushes: 0,
    projects: {},
    goal_categories: {},
    outcomes: {},
    satisfaction: {},
    helpfulness: {},
    session_types: {},
    friction: {},
    success: {},
    session_summaries: [],
    // 新增统计
    total_interruptions: 0,
    total_tool_errors: 0,
    tool_error_categories: {},
    user_response_times: [],
    median_response_time: 0,
    avg_response_time: 0,
    sessions_using_task_agent: 0,
    sessions_using_mcp: 0,
    sessions_using_web_search: 0,
    sessions_using_web_fetch: 0,
    // 附加统计
    total_lines_added: 0,
    total_lines_removed: 0,
    total_files_modified: 0,
    days_active: 0,
    messages_per_day: 0,
    message_hours: [],
    // 多会话统计（匹配 Python 参考实现）
    multi_clauding: {
      overlap_events: 0,
      sessions_involved: 0,
      user_messages_during: 0,
    },
  }

  const dates: string[] = []
  const allResponseTimes: number[] = []
  const allMessageHours: number[] = []

  for (const session of sessions) {
    dates.push(session.start_time)
    result.total_messages += session.user_message_count
    result.total_duration_hours += session.duration_minutes / 60
    result.total_input_tokens += session.input_tokens
    result.total_output_tokens += session.output_tokens
    result.git_commits += session.git_commits
    result.git_pushes += session.git_pushes

    // 新增统计聚合
    result.total_interruptions += session.user_interruptions
    result.total_tool_errors += session.tool_errors
    for (const [cat, count] of Object.entries(session.tool_error_categories)) {
      result.tool_error_categories[cat] =
        (result.tool_error_categories[cat] || 0) + count
    }
    allResponseTimes.push(...session.user_response_times)
    if (session.uses_task_agent) result.sessions_using_task_agent++
    if (session.uses_mcp) result.sessions_using_mcp++
    if (session.uses_web_search) result.sessions_using_web_search++
    if (session.uses_web_fetch) result.sessions_using_web_fetch++

    // 附加统计聚合
    result.total_lines_added += session.lines_added
    result.total_lines_removed += session.lines_removed
    result.total_files_modified += session.files_modified
    allMessageHours.push(...session.message_hours)

    for (const [tool, count] of Object.entries(session.tool_counts)) {
      result.tool_counts[tool] = (result.tool_counts[tool] || 0) + count
    }

    for (const [lang, count] of Object.entries(session.languages)) {
      result.languages[lang] = (result.languages[lang] || 0) + count
    }

    if (session.project_path) {
      result.projects[session.project_path] =
        (result.projects[session.project_path] || 0) + 1
    }

    const sessionFacets = facets.get(session.session_id)
    if (sessionFacets) {
      // 目标类别
      for (const [cat, count] of safeEntries(sessionFacets.goal_categories)) {
        if (count > 0) {
          result.goal_categories[cat] =
            (result.goal_categories[cat] || 0) + count
        }
      }

      // 结果
      result.outcomes[sessionFacets.outcome] =
        (result.outcomes[sessionFacets.outcome] || 0) + 1

      // 满意度计数
      for (const [level, count] of safeEntries(
        sessionFacets.user_satisfaction_counts,
      )) {
        if (count > 0) {
          result.satisfaction[level] = (result.satisfaction[level] || 0) + count
        }
      }

      // 帮助性
      result.helpfulness[sessionFacets.claude_helpfulness] =
        (result.helpfulness[sessionFacets.claude_helpfulness] || 0) + 1

      // 会话类型
      result.session_types[sessionFacets.session_type] =
        (result.session_types[sessionFacets.session_type] || 0) + 1

      // 摩擦点计数
      for (const [type, count] of safeEntries(sessionFacets.friction_counts)) {
        if (count > 0) {
          result.friction[type] = (result.friction[type] || 0) + count
        }
      }

      // 成功因素
      if (sessionFacets.primary_success !== 'none') {
        result.success[sessionFacets.primary_success] =
          (result.success[sessionFacets.primary_success] || 0) + 1
      }
    }

    if (result.session_summaries.length < 50) {
      result.session_summaries.push({
        id: session.session_id.slice(0, 8),
        date: session.start_time.split('T')[0] || '',
        summary: session.summary || session.first_prompt.slice(0, 100),
        goal: sessionFacets?.underlying_goal,
      })
    }
  }

  dates.sort()
  result.date_range.start = dates[0]?.split('T')[0] || ''
  result.date_range.end = dates[dates.length - 1]?.split('T')[0] || ''

  // 计算响应时间统计
  result.user_response_times = allResponseTimes
  if (allResponseTimes.length > 0) {
    const sorted = [...allResponseTimes].sort((a, b) => a - b)
    result.median_response_time = sorted[Math.floor(sorted.length / 2)] || 0
    result.avg_response_time =
      allResponseTimes.reduce((a, b) => a + b, 0) / allResponseTimes.length
  }

  // 计算活跃天数和每日消息数
  const uniqueDays = new Set(dates.map(d => d.split('T')[0]))
  result.days_active = uniqueDays.size
  result.messages_per_day =
    result.days_active > 0
      ? Math.round((result.total_messages / result.days_active) * 10) / 10
      : 0

  // 存储消息小时数以生成时段分布图
  result.message_hours = allMessageHours

  result.multi_clauding = detectMultiClauding(sessions)

  return result
}

// ============================================================================
// 并行洞察生成（6 个部分）
// ============================================================================

type InsightSection = {
  name: string
  prompt: string
  maxTokens: number
}

// 首先并行运行的部分
const INSIGHT_SECTIONS: InsightSection[] = [
  {
    name: 'project_areas',
    prompt: `分析此 Claude Code 使用数据并识别项目领域。

仅返回有效的 JSON 对象：
{
  "areas": [
    {"name": "领域名称", "session_count": N, "description": "2-3 句话说明所处理的内容以及如何使用 Claude Code。"}
  ]
}

包含 4-5 个领域。跳过内部 CC 操作。`,
    maxTokens: 8192,
  },
  {
    name: 'interaction_style',
    prompt: `分析此 Claude Code 使用数据并描述用户的交互风格。

仅返回有效的 JSON 对象：
{
  "narrative": "2-3 段文字分析用户如何与 Claude Code 交互。使用第二人称‘你’。描述模式：是快速迭代还是先制定详细规范？经常打断还是让 Claude 持续运行？包含具体示例。使用 **粗体** 突出关键洞察。",
  "key_pattern": "用一句话总结最具特色的交互风格"
}`,
    maxTokens: 8192,
  },
  {
    name: 'what_works',
    prompt: `分析此 Claude Code 使用数据并找出该用户做得好的方面。使用第二人称（“你”）。

仅返回有效的 JSON 对象：
{
  "intro": "1 句话提供背景",
  "impressive_workflows": [
    {"title": "简短标题（3-6 个词）", "description": "2-3 句话描述令人印象深刻的工作流程或方法。使用‘你’而非‘用户’。"}
  ]
}

包含 3 个令人印象深刻的工作流程。`,
    maxTokens: 8192,
  },
  {
    name: 'friction_analysis',
    prompt: `分析此 Claude Code 使用数据并找出该用户的摩擦点。使用第二人称（“你”）。

仅返回有效的 JSON 对象：
{
  "intro": "1 句话总结摩擦模式",
  "categories": [
    {"category": "具体的类别名称", "description": "1-2 句话解释此类别以及可以采取哪些不同做法。使用‘你’而非‘用户’。", "examples": ["带有后果的具体示例", "另一个示例"]}
  ]
}

包含 3 个摩擦类别，每个类别提供 2 个示例。`,
    maxTokens: 8192,
  },
  {
    name: 'suggestions',
    prompt: `分析此 Claude Code 使用数据并提出改进建议。

## CC 功能参考（从以下选择 features_to_try）：
1. **MCP 服务器**：通过模型上下文协议将 Claude 连接到外部工具、数据库和 API。
   - 使用方法：运行 \`claude mcp add <server-name> -- <command>\`
   - 适用场景：数据库查询、Slack 集成、GitHub 问题查找、连接内部 API

2. **自定义技能**：您定义为 Markdown 文件的可重用提示，可通过单个 /command 运行。
   - 使用方法：在 \`.claude/skills/commit/SKILL.md\` 中创建包含指令的文件。然后输入 \`/commit\` 运行。
   - 适用场景：重复性工作流程 - /commit、/review、/test、/deploy、/pr，或复杂的多步骤工作流程

3. **钩子**：在特定生命周期事件自动运行的 shell 命令。
   - 使用方法：添加到 \`.claude/settings.json\` 中的 "hooks" 键下。
   - 适用场景：自动格式化代码、运行类型检查、强制执行约定

4. **无头模式**：从脚本和 CI/CD 非交互式运行 Claude。
   - 使用方法：\`claude -p "修复 lint 错误" --allowedTools "Edit,Read,Bash"\`
   - 适用场景：CI/CD 集成、批量代码修复、自动化审查

5. **任务代理**：Claude 为复杂探索或并行工作生成专注的子代理。
   - 使用方法：Claude 在需要时自动调用，或询问“使用代理探索 X”
   - 适用场景：代码库探索、理解复杂系统

仅返回有效的 JSON 对象：
{
  "claude_md_additions": [
    {"addition": "基于工作流模式添加到 CLAUDE.md 的特定行或块。例如，‘修改身份验证相关文件后始终运行测试’", "why": "1 句话解释基于实际会话为什么这会有帮助", "prompt_scaffold": "关于在 CLAUDE.md 中何处添加此内容的说明。例如，‘在 ## 测试 部分下添加’"}
  ],
  "features_to_try": [
    {"feature": "来自上述 CC 功能参考的功能名称", "one_liner": "功能描述", "why_for_you": "基于您的会话，为什么这会对您有帮助", "example_code": "可复制的实际命令或配置"}
  ],
  "usage_patterns": [
    {"title": "简短标题", "suggestion": "1-2 句话总结", "detail": "3-4 句话解释这如何适用于您的工作", "copyable_prompt": "可复制的特定提示"}
  ]
}

关于 claude_md_additions 的重要提示：优先考虑在用户数据中多次出现的指令。如果用户在 2 个以上会话中告诉 Claude 相同的事情（例如，‘始终运行测试’、‘使用 TypeScript’），那就是首要候选——他们不应该重复自己。

关于 features_to_try 的重要提示：从上述 CC 功能参考中选择 2-3 个。每个类别包含 2-3 个项目。`,
    maxTokens: 8192,
  },
  {
    name: 'on_the_horizon',
    prompt: `分析此 Claude Code 使用数据并识别未来机会。

仅返回有效的 JSON 对象：
{
  "intro": "1 句话关于 AI 辅助开发的演进",
  "opportunities": [
    {"title": "简短标题（4-8 个词）", "whats_possible": "2-3 句关于自主工作流程的雄心勃勃的描述", "how_to_try": "1-2 句话提及相关工具", "copyable_prompt": "可尝试的详细提示"}
  ]
}

包含 3 个机会。大胆设想——自主工作流程、并行代理、针对测试进行迭代。`,
    maxTokens: 8192,
  },
  ...(process.env.USER_TYPE === 'ant'
    ? [
        {
          name: 'cc_team_improvements',
          prompt: `分析此 Claude Code 使用数据并为 CC 团队提出产品改进建议。

仅返回有效的 JSON 对象：
{
  "improvements": [
    {"title": "产品/工具改进", "detail": "3-4 句话描述改进内容", "evidence": "3-4 句话提供具体会话示例作为证据"}
  ]
}

基于观察到的摩擦模式提出 2-3 项改进。`,
          maxTokens: 8192,
        },
        {
          name: 'model_behavior_improvements',
          prompt: `分析此 Claude Code 使用数据并提出模型行为改进建议。

仅返回有效的 JSON 对象：
{
  "improvements": [
    {"title": "模型行为变更", "detail": "3-4 句话描述模型应如何不同地行事", "evidence": "3-4 句话提供具体示例作为证据"}
  ]
}

基于观察到的摩擦模式提出 2-3 项改进。`,
          maxTokens: 8192,
        },
      ]
    : []),
  {
    name: 'fun_ending',
    prompt: `分析此 Claude Code 使用数据并找出一个难忘的时刻。

仅返回有效的 JSON 对象：
{
  "headline": "来自对话记录的一个难忘的定性时刻——不是统计数据。一些人性化、有趣或令人惊讶的事情。",
  "detail": "关于何时/何地发生此事的简要背景"
}

从会话摘要中找出真正有趣或令人发笑的内容。`,
    maxTokens: 8192,
  },
]

type InsightResults = {
  at_a_glance?: {
    whats_working?: string
    whats_hindering?: string
    quick_wins?: string
    ambitious_workflows?: string
  }
  project_areas?: {
    areas?: Array<{ name: string; session_count: number; description: string }>
  }
  interaction_style?: {
    narrative?: string
    key_pattern?: string
  }
  what_works?: {
    intro?: string
    impressive_workflows?: Array<{ title: string; description: string }>
  }
  friction_analysis?: {
    intro?: string
    categories?: Array<{
      category: string
      description: string
      examples?: string[]
    }>
  }
  suggestions?: {
    claude_md_additions?: Array<{
      addition: string
      why: string
      where?: string
      prompt_scaffold?: string
    }>
    features_to_try?: Array<{
      feature: string
      one_liner: string
      why_for_you: string
      example_code?: string
    }>
    usage_patterns?: Array<{
      title: string
      suggestion: string
      detail?: string
      copyable_prompt?: string
    }>
  }
  on_the_horizon?: {
    intro?: string
    opportunities?: Array<{
      title: string
      whats_possible: string
      how_to_try?: string
      copyable_prompt?: string
    }>
  }
  cc_team_improvements?: {
    improvements?: Array<{
      title: string
      detail: string
      evidence?: string
    }>
  }
  model_behavior_improvements?: {
    improvements?: Array<{
      title: string
      detail: string
      evidence?: string
    }>
  }
  fun_ending?: {
    headline?: string
    detail?: string
  }
}

async function generateSectionInsight(
  section: InsightSection,
  dataContext: string,
): Promise<{ name: string; result: unknown }> {
  try {
    const result = await queryWithModel({
      systemPrompt: asSystemPrompt([]),
      userPrompt: section.prompt + '\n\nDATA:\n' + dataContext,
      signal: new AbortController().signal,
      options: {
        model: getInsightsModel(),
        querySource: 'insights',
        agents: [],
        isNonInteractiveSession: true,
        hasAppendSystemPrompt: false,
        mcpTools: [],
        maxOutputTokensOverride: section.maxTokens,
      },
    })

    const text = extractTextContent(
      result.message.content as readonly { readonly type: string }[],
    )

    if (text) {
      // 从响应中解析 JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          return { name: section.name, result: jsonParse(jsonMatch[0]) }
        } catch {
          return { name: section.name, result: null }
        }
      }
    }
    return { name: section.name, result: null }
  } catch (err) {
    logError(new Error(`${section.name} failed: ${toError(err).message}`))
    return { name: section.name, result: null }
  }
}

async function generateParallelInsights(
  data: AggregatedData,
  facets: Map<string, SessionFacets>,
): Promise<InsightResults> {
  // 构建数据上下文字符串
  const facetSummaries = Array.from(facets.values())
    .slice(0, 50)
    .map(f => `- ${f.brief_summary} (${f.outcome}, ${f.claude_helpfulness})`)
    .join('\n')

  const frictionDetails = Array.from(facets.values())
    .filter(f => f.friction_detail)
    .slice(0, 20)
    .map(f => `- ${f.friction_detail}`)
    .join('\n')

  const userInstructions = Array.from(facets.values())
    .flatMap(f => f.user_instructions_to_claude || [])
    .slice(0, 15)
    .map(i => `- ${i}`)
    .join('\n')

  const dataContext = jsonStringify(
    {
      sessions: data.total_sessions,
      analyzed: data.sessions_with_facets,
      date_range: data.date_range,
      messages: data.total_messages,
      hours: Math.round(data.total_duration_hours),
      commits: data.git_commits,
      top_tools: Object.entries(data.tool_counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8),
      top_goals: Object.entries(data.goal_categories)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8),
      outcomes: data.outcomes,
      satisfaction: data.satisfaction,
      friction: data.friction,
      success: data.success,
      languages: data.languages,
    },
    null,
    2,
  )

  const fullContext =
    dataContext +
    '\n\n会话摘要：\n' +
    facetSummaries +
    '\n\n摩擦详情：\n' +
    frictionDetails +
    '\n\nUSER INSTRUCTIONS TO CLAUDE:\n' +
    (userInstructions || '未捕获')

  // 首先并行运行部分（at_a_glance 除外）
  const results = await Promise.all(
    INSIGHT_SECTIONS.map(section =>
      generateSectionInsight(section, fullContext),
    ),
  )

  // 合并结果
  const insights: InsightResults = {}
  for (const { name, result } of results) {
    if (result) {
      ;(insights as Record<string, unknown>)[name] = result
    }
  }

  // 为“概览”部分从生成的各节内容构建丰富的上下文
  const projectAreasText =
    (
      insights.project_areas as {
        areas?: Array<{ name: string; description: string }>
      }
    )?.areas
      ?.map(a => `- ${a.name}: ${a.description}`)
      .join('\n') || ''

  const bigWinsText =
    (
      insights.what_works as {
        impressive_workflows?: Array<{ title: string; description: string }>
      }
    )?.impressive_workflows
      ?.map(w => `- ${w.title}: ${w.description}`)
      .join('\n') || ''

  const frictionText =
    (
      insights.friction_analysis as {
        categories?: Array<{ category: string; description: string }>
      }
    )?.categories
      ?.map(c => `- ${c.category}: ${c.description}`)
      .join('\n') || ''

  const featuresText =
    (
      insights.suggestions as {
        features_to_try?: Array<{ feature: string; one_liner: string }>
      }
    )?.features_to_try
      ?.map(f => `- ${f.feature}: ${f.one_liner}`)
      .join('\n') || ''

  const patternsText =
    (
      insights.suggestions as {
        usage_patterns?: Array<{ title: string; suggestion: string }>
      }
    )?.usage_patterns
      ?.map(p => `- ${p.title}: ${p.suggestion}`)
      .join('\n') || ''

  const horizonText =
    (
      insights.on_the_horizon as {
        opportunities?: Array<{ title: string; whats_possible: string }>
      }
    )?.opportunities
      ?.map(o => `- ${o.title}: ${o.whats_possible}`)
      .join('\n') || ''

  // 现在生成“概览”，并能够访问其他各节的输出
  const atAGlancePrompt = `你正在为 Claude Code 用户撰写一份 Claude Code 使用洞察报告的“概览”摘要。目标是帮助他们理解自己的使用情况，并改进他们使用 Claude 的方式，尤其是在模型不断改进的背景下。

请使用以下四部分结构：

1.  **哪些方面做得好** - 用户与 Claude 互动的独特风格是什么？他们完成了哪些有影响力的事情？你可以包含一两个细节，但保持高层次概述，因为用户可能记不清具体细节。不要浮夸或过度赞美。同时，不要聚焦于他们使用的工具调用。

2.  **哪些方面阻碍了你** - 分为 (a) Claude 的问题（误解、错误方法、缺陷）和 (b) 用户侧的摩擦（未提供足够上下文、环境问题——最好比单个项目更具普遍性）。要诚实但具有建设性。

3.  **可以尝试的快速改进** - 他们可以尝试的特定 Claude Code 功能（来自下面的示例），或者如果你认为某个工作流技巧非常有吸引力，也可以推荐。（避免诸如“在采取行动前让 Claude 确认”或“一开始就输入更多上下文”这类吸引力较低的技巧。）

4.  **面向更优模型的进阶工作流** - 随着未来 3-6 个月内我们将迎来能力更强的模型，他们应该为此准备什么？哪些现在看似不可能的工作流将变得可能？请从下面相应的部分中汲取灵感。

每部分控制在 2-3 个不太长的句子。不要给用户造成信息过载。不要提及下面会话数据中的具体数值统计或带下划线的类别。使用指导性的语气。

仅以有效的 JSON 对象格式回复：
{
  "whats_working": "（参考上述说明）",
  "whats_hindering": "（参考上述说明）",
  "quick_wins": "（参考上述说明）",
  "ambitious_workflows": "（参考上述说明）"
}

会话数据：
${fullContext}

## 项目领域（用户的工作内容）
${projectAreasText}

## 重大成就（令人印象深刻的成果）
${bigWinsText}

## 摩擦类别（问题所在）
${frictionText}

## 可尝试的功能
${featuresText}

## 可采纳的使用模式
${patternsText}

## 未来展望（面向更优模型的进阶工作流）
${horizonText}`

  const atAGlanceSection: InsightSection = {
    name: 'at_a_glance',
    prompt: atAGlancePrompt,
    maxTokens: 8192,
  }

  const atAGlanceResult = await generateSectionInsight(atAGlanceSection, '')
  if (atAGlanceResult.result) {
    insights.at_a_glance = atAGlanceResult.result as {
      whats_working?: string
      whats_hindering?: string
      quick_wins?: string
      ambitious_workflows?: string
    }
  }

  return insights
}

// 转义 HTML 但将 **粗体** 渲染为 <strong>
function escapeHtmlWithBold(text: string): string {
  const escaped = escapeHtml(text)
  return escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}

// 特定图表的固定排序（与 Python 参考实现匹配）
const SATISFACTION_ORDER = [
  'frustrated',
  'dissatisfied',
  'likely_satisfied',
  'satisfied',
  'happy',
  'unsure',
]

const OUTCOME_ORDER = [
  'not_achieved',
  'partially_achieved',
  'mostly_achieved',
  'fully_achieved',
  'unclear_from_transcript',
]

function generateBarChart(
  data: Record<string, number>,
  color: string,
  maxItems = 6,
  fixedOrder?: string[],
): string {
  let entries: [string, number][]

  if (fixedOrder) {
    // 使用固定顺序，仅包含数据中存在的项目
    entries = fixedOrder
      .filter(key => key in data && (data[key] ?? 0) > 0)
      .map(key => [key, data[key] ?? 0] as [string, number])
  } else {
    // 按计数降序排序
    entries = Object.entries(data)
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxItems)
  }

  if (entries.length === 0) return '<p class="empty">无数据</p>'

  const maxVal = Math.max(...entries.map(e => e[1]))
  return entries
    .map(([label, count]) => {
      const pct = (count / maxVal) * 100
      // 如果存在 LABEL_MAP 则使用，否则清理下划线并转换为标题大小写
      const cleanLabel =
        LABEL_MAP[label] ||
        label.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      return `<div class="bar-row">
        <div class="bar-label">${escapeHtml(cleanLabel)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
        <div class="bar-value">${count}</div>
      </div>`
    })
    .join('\n')
}

function generateResponseTimeHistogram(times: number[]): string {
  if (times.length === 0) return '<p class="empty">无响应时间数据</p>'

  // 创建分桶（与 Python 参考实现匹配）
  const buckets: Record<string, number> = {
    '2-10s': 0,
    '10-30s': 0,
    '30s-1m': 0,
    '1-2m': 0,
    '2-5m': 0,
    '5-15m': 0,
    '>15m': 0,
  }

  for (const t of times) {
    if (t < 10) buckets['2-10s'] = (buckets['2-10s'] ?? 0) + 1
    else if (t < 30) buckets['10-30s'] = (buckets['10-30s'] ?? 0) + 1
    else if (t < 60) buckets['30s-1m'] = (buckets['30s-1m'] ?? 0) + 1
    else if (t < 120) buckets['1-2m'] = (buckets['1-2m'] ?? 0) + 1
    else if (t < 300) buckets['2-5m'] = (buckets['2-5m'] ?? 0) + 1
    else if (t < 900) buckets['5-15m'] = (buckets['5-15m'] ?? 0) + 1
    else buckets['>15m'] = (buckets['>15m'] ?? 0) + 1
  }

  const maxVal = Math.max(...Object.values(buckets))
  if (maxVal === 0) return '<p class="empty">无响应时间数据</p>'

  return Object.entries(buckets)
    .map(([label, count]) => {
      const pct = (count / maxVal) * 100
      return `<div class="bar-row">
        <div class="bar-label">${label}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:#6366f1"></div></div>
        <div class="bar-value">${count}</div>
      </div>`
    })
    .join('\n')
}

function generateTimeOfDayChart(messageHours: number[]): string {
  if (messageHours.length === 0) return '<p class="empty">无时间数据</p>'

  // 按时间段分组
  const periods = [
    { label: '早晨 (6-12)', range: [6, 7, 8, 9, 10, 11] },
    { label: '下午 (12-18)', range: [12, 13, 14, 15, 16, 17] },
    { label: '晚上 (18-24)', range: [18, 19, 20, 21, 22, 23] },
    { label: '夜间 (0-6)', range: [0, 1, 2, 3, 4, 5] },
  ]

  const hourCounts: Record<number, number> = {}
  for (const h of messageHours) {
    hourCounts[h] = (hourCounts[h] || 0) + 1
  }

  const periodCounts = periods.map(p => ({
    label: p.label,
    count: p.range.reduce((sum, h) => sum + (hourCounts[h] || 0), 0),
  }))

  const maxVal = Math.max(...periodCounts.map(p => p.count)) || 1

  const barsHtml = periodCounts
    .map(
      p => `
      <div class="bar-row">
        <div class="bar-label">${p.label}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(p.count / maxVal) * 100}%;background:#8b5cf6"></div></div>
        <div class="bar-value">${p.count}</div>
      </div>`,
    )
    .join('\n')

  return `<div id="hour-histogram">${barsHtml}</div>`
}

function getHourCountsJson(messageHours: number[]): string {
  const hourCounts: Record<number, number> = {}
  for (const h of messageHours) {
    hourCounts[h] = (hourCounts[h] || 0) + 1
  }
  return jsonStringify(hourCounts)
}

function generateHtmlReport(
  data: AggregatedData,
  insights: InsightResults,
): string {
  const markdownToHtml = (md: string): string => {
    if (!md) return ''
    return md
      .split('\n\n')
      .map(p => {
        let html = escapeHtml(p)
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        html = html.replace(/^- /gm, '• ')
        html = html.replace(/\n/g, '<br>')
        return `<p>${html}</p>`
      })
      .join('\n')
  }

  // 构建“概览”部分（新的四部分格式，包含指向各节的链接）
  const atAGlance = insights.at_a_glance
  const atAGlanceHtml = atAGlance
    ? `
    <div class="at-a-glance">
      <div class="glance-title">概览</div>
      <div class="glance-sections">
        ${atAGlance.whats_working ? `<div class="glance-section"><strong>What's working:</strong> ${escapeHtmlWithBold(atAGlance.whats_working)} <a href="#section-wins" class="see-more">Impressive Things You Did →</a></div>` : ''}
        ${atAGlance.whats_hindering ? `<div class="glance-section"><strong>What's hindering you:</strong> ${escapeHtmlWithBold(atAGlance.whats_hindering)} <a href="#section-friction" class="see-more">Where Things Go Wrong →</a></div>` : ''}
        ${atAGlance.quick_wins ? `<div class="glance-section"><strong>Quick wins to try:</strong> ${escapeHtmlWithBold(atAGlance.quick_wins)} <a href="#section-features" class="see-more">Features to Try →</a></div>` : ''}
        ${atAGlance.ambitious_workflows ? `<div class="glance-section"><strong>Ambitious workflows:</strong> ${escapeHtmlWithBold(atAGlance.ambitious_workflows)} <a href="#section-horizon" class="see-more">On the Horizon →</a></div>` : ''}
      </div>
    </div>
    `
    : ''

  // 构建项目领域部分
  const projectAreas = insights.project_areas?.areas || []
  const projectAreasHtml =
    projectAreas.length > 0
      ? `
    <h2 id="section-work">你的工作内容</h2>
    <div class="project-areas">
      ${projectAreas
        .map(
          area => `
        <div class="project-area">
          <div class="area-header">
            <span class="area-name">${escapeHtml(area.name)}</span>
            <span class="area-count">~${area.session_count} sessions</span>
          </div>
          <div class="area-desc">${escapeHtml(area.description)}</div>
        </div>
      `,
        )
        .join('')}
    </div>
    `
      : ''

  // 构建交互风格部分
  const interactionStyle = insights.interaction_style
  const interactionHtml = interactionStyle?.narrative
    ? `
    <h2 id="section-usage">你如何使用 Claude Code</h2>
    <div class="narrative">
      ${markdownToHtml(interactionStyle.narrative)}
      ${interactionStyle.key_pattern ? `<div class="key-insight"><strong>Key pattern:</strong> ${escapeHtml(interactionStyle.key_pattern)}</div>` : ''}
    </div>
    `
    : ''

  // Build what works section
  const whatWorks = insights.what_works
  const whatWorksHtml =
    whatWorks?.impressive_workflows && whatWorks.impressive_workflows.length > 0
      ? `
    <h2 id="section-wins">Impressive Things You Did</h2>
    ${whatWorks.intro ? `<p class="section-intro">${escapeHtml(whatWorks.intro)}</p>` : ''}
    <div class="big-wins">
      ${whatWorks.impressive_workflows
        .map(
          wf => `
        <div class="big-win">
          <div class="big-win-title">${escapeHtml(wf.title || '')}</div>
          <div class="big-win-desc">${escapeHtml(wf.description || '')}</div>
        </div>
      `,
        )
        .join('')}
    </div>
    `
      : ''

  // Build friction section
  const frictionAnalysis = insights.friction_analysis
  const frictionHtml =
    frictionAnalysis?.categories && frictionAnalysis.categories.length > 0
      ? `
    <h2 id="section-friction">Where Things Go Wrong</h2>
    ${frictionAnalysis.intro ? `<p class="section-intro">${escapeHtml(frictionAnalysis.intro)}</p>` : ''}
    <div class="friction-categories">
      ${frictionAnalysis.categories
        .map(
          cat => `
        <div class="friction-category">
          <div class="friction-title">${escapeHtml(cat.category || '')}</div>
          <div class="friction-desc">${escapeHtml(cat.description || '')}</div>
          ${cat.examples ? `<ul class="friction-examples">${cat.examples.map(ex => `<li>${escapeHtml(ex)}</li>`).join('')}</ul>` : ''}
        </div>
      `,
        )
        .join('')}
    </div>
    `
      : ''

  // Build suggestions section
  const suggestions = insights.suggestions
  const suggestionsHtml = suggestions
    ? `
    ${
      suggestions.claude_md_additions &&
      suggestions.claude_md_additions.length > 0
        ? `
    <h2 id="section-features">Existing CC Features to Try</h2>
    <div class="claude-md-section">
      <h3>Suggested CLAUDE.md Additions</h3>
      <p style="font-size: 12px; color: #64748b; margin-bottom: 12px;">Just copy this into Claude Code to add it to your CLAUDE.md.</p>
      <div class="claude-md-actions">
        <button class="copy-all-btn" onclick="copyAllCheckedClaudeMd()">Copy All Checked</button>
      </div>
      ${suggestions.claude_md_additions
        .map(
          (add, i) => `
        <div class="claude-md-item">
          <input type="checkbox" id="cmd-${i}" class="cmd-checkbox" checked data-text="${escapeHtml(add.prompt_scaffold || add.where || 'Add to CLAUDE.md')}\\n\\n${escapeHtml(add.addition)}">
          <label for="cmd-${i}">
            <code class="cmd-code">${escapeHtml(add.addition)}</code>
            <button class="copy-btn" onclick="copyCmdItem(${i})">Copy</button>
          </label>
          <div class="cmd-why">${escapeHtml(add.why)}</div>
        </div>
      `,
        )
        .join('')}
    </div>
    `
        : ''
    }
    ${
      suggestions.features_to_try && suggestions.features_to_try.length > 0
        ? `
    <p style="font-size: 13px; color: #64748b; margin-bottom: 12px;">Just copy this into Claude Code and it'll set it up for you.</p>
    <div class="features-section">
      ${suggestions.features_to_try
        .map(
          feat => `
        <div class="feature-card">
          <div class="feature-title">${escapeHtml(feat.feature || '')}</div>
          <div class="feature-oneliner">${escapeHtml(feat.one_liner || '')}</div>
          <div class="feature-why"><strong>Why for you:</strong> ${escapeHtml(feat.why_for_you || '')}</div>
          ${
            feat.example_code
              ? `
          <div class="feature-examples">
            <div class="feature-example">
              <div class="example-code-row">
                <code class="example-code">${escapeHtml(feat.example_code)}</code>
                <button class="copy-btn" onclick="copyText(this)">Copy</button>
              </div>
            </div>
          </div>
          `
              : ''
          }
        </div>
      `,
        )
        .join('')}
    </div>
    `
        : ''
    }
    ${
      suggestions.usage_patterns && suggestions.usage_patterns.length > 0
        ? `
    <h2 id="section-patterns">New Ways to Use Claude Code</h2>
    <p style="font-size: 13px; color: #64748b; margin-bottom: 12px;">Just copy this into Claude Code and it'll walk you through it.</p>
    <div class="patterns-section">
      ${suggestions.usage_patterns
        .map(
          pat => `
        <div class="pattern-card">
          <div class="pattern-title">${escapeHtml(pat.title || '')}</div>
          <div class="pattern-summary">${escapeHtml(pat.suggestion || '')}</div>
          ${pat.detail ? `<div class="pattern-detail">${escapeHtml(pat.detail)}</div>` : ''}
          ${
            pat.copyable_prompt
              ? `
          <div class="copyable-prompt-section">
            <div class="prompt-label">Paste into Claude Code:</div>
            <div class="copyable-prompt-row">
              <code class="copyable-prompt">${escapeHtml(pat.copyable_prompt)}</code>
              <button class="copy-btn" onclick="copyText(this)">Copy</button>
            </div>
          </div>
          `
              : ''
          }
        </div>
      `,
        )
        .join('')}
    </div>
    `
        : ''
    }
    `
    : ''

  // Build On the Horizon section
  const horizonData = insights.on_the_horizon
  const horizonHtml =
    horizonData?.opportunities && horizonData.opportunities.length > 0
      ? `
    <h2 id="section-horizon">On the Horizon</h2>
    ${horizonData.intro ? `<p class="section-intro">${escapeHtml(horizonData.intro)}</p>` : ''}
    <div class="horizon-section">
      ${horizonData.opportunities
        .map(
          opp => `
        <div class="horizon-card">
          <div class="horizon-title">${escapeHtml(opp.title || '')}</div>
          <div class="horizon-possible">${escapeHtml(opp.whats_possible || '')}</div>
          ${opp.how_to_try ? `<div class="horizon-tip"><strong>Getting started:</strong> ${escapeHtml(opp.how_to_try)}</div>` : ''}
          ${opp.copyable_prompt ? `<div class="pattern-prompt"><div class="prompt-label">Paste into Claude Code:</div><code>${escapeHtml(opp.copyable_prompt)}</code><button class="copy-btn" onclick="copyText(this)">Copy</button></div>` : ''}
        </div>
      `,
        )
        .join('')}
    </div>
    `
      : ''

  // Build Team Feedback section (collapsible, ant-only)
  const ccImprovements =
    process.env.USER_TYPE === 'ant'
      ? insights.cc_team_improvements?.improvements || []
      : []
  const modelImprovements =
    process.env.USER_TYPE === 'ant'
      ? insights.model_behavior_improvements?.improvements || []
      : []
  const teamFeedbackHtml =
    ccImprovements.length > 0 || modelImprovements.length > 0
      ? `
    <h2 id="section-feedback" class="feedback-header">Closing the Loop: Feedback for Other Teams</h2>
    <p class="feedback-intro">Suggestions for the CC product and model teams based on your usage patterns. Click to expand.</p>
    ${
      ccImprovements.length > 0
        ? `
    <div class="collapsible-section">
      <div class="collapsible-header" onclick="toggleCollapsible(this)">
        <span class="collapsible-arrow">▶</span>
        <h3>Product Improvements for CC Team</h3>
      </div>
      <div class="collapsible-content">
        <div class="suggestions-section">
          ${ccImprovements
            .map(
              imp => `
            <div class="feedback-card team-card">
              <div class="feedback-title">${escapeHtml(imp.title || '')}</div>
              <div class="feedback-detail">${escapeHtml(imp.detail || '')}</div>
              ${imp.evidence ? `<div class="feedback-evidence"><em>Evidence:</em> ${escapeHtml(imp.evidence)}</div>` : ''}
            </div>
          `,
            )
            .join('')}
        </div>
      </div>
    </div>
    `
        : ''
    }
    ${
      modelImprovements.length > 0
        ? `
    <div class="collapsible-section">
      <div class="collapsible-header" onclick="toggleCollapsible(this)">
        <span class="collapsible-arrow">▶</span>
        <h3>Model Behavior Improvements</h3>
      </div>
      <div class="collapsible-content">
        <div class="suggestions-section">
          ${modelImprovements
            .map(
              imp => `
            <div class="feedback-card model-card">
              <div class="feedback-title">${escapeHtml(imp.title || '')}</div>
              <div class="feedback-detail">${escapeHtml(imp.detail || '')}</div>
              ${imp.evidence ? `<div class="feedback-evidence"><em>Evidence:</em> ${escapeHtml(imp.evidence)}</div>` : ''}
            </div>
          `,
            )
            .join('')}
        </div>
      </div>
    </div>
    `
        : ''
    }
    `
      : ''

  // Build Fun Ending section
  const funEnding = insights.fun_ending
  const funEndingHtml = funEnding?.headline
    ? `
    <div class="fun-ending">
      <div class="fun-headline">"${escapeHtml(funEnding.headline)}"</div>
      ${funEnding.detail ? `<div class="fun-detail">${escapeHtml(funEnding.detail)}</div>` : ''}
    </div>
    `
    : ''

  const css = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; background: #f8fafc; color: #334155; line-height: 1.65; padding: 48px 24px; }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { font-size: 32px; font-weight: 700; color: #0f172a; margin-bottom: 8px; }
    h2 { font-size: 20px; font-weight: 600; color: #0f172a; margin-top: 48px; margin-bottom: 16px; }
    .subtitle { color: #64748b; font-size: 15px; margin-bottom: 32px; }
    .nav-toc { display: flex; flex-wrap: wrap; gap: 8px; margin: 24px 0 32px 0; padding: 16px; background: white; border-radius: 8px; border: 1px solid #e2e8f0; }
    .nav-toc a { font-size: 12px; color: #64748b; text-decoration: none; padding: 6px 12px; border-radius: 6px; background: #f1f5f9; transition: all 0.15s; }
    .nav-toc a:hover { background: #e2e8f0; color: #334155; }
    .stats-row { display: flex; gap: 24px; margin-bottom: 40px; padding: 20px 0; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; flex-wrap: wrap; }
    .stat { text-align: center; }
    .stat-value { font-size: 24px; font-weight: 700; color: #0f172a; }
    .stat-label { font-size: 11px; color: #64748b; text-transform: uppercase; }
    .at-a-glance { background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border: 1px solid #f59e0b; border-radius: 12px; padding: 20px 24px; margin-bottom: 32px; }
    .glance-title { font-size: 16px; font-weight: 700; color: #92400e; margin-bottom: 16px; }
    .glance-sections { display: flex; flex-direction: column; gap: 12px; }
    .glance-section { font-size: 14px; color: #78350f; line-height: 1.6; }
    .glance-section strong { color: #92400e; }
    .see-more { color: #b45309; text-decoration: none; font-size: 13px; white-space: nowrap; }
    .see-more:hover { text-decoration: underline; }
    .project-areas { display: flex; flex-direction: column; gap: 12px; margin-bottom: 32px; }
    .project-area { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
    .area-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .area-name { font-weight: 600; font-size: 15px; color: #0f172a; }
    .area-count { font-size: 12px; color: #64748b; background: #f1f5f9; padding: 2px 8px; border-radius: 4px; }
    .area-desc { font-size: 14px; color: #475569; line-height: 1.5; }
    .narrative { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 24px; }
    .narrative p { margin-bottom: 12px; font-size: 14px; color: #475569; line-height: 1.7; }
    .key-insight { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; margin-top: 12px; font-size: 14px; color: #166534; }
    .section-intro { font-size: 14px; color: #64748b; margin-bottom: 16px; }
    .big-wins { display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px; }
    .big-win { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; }
    .big-win-title { font-weight: 600; font-size: 15px; color: #166534; margin-bottom: 8px; }
    .big-win-desc { font-size: 14px; color: #15803d; line-height: 1.5; }
    .friction-categories { display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px; }
    .friction-category { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; padding: 16px; }
    .friction-title { font-weight: 600; font-size: 15px; color: #991b1b; margin-bottom: 6px; }
    .friction-desc { font-size: 13px; color: #7f1d1d; margin-bottom: 10px; }
    .friction-examples { margin: 0 0 0 20px; font-size: 13px; color: #334155; }
    .friction-examples li { margin-bottom: 4px; }
    .claude-md-section { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
    .claude-md-section h3 { font-size: 14px; font-weight: 600; color: #1e40af; margin: 0 0 12px 0; }
    .claude-md-actions { margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #dbeafe; }
    .copy-all-btn { background: #2563eb; color: white; border: none; border-radius: 4px; padding: 6px 12px; font-size: 12px; cursor: pointer; font-weight: 500; transition: all 0.2s; }
    .copy-all-btn:hover { background: #1d4ed8; }
    .copy-all-btn.copied { background: #16a34a; }
    .claude-md-item { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px; padding: 10px 0; border-bottom: 1px solid #dbeafe; }
    .claude-md-item:last-child { border-bottom: none; }
    .cmd-checkbox { margin-top: 2px; }
    .cmd-code { background: white; padding: 8px 12px; border-radius: 4px; font-size: 12px; color: #1e40af; border: 1px solid #bfdbfe; font-family: monospace; display: block; white-space: pre-wrap; word-break: break-word; flex: 1; }
    .cmd-why { font-size: 12px; color: #64748b; width: 100%; padding-left: 24px; margin-top: 4px; }
    .features-section, .patterns-section { display: flex; flex-direction: column; gap: 12px; margin: 16px 0; }
    .feature-card { background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 16px; }
    .pattern-card { background: #f0f9ff; border: 1px solid #7dd3fc; border-radius: 8px; padding: 16px; }
    .feature-title, .pattern-title { font-weight: 600; font-size: 15px; color: #0f172a; margin-bottom: 6px; }
    .feature-oneliner { font-size: 14px; color: #475569; margin-bottom: 8px; }
    .pattern-summary { font-size: 14px; color: #475569; margin-bottom: 8px; }
    .feature-why, .pattern-detail { font-size: 13px; color: #334155; line-height: 1.5; }
    .feature-examples { margin-top: 12px; }
    .feature-example { padding: 8px 0; border-top: 1px solid #d1fae5; }
    .feature-example:first-child { border-top: none; }
    .example-desc { font-size: 13px; color: #334155; margin-bottom: 6px; }
    .example-code-row { display: flex; align-items: flex-start; gap: 8px; }
    .example-code { flex: 1; background: #f1f5f9; padding: 8px 12px; border-radius: 4px; font-family: monospace; font-size: 12px; color: #334155; overflow-x: auto; white-space: pre-wrap; }
    .copyable-prompt-section { margin-top: 12px; padding-top: 12px; border-top: 1px solid #e2e8f0; }
    .copyable-prompt-row { display: flex; align-items: flex-start; gap: 8px; }
    .copyable-prompt { flex: 1; background: #f8fafc; padding: 10px 12px; border-radius: 4px; font-family: monospace; font-size: 12px; color: #334155; border: 1px solid #e2e8f0; white-space: pre-wrap; line-height: 1.5; }
    .feature-code { background: #f8fafc; padding: 12px; border-radius: 6px; margin-top: 12px; border: 1px solid #e2e8f0; display: flex; align-items: flex-start; gap: 8px; }
    .feature-code code { flex: 1; font-family: monospace; font-size: 12px; color: #334155; white-space: pre-wrap; }
    .pattern-prompt { background: #f8fafc; padding: 12px; border-radius: 6px; margin-top: 12px; border: 1px solid #e2e8f0; }
    .pattern-prompt code { font-family: monospace; font-size: 12px; color: #334155; display: block; white-space: pre-wrap; margin-bottom: 8px; }
    .prompt-label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: #64748b; margin-bottom: 6px; }
    .copy-btn { background: #e2e8f0; border: none; border-radius: 4px; padding: 4px 8px; font-size: 11px; cursor: pointer; color: #475569; flex-shrink: 0; }
    .copy-btn:hover { background: #cbd5e1; }
    .charts-row { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 24px 0; }
    .chart-card { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
    .chart-title { font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; margin-bottom: 12px; }
    .bar-row { display: flex; align-items: center; margin-bottom: 6px; }
    .bar-label { width: 100px; font-size: 11px; color: #475569; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bar-track { flex: 1; height: 6px; background: #f1f5f9; border-radius: 3px; margin: 0 8px; }
    .bar-fill { height: 100%; border-radius: 3px; }
    .bar-value { width: 28px; font-size: 11px; font-weight: 500; color: #64748b; text-align: right; }
    .empty { color: #94a3b8; font-size: 13px; }
    .horizon-section { display: flex; flex-direction: column; gap: 16px; }
    .horizon-card { background: linear-gradient(135deg, #faf5ff 0%, #f5f3ff 100%); border: 1px solid #c4b5fd; border-radius: 8px; padding: 16px; }
    .horizon-title { font-weight: 600; font-size: 15px; color: #5b21b6; margin-bottom: 8px; }
    .horizon-possible { font-size: 14px; color: #334155; margin-bottom: 10px; line-height: 1.5; }
    .horizon-tip { font-size: 13px; color: #6b21a8; background: rgba(255,255,255,0.6); padding: 8px 12px; border-radius: 4px; }
    .feedback-header { margin-top: 48px; color: #64748b; font-size: 16px; }
    .feedback-intro { font-size: 13px; color: #94a3b8; margin-bottom: 16px; }
    .feedback-section { margin-top: 16px; }
    .feedback-section h3 { font-size: 14px; font-weight: 600; color: #475569; margin-bottom: 12px; }
    .feedback-card { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
    .feedback-card.team-card { background: #eff6ff; border-color: #bfdbfe; }
    .feedback-card.model-card { background: #faf5ff; border-color: #e9d5ff; }
    .feedback-title { font-weight: 600; font-size: 14px; color: #0f172a; margin-bottom: 6px; }
    .feedback-detail { font-size: 13px; color: #475569; line-height: 1.5; }
    .feedback-evidence { font-size: 12px; color: #64748b; margin-top: 8px; }
    .fun-ending { background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border: 1px solid #fbbf24; border-radius: 12px; padding: 24px; margin-top: 40px; text-align: center; }
    .fun-headline { font-size: 18px; font-weight: 600; color: #78350f; margin-bottom: 8px; }
    .fun-detail { font-size: 14px; color: #92400e; }
    .collapsible-section { margin-top: 16px; }
    .collapsible-header { display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 12px 0; border-bottom: 1px solid #e2e8f0; }
    .collapsible-header h3 { margin: 0; font-size: 14px; font-weight: 600; color: #475569; }
    .collapsible-arrow { font-size: 12px; color: #94a3b8; transition: transform 0.2s; }
    .collapsible-content { display: none; padding-top: 16px; }
    .collapsible-content.open { display: block; }
    .collapsible-header.open .collapsible-arrow { transform: rotate(90deg); }
    @media (max-width: 640px) { .charts-row { grid-template-columns: 1fr; } .stats-row { justify-content: center; } }
  `

  const hourCountsJson = getHourCountsJson(data.message_hours)

  const js = `
    function toggleCollapsible(header) {
      header.classList.toggle('open');
      const content = header.nextElementSibling;
      content.classList.toggle('open');
    }
    function copyText(btn) {
      const code = btn.previousElementSibling;
      navigator.clipboard.writeText(code.textContent).then(() => {
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
      });
    }
    function copyCmdItem(idx) {
      const checkbox = document.getElementById('cmd-' + idx);
      if (checkbox) {
        const text = checkbox.dataset.text;
        navigator.clipboard.writeText(text).then(() => {
          const btn = checkbox.nextElementSibling.querySelector('.copy-btn');
          if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy'; }, 2000); }
        });
      }
    }
    function copyAllCheckedClaudeMd() {
      const checkboxes = document.querySelectorAll('.cmd-checkbox:checked');
      const texts = [];
      checkboxes.forEach(cb => {
        if (cb.dataset.text) { texts.push(cb.dataset.text); }
      });
      const combined = texts.join('\\n');
      const btn = document.querySelector('.copy-all-btn');
      if (btn) {
        navigator.clipboard.writeText(combined).then(() => {
          btn.textContent = 'Copied ' + texts.length + ' items!';
          btn.classList.add('copied');
          setTimeout(() => { btn.textContent = 'Copy All Checked'; btn.classList.remove('copied'); }, 2000);
        });
      }
    }
    // Timezone selector for time of day chart (data is from our own analytics, not user input)
    const rawHourCounts = ${hourCountsJson};
    function updateHourHistogram(offsetFromPT) {
      const periods = [
        { label: "Morning (6-12)", range: [6,7,8,9,10,11] },
        { label: "Afternoon (12-18)", range: [12,13,14,15,16,17] },
        { label: "Evening (18-24)", range: [18,19,20,21,22,23] },
        { label: "Night (0-6)", range: [0,1,2,3,4,5] }
      ];
      const adjustedCounts = {};
      for (const [hour, count] of Object.entries(rawHourCounts)) {
        const newHour = (parseInt(hour) + offsetFromPT + 24) % 24;
        adjustedCounts[newHour] = (adjustedCounts[newHour] || 0) + count;
      }
      const periodCounts = periods.map(p => ({
        label: p.label,
        count: p.range.reduce((sum, h) => sum + (adjustedCounts[h] || 0), 0)
      }));
      const maxCount = Math.max(...periodCounts.map(p => p.count)) || 1;
      const container = document.getElementById('hour-histogram');
      container.textContent = '';
      periodCounts.forEach(p => {
        const row = document.createElement('div');
        row.className = 'bar-row';
        const label = document.createElement('div');
        label.className = 'bar-label';
        label.textContent = p.label;
        const track = document.createElement('div');
        track.className = 'bar-track';
        const fill = document.createElement('div');
        fill.className = 'bar-fill';
        fill.style.width = (p.count / maxCount) * 100 + '%';
        fill.style.background = '#8b5cf6';
        track.appendChild(fill);
        const value = document.createElement('div');
        value.className = 'bar-value';
        value.textContent = p.count;
        row.appendChild(label);
        row.appendChild(track);
        row.appendChild(value);
        container.appendChild(row);
      });
    }
    document.getElementById('timezone-select').addEventListener('change', function() {
      const customInput = document.getElementById('custom-offset');
      if (this.value === 'custom') {
        customInput.style.display = 'inline-block';
        customInput.focus();
      } else {
        customInput.style.display = 'none';
        updateHourHistogram(parseInt(this.value));
      }
    });
    document.getElementById('custom-offset').addEventListener('change', function() {
      const offset = parseInt(this.value) + 8;
      updateHourHistogram(offset);
    });
  `

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Claude Code Insights</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>${css}</style>
</head>
<body>
  <div class="container">
    <h1>Claude Code Insights</h1>
    <p class="subtitle">${data.total_messages.toLocaleString()} messages across ${data.total_sessions} sessions${data.total_sessions_scanned && data.total_sessions_scanned > data.total_sessions ? ` (${data.total_sessions_scanned.toLocaleString()} total)` : ''} | ${data.date_range.start} to ${data.date_range.end}</p>

    ${atAGlanceHtml}

    <nav class="nav-toc">
      <a href="#section-work">What You Work On</a>
      <a href="#section-usage">How You Use CC</a>
      <a href="#section-wins">Impressive Things</a>
      <a href="#section-friction">Where Things Go Wrong</a>
      <a href="#section-features">Features to Try</a>
      <a href="#section-patterns">New Usage Patterns</a>
      <a href="#section-horizon">On the Horizon</a>
      <a href="#section-feedback">Team Feedback</a>
    </nav>

    <div class="stats-row">
      <div class="stat"><div class="stat-value">${data.total_messages.toLocaleString()}</div><div class="stat-label">Messages</div></div>
      <div class="stat"><div class="stat-value">+${data.total_lines_added.toLocaleString()}/-${data.total_lines_removed.toLocaleString()}</div><div class="stat-label">Lines</div></div>
      <div class="stat"><div class="stat-value">${data.total_files_modified}</div><div class="stat-label">Files</div></div>
      <div class="stat"><div class="stat-value">${data.days_active}</div><div class="stat-label">Days</div></div>
      <div class="stat"><div class="stat-value">${data.messages_per_day}</div><div class="stat-label">Msgs/Day</div></div>
    </div>

    ${projectAreasHtml}

    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-title">What You Wanted</div>
        ${generateBarChart(data.goal_categories, '#2563eb')}
      </div>
      <div class="chart-card">
        <div class="chart-title">Top Tools Used</div>
        ${generateBarChart(data.tool_counts, '#0891b2')}
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-title">Languages</div>
        ${generateBarChart(data.languages, '#10b981')}
      </div>
      <div class="chart-card">
        <div class="chart-title">Session Types</div>
        ${generateBarChart(data.session_types || {}, '#8b5cf6')}
      </div>
    </div>

    ${interactionHtml}

    <!-- Response Time Distribution -->
    <div class="chart-card" style="margin: 24px 0;">
      <div class="chart-title">User Response Time Distribution</div>
      ${generateResponseTimeHistogram(data.user_response_times)}
      <div style="font-size: 12px; color: #64748b; margin-top: 8px;">
        Median: ${data.median_response_time.toFixed(1)}s &bull; Average: ${data.avg_response_time.toFixed(1)}s
      </div>
    </div>

    <!-- Multi-clauding Section (matching Python reference) -->
    <div class="chart-card" style="margin: 24px 0;">
      <div class="chart-title">Multi-Clauding (Parallel Sessions)</div>
      ${
        data.multi_clauding.overlap_events === 0
          ? `
        <p style="font-size: 14px; color: #64748b; padding: 8px 0;">
          No parallel session usage detected. You typically work with one Claude Code session at a time.
        </p>
      `
          : `
        <div style="display: flex; gap: 24px; margin: 12px 0;">
          <div style="text-align: center;">
            <div style="font-size: 24px; font-weight: 700; color: #7c3aed;">${data.multi_clauding.overlap_events}</div>
            <div style="font-size: 11px; color: #64748b; text-transform: uppercase;">Overlap Events</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 24px; font-weight: 700; color: #7c3aed;">${data.multi_clauding.sessions_involved}</div>
            <div style="font-size: 11px; color: #64748b; text-transform: uppercase;">Sessions Involved</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 24px; font-weight: 700; color: #7c3aed;">${data.total_messages > 0 ? Math.round((100 * data.multi_clauding.user_messages_during) / data.total_messages) : 0}%</div>
            <div style="font-size: 11px; color: #64748b; text-transform: uppercase;">Of Messages</div>
          </div>
        </div>
        <p style="font-size: 13px; color: #475569; margin-top: 12px;">
          You run multiple Claude Code sessions simultaneously. Multi-clauding is detected when sessions
          overlap in time, suggesting parallel workflows.
        </p>
      `
      }
    </div>

    <!-- Time of Day & Tool Errors -->
    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-title" style="display: flex; align-items: center; gap: 12px;">
          User Messages by Time of Day
          <select id="timezone-select" style="font-size: 12px; padding: 4px 8px; border-radius: 4px; border: 1px solid #e2e8f0;">
            <option value="0">PT (UTC-8)</option>
            <option value="3">ET (UTC-5)</option>
            <option value="8">London (UTC)</option>
            <option value="9">CET (UTC+1)</option>
            <option value="17">Tokyo (UTC+9)</option>
            <option value="custom">Custom offset...</option>
          </select>
          <input type="number" id="custom-offset" placeholder="UTC offset" style="display: none; width: 80px; font-size: 12px; padding: 4px; border-radius: 4px; border: 1px solid #e2e8f0;">
        </div>
        ${generateTimeOfDayChart(data.message_hours)}
      </div>
      <div class="chart-card">
        <div class="chart-title">Tool Errors Encountered</div>
        ${Object.keys(data.tool_error_categories).length > 0 ? generateBarChart(data.tool_error_categories, '#dc2626') : '<p class="empty">No tool errors</p>'}
      </div>
    </div>

    ${whatWorksHtml}

    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-title">What Helped Most (Claude's Capabilities)</div>
        ${generateBarChart(data.success, '#16a34a')}
      </div>
      <div class="chart-card">
        <div class="chart-title">Outcomes</div>
        ${generateBarChart(data.outcomes, '#8b5cf6', 6, OUTCOME_ORDER)}
      </div>
    </div>

    ${frictionHtml}

    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-title">Primary Friction Types</div>
        ${generateBarChart(data.friction, '#dc2626')}
      </div>
      <div class="chart-card">
        <div class="chart-title">Inferred Satisfaction (model-estimated)</div>
        ${generateBarChart(data.satisfaction, '#eab308', 6, SATISFACTION_ORDER)}
      </div>
    </div>

    ${suggestionsHtml}

    ${horizonHtml}

    ${funEndingHtml}

    ${teamFeedbackHtml}
  </div>
  <script>${js}</script>
</body>
</html>`
}

// ============================================================================
// Export Types & Functions
// ============================================================================

/** Structured export format for claudescope consumption */
export type InsightsExport = {
  metadata: {
    username: string
    generated_at: string
    claude_code_version: string
    date_range: { start: string; end: string }
    session_count: number
    remote_hosts_collected?: string[]
  }
  aggregated_data: AggregatedData
  insights: InsightResults
  facets_summary?: {
    total: number
    goal_categories: Record<string, number>
    outcomes: Record<string, number>
    satisfaction: Record<string, number>
    friction: Record<string, number>
  }
}

/** Build export data from already-computed values.
Used by background upload to S3. */
export function buildExportData(
  data: AggregatedData,
  insights: InsightResults,
  facets: Map<string, SessionFacets>,
  remoteStats?: { hosts: RemoteHostInfo[]; totalCopied: number },
): InsightsExport {
  const version = typeof MACRO !== 'undefined' ? MACRO.VERSION : 'unknown'

  const remote_hosts_collected = remoteStats?.hosts
    .filter(h => h.sessionCount > 0)
    .map(h => h.name)

  const facets_summary = {
    total: facets.size,
    goal_categories: {} as Record<string, number>,
    outcomes: {} as Record<string, number>,
    satisfaction: {} as Record<string, number>,
    friction: {} as Record<string, number>,
  }
  for (const f of facets.values()) {
    for (const [cat, count] of safeEntries(f.goal_categories)) {
      if (count > 0) {
        facets_summary.goal_categories[cat] =
          (facets_summary.goal_categories[cat] || 0) + count
      }
    }
    facets_summary.outcomes[f.outcome] =
      (facets_summary.outcomes[f.outcome] || 0) + 1
    for (const [level, count] of safeEntries(f.user_satisfaction_counts)) {
      if (count > 0) {
        facets_summary.satisfaction[level] =
          (facets_summary.satisfaction[level] || 0) + count
      }
    }
    for (const [type, count] of safeEntries(f.friction_counts)) {
      if (count > 0) {
        facets_summary.friction[type] =
          (facets_summary.friction[type] || 0) + count
      }
    }
  }

  return {
    metadata: {
      username: process.env.SAFEUSER || process.env.USER || 'unknown',
      generated_at: new Date().toISOString(),
      claude_code_version: version,
      date_range: data.date_range,
      session_count: data.total_sessions,
      ...(remote_hosts_collected &&
        remote_hosts_collected.length > 0 && {
          remote_hosts_collected,
        }),
    },
    aggregated_data: data,
    insights,
    facets_summary,
  }
}

// ============================================================================
// Lite Session Scanning
// ============================================================================

type LiteSessionInfo = {
  sessionId: string
  path: string
  mtime: number
  size: number
}

/** Scans all project directories using filesystem metadata only (no JSONL parsing).
Returns a list of session file info sorted by mtime descending.
Yields to the event loop between project directories to keep the UI responsive. */
async function scanAllSessions(): Promise<LiteSessionInfo[]> {
  const projectsDir = getProjectsDir()

  let dirents: Dirent<string>[]
  try {
    dirents = await readdir(projectsDir, { withFileTypes: true })
  } catch {
    return []
  }

  const projectDirs = dirents
    .filter(dirent => dirent.isDirectory())
    .map(dirent => join(projectsDir, dirent.name))

  const allSessions: LiteSessionInfo[] = []

  for (let i = 0; i < projectDirs.length; i++) {
    const sessionFiles = await getSessionFilesWithMtime(projectDirs[i]!)
    for (const [sessionId, fileInfo] of sessionFiles) {
      allSessions.push({
        sessionId,
        path: fileInfo.path,
        mtime: fileInfo.mtime,
        size: fileInfo.size,
      })
    }
    // Yield to event loop every 10 project directories
    if (i % 10 === 9) {
      await new Promise<void>(resolve => setImmediate(resolve))
    }
  }

  // Sort by mtime descending (most recent first)
  allSessions.sort((a, b) => b.mtime - a.mtime)
  return allSessions
}

// ============================================================================
// Main Function
// ============================================================================

export async function generateUsageReport(options?: {
  collectRemote?: boolean
}): Promise<{
  insights: InsightResults
  htmlPath: string
  data: AggregatedData
  remoteStats?: { hosts: RemoteHostInfo[]; totalCopied: number }
  facets: Map<string, SessionFacets>
}> {
  let remoteStats: { hosts: RemoteHostInfo[]; totalCopied: number } | undefined

  // Optionally collect data from remote hosts first (ant-only)
  if (process.env.USER_TYPE === 'ant' && options?.collectRemote) {
    const destDir = join(getClaudeConfigHomeDir(), 'projects')
    const { hosts, totalCopied } = await collectAllRemoteHostData(destDir)
    remoteStats = { hosts, totalCopied }
  }

  // Phase 1: Lite scan — filesystem metadata only (no JSONL parsing)
  const allScannedSessions = await scanAllSessions()
  const totalSessionsScanned = allScannedSessions.length

  // Phase 2: Load SessionMeta — use cache where available, parse only uncached
  // Read cached metas in parallel batches to avoid blocking the event loop
  const META_BATCH_SIZE = 50
  const MAX_SESSIONS_TO_LOAD = 200
  let allMetas: SessionMeta[] = []
  const uncachedSessions: LiteSessionInfo[] = []

  for (let i = 0; i < allScannedSessions.length; i += META_BATCH_SIZE) {
    const batch = allScannedSessions.slice(i, i + META_BATCH_SIZE)
    const results = await Promise.all(
      batch.map(async sessionInfo => ({
        sessionInfo,
        cached: await loadCachedSessionMeta(sessionInfo.sessionId),
      })),
    )
    for (const { sessionInfo, cached } of results) {
      if (cached) {
        allMetas.push(cached)
      } else if (uncachedSessions.length < MAX_SESSIONS_TO_LOAD) {
        uncachedSessions.push(sessionInfo)
      }
    }
  }

  // Load full message data only for uncached sessions and compute SessionMeta
  const logsForFacets = new Map<string, LogOption>()

  // Filter out /insights meta-sessions (facet extraction API calls get logged as sessions)
  const isMetaSession = (log: LogOption): boolean => {
    for (const msg of log.messages.slice(0, 5)) {
      if (msg.type === 'user' && msg.message) {
        const content = msg.message.content
        if (typeof content === 'string') {
          if (
            content.includes('RESPOND WITH ONLY A VALID JSON OBJECT') ||
            content.includes('record_facets')
          ) {
            return true
          }
        }
      }
    }
    return false
  }

  // 批量加载未缓存的会话，在批次之间让出事件循环
  const LOAD_BATCH_SIZE = 10
  for (let i = 0; i < uncachedSessions.length; i += LOAD_BATCH_SIZE) {
    const batch = uncachedSessions.slice(i, i + LOAD_BATCH_SIZE)
    const batchResults = await Promise.all(
      batch.map(async sessionInfo => {
        try {
          return await loadAllLogsFromSessionFile(sessionInfo.path)
        } catch {
          return []
        }
      }),
    )
    // 同步收集元数据，然后并行保存（独立写入）
    const metasToSave: SessionMeta[] = []
    for (const logs of batchResults) {
      for (const log of logs) {
        if (isMetaSession(log) || !hasValidDates(log)) continue
        const meta = logToSessionMeta(log)
        allMetas.push(meta)
        metasToSave.push(meta)
        // 保留日志以备可能的方面提取
        logsForFacets.set(meta.session_id, log)
      }
    }
    await Promise.all(metasToSave.map(meta => saveSessionMeta(meta)))
  }

  // 对会话分支进行去重（保留每个 session_id 中用户消
  // 息最多的分支）这可以防止一个会话有多个对话分支时总数虚高
  const bestBySession = new Map<string, SessionMeta>()
  for (const meta of allMetas) {
    const existing = bestBySession.get(meta.session_id)
    if (
      !existing ||
      meta.user_message_count > existing.user_message_count ||
      (meta.user_message_count === existing.user_message_count &&
        meta.duration_minutes > existing.duration_minutes)
    ) {
      bestBySession.set(meta.session_id, meta)
    }
  }
  // 用去重后的列表替换 allMetas，并从 logsForFacets 中移除未使用的日志
  const keptSessionIds = new Set(bestBySession.keys())
  allMetas = [...bestBySession.values()]
  for (const sessionId of logsForFacets.keys()) {
    if (!keptSessionIds.has(sessionId)) {
      logsForFacets.delete(sessionId)
    }
  }

  // 按 start_time 降序排列所有元数据（最新的在前）
  allMetas.sort((a, b) => b.start_time.localeCompare(a.start_time))

  // 预过滤明显极简的会话以节省 API 调用（
  // 匹配 Python 的实质性过滤概念）
  const isSubstantiveSession = (meta: SessionMeta): boolean => {
    // 跳过用户消息极少的会话
    if (meta.user_message_count < 2) return false
    // 跳过非常短的会话（< 1 分钟）
    if (meta.duration_minutes < 1) return false
    return true
  }

  const substantiveMetas = allMetas.filter(isSubstantiveSession)

  // 阶段 3：方面提取 —— 仅针对没有缓存方面的会话
  const facets = new Map<string, SessionFacets>()
  const toExtract: Array<{ log: LogOption; sessionId: string }> = []
  const MAX_FACET_EXTRACTIONS = 50

  // 并行加载所有实质性会话的缓存方面
  const cachedFacetResults = await Promise.all(
    substantiveMetas.map(async meta => ({
      sessionId: meta.session_id,
      cached: await loadCachedFacets(meta.session_id),
    })),
  )
  for (const { sessionId, cached } of cachedFacetResults) {
    if (cached) {
      facets.set(sessionId, cached)
    } else {
      const log = logsForFacets.get(sessionId)
      if (log && toExtract.length < MAX_FACET_EXTRACTIONS) {
        toExtract.push({ log, sessionId })
      }
    }
  }

  // 为需要方面的会话提取方面（50 个并发）
  const CONCURRENCY = 50
  for (let i = 0; i < toExtract.length; i += CONCURRENCY) {
    const batch = toExtract.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      batch.map(async ({ log, sessionId }) => {
        const newFacets = await extractFacetsFromAPI(log, sessionId)
        return { sessionId, newFacets }
      }),
    )
    // 同步收集方面，并行保存（独立写入）
    const facetsToSave: SessionFacets[] = []
    for (const { sessionId, newFacets } of results) {
      if (newFacets) {
        facets.set(sessionId, newFacets)
        facetsToSave.push(newFacets)
      }
    }
    await Promise.all(facetsToSave.map(f => saveFacets(f)))
  }

  // 过滤掉预热/极简会话（匹配 Python 的 is_minimal）如果
  // warmup_minimal 是唯一的 goal 类别，则会话是极简的
  const isMinimalSession = (sessionId: string): boolean => {
    const sessionFacets = facets.get(sessionId)
    if (!sessionFacets) return false
    const cats = sessionFacets.goal_categories
    const catKeys = safeKeys(cats).filter(k => (cats[k] ?? 0) > 0)
    return catKeys.length === 1 && catKeys[0] === 'warmup_minimal'
  }

  const substantiveSessions = substantiveMetas.filter(
    s => !isMinimalSession(s.session_id),
  )

  const substantiveFacets = new Map<string, SessionFacets>()
  for (const [sessionId, f] of facets) {
    if (!isMinimalSession(sessionId)) {
      substantiveFacets.set(sessionId, f)
    }
  }

  const aggregated = aggregateData(substantiveSessions, substantiveFacets)
  aggregated.total_sessions_scanned = totalSessionsScanned

  // 从 Claude 生成并行洞察（6 个部分）
  const insights = await generateParallelInsights(aggregated, facets)

  // 生成 HTML 报告
  const htmlReport = generateHtmlReport(aggregated, insights)

  // 保存报告
  try {
    await mkdir(getDataDir(), { recursive: true })
  } catch {
    // 目录可能已存在
  }

  const htmlPath = join(getDataDir(), 'report.html')
  await writeFile(htmlPath, htmlReport, {
    encoding: 'utf-8',
    mode: 0o600,
  })

  return {
    insights,
    htmlPath,
    data: aggregated,
    remoteStats,
    facets: substantiveFacets,
  }
}

function safeEntries<V>(
  obj: Record<string, V> | undefined | null,
): [string, V][] {
  return obj ? Object.entries(obj) : []
}

function safeKeys(obj: Record<string, unknown> | undefined | null): string[] {
  return obj ? Object.keys(obj) : []
}

// ============================================================================
// 命令定义
// ============================================================================

const usageReport: Command = {
  type: 'prompt',
  name: 'insights',
  description: '生成一份分析你的 Claude Code 会话的报告',
  contentLength: 0, // 动态内容
  progressMessage: '分析你的会话',
  source: 'builtin',
  async getPromptForCommand(args) {
    let collectRemote = false
    let remoteHosts: string[] = []
    let hasRemoteHosts = false

    if (process.env.USER_TYPE === 'ant') {
      // 解析 --homespaces 标志
      collectRemote = args?.includes('--homespaces') ?? false

      // 检查可用的远程主机
      remoteHosts = await getRunningRemoteHosts()
      hasRemoteHosts = remoteHosts.length > 0

      // 如果正在收集，则显示收集消息
      if (collectRemote && hasRemoteHosts) {
        console.error(
          `正在从 ${remoteHosts.length} 个 homespace 收集会话：${remoteHosts.join(', ')}...`,
        )
      }
    }

    const { insights, htmlPath, data, remoteStats } = await generateUsageReport(
      { collectRemote },
    )

    let reportUrl = `file://${htmlPath}`
    let uploadHint = ''

    if (process.env.USER_TYPE === 'ant') {
      // 尝试上传到 S3
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:]/g, '')
        .replace('T', '_')
        .slice(0, 15)
      const username = process.env.SAFEUSER || process.env.USER || 'unknown'
      const filename = `${username}_insights_${timestamp}.html`
      const s3Path = `s3://anthropic-serve/atamkin/cc-user-reports/${filename}`
      const s3Url = `https://s3-frontend.infra.ant.dev/anthropic-serve/atamkin/cc-user-reports/${filename}`

      reportUrl = s3Url
      try {
        execFileSync('ff', ['cp', htmlPath, s3Path], {
          timeout: 60000,
          stdio: 'pipe', // 抑制输出
        })
      } catch {
        // 上传失败 - 回退到本地文件并显示上传命令
        reportUrl = `file://${htmlPath}`
        uploadHint = `
自动上传失败。您是否在 boron 命名空间？请尝试 \`use-bo\` 并确保已运行 \`sso\`。
要分享，请运行：ff cp ${htmlPath} ${s3Path}
然后访问：${s3Url}`
      }
    }

    // 构建包含统计信息的标题
    const sessionLabel =
      data.total_sessions_scanned &&
      data.total_sessions_scanned > data.total_sessions
        ? `总计 ${data.total_sessions_scanned.toLocaleString()} 个会话 · 已分析 ${data.total_sessions} 个`
        : `${data.total_sessions} sessions`
    const stats = [
      sessionLabel,
      `${data.total_messages.toLocaleString()} messages`,
      `${Math.round(data.total_duration_hours)}h`,
      `${data.git_commits} commits`,
    ].join(' · ')

    // 构建远程主机信息（仅限 ant）
    let remoteInfo = ''
    if (process.env.USER_TYPE === 'ant') {
      if (remoteStats && remoteStats.totalCopied > 0) {
        const hsNames = remoteStats.hosts
          .filter(h => h.sessionCount > 0)
          .map(h => h.name)
          .join(', ')
        remoteInfo = `
_从以下位置收集了 ${remoteStats.totalCopied} 个新会话：${hsNames}_
`
      } else if (!collectRemote && hasRemoteHosts) {
        // 如果他们拥有远程主机但未使用该标志，则建议使用 --homespaces
        remoteInfo = `
_提示：运行 \`/insights --homespaces\` 以包含来自您 ${remoteHosts.length} 个正在运行的 homespace 的会话_
`
      }
    }

    // 根据洞察数据构建 Markdown 摘要
    const atAGlance = insights.at_a_glance
    const summaryText = atAGlance
      ? `## 概览

${atAGlance.whats_working ? `**What's working:** ${atAGlance.whats_working} See _Impressive Things You Did_.` : ''}

${atAGlance.whats_hindering ? `**What's hindering you:** ${atAGlance.whats_hindering} See _Where Things Go Wrong_.` : ''}

${atAGlance.quick_wins ? `**Quick wins to try:** ${atAGlance.quick_wins} See _Features to Try_.` : ''}

${atAGlance.ambitious_workflows ? `**Ambitious workflows:** ${atAGlance.ambitious_workflows} See _On the Horizon_.` : ''}`
      : '_未生成任何洞察_'

    const header = `# Claude Code 洞察报告

${stats}
${data.date_range.start} 至 ${data.date_range.end}
${remoteInfo}
`

    const userSummary = `${header}${summaryText}

您的完整可分享洞察报告已就绪：${reportUrl}${uploadHint}`

    // 返回供 Claude 响应的提示
    return [
      {
        type: 'text',
        text: `用户刚刚运行了 /insights 来生成一份分析其 Claude Code 会话的使用报告。

以下是完整的洞察数据：
${jsonStringify(insights, null, 2)}

报告 URL：${reportUrl}
HTML 文件：${htmlPath}
Facets 目录：${getFacetsDir()}

以下是用户看到的内容：
${userSummary}

现在请准确输出以下消息：

<message>
您的可分享洞察报告已就绪：
${reportUrl}${uploadHint}

想要深入探究任何部分或尝试某个建议吗？
</message>`,
      },
    ]
  },
}

function isValidSessionFacets(obj: unknown): obj is SessionFacets {
  if (!obj || typeof obj !== 'object') return false
  const o = obj as Record<string, unknown>
  return (
    typeof o.underlying_goal === 'string' &&
    typeof o.outcome === 'string' &&
    typeof o.brief_summary === 'string' &&
    o.goal_categories !== null &&
    typeof o.goal_categories === 'object' &&
    o.user_satisfaction_counts !== null &&
    typeof o.user_satisfaction_counts === 'object' &&
    o.friction_counts !== null &&
    typeof o.friction_counts === 'object'
  )
}

export default usageReport
