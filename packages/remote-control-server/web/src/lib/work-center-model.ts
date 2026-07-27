import type { PlanEntry } from '../acp/types'
import type {
  RuntimeTask,
  RuntimeTaskUsage,
  SessionRuntimeState,
  ThreadEntry,
  ToolCallData,
  ToolCallStatus,
} from './types'

type UnknownRecord = Record<string, unknown>

export interface RuntimeAgent {
  id: string
  name: string
  description: string
  agentType?: string
  model?: string
  background: boolean
  isolated: boolean
  parentId?: string
  worktreePath?: string
  status: ToolCallStatus
  /** Linked Agent/Task tool_use id, when known. */
  toolUseId?: string
  /** Full prompt handed to the subagent (Agent tool rawInput.prompt). */
  prompt?: string
  /** Final report returned by the subagent (tool rawOutput text). */
  outputText?: string
  usage?: RuntimeTaskUsage
  lastToolName?: string
  summary?: string
  outputFile?: string
  startedAt?: number
  updatedAt?: number
  /** Live elapsed seconds from tool_progress telemetry. */
  elapsedSeconds?: number
}

export interface RuntimeCommand {
  id: string
  tool: string
  command: string
  status: ToolCallStatus
}

export interface RuntimeSnapshot {
  phase:
    | 'unknown'
    | 'offline'
    | 'waiting'
    | 'running_tool'
    | 'thinking'
    | 'idle'
  phaseLabel: string
  phaseDetail: string
  activeTools: ToolCallData[]
  recentTools: ToolCallData[]
  agents: RuntimeAgent[]
  commands: RuntimeCommand[]
  plan: PlanEntry[]
  tasks: RuntimeTask[]
}

export interface ReviewHunk {
  id: string
  tool: 'Edit' | 'Write' | 'NotebookEdit'
  oldText: string
  newText: string
  additions: number
  deletions: number
  status: ToolCallStatus
}

export interface ReviewFile {
  path: string
  additions: number
  deletions: number
  hunks: ReviewHunk[]
  status: ToolCallStatus
}

export interface PublishedArtifact {
  toolUseId: string
  filePath: string
  basename: string
  hash?: string
  ttlDays?: number
  url?: string
  artifactId?: string
  expiresAt?: string
  status: ToolCallStatus
  error?: string
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function boolValue(value: unknown): boolean {
  return value === true
}

function toolEntries(entries: ThreadEntry[]): ToolCallData[] {
  return entries.flatMap(entry =>
    entry.type === 'tool_call' ? [entry.toolCall] : [],
  )
}

function latestTurn(entries: ThreadEntry[]): ThreadEntry[] {
  let start = 0
  for (let index = entries.length - 1; index >= 0; index--) {
    if (entries[index]?.type === 'user_message') {
      start = index
      break
    }
  }
  return entries.slice(start)
}

function inputOf(tool: ToolCallData): UnknownRecord {
  return tool.rawInput ?? {}
}

function normalizedToolName(title: string): string {
  const lastSegment = title.split(/[:./]/).filter(Boolean).at(-1) ?? title
  return lastSegment.trim().toLowerCase()
}

function outputText(value: unknown, depth = 0): string {
  if (depth > 5 || value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value))
    return value
      .map(item => outputText(item, depth + 1))
      .filter(Boolean)
      .join('\n')
  if (!isRecord(value)) return ''
  return Object.values(value)
    .map(item => outputText(item, depth + 1))
    .filter(Boolean)
    .join('\n')
}

export function derivePublishedArtifacts(
  entries: ThreadEntry[],
): PublishedArtifact[] {
  return toolEntries(entries)
    .filter(tool => normalizedToolName(tool.title) === 'artifact')
    .map(tool => {
      const input = inputOf(tool)
      const filePath = stringValue(input.file_path) ?? 'artifact.html'
      const text = outputText(tool.rawOutput)
      const url = /https?:\/\/[^\s)]+/.exec(text)?.[0]
      const artifactId = /\bid:\s*([^,\s)]+)/i.exec(text)?.[1]
      const expiresAt = /\bexpires:\s*([^\n)]+)/i.exec(text)?.[1]?.trim()
      const ttl =
        typeof input.ttl === 'number' && Number.isFinite(input.ttl)
          ? input.ttl
          : undefined
      return {
        toolUseId: tool.id,
        filePath,
        basename:
          filePath.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) ??
          filePath,
        hash: stringValue(input.hash),
        ttlDays: ttl,
        url,
        artifactId,
        expiresAt,
        status: tool.status,
        error: tool.status === 'error' ? text || '发布失败' : undefined,
      }
    })
    .reverse()
}

function summarizeTool(tool: ToolCallData): string {
  const input = inputOf(tool)
  return (
    stringValue(input.description) ??
    stringValue(input.command) ??
    stringValue(input.file_path) ??
    stringValue(input.path) ??
    stringValue(input.prompt) ??
    tool.title
  )
}

function planFromEntries(
  entries: ThreadEntry[],
  runtime?: SessionRuntimeState | null,
): PlanEntry[] {
  const latestList = runtime
    ? Object.values(runtime.taskLists).sort(
        (left, right) => right.updatedAt - left.updatedAt,
      )[0]
    : undefined
  if (latestList) {
    return latestList.tasks.flatMap(task => {
      if (
        task.status !== 'pending' &&
        task.status !== 'in_progress' &&
        task.status !== 'completed'
      ) {
        return []
      }
      return [
        {
          content:
            task.status === 'in_progress' && task.activeForm
              ? task.activeForm
              : task.subject,
          status: task.status,
          priority: 'medium' as const,
        },
      ]
    })
  }

  const turnEntries = latestTurn(entries)
  for (let index = turnEntries.length - 1; index >= 0; index--) {
    const entry = turnEntries[index]
    if (entry?.type === 'plan') return entry.entries
    if (entry?.type !== 'tool_call') continue
    if (normalizedToolName(entry.toolCall.title) !== 'todowrite') continue
    const todos = entry.toolCall.rawInput?.todos
    if (!Array.isArray(todos)) continue
    return todos.flatMap(todo => {
      if (!isRecord(todo)) return []
      const content = stringValue(todo.content)
      const status = stringValue(todo.status)
      if (
        !content ||
        (status !== 'pending' &&
          status !== 'in_progress' &&
          status !== 'completed')
      ) {
        return []
      }
      return [
        {
          content,
          status,
          priority: 'medium' as const,
        },
      ]
    })
  }
  return []
}

function agentsFromTools(tools: ToolCallData[]): RuntimeAgent[] {
  return tools
    .filter(tool => {
      const name = normalizedToolName(tool.title)
      return name === 'agent' || name === 'task'
    })
    .map(tool => {
      const input = inputOf(tool)
      const description =
        stringValue(input.description) ??
        stringValue(input.prompt) ??
        '子代理任务'
      return {
        id: tool.id,
        name: stringValue(input.name) ?? description,
        description,
        agentType: stringValue(input.subagent_type),
        model: stringValue(input.model),
        background: boolValue(input.run_in_background),
        isolated:
          input.isolation === 'worktree' || input.isolation === 'remote',
        parentId:
          stringValue(input.parent_agent_id) ??
          stringValue(input.parent_task_id),
        worktreePath: stringValue(input.worktree_path),
        status: tool.status,
        toolUseId: tool.id,
        prompt: stringValue(input.prompt),
        outputText: outputText(tool.rawOutput) || undefined,
      }
    })
    .slice(-8)
    .reverse()
}

function toolStatusFromTask(status: RuntimeTask['status']): ToolCallStatus {
  if (status === 'completed') return 'complete'
  if (status === 'failed') return 'error'
  if (status === 'stopped') return 'canceled'
  return 'running'
}

function isAgentTask(taskType?: string): boolean {
  return Boolean(
    taskType && (taskType.includes('agent') || taskType.includes('teammate')),
  )
}

function tasksFromRuntime(runtime?: SessionRuntimeState | null): RuntimeTask[] {
  if (!runtime) return []
  return Object.values(runtime.tasks).sort((left, right) => {
    const leftActive = left.status === 'running' ? 1 : 0
    const rightActive = right.status === 'running' ? 1 : 0
    return rightActive - leftActive || right.updatedAt - left.updatedAt
  })
}

function agentsFromRuntime(
  tasks: RuntimeTask[],
  tools: ToolCallData[],
  runtime?: SessionRuntimeState | null,
): RuntimeAgent[] {
  const toolsById = new Map(tools.map(tool => [tool.id, tool]))
  const progressByToolId = new Map(
    Object.values(runtime?.toolProgress ?? {}).map(progress => [
      progress.toolUseId,
      progress,
    ]),
  )
  const reportedToolIds = new Set(
    tasks.flatMap(task => (task.toolUseId ? [task.toolUseId] : [])),
  )
  const reported = tasks
    .filter(task => isAgentTask(task.taskType))
    .map(task => {
      const linkedTool = task.toolUseId
        ? toolsById.get(task.toolUseId)
        : undefined
      const input = linkedTool ? inputOf(linkedTool) : {}
      const progress = task.toolUseId
        ? progressByToolId.get(task.toolUseId)
        : undefined
      return {
        id: task.id,
        name: stringValue(input.name) ?? task.description,
        description: task.summary ?? task.description,
        agentType: stringValue(input.subagent_type) ?? task.taskType,
        model: stringValue(input.model),
        background: boolValue(input.run_in_background),
        isolated:
          input.isolation === 'worktree' || input.isolation === 'remote',
        parentId:
          stringValue(input.parent_agent_id) ??
          stringValue(input.parent_task_id) ??
          progress?.parentToolUseId,
        worktreePath: stringValue(input.worktree_path),
        status: toolStatusFromTask(task.status),
        toolUseId: task.toolUseId,
        prompt: stringValue(input.prompt) ?? task.prompt,
        outputText: linkedTool
          ? outputText(linkedTool.rawOutput) || undefined
          : undefined,
        usage: task.usage,
        lastToolName: task.lastToolName,
        summary: task.summary,
        outputFile: task.outputFile,
        startedAt: task.startedAt,
        updatedAt: task.updatedAt,
        elapsedSeconds: progress?.elapsedSeconds,
      }
    })
  const activeUnreported = agentsFromTools(tools).filter(
    agent => agent.status === 'running' && !reportedToolIds.has(agent.id),
  )
  return [...activeUnreported, ...reported].slice(0, 8)
}

function commandsFromTools(tools: ToolCallData[]): RuntimeCommand[] {
  const commandNames = new Set([
    'bash',
    'powershell',
    'terminal',
    'terminalrun',
    'monitor',
    'repl',
  ])
  return tools
    .filter(tool => commandNames.has(normalizedToolName(tool.title)))
    .map(tool => ({
      id: tool.id,
      tool: tool.title,
      command: summarizeTool(tool),
      status: tool.status,
    }))
    .slice(-10)
    .reverse()
}

export function deriveRuntimeSnapshot(
  entries: ThreadEntry[],
  sessionStatus: string | null,
  runtimeState?: SessionRuntimeState | null,
): RuntimeSnapshot {
  const allTools = toolEntries(entries)
  const turnTools = toolEntries(latestTurn(entries))
  const tasks = tasksFromRuntime(runtimeState)
  const reportedTurnState =
    runtimeState?.turnState && runtimeState.turnState !== 'unknown'
      ? runtimeState.turnState
      : sessionStatus === 'idle' ||
          sessionStatus === 'running' ||
          sessionStatus === 'requires_action'
        ? sessionStatus
        : 'unknown'
  const workerOffline = runtimeState?.workerStatus === 'offline'
  const sessionClosed =
    sessionStatus === 'inactive' ||
    sessionStatus === 'archived' ||
    sessionStatus === 'closed'
  const activeTools =
    reportedTurnState === 'idle' || workerOffline || sessionClosed
      ? []
      : turnTools.filter(
          tool =>
            tool.status === 'running' ||
            tool.status === 'waiting_for_confirmation',
        )
  const waiting = activeTools.find(
    tool => tool.status === 'waiting_for_confirmation',
  )
  const running = activeTools.find(tool => tool.status === 'running')
  let phase: RuntimeSnapshot['phase'] = 'unknown'
  let phaseLabel = '等待运行状态'
  let phaseDetail = '正在等待 Claude Code 上报当前主回合状态。'

  if (workerOffline) {
    phase = 'offline'
    phaseLabel = 'Claude Code 运行端离线'
    phaseDetail = '当前只能读取 RCS 中已保存的会话与运行记录。'
  } else if (sessionClosed) {
    phase = 'offline'
    phaseLabel = '运行环境未连接'
    phaseDetail = '当前会话只能读取已保存的运行记录。'
  } else if (reportedTurnState === 'requires_action' || waiting) {
    phase = 'waiting'
    phaseLabel = '等待你的确认'
    phaseDetail = waiting
      ? `${waiting.title} 已暂停，等待权限决定。`
      : 'Claude Code 已上报 requires_action，等待用户处理。'
  } else if (reportedTurnState === 'running') {
    phase = running ? 'running_tool' : 'thinking'
    phaseLabel = running ? `正在运行 ${running.title}` : 'Claude 正在工作'
    phaseDetail = running
      ? summarizeTool(running)
      : '主回合处于运行状态，等待下一条工具或回复事件。'
  } else if (reportedTurnState === 'idle') {
    phase = 'idle'
    phaseLabel = '主回合已结束'
    phaseDetail = tasks.some(task => task.status === 'running')
      ? '主回合空闲，后台任务仍在继续。'
      : 'Claude Code 当前处于空闲状态。'
  } else if (running) {
    phase = 'running_tool'
    phaseLabel = `正在运行 ${running.title}`
    phaseDetail = summarizeTool(running)
  }

  return {
    phase,
    phaseLabel,
    phaseDetail,
    activeTools,
    recentTools: turnTools.slice(-12).reverse(),
    agents: agentsFromRuntime(tasks, allTools, runtimeState),
    commands: commandsFromTools(turnTools),
    plan: planFromEntries(entries, runtimeState),
    tasks,
  }
}

function lineCount(text: string): number {
  if (!text) return 0
  return text.split(/\r?\n/).length
}

function editPath(input: UnknownRecord): string | undefined {
  return (
    stringValue(input.file_path) ??
    stringValue(input.notebook_path) ??
    stringValue(input.path)
  )
}

function hunksFromTool(tool: ToolCallData): ReviewHunk[] {
  const input = inputOf(tool)
  const name = normalizedToolName(tool.title)
  if (name === 'edit') {
    const oldText = stringValue(input.old_string) ?? ''
    const newText = stringValue(input.new_string) ?? ''
    return [
      {
        id: tool.id,
        tool: 'Edit',
        oldText,
        newText,
        additions: lineCount(newText),
        deletions: lineCount(oldText),
        status: tool.status,
      },
    ]
  }
  if (name === 'write') {
    const newText = stringValue(input.content) ?? ''
    return [
      {
        id: tool.id,
        tool: 'Write',
        oldText: '',
        newText,
        additions: lineCount(newText),
        deletions: 0,
        status: tool.status,
      },
    ]
  }
  if (name === 'notebookedit') {
    const oldText = stringValue(input.old_source) ?? ''
    const newText =
      stringValue(input.new_source) ?? stringValue(input.new_cell_source) ?? ''
    return [
      {
        id: tool.id,
        tool: 'NotebookEdit',
        oldText,
        newText,
        additions: lineCount(newText),
        deletions: lineCount(oldText),
        status: tool.status,
      },
    ]
  }
  return []
}

function combinedStatus(hunks: ReviewHunk[]): ToolCallStatus {
  if (hunks.some(hunk => hunk.status === 'error')) return 'error'
  if (hunks.some(hunk => hunk.status === 'waiting_for_confirmation')) {
    return 'waiting_for_confirmation'
  }
  if (hunks.some(hunk => hunk.status === 'running')) return 'running'
  if (hunks.some(hunk => hunk.status === 'rejected')) return 'rejected'
  if (hunks.some(hunk => hunk.status === 'canceled')) return 'canceled'
  return 'complete'
}

export interface MarkdownDoc {
  path: string
  basename: string
  /** Full text from the latest successful Write; empty when only Edits were seen. */
  content: string
  toolUseId: string
  /**
   * True when the file was Edited after (or without) the captured Write —
   * the shown content may not match what's on disk.
   */
  stale: boolean
  /** Entry-order index of the last touch, for sorting (newest first). */
  lastTouchedIndex: number
}

/**
 * Collect markdown documents the agent produced this session, derived purely
 * from durable Write/Edit tool events so history replay and offline sessions
 * work the same as live ones.
 */
export function deriveMarkdownDocs(entries: ThreadEntry[]): MarkdownDoc[] {
  const docs = new Map<string, MarkdownDoc>()
  const tools = toolEntries(entries)
  for (let index = 0; index < tools.length; index++) {
    const tool = tools[index]!
    if (tool.status !== 'complete') continue
    const input = inputOf(tool)
    const path = editPath(input)
    if (!path || !/\.(md|markdown)$/i.test(path)) continue
    const name = normalizedToolName(tool.title)
    const base =
      path.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) ?? path
    if (name === 'write') {
      const content = stringValue(input.content)
      if (content === undefined) continue
      docs.set(path, {
        path,
        basename: base,
        content,
        toolUseId: tool.id,
        stale: false,
        lastTouchedIndex: index,
      })
    } else if (name === 'edit' || name === 'notebookedit') {
      const existing = docs.get(path)
      if (existing) {
        docs.set(path, { ...existing, stale: true, lastTouchedIndex: index })
      } else {
        docs.set(path, {
          path,
          basename: base,
          content: '',
          toolUseId: tool.id,
          stale: true,
          lastTouchedIndex: index,
        })
      }
    }
  }
  return [...docs.values()].sort(
    (left, right) => right.lastTouchedIndex - left.lastTouchedIndex,
  )
}

export function deriveReviewFiles(entries: ThreadEntry[]): ReviewFile[] {
  const grouped = new Map<string, ReviewHunk[]>()
  for (const tool of toolEntries(latestTurn(entries))) {
    if (tool.status !== 'complete') continue
    const input = inputOf(tool)
    const path = editPath(input)
    if (!path) continue
    const hunks = hunksFromTool(tool)
    if (hunks.length === 0) continue
    grouped.set(path, [...(grouped.get(path) ?? []), ...hunks])
  }

  return [...grouped.entries()]
    .map(([path, hunks]) => ({
      path,
      additions: hunks.reduce((total, hunk) => total + hunk.additions, 0),
      deletions: hunks.reduce((total, hunk) => total + hunk.deletions, 0),
      hunks,
      status: combinedStatus(hunks),
    }))
    .reverse()
}
