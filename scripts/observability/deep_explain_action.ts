import { spawnSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { buildArtifactChain, enrichToolPaths } from "./lib/artifact_tracker"
import { writeDeepReport } from "./lib/deep_report_writer"
import type {
  ActionRow,
  ArtifactRecord,
  EventRow,
  EvidenceRecord,
  IntegrityRow,
  JsonValue,
  PhaseRecord,
  QueryRow,
  RichToolCall,
  SnapshotIndexRow,
  SnapshotRecord,
  SubagentRow,
  ToolRow,
  TurnRow,
} from "./lib/deep_action_types"
import { buildDebugChainFlow, buildRichStageFlow } from "./lib/mermaid_rich_graph"
import { inferPhases } from "./lib/phase_infer"
import { SnapshotReader } from "./lib/snapshot_reader"
import { buildRichToolCalls } from "./lib/tool_use_extractor"

const repoRoot = resolve(import.meta.dir, "..", "..")
const duckdbExe = join(repoRoot, "tools", "duckdb", "duckdb.exe")
const dbPath = join(repoRoot, ".observability", "observability_v1.duckdb")
const dbSnapshotDir = join(repoRoot, ".observability", "v1-report-db-snapshots")

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

function parseArgs(argv: string[]): {
  userActionId?: string
  latest: boolean
  outputDir?: string
  baselineReportPath?: string
} {
  const parsed = { latest: false } as {
    userActionId?: string
    latest: boolean
    outputDir?: string
    baselineReportPath?: string
  }
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    if (current === "--user-action-id") parsed.userActionId = argv[++index]
    if (current === "--latest") parsed.latest = true
    if (current === "--output-dir") parsed.outputDir = argv[++index]
    if (current === "--baseline-report-path") parsed.baselineReportPath = argv[++index]
  }
  if (!parsed.userActionId) parsed.latest = true
  return parsed
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function runDuckDbJson<T>(databasePath: string, sql: string): T[] {
  const result = spawnSync(duckdbExe, ["-json", databasePath, sql], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 128,
  })
  if (result.status !== 0) {
    fail(result.stderr?.trim() || result.stdout?.trim() || "duckdb query failed")
  }
  const raw = result.stdout.trim()
  return raw ? (JSON.parse(raw) as T[]) : []
}

function createDbSnapshot(): string {
  mkdirSync(dbSnapshotDir, { recursive: true })
  const tempDbPath = join(dbSnapshotDir, `deep_explain_action.${process.pid}.${Date.now()}.duckdb`)
  copyFileSync(dbPath, tempDbPath)
  return tempDbPath
}

function parseJsonValue(value: string | null): JsonValue | null {
  if (!value) return null
  try {
    return JSON.parse(value) as JsonValue
  } catch {
    return null
  }
}

function toBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0
  if (typeof value === "string") {
    const lowered = value.toLowerCase()
    if (lowered === "true") return true
    if (lowered === "false") return false
  }
  return null
}

function csvEscape(value: string | number | boolean | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value)
  if (/[",\n]/u.test(text)) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

function toCsv(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>): string {
  return [
    headers.join(","),
    ...rows.map(row => row.map(csvEscape).join(",")),
  ].join("\n")
}

function shortId(value: string | null | undefined): string {
  if (!value) return "null"
  return value.length <= 8 ? value : value.slice(0, 8)
}

function pickLatestUserActionId(databasePath: string): string {
  const rows = runDuckDbJson<{ user_action_id: string }>(
    databasePath,
    "select user_action_id from user_actions order by started_at_ms desc limit 1;",
  )
  if (rows.length === 0) {
    fail("no user actions found")
  }
  return rows[0]!.user_action_id
}

function collectResponseSnapshotsByTurn(
  events: EventRow[],
  snapshotReader: SnapshotReader,
): Map<string, SnapshotRecord[]> {
  const result = new Map<string, SnapshotRecord[]>()
  for (const event of events) {
    if (event.event_name !== "api.stream.completed") continue
    const payload = parseJsonValue(event.payload_json)
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) continue
    const snapshotRef = typeof payload.response_snapshot_ref === "string" ? payload.response_snapshot_ref : null
    if (!snapshotRef) continue
    const key = `${event.effective_query_id ?? event.query_id ?? "unknown"}|${event.turn_id ?? "unknown"}`
    const list = result.get(key) ?? []
    list.push(snapshotReader.read(snapshotRef))
    result.set(key, list)
  }
  return result
}

function buildEvidenceIndex(params: {
  events: EventRow[]
  snapshots: Map<string, SnapshotRecord>
}): EvidenceRecord[] {
  const rows: EvidenceRecord[] = []
  let index = 0

  for (const event of params.events) {
    const refs = (parseJsonValue(event.snapshot_refs_json) as string[] | null) ?? []
    for (const ref of refs) {
      const snapshot = params.snapshots.get(ref)
      if (!snapshot) continue
      const data = snapshot.data
      const extractedFields =
        data && typeof data === "object" && !Array.isArray(data)
          ? Object.keys(data).slice(0, 8)
          : []
      const summary =
        snapshot.category === "response"
          ? "response snapshot with assistant text/tool_use blocks"
          : snapshot.category === "state_after_turn"
            ? "after-turn state snapshot"
            : snapshot.category === "state_before_turn"
              ? "before-turn state snapshot"
              : snapshot.category ?? "snapshot"
      index += 1
      rows.push({
        evidence_id: `e${String(index).padStart(3, "0")}`,
        snapshot_ref: ref,
        category: snapshot.category,
        query_id: event.effective_query_id ?? event.query_id,
        turn_id: event.turn_id,
        extracted_fields: extractedFields,
        summary,
      })
    }
  }

  return rows
}

function main(): void {
  if (!existsSync(duckdbExe)) fail(`DuckDB executable not found: ${duckdbExe}`)
  if (!existsSync(dbPath)) fail(`DuckDB database not found: ${dbPath}`)

  const args = parseArgs(process.argv.slice(2))
  const tempDbPath = createDbSnapshot()

  try {
    const userActionId = args.userActionId ?? pickLatestUserActionId(tempDbPath)
    const actionIdSql = sqlLiteral(userActionId)
    const action = runDuckDbJson<ActionRow>(
      tempDbPath,
      `select * from user_actions where user_action_id = ${actionIdSql};`,
    )[0]
    if (!action) fail(`user action not found: ${userActionId}`)

    const integrity = runDuckDbJson<IntegrityRow>(
      tempDbPath,
      `select * from metrics_integrity_daily where event_date = ${sqlLiteral(action.event_date)};`,
    )[0] ?? null
    const queries = runDuckDbJson<QueryRow>(
      tempDbPath,
      `select query_id, user_action_id, query_source, subagent_id, subagent_reason, subagent_trigger_kind, subagent_trigger_detail, agent_name, source_group, started_at, started_at_ms, ended_at, ended_at_ms, duration_ms, turn_count, query_max_loop_iter, tool_call_count, terminal_reason, strict_is_complete, inferred_is_complete from queries where user_action_id = ${actionIdSql} order by started_at_ms asc;`,
    )
    const turns = runDuckDbJson<TurnRow>(
      tempDbPath,
      `select query_id, turn_id, agent_name, query_source, started_at, started_at_ms, ended_at, ended_at_ms, duration_ms, loop_iter_start, loop_iter_end, tool_call_count, stop_reason, transition_out, termination_reason, strict_is_closed, inferred_is_closed from turns where user_action_id = ${actionIdSql} order by started_at_ms asc;`,
    )
    const tools = runDuckDbJson<ToolRow>(
      tempDbPath,
      `select tool_call_id, query_id, turn_id, subagent_id, tool_name, detected_at, detected_at_ms, started_at, started_at_ms, completed_at, completed_at_ms, duration_ms, success, failure_reason from tools where user_action_id = ${actionIdSql} order by detected_at_ms asc;`,
    ).map(tool => ({
      ...tool,
      success: toBoolean(tool.success),
    }))
    const subagents = runDuckDbJson<SubagentRow>(
      tempDbPath,
      `select subagent_id, query_id, subagent_type, subagent_reason, subagent_trigger_kind, subagent_trigger_detail, query_source, agent_name, source_group, spawned_at, spawned_at_ms, completed_at, completed_at_ms, duration_ms from subagents where user_action_id = ${actionIdSql} order by spawned_at_ms asc;`,
    )
    const events = runDuckDbJson<EventRow>(
      tempDbPath,
      `select event_name, ts_wall, ts_wall_ms, query_id, effective_query_id, turn_id, tool_call_id, subagent_id, payload_json, snapshot_refs_json from events_raw where user_action_id = ${actionIdSql} order by ts_wall_ms asc, event_idx asc;`,
    )

    const snapshotRefs = new Set<string>()
    for (const event of events) {
      const refs = (parseJsonValue(event.snapshot_refs_json) as string[] | null) ?? []
      for (const ref of refs) snapshotRefs.add(ref)
    }
    const snapshotIndex = new Map<string, SnapshotIndexRow>()
    if (snapshotRefs.size > 0) {
      for (const row of runDuckDbJson<SnapshotIndexRow>(
        tempDbPath,
        "select snapshot_ref, file_name, relative_path, absolute_path, exists, size_bytes, sha256, referenced_count, first_event_ts, last_event_ts, category from snapshots_index;",
      )) {
        if (snapshotRefs.has(row.snapshot_ref)) {
          snapshotIndex.set(row.snapshot_ref, row)
        }
      }
    }

    const snapshotReader = new SnapshotReader(repoRoot, snapshotIndex)
    const snapshots = new Map<string, SnapshotRecord>()
    for (const ref of snapshotRefs) {
      snapshots.set(ref, snapshotReader.read(ref))
    }

    const turnsByQueryTurn = new Map<string, { agent_name: string | null }>()
    for (const turn of turns) {
      turnsByQueryTurn.set(`${turn.query_id}|${turn.turn_id}`, { agent_name: turn.agent_name })
    }

    const responseSnapshotsByTurn = collectResponseSnapshotsByTurn(events, snapshotReader)
    const richTools = enrichToolPaths(
      buildRichToolCalls({ tools, events, turnsByQueryTurn, responseSnapshotsByTurn }),
    )
    const phases = inferPhases({ action, queries, turns, tools: richTools })
    const phaseByToolId = new Map<string, PhaseRecord>()
    for (const phase of phases) {
      for (const toolCallId of phase.tool_call_ids) {
        phaseByToolId.set(toolCallId, phase)
      }
    }
    const artifacts = buildArtifactChain(richTools, phaseByToolId)
    const evidence = buildEvidenceIndex({ events, snapshots })

    const outputDir =
      args.outputDir ??
      join(repoRoot, "ObservrityTask", "action-reports", "deep", `user_action_${shortId(userActionId)}`)
    mkdirSync(outputDir, { recursive: true })

    const richMermaid = buildRichStageFlow(phases)
    const debugMermaid = buildDebugChainFlow(phases)
    const richMermaidPath = join(outputDir, "rich_stage_flow.mmd")
    const debugMermaidPath = join(outputDir, "debug_chain_flow.mmd")
    writeFileSync(richMermaidPath, richMermaid, "utf8")
    writeFileSync(debugMermaidPath, debugMermaid, "utf8")

    writeFileSync(
      join(outputDir, "phase_timeline_mapping.csv"),
      toCsv(
        [
          "phase_id",
          "phase_name",
          "start_local",
          "end_local",
          "duration_ms",
          "query_ids",
          "turn_range",
          "tool_counts",
          "main_outputs",
          "problems",
          "evidence_refs",
        ],
        phases.map(phase => [
          phase.phase_id,
          phase.phase_name,
          phase.start_local,
          phase.end_local,
          phase.duration_ms,
          phase.query_ids.join(";"),
          phase.turn_ids.join(";"),
          Object.entries(phase.tool_counts)
            .map(([name, count]) => `${name}:${count}`)
            .join(";"),
          phase.main_outputs.join(" | "),
          phase.problems.join(" | "),
          phase.evidence_refs.join(";"),
        ]),
      ),
      "utf8",
    )

    writeFileSync(
      join(outputDir, "tool_calls_rich.csv"),
      toCsv(
        [
          "query_id",
          "agent_name",
          "turn_id",
          "tool_name",
          "detected_at",
          "completed_at",
          "duration_ms",
          "success",
          "input_summary",
          "output_summary",
          "command_or_path",
          "intent_inferred",
          "produced_files",
          "touched_files",
          "snapshot_refs",
        ],
        richTools.map(tool => [
          tool.query_id,
          tool.agent_name,
          tool.turn_id,
          tool.tool_name,
          tool.detected_at,
          tool.completed_at,
          tool.duration_ms,
          tool.success,
          tool.input_summary,
          tool.output_summary,
          tool.command_or_path,
          tool.intent_inferred,
          tool.produced_files.join(";"),
          tool.touched_files.join(";"),
          tool.snapshot_refs.join(";"),
        ]),
      ),
      "utf8",
    )

    writeFileSync(
      join(outputDir, "artifact_chain.csv"),
      toCsv(
        [
          "artifact_path",
          "artifact_type",
          "first_seen_phase",
          "created_by_tool",
          "modified_by_tools",
          "evidence_refs",
        ],
        artifacts.map((artifact: ArtifactRecord) => [
          artifact.artifact_path,
          artifact.artifact_type,
          artifact.first_seen_phase,
          artifact.created_by_tool,
          artifact.modified_by_tools.join(";"),
          artifact.evidence_refs.join(";"),
        ]),
      ),
      "utf8",
    )

    writeFileSync(
      join(outputDir, "snapshot_evidence_index.csv"),
      toCsv(
        ["evidence_id", "snapshot_ref", "category", "query_id", "turn_id", "extracted_fields", "summary"],
        evidence.map((item: EvidenceRecord) => [
          item.evidence_id,
          item.snapshot_ref,
          item.category,
          item.query_id,
          item.turn_id,
          item.extracted_fields.join(";"),
          item.summary,
        ]),
      ),
      "utf8",
    )

    const report = writeDeepReport({
      action,
      integrity,
      queries,
      subagents,
      phases,
      tools: richTools,
      artifacts,
      evidence,
      richMermaidPath: "rich_stage_flow.mmd",
      debugMermaidPath: "debug_chain_flow.mmd",
      baselineReportPath: args.baselineReportPath ? "baseline_action_report.md" : null,
    })
    writeFileSync(join(outputDir, "deep_report.md"), report, "utf8")

    console.log(
      JSON.stringify(
        {
          userActionId,
          outputDir,
          files: [
            "deep_report.md",
            "rich_stage_flow.mmd",
            "debug_chain_flow.mmd",
            "phase_timeline_mapping.csv",
            "tool_calls_rich.csv",
            "artifact_chain.csv",
            "snapshot_evidence_index.csv",
          ],
        },
        null,
        2,
      ),
    )
  } finally {
    rmSync(tempDbPath, { force: true })
  }
}

main()
