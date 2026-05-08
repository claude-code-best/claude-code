export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

export type ActionRow = {
  user_action_id: string
  event_date: string
  started_at: string
  started_at_ms: number
  ended_at: string
  ended_at_ms: number
  duration_ms: number
  query_count: number
  subagent_count: number
  tool_call_count: number
  total_prompt_input_tokens: number
  total_billed_tokens: number
  main_thread_total_prompt_input_tokens: number
  subagent_total_prompt_input_tokens: number
}

export type IntegrityRow = Record<string, string | number | boolean | null>

export type QueryRow = {
  query_id: string
  user_action_id: string
  query_source: string | null
  subagent_id: string | null
  subagent_reason: string | null
  subagent_trigger_kind: string | null
  subagent_trigger_detail: string | null
  agent_name: string | null
  source_group: string | null
  started_at: string
  started_at_ms: number
  ended_at: string | null
  ended_at_ms: number | null
  duration_ms: number | null
  turn_count: number
  query_max_loop_iter: number | null
  tool_call_count: number
  terminal_reason: string | null
  strict_is_complete: boolean | null
  inferred_is_complete: boolean | null
}

export type TurnRow = {
  query_id: string
  turn_id: string
  agent_name: string | null
  query_source: string | null
  started_at: string
  started_at_ms: number
  ended_at: string | null
  ended_at_ms: number | null
  duration_ms: number | null
  loop_iter_start: number | null
  loop_iter_end: number | null
  tool_call_count: number
  stop_reason: string | null
  transition_out: string | null
  termination_reason: string | null
  strict_is_closed: boolean | null
  inferred_is_closed: boolean | null
}

export type ToolRow = {
  tool_call_id: string
  query_id: string | null
  turn_id: string | null
  subagent_id: string | null
  tool_name: string | null
  detected_at: string | null
  detected_at_ms: number | null
  started_at: string | null
  started_at_ms: number | null
  completed_at: string | null
  completed_at_ms: number | null
  duration_ms: number | null
  success: boolean | null
  failure_reason: string | null
}

export type SubagentRow = {
  subagent_id: string
  query_id: string | null
  subagent_type: string | null
  subagent_reason: string | null
  subagent_trigger_kind: string | null
  subagent_trigger_detail: string | null
  query_source: string | null
  agent_name: string | null
  source_group: string | null
  spawned_at: string | null
  spawned_at_ms: number | null
  completed_at: string | null
  completed_at_ms: number | null
  duration_ms: number | null
}

export type EventRow = {
  event_name: string
  ts_wall: string
  ts_wall_ms: number | null
  query_id: string | null
  effective_query_id: string | null
  turn_id: string | null
  tool_call_id: string | null
  subagent_id: string | null
  payload_json: string | null
  snapshot_refs_json: string | null
}

export type SnapshotIndexRow = {
  snapshot_ref: string
  file_name: string
  relative_path: string
  absolute_path: string
  exists: boolean
  size_bytes: number | null
  sha256: string | null
  referenced_count: number
  first_event_ts: string | null
  last_event_ts: string | null
  category: string | null
}

export type SnapshotRecord = {
  snapshotRef: string
  category: string | null
  exists: boolean
  absolutePath: string
  data: JsonValue | null
  warnings: string[]
}

export type ToolInputSemantics = {
  toolUseId: string
  toolName: string
  inputSummary: string
  commandOrPath: string
  touchedFiles: string[]
  producedFiles: string[]
  assistantTextSummary: string
  promptSummary: string
  rawInput: JsonValue | null
}

export type RichToolCall = {
  tool_call_id: string
  query_id: string | null
  agent_name: string | null
  turn_id: string | null
  tool_name: string
  detected_at: string | null
  completed_at: string | null
  duration_ms: number | null
  success: boolean | null
  input_summary: string
  output_summary: string
  command_or_path: string
  intent_inferred: string
  produced_files: string[]
  touched_files: string[]
  snapshot_refs: string[]
  evidence_refs: string[]
  warnings: string[]
  prompt_summary: string
}

export type PhaseRecord = {
  phase_id: string
  phase_name: string
  stage_kind: "input" | "main" | "subagent" | "compact" | "script" | "issue" | "fix" | "output"
  start_local: string
  end_local: string
  duration_ms: number
  start_ms: number
  end_ms: number
  query_ids: string[]
  turn_ids: string[]
  tool_counts: Record<string, number>
  main_outputs: string[]
  problems: string[]
  fixes: string[]
  evidence_refs: string[]
  tool_call_ids: string[]
}

export type ArtifactRecord = {
  artifact_path: string
  artifact_type: string
  first_seen_phase: string
  created_by_tool: string
  modified_by_tools: string[]
  evidence_refs: string[]
}

export type EvidenceRecord = {
  evidence_id: string
  snapshot_ref: string
  category: string | null
  query_id: string | null
  turn_id: string | null
  extracted_fields: string[]
  summary: string
}
