import type { ArtifactRecord, PhaseRecord, RichToolCall } from "./deep_action_types"

const PATH_PATTERN =
  /([A-Za-z]:\\[^\s"'`|<>]+|\/[^\s"'`|<>]+|(?:\.{0,2}\/)?[\w.-]+(?:\/[\w.-]+)*\.(?:docx|pptx|txt|json|py|js|ts|ps1|csv|md))/gu

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function extractPaths(text: string): string[] {
  return unique([...text.matchAll(PATH_PATTERN)].map(match => match[1] ?? "").filter(Boolean))
}

function classifyArtifact(path: string): string {
  const lowered = path.toLowerCase()
  if (/\.(py|js|ts|ps1)$/u.test(lowered)) return "script"
  if (/\.(pptx)$/u.test(lowered)) return "final"
  if (/\.(docx)$/u.test(lowered)) return "input"
  if (/\.(md|csv|json|txt)$/u.test(lowered)) return lowered.includes("report") ? "report" : "intermediate"
  return "other"
}

export function enrichToolPaths(tools: RichToolCall[]): RichToolCall[] {
  return tools.map(tool => {
    const discovered = extractPaths(`${tool.command_or_path}\n${tool.input_summary}\n${tool.output_summary}`)
    const touched = unique([...tool.touched_files, ...discovered])
    const produced = unique([
      ...tool.produced_files,
      ...discovered.filter(path => /save|write|export|generate|create/iu.test(tool.command_or_path)),
    ])
    return {
      ...tool,
      touched_files: touched,
      produced_files: produced,
    }
  })
}

export function buildArtifactChain(
  tools: RichToolCall[],
  phasesByToolId: Map<string, PhaseRecord>,
): ArtifactRecord[] {
  const artifacts = new Map<string, ArtifactRecord>()

  for (const tool of tools) {
    const phase = phasesByToolId.get(tool.tool_call_id)
    const phaseId = phase?.phase_id ?? "unknown"
    const everyPath = unique([...tool.touched_files, ...tool.produced_files])
    for (const path of everyPath) {
      const existing = artifacts.get(path)
      if (!existing) {
        artifacts.set(path, {
          artifact_path: path,
          artifact_type: classifyArtifact(path),
          first_seen_phase: phaseId,
          created_by_tool: tool.produced_files.includes(path) ? tool.tool_name : "",
          modified_by_tools: tool.touched_files.includes(path) ? [tool.tool_name] : [],
          evidence_refs: [...tool.evidence_refs],
        })
        continue
      }
      if (!existing.created_by_tool && tool.produced_files.includes(path)) {
        existing.created_by_tool = tool.tool_name
      }
      if (tool.touched_files.includes(path)) {
        existing.modified_by_tools = unique([...existing.modified_by_tools, tool.tool_name])
      }
      existing.evidence_refs = unique([...existing.evidence_refs, ...tool.evidence_refs])
    }
  }

  return [...artifacts.values()].sort((left, right) =>
    left.artifact_path.localeCompare(right.artifact_path),
  )
}
