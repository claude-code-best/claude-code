import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { JsonValue, SnapshotIndexRow, SnapshotRecord } from "./deep_action_types"

function inferCategory(snapshotRef: string): string | null {
  const lowered = snapshotRef.toLowerCase()
  if (lowered.includes("request")) return "request"
  if (lowered.includes("response")) return "response"
  if (lowered.includes("state.snapshot.after_turn")) return "state_after_turn"
  if (lowered.includes("state.snapshot.before_turn")) return "state_before_turn"
  if (lowered.includes("messages.")) return "messages_stage"
  return null
}

export class SnapshotReader {
  private readonly cache = new Map<string, SnapshotRecord>()

  constructor(
    private readonly repoRoot: string,
    private readonly snapshotIndex = new Map<string, SnapshotIndexRow>(),
  ) {}

  read(snapshotRef: string): SnapshotRecord {
    const cached = this.cache.get(snapshotRef)
    if (cached) {
      return cached
    }

    const indexed = this.snapshotIndex.get(snapshotRef)
    const absolutePath =
      indexed?.absolute_path ?? resolve(this.repoRoot, snapshotRef.replaceAll("/", "\\"))
    const category = indexed?.category ?? inferCategory(snapshotRef)
    const warnings: string[] = []

    if (!existsSync(absolutePath)) {
      const record: SnapshotRecord = {
        snapshotRef,
        category,
        exists: false,
        absolutePath,
        data: null,
        warnings: [`missing snapshot: ${snapshotRef}`],
      }
      this.cache.set(snapshotRef, record)
      return record
    }

    try {
      const data = JSON.parse(readFileSync(absolutePath, "utf8")) as JsonValue
      const record: SnapshotRecord = {
        snapshotRef,
        category,
        exists: true,
        absolutePath,
        data,
        warnings,
      }
      this.cache.set(snapshotRef, record)
      return record
    } catch (error) {
      const record: SnapshotRecord = {
        snapshotRef,
        category,
        exists: true,
        absolutePath,
        data: null,
        warnings: [
          `failed to parse snapshot ${snapshotRef}: ${error instanceof Error ? error.message : String(error)}`,
        ],
      }
      this.cache.set(snapshotRef, record)
      return record
    }
  }
}
