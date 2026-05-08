import type {
  EventRow,
  JsonValue,
  RichToolCall,
  SnapshotRecord,
  ToolInputSemantics,
  ToolRow,
} from "./deep_action_types"

function asRecord(value: JsonValue | null): Record<string, JsonValue> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  return value as Record<string, JsonValue>
}

function asArray(value: JsonValue | null | undefined): JsonValue[] {
  return Array.isArray(value) ? value : []
}

function stringifyValue(value: JsonValue | null | undefined, maxLength = 180): string {
  if (value === null || value === undefined) {
    return ""
  }
  if (typeof value === "string") {
    return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value
  }
  const serialized = JSON.stringify(value)
  return serialized.length > maxLength
    ? `${serialized.slice(0, maxLength - 3)}...`
    : serialized
}

function summarizeTextBlocks(messages: JsonValue[]): string {
  const chunks: string[] = []
  for (const item of messages) {
    const record = asRecord(item)
    const message = asRecord(record?.message as JsonValue)
    for (const content of asArray(message?.content)) {
      const contentRecord = asRecord(content)
      if (contentRecord?.type === "text" && typeof contentRecord.text === "string") {
        chunks.push(contentRecord.text.trim())
      }
    }
  }
  const merged = chunks.join(" ").replace(/\s+/gu, " ").trim()
  return merged.length > 240 ? `${merged.slice(0, 237)}...` : merged
}

function extractPromptSummary(toolName: string, input: Record<string, JsonValue> | null): string {
  if (!input) {
    return ""
  }
  if (toolName === "Agent") {
    const prompt = typeof input.prompt === "string" ? input.prompt : ""
    return prompt.length > 200 ? `${prompt.slice(0, 197)}...` : prompt
  }
  if (toolName === "Write") {
    const content = typeof input.content === "string" ? input.content : ""
    return content.length > 200 ? `${content.slice(0, 197)}...` : content
  }
  if (toolName === "Edit" || toolName === "MultiEdit") {
    const newString = typeof input.new_string === "string" ? input.new_string : ""
    return newString.length > 200 ? `${newString.slice(0, 197)}...` : newString
  }
  return ""
}

function extractPathsFromInput(toolName: string, input: Record<string, JsonValue> | null): {
  commandOrPath: string
  touchedFiles: string[]
  producedFiles: string[]
  inputSummary: string
} {
  if (!input) {
    return { commandOrPath: "", touchedFiles: [], producedFiles: [], inputSummary: "" }
  }

  const getPath = (...keys: string[]): string => {
    for (const key of keys) {
      if (typeof input[key] === "string") {
        return input[key] as string
      }
    }
    return ""
  }

  switch (toolName) {
    case "Agent": {
      const description = stringifyValue(input.description)
      const prompt = stringifyValue(input.prompt, 120)
      const background = input.run_in_background === true ? "background" : "foreground"
      return {
        commandOrPath: description,
        touchedFiles: [],
        producedFiles: [],
        inputSummary: `description=${description}; prompt=${prompt}; mode=${background}`,
      }
    }
    case "Bash": {
      const command = getPath("command")
      const description = stringifyValue(input.description, 100)
      return {
        commandOrPath: command,
        touchedFiles: [],
        producedFiles: [],
        inputSummary: `command=${stringifyValue(command, 160)}; description=${description}`,
      }
    }
    case "Read":
    case "Grep":
    case "Glob": {
      const path = getPath("file_path", "path", "pattern")
      return {
        commandOrPath: path,
        touchedFiles: path ? [path] : [],
        producedFiles: [],
        inputSummary: stringifyValue(input),
      }
    }
    case "Write": {
      const filePath = getPath("file_path", "path")
      return {
        commandOrPath: filePath,
        touchedFiles: filePath ? [filePath] : [],
        producedFiles: filePath ? [filePath] : [],
        inputSummary: `file=${filePath}; content=${stringifyValue(input.content, 120)}`,
      }
    }
    case "Edit":
    case "MultiEdit": {
      const filePath = getPath("file_path", "path")
      return {
        commandOrPath: filePath,
        touchedFiles: filePath ? [filePath] : [],
        producedFiles: [],
        inputSummary: `file=${filePath}; old=${stringifyValue(input.old_string, 80)}; new=${stringifyValue(input.new_string, 80)}`,
      }
    }
    case "Task": {
      return {
        commandOrPath: stringifyValue(input.subagent_type),
        touchedFiles: [],
        producedFiles: [],
        inputSummary: stringifyValue(input),
      }
    }
    default:
      return {
        commandOrPath: stringifyValue(input, 140),
        touchedFiles: [],
        producedFiles: [],
        inputSummary: stringifyValue(input),
      }
  }
}

export function extractToolUsesFromResponse(snapshot: SnapshotRecord): Map<string, ToolInputSemantics> {
  const result = new Map<string, ToolInputSemantics>()
  const data = asRecord(snapshot.data)
  if (!data) {
    return result
  }

  const assistantMessages = asArray(data.assistantMessages)
  const textSummary = summarizeTextBlocks(assistantMessages)
  const toolBlocks = asArray(data.toolUseBlocks)

  for (const block of toolBlocks) {
    const record = asRecord(block)
    const toolUseId = typeof record?.id === "string" ? record.id : ""
    const toolName = typeof record?.name === "string" ? record.name : "unknown"
    if (!toolUseId) {
      continue
    }
    const input = asRecord((record?.input ?? null) as JsonValue)
    const semantics = extractPathsFromInput(toolName, input)
    result.set(toolUseId, {
      toolUseId,
      toolName,
      inputSummary: semantics.inputSummary,
      commandOrPath: semantics.commandOrPath,
      touchedFiles: semantics.touchedFiles,
      producedFiles: semantics.producedFiles,
      assistantTextSummary: textSummary,
      promptSummary: extractPromptSummary(toolName, input),
      rawInput: (record?.input ?? null) as JsonValue,
    })
  }

  return result
}

function inferIntent(toolName: string, inputSummary: string, commandOrPath: string, agentName: string | null): string {
  const haystack = `${toolName} ${inputSummary} ${commandOrPath} ${agentName ?? ""}`.toLowerCase()
  if (haystack.includes("compact")) return "compact"
  if (toolName === "Agent") return "spawn_subagent"
  if (toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit") return "modify_files"
  if (toolName === "Bash" && /\.(py|js|ts|ps1)\b/iu.test(commandOrPath)) return "run_script"
  if (toolName === "Read" || toolName === "Grep" || toolName === "Glob") return "inspect_inputs"
  if (haystack.includes("check") || haystack.includes("inspect") || haystack.includes("verify")) return "inspect_outputs"
  if (haystack.includes("fix") || haystack.includes("replace") || haystack.includes("patch")) return "repair"
  return "other"
}

function summarizeOutput(tool: ToolRow, eventByToolId: Map<string, EventRow[]>): { summary: string; warnings: string[] } {
  const warnings: string[] = []
  if (tool.success === false) {
    return {
      summary: tool.failure_reason ? `failed: ${tool.failure_reason}` : "failed",
      warnings,
    }
  }
  if (tool.success === true) {
    return { summary: "completed", warnings }
  }
  const events = eventByToolId.get(tool.tool_call_id) ?? []
  const failedEvent = events.find(event => event.event_name === "tool.execution.failed")
  if (failedEvent?.payload_json) {
    return { summary: failedEvent.payload_json.slice(0, 160), warnings }
  }
  warnings.push("missing tool execution result summary in V1 facts")
  return { summary: "result summary unavailable", warnings }
}

export function buildRichToolCalls(params: {
  tools: ToolRow[]
  events: EventRow[]
  turnsByQueryTurn: Map<string, { agent_name: string | null }>
  responseSnapshotsByTurn: Map<string, SnapshotRecord[]>
}): RichToolCall[] {
  const eventByToolId = new Map<string, EventRow[]>()
  for (const event of params.events) {
    if (!event.tool_call_id) {
      continue
    }
    const list = eventByToolId.get(event.tool_call_id) ?? []
    list.push(event)
    eventByToolId.set(event.tool_call_id, list)
  }

  const extractedByTurn = new Map<string, Map<string, ToolInputSemantics>>()
  for (const [turnKey, snapshots] of params.responseSnapshotsByTurn) {
    const collected = new Map<string, ToolInputSemantics>()
    for (const snapshot of snapshots) {
      for (const [id, semantics] of extractToolUsesFromResponse(snapshot)) {
        collected.set(id, semantics)
      }
    }
    extractedByTurn.set(turnKey, collected)
  }

  return params.tools.map(tool => {
    const turnKey = `${tool.query_id ?? "unknown"}|${tool.turn_id ?? "unknown"}`
    const extracted = extractedByTurn.get(turnKey)?.get(tool.tool_call_id)
    const output = summarizeOutput(tool, eventByToolId)
    const agentName = params.turnsByQueryTurn.get(turnKey)?.agent_name ?? null
    const toolName = tool.tool_name ?? extracted?.toolName ?? "unknown"
    const evidenceRefs = [
      ...(params.responseSnapshotsByTurn.get(turnKey)?.map(snapshot => snapshot.snapshotRef) ?? []),
    ]
    if (!extracted) {
      output.warnings.push("missing response snapshot tool_use block")
    }
    return {
      tool_call_id: tool.tool_call_id,
      query_id: tool.query_id,
      agent_name: agentName,
      turn_id: tool.turn_id,
      tool_name: toolName,
      detected_at: tool.detected_at,
      completed_at: tool.completed_at,
      duration_ms: tool.duration_ms,
      success: tool.success,
      input_summary: extracted?.inputSummary ?? "input unavailable",
      output_summary: output.summary,
      command_or_path: extracted?.commandOrPath ?? "",
      intent_inferred: inferIntent(
        toolName,
        extracted?.inputSummary ?? "",
        extracted?.commandOrPath ?? "",
        agentName,
      ),
      produced_files: extracted?.producedFiles ?? [],
      touched_files: extracted?.touchedFiles ?? [],
      snapshot_refs: evidenceRefs,
      evidence_refs: evidenceRefs,
      warnings: output.warnings,
      prompt_summary: extracted?.promptSummary ?? "",
    } satisfies RichToolCall
  })
}
