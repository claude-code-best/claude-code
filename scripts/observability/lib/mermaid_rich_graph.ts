import type { PhaseRecord } from "./deep_action_types"

function esc(text: string): string {
  return text.replaceAll('"', "'")
}

function label(phase: PhaseRecord): string {
  const toolSummary = Object.entries(phase.tool_counts)
    .map(([name, count]) => `${name} x${count}`)
    .join(" + ")
  return esc(
    [
      phase.phase_name,
      `${phase.start_local} -> ${phase.end_local}`,
      `duration ${phase.duration_ms}ms`,
      phase.turn_ids.length > 0 ? `turns ${phase.turn_ids.join(",")}` : "",
      toolSummary ? `tools ${toolSummary}` : "",
      phase.main_outputs[0] ? `output ${phase.main_outputs[0]}` : "",
      phase.problems[0] ? `problem ${phase.problems[0]}` : "",
      phase.fixes[0] ? `fix ${phase.fixes[0]}` : "",
    ]
      .filter(Boolean)
      .join("<br/>"),
  )
}

function className(kind: PhaseRecord["stage_kind"]): string {
  return kind
}

export function buildRichStageFlow(phases: PhaseRecord[]): string {
  const lines = [
    "flowchart TD",
    "  classDef input fill:#eef6ff,stroke:#1d4ed8,color:#0f172a",
    "  classDef main fill:#ecfdf5,stroke:#15803d,color:#052e16",
    "  classDef subagent fill:#fff7ed,stroke:#c2410c,color:#431407",
    "  classDef compact fill:#f5f3ff,stroke:#7c3aed,color:#2e1065",
    "  classDef script fill:#fef3c7,stroke:#b45309,color:#451a03",
    "  classDef issue fill:#fff1f2,stroke:#e11d48,color:#4c0519",
    "  classDef fix fill:#eff6ff,stroke:#0891b2,color:#082f49",
    "  classDef output fill:#f0fdf4,stroke:#16a34a,color:#14532d",
  ]

  phases.forEach((phase, index) => {
    const nodeId = `P${index + 1}`
    lines.push(`  ${nodeId}["${label(phase)}"]`)
    lines.push(`  class ${nodeId} ${className(phase.stage_kind)}`)
    if (index > 0) {
      lines.push(`  P${index} --> ${nodeId}`)
    }
  })

  return lines.join("\n")
}

export function buildDebugChainFlow(phases: PhaseRecord[]): string {
  const debugPhases = phases.filter(
    phase =>
      phase.problems.length > 0 ||
      phase.fixes.length > 0 ||
      phase.phase_name === "repair" ||
      phase.stage_kind === "issue" ||
      phase.stage_kind === "fix",
  )
  const lines = [
    "flowchart TD",
    "  classDef issue fill:#fff1f2,stroke:#e11d48,color:#4c0519",
    "  classDef fix fill:#eff6ff,stroke:#0891b2,color:#082f49",
    "  classDef output fill:#f0fdf4,stroke:#16a34a,color:#14532d",
  ]

  debugPhases.forEach((phase, index) => {
    const nodeId = `D${index + 1}`
    lines.push(`  ${nodeId}["${label(phase)}"]`)
    lines.push(`  class ${nodeId} ${phase.stage_kind === "fix" ? "fix" : phase.problems.length > 0 ? "issue" : "output"}`)
    if (index > 0) {
      lines.push(`  D${index} --> ${nodeId}`)
    }
  })

  if (debugPhases.length === 0) {
    lines.push('  D1["no dense repair chain detected"]')
    lines.push("  class D1 output")
  }
  return lines.join("\n")
}
