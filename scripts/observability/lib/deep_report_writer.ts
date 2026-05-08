import type {
  ActionRow,
  ArtifactRecord,
  EvidenceRecord,
  IntegrityRow,
  PhaseRecord,
  QueryRow,
  RichToolCall,
  SubagentRow,
} from "./deep_action_types"

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function shortId(value: string | null | undefined): string {
  if (!value) return "null"
  return value.length <= 8 ? value : value.slice(0, 8)
}

function table(headers: string[], rows: string[][]): string[] {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map(row => `| ${row.join(" | ")} |`),
  ]
}

export function writeDeepReport(params: {
  action: ActionRow
  integrity: IntegrityRow | null
  queries: QueryRow[]
  subagents: SubagentRow[]
  phases: PhaseRecord[]
  tools: RichToolCall[]
  artifacts: ArtifactRecord[]
  evidence: EvidenceRecord[]
  richMermaidPath: string
  debugMermaidPath: string
  baselineReportPath: string | null
}): string {
  const missingSnapshotCount = params.tools.filter(tool =>
    tool.warnings.some(warning => warning.includes("snapshot")),
  ).length
  const confidence = missingSnapshotCount === 0 ? "high" : missingSnapshotCount < 5 ? "medium" : "low"
  const summary = `This action expanded into ${params.action.query_count} queries, ${params.action.subagent_count} subagents, and ${params.phases.length} inferred phases with ${params.action.tool_call_count} tool calls.`
  const lines: string[] = [
    "# Deep Action Report",
    "",
    "## 1. 一句话总结",
    "",
    summary,
    "",
    "## 2. Basics",
    "",
    `- user_action_id: ${params.action.user_action_id}`,
    `- utc: ${params.action.started_at} -> ${params.action.ended_at}`,
    `- duration_ms: ${params.action.duration_ms}`,
    `- query_count: ${params.action.query_count}`,
    `- subagent_count: ${params.action.subagent_count}`,
    `- tool_call_count: ${params.action.tool_call_count}`,
    `- total_prompt_input_tokens: ${params.action.total_prompt_input_tokens}`,
    `- total_billed_tokens: ${params.action.total_billed_tokens}`,
    "",
  ]

  if (params.integrity) {
    lines.push("## 3. Integrity Snapshot", "")
    for (const [key, value] of Object.entries(params.integrity)) {
      lines.push(`- ${key}: ${value ?? ""}`)
    }
    lines.push("")
  }

  lines.push("## 4. Query / Agent 分工", "")
  for (const query of params.queries) {
    lines.push(
      `- ${query.agent_name ?? "unknown"} ${shortId(query.query_id)}: turns=${query.turn_count}, tools=${query.tool_call_count}, duration_ms=${query.duration_ms ?? ""}, terminal=${query.terminal_reason ?? ""}`,
    )
  }
  for (const subagent of params.subagents) {
    lines.push(
      `- subagent ${shortId(subagent.subagent_id)}: ${subagent.subagent_reason ?? ""}, duration_ms=${subagent.duration_ms ?? ""}, child_query=${shortId(subagent.query_id)}`,
    )
  }
  lines.push("")

  lines.push("## 5. 阶段级时间线", "")
  lines.push(
    ...table(
      ["phase", "time", "queries", "turns", "tools", "outputs", "problems", "evidence"],
      params.phases.map(phase => [
        phase.phase_name,
        `${phase.start_local} -> ${phase.end_local}`,
        phase.query_ids.map(shortId).join(", "),
        unique(phase.turn_ids).join(", "),
        Object.entries(phase.tool_counts)
          .map(([name, count]) => `${name} x${count}`)
          .join("; "),
        (phase.main_outputs[0] ?? "").replaceAll("|", "\\|"),
        (phase.problems[0] ?? "").replaceAll("|", "\\|"),
        phase.evidence_refs.slice(0, 2).join("<br/>"),
      ]),
    ),
  )
  lines.push("")

  lines.push("## 6. 富证据复杂 DAG", "")
  lines.push(`- rich stage flow: ${params.richMermaidPath}`)
  lines.push(`- debug chain flow: ${params.debugMermaidPath}`)
  if (params.baselineReportPath) {
    lines.push(`- baseline explain_action report: ${params.baselineReportPath}`)
  }
  lines.push("")

  lines.push("## 7. 工具调用语义复盘", "")
  for (const tool of params.tools.slice(0, 20)) {
    lines.push(
      `- ${tool.tool_name} ${shortId(tool.tool_call_id)} @ ${tool.turn_id ?? "no-turn"}: ${tool.input_summary}; output=${tool.output_summary}; intent=${tool.intent_inferred}; evidence=${tool.evidence_refs[0] ?? "none"}`,
    )
  }
  if (params.tools.length > 20) {
    lines.push(`- ... ${params.tools.length - 20} more tool calls in tool_calls_rich.csv`)
  }
  lines.push("")

  lines.push("## 8. 文件产物链", "")
  for (const artifact of params.artifacts.slice(0, 20)) {
    lines.push(
      `- ${artifact.artifact_path}: type=${artifact.artifact_type}, first_seen_phase=${artifact.first_seen_phase}, created_by=${artifact.created_by_tool || "unknown"}, modified_by=${artifact.modified_by_tools.join(", ") || "none"}`,
    )
  }
  if (params.artifacts.length > 20) {
    lines.push(`- ... ${params.artifacts.length - 20} more artifacts in artifact_chain.csv`)
  }
  lines.push("")

  lines.push("## 9. 问题与修复链", "")
  const issueTools = params.tools.filter(
    tool => tool.success === false || tool.intent_inferred === "repair" || tool.warnings.length > 0,
  )
  if (issueTools.length === 0) {
    lines.push("- no dense repair chain detected")
  } else {
    for (const tool of issueTools.slice(0, 20)) {
      lines.push(
        `- ${tool.tool_name} ${shortId(tool.tool_call_id)}: ${tool.output_summary}; warnings=${tool.warnings.join("; ") || "none"}`,
      )
    }
  }
  lines.push("")

  lines.push("## 10. Snapshot 证据索引", "")
  lines.push(
    ...table(
      ["evidence_id", "category", "query", "turn", "fields", "summary"],
      params.evidence.slice(0, 20).map(item => [
        item.evidence_id,
        item.category ?? "",
        shortId(item.query_id),
        item.turn_id ?? "",
        item.extracted_fields.join(", "),
        item.summary.replaceAll("|", "\\|"),
      ]),
    ),
  )
  if (params.evidence.length > 20) {
    lines.push("", `More evidence rows: ${params.evidence.length - 20} omitted from report; see snapshot_evidence_index.csv`)
  }
  lines.push("", "## 11. 缺失信息与可信度", "")
  lines.push(`- confidence: ${confidence}`)
  lines.push(`- missing_snapshot_tool_calls: ${missingSnapshotCount}`)
  if (missingSnapshotCount > 0) {
    lines.push("- some tool parameters or results could not be reconstructed because response/state snapshots were missing in V1 facts")
  }
  return lines.join("\n")
}
