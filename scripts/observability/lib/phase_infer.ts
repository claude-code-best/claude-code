import type { ActionRow, PhaseRecord, QueryRow, RichToolCall, TurnRow } from "./deep_action_types"

type Seed = {
  name: string
  kind: PhaseRecord["stage_kind"]
  startMs: number
  endMs: number
  queryId: string | null
  turnId: string | null
  toolName: string | null
  toolCallId: string | null
  output: string
  problem: string
  fix: string
  evidenceRefs: string[]
}

function localText(value: number): string {
  return new Date(value).toLocaleString("sv-SE").replace("T", " ")
}

function inferPhaseName(tool: RichToolCall): { name: string; kind: PhaseRecord["stage_kind"] } {
  const haystack = `${tool.tool_name} ${tool.input_summary} ${tool.command_or_path} ${tool.prompt_summary} ${tool.agent_name ?? ""}`.toLowerCase()
  if (haystack.includes("compact")) return { name: "compact", kind: "compact" }
  if (haystack.includes("docx") || haystack.includes("python-docx") || haystack.includes("word")) {
    return { name: "thesis_parse", kind: tool.agent_name === "main_thread" ? "main" : "subagent" }
  }
  if (haystack.includes("pptx") || haystack.includes("template") || haystack.includes("python-pptx")) {
    return { name: "template_parse", kind: tool.agent_name === "main_thread" ? "main" : "subagent" }
  }
  if (haystack.includes("word/media") || haystack.includes("zipfile")) {
    return { name: "media_extract", kind: "subagent" }
  }
  if (haystack.includes("blip") || haystack.includes("caption") || haystack.includes("image")) {
    return { name: "image_caption_map", kind: "subagent" }
  }
  if (haystack.includes("pptxgenjs") || haystack.includes("generate_ppt") || haystack.includes("create_ppt")) {
    return { name: "deck_build", kind: "script" }
  }
  if (haystack.includes("overlap") || haystack.includes("out-of-bounds") || haystack.includes("check")) {
    return { name: "layout_check", kind: "issue" }
  }
  if (haystack.includes("readonly") || haystack.includes("lock") || haystack.includes("copy2") || haystack.includes("save")) {
    return { name: "ppt_save_fix", kind: "fix" }
  }
  if (tool.tool_name === "Agent") return { name: "spawn_subagents", kind: "main" }
  if (tool.tool_name === "Read" || tool.tool_name === "Grep" || tool.tool_name === "Glob") {
    return { name: tool.agent_name === "main_thread" ? "initial_read" : "subagent_work", kind: tool.agent_name === "main_thread" ? "input" : "subagent" }
  }
  if (tool.tool_name === "Write" && /\.(py|js|ts|ps1)\b/iu.test(tool.command_or_path)) {
    return { name: "script_generation", kind: "script" }
  }
  if (tool.tool_name === "Bash" && /\.(py|js|ts|ps1)\b/iu.test(tool.command_or_path)) {
    return { name: "script_execution", kind: "script" }
  }
  if (tool.tool_name === "Edit" || tool.tool_name === "MultiEdit") {
    return { name: "repair", kind: "fix" }
  }
  if (tool.tool_name === "Task") return { name: "completion", kind: "output" }
  if (tool.agent_name && tool.agent_name !== "main_thread") {
    return { name: "subagent_work", kind: "subagent" }
  }
  return { name: "main_preparation", kind: "main" }
}

function appendCount(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1
}

function mergeSeeds(seeds: Seed[]): PhaseRecord[] {
  if (seeds.length === 0) {
    return []
  }
  const sorted = [...seeds].sort((left, right) => left.startMs - right.startMs)
  const phases: PhaseRecord[] = []
  let current: PhaseRecord | null = null

  for (const seed of sorted) {
    const shouldMerge =
      current &&
      current.phase_name === seed.name &&
      current.stage_kind === seed.kind &&
      seed.startMs - current.end_ms < 90_000

    if (!shouldMerge) {
      current = {
        phase_id: `phase_${String(phases.length + 1).padStart(2, "0")}`,
        phase_name: seed.name,
        stage_kind: seed.kind,
        start_local: localText(seed.startMs),
        end_local: localText(seed.endMs),
        duration_ms: Math.max(seed.endMs - seed.startMs, 0),
        start_ms: seed.startMs,
        end_ms: seed.endMs,
        query_ids: seed.queryId ? [seed.queryId] : [],
        turn_ids: seed.turnId ? [seed.turnId] : [],
        tool_counts: {},
        main_outputs: seed.output ? [seed.output] : [],
        problems: seed.problem ? [seed.problem] : [],
        fixes: seed.fix ? [seed.fix] : [],
        evidence_refs: [...seed.evidenceRefs],
        tool_call_ids: seed.toolCallId ? [seed.toolCallId] : [],
      }
      if (seed.toolName) {
        appendCount(current.tool_counts, seed.toolName)
      }
      phases.push(current)
      continue
    }

    current.end_ms = Math.max(current.end_ms, seed.endMs)
    current.end_local = localText(current.end_ms)
    current.duration_ms = Math.max(current.end_ms - current.start_ms, 0)
    if (seed.queryId && !current.query_ids.includes(seed.queryId)) current.query_ids.push(seed.queryId)
    if (seed.turnId && !current.turn_ids.includes(seed.turnId)) current.turn_ids.push(seed.turnId)
    if (seed.toolName) appendCount(current.tool_counts, seed.toolName)
    if (seed.output && !current.main_outputs.includes(seed.output)) current.main_outputs.push(seed.output)
    if (seed.problem && !current.problems.includes(seed.problem)) current.problems.push(seed.problem)
    if (seed.fix && !current.fixes.includes(seed.fix)) current.fixes.push(seed.fix)
    for (const ref of seed.evidenceRefs) {
      if (!current.evidence_refs.includes(ref)) current.evidence_refs.push(ref)
    }
    if (seed.toolCallId && !current.tool_call_ids.includes(seed.toolCallId)) {
      current.tool_call_ids.push(seed.toolCallId)
    }
  }

  return phases
}

function coalescePhases(phases: PhaseRecord[]): PhaseRecord[] {
  const merged = new Map<string, PhaseRecord>()
  const order: string[] = []

  for (const phase of phases) {
    const key = `${phase.phase_name}|${phase.stage_kind}`
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, {
        ...phase,
        query_ids: [...phase.query_ids],
        turn_ids: [...phase.turn_ids],
        tool_counts: { ...phase.tool_counts },
        main_outputs: [...phase.main_outputs],
        problems: [...phase.problems],
        fixes: [...phase.fixes],
        evidence_refs: [...phase.evidence_refs],
        tool_call_ids: [...phase.tool_call_ids],
      })
      order.push(key)
      continue
    }

    existing.start_ms = Math.min(existing.start_ms, phase.start_ms)
    existing.end_ms = Math.max(existing.end_ms, phase.end_ms)
    existing.start_local = localText(existing.start_ms)
    existing.end_local = localText(existing.end_ms)
    existing.duration_ms = Math.max(existing.end_ms - existing.start_ms, 0)
    for (const queryId of phase.query_ids) {
      if (!existing.query_ids.includes(queryId)) existing.query_ids.push(queryId)
    }
    for (const turnId of phase.turn_ids) {
      if (!existing.turn_ids.includes(turnId)) existing.turn_ids.push(turnId)
    }
    for (const [toolName, count] of Object.entries(phase.tool_counts)) {
      existing.tool_counts[toolName] = (existing.tool_counts[toolName] ?? 0) + count
    }
    for (const output of phase.main_outputs) {
      if (!existing.main_outputs.includes(output)) existing.main_outputs.push(output)
    }
    for (const problem of phase.problems) {
      if (!existing.problems.includes(problem)) existing.problems.push(problem)
    }
    for (const fix of phase.fixes) {
      if (!existing.fixes.includes(fix)) existing.fixes.push(fix)
    }
    for (const ref of phase.evidence_refs) {
      if (!existing.evidence_refs.includes(ref)) existing.evidence_refs.push(ref)
    }
    for (const toolCallId of phase.tool_call_ids) {
      if (!existing.tool_call_ids.includes(toolCallId)) existing.tool_call_ids.push(toolCallId)
    }
  }

  return order.map((key, index) => ({
    ...merged.get(key)!,
    phase_id: `phase_${String(index + 1).padStart(2, "0")}`,
  }))
}

export function inferPhases(params: {
  action: ActionRow
  queries: QueryRow[]
  turns: TurnRow[]
  tools: RichToolCall[]
}): PhaseRecord[] {
  const seeds: Seed[] = []
  const firstTool = [...params.tools]
    .filter(tool => tool.detected_at)
    .sort((left, right) => Date.parse(left.detected_at ?? "") - Date.parse(right.detected_at ?? ""))[0]

  if (firstTool?.detected_at) {
    seeds.push({
      name: "action_start",
      kind: "input",
      startMs: params.action.started_at_ms,
      endMs: Date.parse(firstTool.detected_at),
      queryId: params.queries[0]?.query_id ?? null,
      turnId: params.turns[0]?.turn_id ?? null,
      toolName: null,
      toolCallId: null,
      output: "entered action",
      problem: "",
      fix: "",
      evidenceRefs: [],
    })
  }

  for (const tool of params.tools) {
    const startMs = tool.detected_at ? Date.parse(tool.detected_at) : params.action.started_at_ms
    const endMs = tool.completed_at ? Date.parse(tool.completed_at) : startMs
    const inferred = inferPhaseName(tool)
    const failed = tool.success === false ? tool.output_summary : ""
    const fix = inferred.kind === "fix" ? tool.input_summary : ""
    seeds.push({
      name: inferred.name,
      kind: inferred.kind,
      startMs,
      endMs,
      queryId: tool.query_id,
      turnId: tool.turn_id,
      toolName: tool.tool_name,
      toolCallId: tool.tool_call_id,
      output: tool.produced_files[0] ?? tool.output_summary,
      problem: failed,
      fix,
      evidenceRefs: tool.evidence_refs,
    })
  }

  if (params.queries.some(query => (query.query_source ?? "").includes("compact"))) {
    const compactQueries = params.queries.filter(query =>
      (query.query_source ?? "").includes("compact"),
    )
    for (const query of compactQueries) {
      seeds.push({
        name: "compact",
        kind: "compact",
        startMs: query.started_at_ms,
        endMs: query.ended_at_ms ?? query.started_at_ms,
        queryId: query.query_id,
        turnId: null,
        toolName: null,
        toolCallId: null,
        output: query.terminal_reason ?? "",
        problem: "",
        fix: "",
        evidenceRefs: [],
      })
    }
  }

  seeds.push({
    name: "completion",
    kind: "output",
    startMs: params.action.ended_at_ms,
    endMs: params.action.ended_at_ms,
    queryId: params.queries.at(-1)?.query_id ?? null,
    turnId: params.turns.at(-1)?.turn_id ?? null,
    toolName: null,
    toolCallId: null,
    output: "action completed",
    problem: "",
    fix: "",
    evidenceRefs: [],
  })

  return coalescePhases(mergeSeeds(seeds))
}
