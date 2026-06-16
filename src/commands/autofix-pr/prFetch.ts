// gh CLI integration for autofix-pr: fetches PR snapshots and feeds them
// through the pure decision matrix in prOutcomeCheck.ts. Kept separate so
// tests of the decision matrix never have to mock node:child_process — and
// tests of callAutofixPr can mock this module without polluting the pure
// decision matrix module (Bun mock.module is process-global).

import { spawn } from 'node:child_process'
import {
  type AutofixOutcomeProbeResult,
  type PrViewPayload,
  summariseAutofixOutcome,
} from './prOutcomeCheck.js'

export interface AutofixOutcomeProbeInput {
  owner: string
  repo: string
  prNumber: number
  /**
   * Head commit SHA captured at /autofix-pr launch. When this differs from
   * the current head, autofix has pushed at least one commit.
   */
  initialHeadSha?: string
  /**
   * Timeout for the gh CLI invocation. Caller is the framework's per-tick
   * poller, so failures must be bounded — a hung gh process would stall
   * the entire poll loop.
   */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 5_000

/**
 * Fetch the PR's current head SHA, state, and CI rollup, and decide whether
 * autofix has finished. Returns `{ completed: true, summary }` if so;
 * otherwise `{ completed: false }`. Never throws.
 */
export async function checkPrAutofixOutcome(
  input: AutofixOutcomeProbeInput,
): Promise<AutofixOutcomeProbeResult> {
  const { owner, repo, prNumber, initialHeadSha, timeoutMs } = input

  let payload: PrViewPayload
  try {
    payload = await runGhPrView(
      owner,
      repo,
      prNumber,
      timeoutMs ?? DEFAULT_TIMEOUT_MS,
    )
  } catch {
    return { completed: false }
  }

  return summariseAutofixOutcome(payload, {
    owner,
    repo,
    prNumber,
    initialHeadSha,
  })
}

/**
 * Resolve the PR's current head commit SHA. Used at /autofix-pr launch to
 * capture a baseline; later compared against the live SHA to detect pushes.
 * Returns null on any failure (network, missing gh, permissions) — the
 * caller treats null as "no baseline" and falls back to terminal-state-only
 * completion detection.
 */
export async function fetchPrHeadSha(
  owner: string,
  repo: string,
  prNumber: number,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string | null> {
  try {
    const payload = await runGhPrView(owner, repo, prNumber, timeoutMs)
    return payload.headRefOid || null
  } catch {
    return null
  }
}

interface SpawnError extends Error {
  code?: string
}

/**
 * Spawn `gh pr view {n} --repo {owner}/{repo} --json ...` and parse the
 * result. Rejects on non-zero exit, timeout, or JSON parse failure.
 */
function runGhPrView(
  owner: string,
  repo: string,
  prNumber: number,
  timeoutMs: number,
): Promise<PrViewPayload> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'gh',
      [
        'pr',
        'view',
        String(prNumber),
        '--repo',
        `${owner}/${repo}`,
        '--json',
        'headRefOid,state,statusCheckRollup',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      proc.kill('SIGKILL')
      reject(new Error(`gh pr view timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    proc.stdout.on('data', chunk => stdoutChunks.push(chunk as Buffer))
    proc.stderr.on('data', chunk => stderrChunks.push(chunk as Buffer))

    proc.on('error', (err: SpawnError) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })

    proc.on('close', code => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString('utf8').trim()
        reject(
          new Error(`gh pr view exited ${code}: ${stderr || '<no stderr>'}`),
        )
        return
      }
      const stdout = Buffer.concat(stdoutChunks).toString('utf8').trim()
      try {
        const parsed = JSON.parse(stdout) as PrViewPayload
        resolve(parsed)
      } catch (e) {
        reject(
          new Error(`gh pr view JSON parse failed: ${(e as Error).message}`),
        )
      }
    })
  })
}
