// NOTE: subscribePR (KAIROS_GITHUB_WEBHOOKS feature) is omitted here.
// The kairos client is not fully available in this repo. The feature-gated
// call is a nice-to-have and safe to skip — teleport + registerRemoteAgentTask
// is sufficient for the core autofix flow.

import React from 'react'
import { feature } from 'bun:bundle'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import {
  checkRemoteAgentEligibility,
  formatPreconditionError,
  getRemoteTaskSessionUrl,
  registerRemoteAgentTask,
  type BackgroundRemoteSessionPrecondition,
} from '../../tasks/RemoteAgentTask/RemoteAgentTask.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { detectCurrentRepositoryWithHost } from '../../utils/detectRepository.js'
import { teleportToRemote } from '../../utils/teleport.js'
import { AutofixProgress } from './AutofixProgress.js'
import { createAutofixTeammate } from './inProcessAgent.js'
import {
  clearActiveMonitor,
  getActiveMonitor,
  isMonitoring,
  trySetActiveMonitor,
} from './monitorState.js'
import { parseAutofixArgs } from './parseArgs.js'
import { detectAutofixSkills, formatSkillsHint } from './skillDetect.js'

function makeErrorText(message: string, code: string): string {
  logEvent('tengu_autofix_pr_result', {
    result:
      'failed' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    error_code:
      code as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })
  return `Autofix PR failed: ${message}`
}

export const callAutofixPr: LocalJSXCommandCall = async (
  onDone,
  context,
  args,
) => {
  try {
    const parsed = parseAutofixArgs(args)

    // 1. stop sub-command
    if (parsed.action === 'stop') {
      const m = getActiveMonitor()
      if (!m) {
        onDone('No active autofix monitor.', { display: 'system' })
        return null
      }
      clearActiveMonitor()
      // Honest message: the local lock is released and any in-flight
      // teleport request is aborted, but a CCR session that has already
      // started running on the cloud will continue until it completes or is
      // cancelled from claude.ai/code.
      onDone(
        `Stopped local monitoring of ${m.repo}#${m.prNumber}. Any already-running remote session continues until it finishes or is cancelled from claude.ai/code.`,
        { display: 'system' },
      )
      return null
    }

    // 2. invalid
    if (parsed.action === 'invalid') {
      onDone(
        `Invalid args: ${parsed.reason}. Use /autofix-pr <pr-number> | stop | <owner>/<repo>#<n>`,
        {
          display: 'system',
        },
      )
      return null
    }

    // 3. freeform — not yet supported
    if (parsed.action === 'freeform') {
      onDone(
        'Freeform prompt mode not yet supported. Use /autofix-pr <pr-number>.',
        {
          display: 'system',
        },
      )
      return null
    }

    // 4. start. has_repo_path tracks whether the user supplied an explicit
    // owner/repo via cross-repo syntax (vs relying on directory detection).
    logEvent('tengu_autofix_pr_started', {
      action:
        'start' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      has_pr_number:
        'true' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      has_repo_path: String(
        !!(parsed.owner && parsed.repo),
      ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })

    // 4.1 resolve owner/repo. Always detect cwd repo first because teleport
    // takes the git source from the working directory; cross-repo args that
    // don't match cwd would silently work on the wrong repo.
    let detected: { host: string; owner: string; name: string } | null
    try {
      detected = await detectCurrentRepositoryWithHost()
    } catch {
      onDone(
        makeErrorText(
          'Cannot detect GitHub repo from current directory.',
          'session_create_failed',
        ),
        { display: 'system' },
      )
      return null
    }
    if (!detected || detected.host !== 'github.com') {
      onDone(
        makeErrorText(
          'Cannot detect GitHub repo from current directory.',
          'session_create_failed',
        ),
        { display: 'system' },
      )
      return null
    }

    // Cross-repo args (owner/repo#n) must match the current working directory;
    // teleport's git source is taken from cwd, so a mismatch would create a
    // session against the wrong repo. Accept both as a safety check rather
    // than as a real cross-repo capability — true cross-repo support requires
    // a separate clone path not yet implemented here.
    if (
      (parsed.owner && parsed.owner !== detected.owner) ||
      (parsed.repo && parsed.repo !== detected.name)
    ) {
      onDone(
        makeErrorText(
          `Cross-repo autofix is not supported from this directory. Run from ${detected.owner}/${detected.name} or pass only the PR number.`,
          'repo_mismatch',
        ),
        { display: 'system' },
      )
      return null
    }
    const owner = detected.owner
    const repo = detected.name

    const { prNumber } = parsed

    // 4.2 singleton lock — already monitoring this exact PR
    if (isMonitoring(owner, repo, prNumber)) {
      logEvent('tengu_autofix_pr_result', {
        result:
          'success_rc' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
      onDone(`Already monitoring ${repo}#${prNumber} in background.`, {
        display: 'system',
      })
      return null
    }

    // 4.2b note: the existing-different-PR check is folded into the
    // trySetActiveMonitor call below. Doing the check + set atomically there
    // avoids a TOCTOU window between the read and the write under concurrent
    // invocations.

    // 4.3 eligibility check (tolerate no_remote_environment, surface real reasons).
    // skipBundle:true matches the teleport call below — autofix needs to push
    // back to GitHub, which a git bundle cannot do.
    const eligibility = await checkRemoteAgentEligibility({ skipBundle: true })
    if (!eligibility.eligible) {
      // Discriminated union: TypeScript narrows `eligibility` here, no cast needed.
      const blockers = eligibility.errors.filter(
        (e: BackgroundRemoteSessionPrecondition) =>
          e.type !== 'no_remote_environment',
      )
      if (blockers.length > 0) {
        const reasons = blockers.map(formatPreconditionError).join('\n')
        onDone(
          makeErrorText(
            `Remote agent not available:\n${reasons}`,
            'session_create_failed',
          ),
          { display: 'system' },
        )
        return null
      }
    }

    // 4.4 detect skills
    const skills = detectAutofixSkills(process.cwd())
    const skillsHint = formatSkillsHint(skills)

    // 4.5 compose message
    const target = `${owner}/${repo}#${prNumber}`
    const branchName = `refs/pull/${prNumber}/head`
    const initialMessage = `Auto-fix failing CI checks on PR #${prNumber} in ${owner}/${repo}.${skillsHint}`

    // 4.6 in-process teammate
    const teammate = createAutofixTeammate(initialMessage, target)

    // 4.7 acquire lock atomically BEFORE doing any awaits. This closes the
    // TOCTOU race where two concurrent invocations both see active=null and
    // both try to create remote sessions.
    const lockAcquired = trySetActiveMonitor({
      taskId: teammate.taskId,
      owner,
      repo,
      prNumber,
      abortController: teammate.abortController,
      startedAt: Date.now(),
    })
    if (!lockAcquired) {
      const existing = getActiveMonitor()
      onDone(
        makeErrorText(
          `already monitoring ${existing?.repo}#${existing?.prNumber}. Run /autofix-pr stop first.`,
          'rc_already_monitoring_other',
        ),
        { display: 'system' },
      )
      return null
    }

    // 4.8 teleport — wire BOTH onBundleFail and onCreateFail so HTTP-layer
    // failures (4xx/5xx, expired token, invalid PR ref) reach the user with
    // the upstream message instead of the generic fallback. skipBundle:true
    // is required for autofix: the remote container must push back to GitHub,
    // which a bundle-cloned source cannot do (teleport.tsx documents this).
    // Note: refs/pull/<n>/head is not a pushable ref. We do NOT pass
    // reuseOutcomeBranch — the orchestrator generates a claude/* branch and
    // the user pushes/PRs from claude.ai/code.
    let teleportFailMsg: string | undefined
    const captureFailMsg = (msg: string) => {
      teleportFailMsg = msg
    }
    let session: { id: string; title: string } | null = null
    try {
      session = await teleportToRemote({
        initialMessage,
        source: 'autofix_pr',
        branchName,
        skipBundle: true,
        title: `Autofix PR: ${target}`,
        useDefaultEnvironment: true,
        signal: teammate.abortController.signal,
        githubPr: { owner, repo, number: prNumber },
        onBundleFail: captureFailMsg,
        onCreateFail: captureFailMsg,
      })
    } catch (teleErr: unknown) {
      clearActiveMonitor(teammate.taskId)
      const teleMsg =
        teleErr instanceof Error ? teleErr.message : String(teleErr)
      onDone(makeErrorText(`teleport failed: ${teleMsg}`, 'teleport_failed'), {
        display: 'system',
      })
      return null
    }

    if (!session) {
      clearActiveMonitor(teammate.taskId)
      onDone(
        makeErrorText(
          teleportFailMsg ?? 'remote session creation failed.',
          'session_create_failed',
        ),
        { display: 'system' },
      )
      return null
    }

    // 4.9 register task. If this throws, release the lock so the user can
    // retry — the remote CCR session is already created so we surface a
    // dedicated error code.
    try {
      registerRemoteAgentTask({
        remoteTaskType: 'autofix-pr',
        session,
        command: `/autofix-pr ${prNumber}`,
        context,
        isLongRunning: true,
        remoteTaskMetadata: { owner, repo, prNumber },
      })
    } catch (regErr: unknown) {
      clearActiveMonitor(teammate.taskId)
      const regMsg = regErr instanceof Error ? regErr.message : String(regErr)
      onDone(
        makeErrorText(
          `task registration failed: ${regMsg}`,
          'registration_failed',
        ),
        { display: 'system' },
      )
      return null
    }

    // 4.10 PR webhook subscription (feature-gated, non-fatal)
    if (feature('KAIROS_GITHUB_WEBHOOKS')) {
      // kairos client not available in this repo — skip silently
    }

    // 4.11 success
    const sessionUrl = getRemoteTaskSessionUrl(session.id)
    logEvent('tengu_autofix_pr_result', {
      result:
        'success_rc' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    // Also call onDone so callers that listen to the callback get notified.
    onDone(`Autofix launched for ${target}. Track: ${sessionUrl}`, {
      display: 'system',
    })
    // Return a React progress UI showing the completed pipeline.
    // The REPL renders the returned React element inline alongside the text.
    return React.createElement(AutofixProgress, {
      phase: 'done',
      target,
      sessionUrl,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    logEvent('tengu_autofix_pr_result', {
      result:
        'failed' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      error_code:
        'exception' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    onDone(`Autofix PR failed: ${msg}`, { display: 'system' })
    return null
  }
}
