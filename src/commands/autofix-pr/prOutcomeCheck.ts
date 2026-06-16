// Pure decision matrix for autofix-pr completion detection.
//
// Given a snapshot of the PR (state, head SHA, CI rollup) and a baseline
// head SHA captured at /autofix-pr launch, decide whether autofix has
// finished. No side effects — extracted from the gh CLI invocation in
// prFetch.ts so unit tests can exercise every branch without spawning
// subprocesses.

export type AutofixOutcomeProbeResult =
  | { completed: true; summary: string }
  | { completed: false }

export interface PrViewPayload {
  headRefOid: string
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  statusCheckRollup?: Array<{
    conclusion?: string | null
    status?: string | null
    name?: string
  }>
}

export interface AutofixOutcomeIdentity {
  owner: string
  repo: string
  prNumber: number
  /**
   * Head commit SHA captured at /autofix-pr launch. When this differs from
   * the current head, autofix has pushed at least one commit. Optional —
   * absence means we can only finish on terminal PR states (merged/closed).
   */
  initialHeadSha?: string
}

/**
 * Pure judgement of whether autofix has finished, given a PR snapshot and
 * the baseline head SHA. Decision matrix:
 *   - MERGED                         → done (merged)
 *   - CLOSED (not merged)            → done (closed without fix)
 *   - OPEN, no baseline              → keep polling
 *   - OPEN, head unchanged           → keep polling (agent hasn't pushed)
 *   - OPEN, head changed, CI pending → keep polling (wait for CI)
 *   - OPEN, head changed, CI failure → done (surface red so user can retry)
 *   - OPEN, head changed, CI success → done (clean fix)
 */
export function summariseAutofixOutcome(
  payload: PrViewPayload,
  identity: AutofixOutcomeIdentity,
): AutofixOutcomeProbeResult {
  const { owner, repo, prNumber, initialHeadSha } = identity

  if (payload.state === 'MERGED') {
    return {
      completed: true,
      summary: `${owner}/${repo}#${prNumber} merged. Autofix monitoring complete.`,
    }
  }
  if (payload.state === 'CLOSED') {
    return {
      completed: true,
      summary: `${owner}/${repo}#${prNumber} closed without merge. Autofix monitoring complete.`,
    }
  }

  if (!initialHeadSha) return { completed: false }
  if (payload.headRefOid === initialHeadSha) return { completed: false }

  const ciState = summariseCiRollup(payload.statusCheckRollup)
  if (ciState.state === 'pending') return { completed: false }
  if (ciState.state === 'failure') {
    return {
      completed: true,
      summary: `Autofix pushed commits to ${owner}/${repo}#${prNumber} but CI is failing (${ciState.detail}).`,
    }
  }
  return {
    completed: true,
    summary: `Autofix pushed commits to ${owner}/${repo}#${prNumber}, CI green.`,
  }
}

interface CiSummary {
  state: 'success' | 'pending' | 'failure'
  detail: string
}

function summariseCiRollup(
  rollup: PrViewPayload['statusCheckRollup'],
): CiSummary {
  if (!rollup || rollup.length === 0) {
    // No checks configured on this repo — treat as success so completion
    // can fire on push alone. PRs without CI are perfectly valid.
    return { state: 'success', detail: 'no checks configured' }
  }
  let pending = 0
  let failed = 0
  const total = rollup.length
  for (const check of rollup) {
    const status = (check.status ?? '').toUpperCase()
    const conclusion = (check.conclusion ?? '').toUpperCase()
    if (status && status !== 'COMPLETED') {
      pending++
      continue
    }
    if (
      conclusion === 'SUCCESS' ||
      conclusion === 'NEUTRAL' ||
      conclusion === 'SKIPPED'
    ) {
      continue
    }
    if (conclusion === '') {
      pending++
      continue
    }
    failed++
  }
  if (pending > 0)
    return { state: 'pending', detail: `${pending}/${total} checks pending` }
  if (failed > 0)
    return { state: 'failure', detail: `${failed}/${total} checks failing` }
  return { state: 'success', detail: `${total}/${total} checks passing` }
}
