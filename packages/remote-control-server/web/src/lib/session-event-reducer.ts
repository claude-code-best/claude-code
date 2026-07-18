import type { SessionEvent, SessionInitInfo, TokenUsageTotals } from '../types'
import type {
  AssistantChunk,
  AssistantMessageEntry,
  PendingPermission,
  RuntimeTask,
  RuntimeTaskListItem,
  RuntimeGoal,
  RuntimeWorkflowAgent,
  RuntimeWorkflowRun,
  SessionRuntimeState,
  SessionEventState,
  ThreadEntry,
  ToolCallEntry,
  ToolCallStatus,
  UserMessageImage,
} from './types'

type UnknownRecord = Record<string, unknown>

interface ToolUse {
  id: string
  title: string
  input?: UnknownRecord
}

interface ToolResult {
  id: string
  output: unknown
  isError: boolean
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function readRecord(value: unknown): UnknownRecord | undefined {
  return isRecord(value) ? value : undefined
}

function cloneRecord(value: unknown): UnknownRecord | undefined {
  const record = readRecord(value)
  return record ? { ...record } : undefined
}

function getPayload(event: SessionEvent): UnknownRecord {
  return isRecord(event.payload) ? event.payload : {}
}

function getRaw(payload: UnknownRecord): UnknownRecord | undefined {
  return readRecord(payload.raw)
}

function getMessageBlocks(payload: UnknownRecord): UnknownRecord[] {
  const message = readRecord(payload.message)
  if (!message || !Array.isArray(message.content)) return []
  return message.content.filter(isRecord)
}

function extractEventText(payload: UnknownRecord): string {
  if (typeof payload.content === 'string') return payload.content

  const message = readRecord(payload.message)
  if (!message) return ''
  if (typeof message.content === 'string') return message.content
  if (!Array.isArray(message.content)) return ''

  return message.content
    .filter(isRecord)
    .filter(block => block.type === 'text' && typeof block.text === 'string')
    .map(block => String(block.text))
    .join('')
}

function extractImages(payload: UnknownRecord): UserMessageImage[] | undefined {
  if (!Array.isArray(payload.images)) return undefined

  const images = payload.images.flatMap(image => {
    if (!isRecord(image)) return []
    const mimeType = readString(image.mimeType)
    const data = readString(image.data)
    return mimeType && data ? [{ mimeType, data }] : []
  })

  return images.length > 0 ? images : undefined
}

function getEventIdentity(event: SessionEvent): string | undefined {
  const eventId = readString(event.id)
  if (eventId) return eventId
  return Number.isSafeInteger(event.seqNum) && event.seqNum >= 0
    ? `seq:${event.seqNum}`
    : undefined
}

function getPayloadUuid(payload: UnknownRecord): string | undefined {
  return readString(payload.uuid) ?? readString(getRaw(payload)?.uuid)
}

function getMessageKey(
  event: SessionEvent,
  payload: UnknownRecord,
): string | undefined {
  const uuid = getPayloadUuid(payload)
  if (!uuid) return undefined
  if (event.type === 'user') return `user:${uuid}`
  return `${event.direction}:${event.type}:${uuid}`
}

function getEntryIdentity(
  event: SessionEvent,
  payload: UnknownRecord,
  exactIdentity: string | undefined,
): string | undefined {
  return getPayloadUuid(payload) ?? readString(event.id) ?? exactIdentity
}

function appendUser(
  entries: ThreadEntry[],
  event: SessionEvent,
  payload: UnknownRecord,
  exactIdentity: string | undefined,
): ThreadEntry[] {
  const content = extractEventText(payload)
  const images = extractImages(payload)
  const id = getEntryIdentity(event, payload, exactIdentity)
  if ((!content && !images) || !id) return entries

  return [
    ...entries,
    {
      type: 'user_message',
      id,
      content,
      ...(images ? { images } : {}),
    },
  ]
}

/**
 * Extract ordered assistant chunks (thinking + text) from an event payload.
 * Prefers structured content blocks so thinking blocks survive; falls back
 * to the flattened `content` string for legacy payloads.
 */
function extractAssistantChunks(payload: UnknownRecord): AssistantChunk[] {
  const blocks = getMessageBlocks(payload)
  const chunks: AssistantChunk[] = []
  for (const block of blocks) {
    if (block.type === 'text' && typeof block.text === 'string' && block.text) {
      chunks.push({ type: 'message', text: block.text })
    } else if (
      block.type === 'thinking' &&
      typeof block.thinking === 'string' &&
      block.thinking
    ) {
      chunks.push({ type: 'thought', text: block.thinking })
    }
  }
  if (chunks.length > 0) return chunks

  const text = extractEventText(payload)
  return text ? [{ type: 'message', text }] : []
}

function appendAssistant(
  entries: ThreadEntry[],
  newChunks: AssistantChunk[],
  id: string | undefined,
): ThreadEntry[] {
  if (newChunks.length === 0 || !id) return entries

  const lastEntry = entries[entries.length - 1]
  if (lastEntry?.type !== 'assistant_message') {
    const entry: AssistantMessageEntry = {
      type: 'assistant_message',
      id,
      chunks: newChunks,
    }
    return [...entries, entry]
  }

  let chunks = lastEntry.chunks
  for (const chunk of newChunks) {
    const lastChunk = chunks[chunks.length - 1]
    chunks =
      lastChunk && lastChunk.type === chunk.type
        ? [
            ...chunks.slice(0, -1),
            { ...lastChunk, text: lastChunk.text + chunk.text },
          ]
        : [...chunks, chunk]
  }

  return [...entries.slice(0, -1), { ...lastEntry, chunks }]
}

function getAssistantMessageId(payload: UnknownRecord): string | undefined {
  return readString(readRecord(payload.message)?.id)
}

function replaceAssistantEntry(
  entries: ThreadEntry[],
  id: string,
  chunks: AssistantChunk[],
): ThreadEntry[] {
  const index = entries.findIndex(
    entry => entry.type === 'assistant_message' && entry.id === id,
  )
  if (index < 0) {
    return chunks.length > 0
      ? [...entries, { type: 'assistant_message', id, chunks }]
      : entries
  }
  if (chunks.length === 0) {
    return [...entries.slice(0, index), ...entries.slice(index + 1)]
  }
  return [
    ...entries.slice(0, index),
    { type: 'assistant_message', id, chunks },
    ...entries.slice(index + 1),
  ]
}

function reducePartialAssistant(
  state: SessionEventState,
  event: SessionEvent,
): SessionEventState {
  const payload = getPayload(event)
  const messageId = readString(payload.message_id)
  const blockIndex = payload.block_index
  const content = payload.content
  if (
    payload.snapshot !== true ||
    !messageId ||
    typeof blockIndex !== 'number' ||
    !Number.isSafeInteger(blockIndex) ||
    blockIndex < 0 ||
    typeof content !== 'string'
  ) {
    return state
  }

  const previousBlocks = state.streamingAssistantBlocks[messageId] ?? {}
  const previous = previousBlocks[blockIndex]
  if (
    previous !== undefined &&
    (content === previous || !content.startsWith(previous))
  ) {
    return state
  }

  const blocks = { ...previousBlocks, [blockIndex]: content }
  const text = Object.entries(blocks)
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([, block]) => block)
    .join('')
  const entries = replaceAssistantEntry(
    state.entries,
    messageId,
    text ? [{ type: 'message', text }] : [],
  )
  return {
    ...state,
    entries,
    streamingAssistantBlocks: {
      ...state.streamingAssistantBlocks,
      [messageId]: blocks,
    },
  }
}

function firstDefined(...values: unknown[]): unknown {
  return values.find(value => value !== undefined)
}

function resolveToolId(
  payload: UnknownRecord,
  block: UnknownRecord | undefined,
  kind: 'use' | 'result',
): string | undefined {
  const raw = getRaw(payload)
  const blockId =
    kind === 'use' ? readString(block?.id) : readString(block?.tool_use_id)

  return (
    readString(payload.tool_call_id) ??
    readString(raw?.tool_call_id) ??
    readString(payload.tool_use_id) ??
    readString(raw?.tool_use_id) ??
    blockId
  )
}

function directToolUse(
  event: SessionEvent,
  payload: UnknownRecord,
): ToolUse | undefined {
  if (event.type !== 'tool_use') return undefined

  const raw = getRaw(payload)
  const id = resolveToolId(payload, undefined, 'use') ?? readString(event.id)
  if (!id) return undefined

  return {
    id,
    title:
      readString(payload.tool_name) ??
      readString(raw?.tool_name) ??
      readString(raw?.name) ??
      'tool',
    input:
      cloneRecord(payload.tool_input) ??
      cloneRecord(payload.input) ??
      cloneRecord(raw?.tool_input) ??
      cloneRecord(raw?.input),
  }
}

function embeddedToolUses(payload: UnknownRecord): ToolUse[] {
  const raw = getRaw(payload)
  return getMessageBlocks(payload).flatMap(block => {
    if (block.type !== 'tool_use') return []
    const id = resolveToolId(payload, block, 'use')
    if (!id) return []

    return [
      {
        id,
        title:
          readString(block.name) ??
          readString(payload.tool_name) ??
          readString(raw?.tool_name) ??
          'tool',
        input:
          cloneRecord(block.input) ??
          cloneRecord(payload.tool_input) ??
          cloneRecord(raw?.tool_input),
      },
    ]
  })
}

function isToolError(
  payload: UnknownRecord,
  block: UnknownRecord | undefined,
): boolean {
  const raw = getRaw(payload)
  const status =
    readString(block?.status) ??
    readString(payload.status) ??
    readString(raw?.status)
  const explicitError =
    readBoolean(block?.is_error) ??
    readBoolean(payload.is_error) ??
    readBoolean(raw?.is_error)

  return explicitError ?? (status === 'failed' || status === 'error')
}

function directToolResult(
  event: SessionEvent,
  payload: UnknownRecord,
): ToolResult | undefined {
  if (event.type !== 'tool_result') return undefined

  const raw = getRaw(payload)
  const id = resolveToolId(payload, undefined, 'result')
  if (!id) return undefined

  return {
    id,
    output: firstDefined(
      payload.output,
      raw?.output,
      payload.content,
      raw?.content,
      '',
    ),
    isError: isToolError(payload, undefined),
  }
}

function embeddedToolResults(payload: UnknownRecord): ToolResult[] {
  const raw = getRaw(payload)
  return getMessageBlocks(payload).flatMap(block => {
    if (block.type !== 'tool_result') return []
    const id = resolveToolId(payload, block, 'result')
    if (!id) return []

    return [
      {
        id,
        output: firstDefined(
          block.output,
          block.content,
          payload.output,
          raw?.output,
          payload.content,
          '',
        ),
        isError: isToolError(payload, block),
      },
    ]
  })
}

function appendToolUse(entries: ThreadEntry[], tool: ToolUse): ThreadEntry[] {
  const entry: ToolCallEntry = {
    type: 'tool_call',
    toolCall: {
      id: tool.id,
      title: tool.title,
      status: 'running',
      ...(tool.input ? { rawInput: tool.input } : {}),
    },
  }
  return [...entries, entry]
}

function applyToolResult(
  entries: ThreadEntry[],
  result: ToolResult,
): ThreadEntry[] {
  let index = -1
  for (let entryIndex = entries.length - 1; entryIndex >= 0; entryIndex--) {
    const candidate = entries[entryIndex]
    if (
      candidate?.type === 'tool_call' &&
      candidate.toolCall.id === result.id
    ) {
      index = entryIndex
      break
    }
  }
  if (index < 0) return entries

  const entry = entries[index]
  if (!entry || entry.type !== 'tool_call') return entries

  const updated: ToolCallEntry = {
    type: 'tool_call',
    toolCall: {
      ...entry.toolCall,
      status: result.isError ? 'error' : 'complete',
      rawOutput: { output: result.output },
    },
  }

  return entries.map((existing, entryIndex) =>
    entryIndex === index ? updated : existing,
  )
}

function applyTools(
  entries: ThreadEntry[],
  seenMessageKeys: Set<string>,
  event: SessionEvent,
  payload: UnknownRecord,
): ThreadEntry[] {
  let nextEntries = entries
  const directUse = directToolUse(event, payload)
  const uses = directUse
    ? [directUse, ...embeddedToolUses(payload)]
    : embeddedToolUses(payload)

  for (const tool of uses) {
    const key = `tool_use:${tool.id}`
    if (seenMessageKeys.has(key)) continue
    seenMessageKeys.add(key)
    nextEntries = appendToolUse(nextEntries, tool)
  }

  const directResult = directToolResult(event, payload)
  const results = directResult
    ? [directResult, ...embeddedToolResults(payload)]
    : embeddedToolResults(payload)

  for (const result of results) {
    const key = `tool_result:${result.id}`
    if (seenMessageKeys.has(key)) continue
    seenMessageKeys.add(key)
    nextEntries = applyToolResult(nextEntries, result)
  }

  return nextEntries
}

interface ParsedPermissionRequest {
  permission: PendingPermission
  toolUseId?: string
}

function parsePermissionRequest(
  event: SessionEvent,
  payload: UnknownRecord,
): ParsedPermissionRequest | undefined {
  if (event.type !== 'control_request' && event.type !== 'permission_request') {
    return undefined
  }
  const raw = getRaw(payload)
  const request = readRecord(payload.request) ?? readRecord(raw?.request)
  if (!request || request.subtype !== 'can_use_tool') return undefined
  const requestId =
    readString(payload.request_id) ?? readString(raw?.request_id)
  if (!requestId) return undefined

  return {
    permission: {
      requestId,
      toolName: readString(request.tool_name) ?? 'unknown',
      toolInput:
        cloneRecord(request.input) ?? cloneRecord(request.tool_input) ?? {},
      description: readString(request.description),
    },
    toolUseId:
      readString(request.tool_use_id) ??
      readString(payload.tool_use_id) ??
      readString(raw?.tool_use_id),
  }
}

function permissionResolutionRequestId(
  event: SessionEvent,
  payload: UnknownRecord,
): string | undefined {
  if (
    event.type !== 'permission_response' &&
    event.type !== 'control_cancel_request'
  ) {
    return undefined
  }
  return (
    readString(payload.request_id) ?? readString(getRaw(payload)?.request_id)
  )
}

function reducePendingPermissions(
  pending: Record<string, PendingPermission>,
  event: SessionEvent,
  payload: UnknownRecord,
): Record<string, PendingPermission> {
  const parsed = parsePermissionRequest(event, payload)
  if (parsed) {
    return {
      ...pending,
      [parsed.permission.requestId]: parsed.permission,
    }
  }

  const requestId = permissionResolutionRequestId(event, payload)
  if (requestId && pending[requestId]) {
    const next = { ...pending }
    delete next[requestId]
    return next
  }

  if (
    (event.type === 'result' || event.type === 'interrupt') &&
    Object.keys(pending).length > 0
  ) {
    return {}
  }
  return pending
}

function applyPermissionEvent(
  entries: ThreadEntry[],
  event: SessionEvent,
  payload: UnknownRecord,
): ThreadEntry[] {
  const parsed = parsePermissionRequest(event, payload)
  if (parsed) {
    let index = parsed.toolUseId
      ? entries.findIndex(
          entry =>
            entry.type === 'tool_call' &&
            entry.toolCall.id === parsed.toolUseId,
        )
      : -1
    if (parsed.toolUseId && index < 0) return entries
    if (index < 0) {
      for (let entryIndex = entries.length - 1; entryIndex >= 0; entryIndex--) {
        const entry = entries[entryIndex]
        if (
          entry?.type === 'tool_call' &&
          entry.toolCall.status === 'running'
        ) {
          index = entryIndex
          break
        }
      }
    }
    if (index < 0) return entries
    const entry = entries[index]
    if (entry?.type !== 'tool_call' || entry.toolCall.status !== 'running') {
      return entries
    }
    return entries.map((candidate, candidateIndex) =>
      candidateIndex === index
        ? {
            type: 'tool_call' as const,
            toolCall: {
              ...entry.toolCall,
              status: 'waiting_for_confirmation' as const,
              permissionRequest: {
                requestId: parsed.permission.requestId,
                options: [],
              },
            },
          }
        : candidate,
    )
  }

  const requestId = permissionResolutionRequestId(event, payload)
  if (requestId) {
    const approved =
      readBoolean(payload.approved) ??
      readBoolean(getRaw(payload)?.approved) ??
      false
    const status: ToolCallStatus =
      event.type === 'control_cancel_request'
        ? 'canceled'
        : approved
          ? 'running'
          : 'rejected'
    return entries.map(entry =>
      entry.type === 'tool_call' &&
      entry.toolCall.permissionRequest?.requestId === requestId
        ? {
            ...entry,
            toolCall: {
              ...entry.toolCall,
              status,
              permissionRequest: undefined,
            },
          }
        : entry,
    )
  }

  if (event.type === 'result' || event.type === 'interrupt') {
    return entries.map(entry =>
      entry.type === 'tool_call' &&
      entry.toolCall.status === 'waiting_for_confirmation'
        ? {
            ...entry,
            toolCall: {
              ...entry.toolCall,
              status: 'canceled' as const,
              permissionRequest: undefined,
            },
          }
        : entry,
    )
  }

  return entries
}

function updateHighWater(
  state: SessionEventState,
  event: SessionEvent,
): number {
  return Number.isSafeInteger(event.seqNum)
    ? Math.max(state.highWaterSeq, event.seqNum)
    : state.highWaterSeq
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value.filter(
    (item): item is string => typeof item === 'string' && item.length > 0,
  )
  return items
}

function readMcpServers(
  value: unknown,
): SessionInitInfo['mcpServers'] | undefined {
  if (!Array.isArray(value)) return undefined
  const servers = value.flatMap(item => {
    const record = readRecord(item)
    const name = record ? readString(record.name) : undefined
    if (!record || !name) return []
    return [{ name, status: readString(record.status) ?? 'unknown' }]
  })
  return servers.length > 0 ? servers : undefined
}

function readPlugins(value: unknown): SessionInitInfo['plugins'] | undefined {
  if (!Array.isArray(value)) return undefined
  const plugins = value.flatMap(item => {
    const record = readRecord(item)
    const name = record ? readString(record.name) : undefined
    if (!record || !name) return []
    return [
      {
        name,
        path: readString(record.path),
        source: readString(record.source),
      },
    ]
  })
  return plugins.length > 0 ? plugins : undefined
}

/**
 * Parse a system/init event payload into SessionInitInfo. The CLI announces
 * session metadata (cwd, model, permission mode, slash commands, agents,
 * skills) on bridge connect; the v1 ws-handler and v2 worker path both
 * preserve these fields on the event payload.
 */
function parseSessionInit(payload: UnknownRecord): SessionInitInfo | undefined {
  if (payload.subtype !== 'init') return undefined
  // Fields may live at the top level (v2 worker path / normalized events) or
  // only under `raw` (older persisted history) — read both.
  const raw = getRaw(payload) ?? {}
  const field = (key: string): unknown => payload[key] ?? raw[key]
  const info: SessionInitInfo = {}
  const cwd = readString(field('cwd'))
  if (cwd) info.cwd = cwd
  const model = readString(field('model'))
  if (model) info.model = model
  const permissionMode = readString(field('permissionMode'))
  if (permissionMode) info.permissionMode = permissionMode
  const slashCommands = readStringArray(field('slash_commands'))
  if (slashCommands) info.slashCommands = slashCommands
  const tools = readStringArray(field('tools'))
  if (tools) info.tools = tools
  const agents = readStringArray(field('agents'))
  if (agents) info.agents = agents
  const skills = readStringArray(field('skills'))
  if (skills) info.skills = skills
  const mcpServers = readMcpServers(field('mcp_servers'))
  if (mcpServers) info.mcpServers = mcpServers
  const plugins = readPlugins(field('plugins'))
  if (plugins) info.plugins = plugins
  const outputStyle = readString(field('output_style'))
  if (outputStyle) info.outputStyle = outputStyle
  const version = readString(field('claude_code_version'))
  if (version) info.version = version
  const capabilities = readRecord(field('capabilities'))
  if (capabilities) info.capabilities = capabilities
  return Object.keys(info).length > 0 ? info : undefined
}

function runtimeField(payload: UnknownRecord, key: string): unknown {
  return payload[key] ?? getRaw(payload)?.[key]
}

function readNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined
}

function readRuntimeTaskUsage(
  value: unknown,
): RuntimeTask['usage'] | undefined {
  const usage = readRecord(value)
  if (!usage) return undefined
  const totalTokens = readNonNegativeNumber(usage.total_tokens)
  const toolUses = readNonNegativeNumber(usage.tool_uses)
  const durationMs = readNonNegativeNumber(usage.duration_ms)
  if (
    totalTokens === undefined ||
    toolUses === undefined ||
    durationMs === undefined
  ) {
    return undefined
  }
  return { totalTokens, toolUses, durationMs }
}

function readNullableNumber(value: unknown): number | null | undefined {
  if (value === null) return null
  return readNonNegativeNumber(value)
}

function readRuntimeGoal(value: unknown): RuntimeGoal | null | undefined {
  if (value === null) return null
  const goal = readRecord(value)
  if (!goal) return undefined
  const objective = readString(goal.objective)
  const status = readString(goal.status)
  const validStatus =
    status === 'active' ||
    status === 'paused' ||
    status === 'blocked' ||
    status === 'budget_limited' ||
    status === 'usage_limited' ||
    status === 'max_turns' ||
    status === 'complete'
  if (!objective || !validStatus) return undefined
  const tokensUsed = readNonNegativeNumber(goal.tokens_used)
  const turnsExecuted = readNonNegativeNumber(goal.turns_executed)
  const activeElapsedMs = readNonNegativeNumber(goal.active_elapsed_ms)
  const startTime = readNonNegativeNumber(goal.start_time)
  const accumulatedActiveMs = readNonNegativeNumber(goal.accumulated_active_ms)
  const blockedAttempts = readNonNegativeNumber(goal.blocked_attempts)
  const updatedAt = readNonNegativeNumber(goal.updated_at)
  if (
    tokensUsed === undefined ||
    turnsExecuted === undefined ||
    activeElapsedMs === undefined ||
    startTime === undefined ||
    accumulatedActiveMs === undefined ||
    blockedAttempts === undefined ||
    updatedAt === undefined
  )
    return undefined
  return {
    objective,
    status,
    tokenBudget: readNullableNumber(goal.token_budget) ?? null,
    tokensUsed,
    turnsExecuted,
    activeElapsedMs,
    startTime,
    pausedAt: readNullableNumber(goal.paused_at) ?? null,
    accumulatedActiveMs,
    blockedAttempts,
    lastBlockReason: readString(goal.last_block_reason) ?? null,
    updatedAt,
  }
}

function readWorkflowAgents(value: unknown): RuntimeWorkflowAgent[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    const agent = readRecord(item)
    const id = readNonNegativeNumber(agent?.id)
    const status = readString(agent?.status)
    if (
      !agent ||
      id === undefined ||
      (status !== 'running' && status !== 'done')
    )
      return []
    const outputShape = readString(agent.outputShape)
    return [
      {
        id,
        label: readString(agent.label),
        phase: readString(agent.phase),
        status,
        resultKind: readString(agent.resultKind),
        outputShape:
          outputShape === 'text' || outputShape === 'object'
            ? outputShape
            : undefined,
        model: readString(agent.model),
        tokenCount: readNonNegativeNumber(agent.tokenCount),
        toolCount: readNonNegativeNumber(agent.toolCount),
      },
    ]
  })
}

function readWorkflowRuns(
  value: unknown,
): Record<string, RuntimeWorkflowRun> | undefined {
  if (!Array.isArray(value)) return undefined
  const runs = value.flatMap(item => {
    const run = readRecord(item)
    const runId = readString(run?.runId)
    const workflowName = readString(run?.workflowName)
    const status = readString(run?.status)
    const startedAt = readNonNegativeNumber(run?.startedAt)
    const updatedAt = readNonNegativeNumber(run?.updatedAt)
    if (
      !run ||
      !runId ||
      !workflowName ||
      startedAt === undefined ||
      updatedAt === undefined ||
      (status !== 'running' &&
        status !== 'completed' &&
        status !== 'failed' &&
        status !== 'killed')
    )
      return []
    const phases = Array.isArray(run.phases)
      ? run.phases.flatMap(item => {
          const phase = readRecord(item)
          const title = readString(phase?.title)
          const phaseStatus = readString(phase?.status)
          return phase &&
            title &&
            (phaseStatus === 'running' || phaseStatus === 'done')
            ? [{ title, status: phaseStatus }]
            : []
        })
      : []
    return [
      [
        runId,
        {
          runId,
          workflowName,
          status,
          phases,
          declaredPhases: readStringArray(run.declaredPhases) ?? [],
          currentPhase: readString(run.currentPhase) ?? null,
          agents: readWorkflowAgents(run.agents),
          agentCount: readNonNegativeNumber(run.agentCount) ?? 0,
          returnValue: run.returnValue,
          error: readString(run.error),
          startedAt,
          description: readString(run.description),
          updatedAt,
        } satisfies RuntimeWorkflowRun,
      ] as const,
    ]
  })
  return Object.fromEntries(runs)
}

function trimRuntimeRecord<T extends { updatedAt: number }>(
  record: Record<string, T>,
  limit: number,
): Record<string, T> {
  const entries = Object.entries(record)
  if (entries.length <= limit) return record
  return Object.fromEntries(
    entries
      .sort(([, left], [, right]) => right.updatedAt - left.updatedAt)
      .slice(0, limit),
  )
}

function readTaskListItems(value: unknown): RuntimeTaskListItem[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    if (!isRecord(item)) return []
    const id = readString(item.id)
    const subject = readString(item.subject)
    const status = readString(item.status)
    if (!id || !subject || !status) return []
    return [
      {
        id,
        subject,
        description: readString(item.description),
        activeForm: readString(item.activeForm),
        status,
        owner: readString(item.owner),
        blocks: readStringArray(item.blocks) ?? [],
        blockedBy: readStringArray(item.blockedBy) ?? [],
      },
    ]
  })
}

function reduceRuntimeState(
  runtime: SessionRuntimeState,
  event: SessionEvent,
  payload: UnknownRecord,
): SessionRuntimeState {
  const changedAt = Number.isFinite(event.createdAt)
    ? event.createdAt
    : event.seqNum

  if (event.type === 'session_status' || event.type === 'worker_status') {
    const status = readString(payload.status)
    if (!status) return runtime
    const isTurnState =
      status === 'idle' || status === 'running' || status === 'requires_action'
    return {
      ...runtime,
      workerStatus: status,
      ...(isTurnState
        ? {
            turnState: status,
            turnStateSource: 'sdk' as const,
          }
        : {}),
    }
  }

  if (event.type === 'user' && event.direction === 'outbound') {
    return {
      ...runtime,
      turnState: 'running',
      turnStateSource: 'event_fallback',
    }
  }

  if (event.type === 'result' || event.type === 'result_success') {
    return {
      ...runtime,
      turnState: 'idle',
      turnStateSource: 'event_fallback',
    }
  }

  if (
    event.type === 'permission_response' ||
    event.type === 'control_cancel_request'
  ) {
    return {
      ...runtime,
      turnState: 'running',
      turnStateSource: 'event_fallback',
    }
  }

  if (event.type === 'interrupt') {
    return {
      ...runtime,
      turnState: 'idle',
      turnStateSource: 'event_fallback',
    }
  }

  if (event.type === 'control_request' || event.type === 'permission_request') {
    const request = readRecord(payload.request)
    if (request?.subtype === 'can_use_tool') {
      return {
        ...runtime,
        turnState: 'requires_action',
        turnStateSource: 'event_fallback',
      }
    }
  }

  if (event.type === 'tool_progress') {
    const toolUseId = readString(runtimeField(payload, 'tool_use_id'))
    const toolName = readString(runtimeField(payload, 'tool_name')) ?? 'tool'
    const elapsedSeconds = readNonNegativeNumber(
      runtimeField(payload, 'elapsed_time_seconds'),
    )
    if (!toolUseId || elapsedSeconds === undefined) return runtime
    const parentToolUseId = readString(
      runtimeField(payload, 'parent_tool_use_id'),
    )
    const key = parentToolUseId ?? toolUseId
    return {
      ...runtime,
      toolProgress: trimRuntimeRecord(
        {
          ...runtime.toolProgress,
          [key]: {
            toolUseId,
            toolName,
            parentToolUseId,
            elapsedSeconds,
            taskId: readString(runtimeField(payload, 'task_id')),
            updatedAt: changedAt,
          },
        },
        100,
      ),
    }
  }

  if (event.type === 'task_state') {
    const listId =
      readString(runtimeField(payload, 'task_list_id')) ??
      readString(runtimeField(payload, 'taskListId'))
    if (!listId) return runtime
    return {
      ...runtime,
      taskLists: trimRuntimeRecord(
        {
          ...runtime.taskLists,
          [listId]: {
            id: listId,
            tasks: readTaskListItems(runtimeField(payload, 'tasks')),
            updatedAt: changedAt,
          },
        },
        20,
      ),
    }
  }

  if (event.type !== 'system') return runtime
  const subtype = readString(runtimeField(payload, 'subtype'))

  if (subtype === 'session_state_changed') {
    const state = readString(runtimeField(payload, 'state'))
    if (
      state !== 'idle' &&
      state !== 'running' &&
      state !== 'requires_action'
    ) {
      return runtime
    }
    return { ...runtime, turnState: state, turnStateSource: 'sdk' }
  }

  if (subtype === 'goal_state') {
    const goal = readRuntimeGoal(runtimeField(payload, 'goal'))
    return goal === undefined ? runtime : { ...runtime, goal }
  }

  if (subtype === 'workflow_state') {
    const runs = readWorkflowRuns(runtimeField(payload, 'runs'))
    if (!runs) return runtime
    return {
      ...runtime,
      workflowRuns: runs,
      namedWorkflows:
        readStringArray(runtimeField(payload, 'named_workflows')) ?? [],
      workflowRunsDirectory:
        readString(runtimeField(payload, 'runs_directory')) ?? null,
    }
  }

  if (
    subtype !== 'task_started' &&
    subtype !== 'task_progress' &&
    subtype !== 'task_notification'
  ) {
    return runtime
  }

  const taskId = readString(runtimeField(payload, 'task_id'))
  if (!taskId) return runtime
  const existing = runtime.tasks[taskId]
  const description =
    readString(runtimeField(payload, 'description')) ??
    existing?.description ??
    readString(runtimeField(payload, 'summary')) ??
    taskId
  const notificationStatus = readString(runtimeField(payload, 'status'))
  const status: RuntimeTask['status'] =
    subtype === 'task_notification' &&
    (notificationStatus === 'completed' ||
      notificationStatus === 'failed' ||
      notificationStatus === 'stopped')
      ? notificationStatus
      : 'running'
  const task: RuntimeTask = {
    id: taskId,
    toolUseId:
      readString(runtimeField(payload, 'tool_use_id')) ?? existing?.toolUseId,
    description,
    taskType:
      readString(runtimeField(payload, 'task_type')) ?? existing?.taskType,
    workflowName:
      readString(runtimeField(payload, 'workflow_name')) ??
      existing?.workflowName,
    prompt: readString(runtimeField(payload, 'prompt')) ?? existing?.prompt,
    status,
    usage:
      readRuntimeTaskUsage(runtimeField(payload, 'usage')) ?? existing?.usage,
    lastToolName:
      readString(runtimeField(payload, 'last_tool_name')) ??
      existing?.lastToolName,
    summary: readString(runtimeField(payload, 'summary')) ?? existing?.summary,
    outputFile:
      readString(runtimeField(payload, 'output_file')) ?? existing?.outputFile,
    workflowProgress: (Array.isArray(runtimeField(payload, 'workflow_progress'))
      ? runtimeField(payload, 'workflow_progress')
      : existing?.workflowProgress) as unknown[] | undefined,
    startedAt:
      existing?.startedAt ??
      (subtype === 'task_started' ? changedAt : undefined),
    updatedAt: changedAt,
  }

  return {
    ...runtime,
    tasks: trimRuntimeRecord({ ...runtime.tasks, [taskId]: task }, 100),
  }
}

function readTokenCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 0
}

/**
 * Aggregate API usage from an assistant event. Deduped by the API message id
 * — a single API response split into multiple assistant events repeats the
 * same usage object.
 */
function accumulateUsage(
  state: SessionEventState,
  payload: UnknownRecord,
): Pick<SessionEventState, 'usage' | 'seenUsageIds' | 'lastAssistantModel'> {
  const message = readRecord(payload.message)
  const unchanged = {
    usage: state.usage,
    seenUsageIds: state.seenUsageIds,
    lastAssistantModel: state.lastAssistantModel,
  }
  if (!message) return unchanged

  const model = readString(message.model) ?? state.lastAssistantModel
  const usage = readRecord(message.usage)
  if (!usage) return { ...unchanged, lastAssistantModel: model }

  const usageId =
    readString(message.id) ?? readString(payload.uuid) ?? undefined
  if (usageId && state.seenUsageIds.has(usageId)) {
    return { ...unchanged, lastAssistantModel: model }
  }

  const seenUsageIds = new Set(state.seenUsageIds)
  if (usageId) seenUsageIds.add(usageId)

  return {
    usage: {
      inputTokens: state.usage.inputTokens + readTokenCount(usage.input_tokens),
      outputTokens:
        state.usage.outputTokens + readTokenCount(usage.output_tokens),
      cacheReadInputTokens:
        state.usage.cacheReadInputTokens +
        readTokenCount(usage.cache_read_input_tokens),
      cacheCreationInputTokens:
        state.usage.cacheCreationInputTokens +
        readTokenCount(usage.cache_creation_input_tokens),
      apiCalls: state.usage.apiCalls + 1,
    },
    seenUsageIds,
    lastAssistantModel: model,
  }
}

const EMPTY_USAGE: TokenUsageTotals = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  apiCalls: 0,
}

export function createSessionEventState(): SessionEventState {
  return {
    entries: [],
    streamingAssistantBlocks: {},
    seenEventIds: new Set(),
    seenMessageKeys: new Set(),
    highWaterSeq: 0,
    sessionInfo: null,
    usage: EMPTY_USAGE,
    seenUsageIds: new Set(),
    lastAssistantModel: null,
    runtime: {
      turnState: 'unknown',
      turnStateSource: 'unknown',
      workerStatus: null,
      tasks: {},
      taskLists: {},
      toolProgress: {},
      goal: null,
      workflowRuns: {},
      namedWorkflows: [],
      workflowRunsDirectory: null,
    },
    pendingPermissions: {},
  }
}

export function reduceSessionEvent(
  state: SessionEventState,
  event: SessionEvent,
): SessionEventState {
  if (event.type === 'partial_assistant') {
    return reducePartialAssistant(state, event)
  }

  const highWaterSeq = updateHighWater(state, event)
  const exactIdentity = getEventIdentity(event)
  if (exactIdentity && state.seenEventIds.has(exactIdentity)) {
    return highWaterSeq === state.highWaterSeq
      ? state
      : { ...state, highWaterSeq }
  }

  const seenEventIds = new Set(state.seenEventIds)
  if (exactIdentity) seenEventIds.add(exactIdentity)

  const payload = getPayload(event)
  const messageKey = getMessageKey(event, payload)
  if (messageKey && state.seenMessageKeys.has(messageKey)) {
    return {
      ...state,
      seenEventIds,
      highWaterSeq,
    }
  }

  const seenMessageKeys = new Set(state.seenMessageKeys)
  if (messageKey) seenMessageKeys.add(messageKey)

  let entries = state.entries
  let streamingAssistantBlocks = state.streamingAssistantBlocks
  let sessionInfo = state.sessionInfo
  let usageState = {
    usage: state.usage,
    seenUsageIds: state.seenUsageIds,
    lastAssistantModel: state.lastAssistantModel,
  }
  const pendingPermissions = reducePendingPermissions(
    state.pendingPermissions,
    event,
    payload,
  )
  const runtime = reduceRuntimeState(state.runtime, event, payload)
  if (event.type === 'user') {
    entries = appendUser(entries, event, payload, exactIdentity)
  } else if (event.type === 'assistant') {
    const assistantId =
      getAssistantMessageId(payload) ??
      getEntryIdentity(event, payload, exactIdentity)
    const chunks = extractAssistantChunks(payload)
    if (
      assistantId &&
      Object.hasOwn(state.streamingAssistantBlocks, assistantId)
    ) {
      entries = replaceAssistantEntry(entries, assistantId, chunks)
      const { [assistantId]: _completed, ...remaining } =
        state.streamingAssistantBlocks
      streamingAssistantBlocks = remaining
    } else {
      entries = appendAssistant(entries, chunks, assistantId)
    }
    usageState = accumulateUsage(state, payload)
  } else if (event.type === 'system') {
    const parsed = parseSessionInit(payload)
    if (parsed) sessionInfo = { ...sessionInfo, ...parsed }
  }

  entries = applyTools(entries, seenMessageKeys, event, payload)
  entries = applyPermissionEvent(entries, event, payload)

  return {
    entries,
    streamingAssistantBlocks,
    seenEventIds,
    seenMessageKeys,
    highWaterSeq,
    sessionInfo,
    runtime,
    pendingPermissions,
    ...usageState,
  }
}
