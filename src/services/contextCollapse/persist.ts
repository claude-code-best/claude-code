/**
 * Context Collapse persistence — restore commit log and staged queue from
 * session transcript entries on session resume.
 *
 * On save: commits are appended as ContextCollapseCommitEntry, snapshots
 *   as ContextCollapseSnapshotEntry (via sessionStorage.ts).
 * On restore: this module rebuilds the in-memory state from those entries.
 */
import type {
  ContextCollapseCommitEntry,
  ContextCollapseSnapshotEntry,
} from '../../types/logs.js'
import { _restoreState } from './index.js'
import { logForDebugging } from '../../utils/debug.js'

/**
 * Rebuild the context collapse state from persisted transcript entries.
 *
 * Called from:
 * - ResumeConversation.tsx after loading a session
 * - sessionRestore.ts during /resume
 *
 * @param commits  Ordered array of commit entries from the transcript
 * @param snapshot Optional last-wins snapshot of staged queue + trigger state
 */
export function restoreFromEntries(
  commits: ContextCollapseCommitEntry[],
  snapshot?: ContextCollapseSnapshotEntry,
): void {
  // Rebuild commit log from persisted entries.
  // archived[] starts empty — projectView lazily fills it from the Message[]
  // the first time it encounters the span.
  const restoredCommits = commits.map(entry => ({
    collapseId: entry.collapseId,
    summaryUuid: entry.summaryUuid,
    summaryContent: entry.summaryContent,
    summary: entry.summary,
    firstArchivedUuid: entry.firstArchivedUuid,
    lastArchivedUuid: entry.lastArchivedUuid,
    archived: [] as unknown[],
  }))

  // Find max collapse ID to reseed the counter
  let maxId = 0
  for (const entry of commits) {
    const id = parseInt(entry.collapseId, 10)
    if (!isNaN(id) && id > maxId) {
      maxId = id
    }
  }

  // Rebuild staged queue from snapshot (if any)
  const restoredStaged =
    snapshot?.staged?.map(s => ({
      startUuid: s.startUuid,
      endUuid: s.endUuid,
      summary: s.summary,
      risk: s.risk,
      stagedAt: s.stagedAt,
    })) ?? []

  _restoreState(restoredCommits as any, restoredStaged, maxId)

  logForDebugging(
    `ContextCollapse: restored ${restoredCommits.length} commits, ${restoredStaged.length} staged spans (maxId=${maxId})`,
  )
}
