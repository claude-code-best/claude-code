import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { WORKFLOW_RUNS_DIR } from '../constants.js'

/**
 * Persist an inline workflow script to the run directory so the caller can
 * iterate via `scriptPath` + `resumeFromRunId` without resending the full script
 * (the round-trip the ultracode skill promises for the inline entry path).
 *
 * Mirrors engine/journal.ts: writes directly via node:fs/promises (no port) to
 * `<cwd>/<WORKFLOW_RUNS_DIR>/<runId>/script.js` — the same directory as
 * journal.jsonl, so journalStore.truncate(runId) cleans it up alongside the journal.
 *
 * Fixed filename `script.js`: parseScript ignores the extension and the runId
 * already makes the directory unique, so a stable name aids muscle memory.
 */
export async function persistInlineScript(
  script: string,
  runId: string,
  cwd: string,
): Promise<string> {
  const dir = join(cwd, WORKFLOW_RUNS_DIR, runId)
  await mkdir(dir, { recursive: true })
  const filePath = join(dir, 'script.js')
  await writeFile(filePath, script, 'utf-8')
  return filePath
}
