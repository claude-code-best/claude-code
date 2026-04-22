/**
 * End-to-end verification probe for the skill-learning pipeline.
 *
 * Exercises the real public API (not mocks, not unit test harness) so we
 * can confirm each pipeline stage actually produces the expected on-disk
 * artefacts under a clean CLAUDE_SKILL_LEARNING_HOME.
 *
 * Run with:
 *   bun run scripts/verify-skill-learning-e2e.ts
 *
 * Sections:
 *   1. Fake transcript -> ingest -> observations on disk
 *   2. Heuristic observer -> instinct candidates -> persisted instincts
 *   3. Evolution -> skill / command / agent candidates
 *   4. Write learned skill -> verify skill file exists
 *   5. Cross-project promotion -> global instinct written
 *   6. Observer backend env switch probe
 *   7. Gap state machine walk-through
 *   8. Tool event observer wrapper invocation
 */

import { mkdtempSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

type Result = { step: string; ok: boolean; detail: string }
const results: Result[] = []

function record(step: string, ok: boolean, detail: string): void {
  results.push({ step, ok, detail })
  const tag = ok ? 'PASS' : 'FAIL'
  console.log(`[${tag}] ${step} — ${detail}`)
}

async function main(): Promise<void> {
  const storage = mkdtempSync(join(tmpdir(), 'skill-learning-e2e-'))
  const projectA = mkdtempSync(join(tmpdir(), 'project-a-'))
  const projectB = mkdtempSync(join(tmpdir(), 'project-b-'))
  // Real git repos so resolveProjectContext derives distinct project IDs
  // (the default `global` fallback for non-git dirs would make A and B
  // share the same storage and defeat the cross-project probe).
  execSync(`git init -q "${projectA}"`, { stdio: 'ignore' })
  execSync(
    `git -C "${projectA}" remote add origin https://example.test/project-a.git`,
    { stdio: 'ignore' },
  )
  execSync(`git init -q "${projectB}"`, { stdio: 'ignore' })
  execSync(
    `git -C "${projectB}" remote add origin https://example.test/project-b.git`,
    { stdio: 'ignore' },
  )

  // === ECC / plugin isolation ===
  // The probe must exercise only the project's own skill-learning code, not
  // the user-level ECC plugin, auto-loaded ECC skill, or any external LLM.
  // Strip every env that could route observations or observer calls outside
  // this probe's temp storage.
  for (const key of [
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'OPENAI_API_KEY',
    'GEMINI_API_KEY',
    'GROK_API_KEY',
    'CLAUDE_CODE_PLUGINS_DIR',
    'CLAUDE_PLUGINS_DIR',
    'CLAUDE_PLUGIN_MARKETPLACE',
    'ECC_PLUGIN_ROOT',
    'ECC_ENABLED',
  ]) {
    delete process.env[key]
  }
  process.env.CLAUDE_SKILL_LEARNING_HOME = storage
  process.env.SKILL_LEARNING_ENABLED = '1'
  process.env.SKILL_SEARCH_ENABLED = '1'
  // Force heuristic backend — no LLM round-trips allowed in clean-room probe.
  process.env.SKILL_LEARNING_OBSERVER_BACKEND = 'heuristic'
  process.env.CLAUDE_SKILL_LEARNING_DISABLE = ''
  // Instrument global fetch so any stray network call from the skill-learning
  // path (unexpected LLM fallback, plugin webhook, etc.) aborts the probe
  // with a visible error rather than hiding behind a try/catch.
  const originalFetch = globalThis.fetch
  let networkCalls = 0
  globalThis.fetch = ((...args: unknown[]) => {
    networkCalls += 1
    throw new Error(
      `clean-room probe must not make network calls, attempted: ${String(args[0])}`,
    )
  }) as typeof globalThis.fetch
  console.log(`storage=${storage}`)
  console.log(`ecc-isolation: API_KEY env vars cleared, fetch stubbed, observer=heuristic`)

  try {
    const skillLearning = await import('../src/services/skillLearning/index.js')
    const projectCtx = await import('../src/services/skillLearning/projectContext.js')

    // ----------------------------------------------------------------------
    // 1. Ingest a synthetic transcript and verify observations land on disk
    // ----------------------------------------------------------------------
    const transcriptPath = join(storage, 'session.jsonl')
    const transcriptLines = [
      { type: 'user', sessionId: 's-e2e', cwd: projectA, message: { role: 'user', content: '请重构 loader.ts 的错误处理' } },
      { type: 'assistant', sessionId: 's-e2e', cwd: projectA, message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Grep', input: { pattern: 'throw new Error', path: 'src' } }] } },
      { type: 'user', sessionId: 's-e2e', cwd: projectA, message: { role: 'user', content: [{ type: 'tool_result', name: 'Grep', content: 'src/loader.ts:42', is_error: false }] } },
      { type: 'assistant', sessionId: 's-e2e', cwd: projectA, message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'src/loader.ts' } }] } },
      { type: 'user', sessionId: 's-e2e', cwd: projectA, message: { role: 'user', content: [{ type: 'tool_result', name: 'Read', content: 'export function load() { ... }', is_error: false }] } },
      { type: 'assistant', sessionId: 's-e2e', cwd: projectA, message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'src/loader.ts', old_string: 'throw new Error', new_string: 'throw new LoaderError' } }] } },
      { type: 'user', sessionId: 's-e2e', cwd: projectA, message: { role: 'user', content: [{ type: 'tool_result', name: 'Edit', content: 'diff', is_error: false }] } },
      { type: 'user', sessionId: 's-e2e', cwd: projectA, message: { role: 'user', content: '不要直接 mock，用 testing-library' } },
      { type: 'user', sessionId: 's-e2e', cwd: projectA, message: { role: 'user', content: '必须用 testing-library 不要 mock' } },
    ]
    writeFileSync(transcriptPath, transcriptLines.map(JSON.stringify).join('\n'))

    const projectAContext = projectCtx.resolveProjectContext(projectA)
    const observations = await skillLearning.ingestTranscript(transcriptPath, { project: projectAContext })
    record(
      'ingest transcript',
      observations.length > 0,
      `${observations.length} observations written under project ${projectAContext.projectId}`,
    )

    const reread = await skillLearning.readObservations({ project: projectAContext })
    record(
      'observations persist on disk',
      reread.length === observations.length,
      `disk has ${reread.length} observations (expected ${observations.length})`,
    )

    // ----------------------------------------------------------------------
    // 2. Heuristic observer -> instinct candidates -> store
    // ----------------------------------------------------------------------
    skillLearning.setActiveObserverBackend('heuristic')
    const candidates = await skillLearning.analyzeWithActiveBackend(observations, { project: projectAContext })
    record(
      'heuristic backend produces candidates',
      candidates.length > 0,
      `${candidates.length} candidates; first trigger=${candidates[0]?.trigger ?? '?'}`,
    )

    for (const c of candidates) {
      await skillLearning.upsertInstinct(skillLearning.createInstinct(c), { project: projectAContext })
    }
    const persistedInstincts = await skillLearning.loadInstincts({ project: projectAContext })
    record(
      'instincts persisted',
      persistedInstincts.length > 0,
      `${persistedInstincts.length} instincts on disk for project A`,
    )

    // Contradiction probe — push a contradicting instinct to verify conflict-hold
    const first = persistedInstincts[0]
    if (first) {
      const contradictor = skillLearning.createInstinct({
        trigger: first.trigger,
        action: first.action.includes('avoid')
          ? first.action.replace('avoid', 'prefer')
          : first.action.replace(/^/, 'avoid '),
        confidence: 0.5,
        domain: first.domain,
        source: 'session-observation',
        scope: first.scope,
        projectId: projectAContext.projectId,
        projectName: projectAContext.projectName,
        evidence: ['contradiction probe'],
        observationIds: [],
      })
      await skillLearning.upsertInstinct(contradictor, { project: projectAContext })
      const after = await skillLearning.loadInstincts({ project: projectAContext })
      const merged = after.find(i => i.id === first.id) ?? after.find(i => i.trigger === first.trigger)
      record(
        'contradiction lowers confidence',
        !!merged && merged.confidence < first.confidence,
        `before=${first.confidence.toFixed(2)} after=${merged?.confidence.toFixed(2) ?? 'n/a'}`,
      )
    }

    // ----------------------------------------------------------------------
    // 3. Evolution candidates
    //
    // clusterInstincts requires EITHER 2+ instincts in the same
    // (domain, normalized-trigger) bucket OR a single instinct with
    // confidence >= 0.8. Inject a high-confidence skill instinct + a
    // 4-instinct agent cluster + a "command"-flavoured instinct so each
    // of the three evolution paths actually has candidates to emit.
    // ----------------------------------------------------------------------
    const highConfidenceSkill = skillLearning.createInstinct({
      trigger: 'When editing TypeScript error handling',
      action: 'prefer throwing domain-specific Error subclasses',
      confidence: 0.9,
      domain: 'code-style',
      source: 'session-observation',
      scope: 'project',
      projectId: projectAContext.projectId,
      projectName: projectAContext.projectName,
      evidence: ['observed 2x in session'],
      observationIds: [],
    })
    await skillLearning.upsertInstinct(highConfidenceSkill, { project: projectAContext })

    const commandSeed = skillLearning.createInstinct({
      trigger: 'User asks to run the full test suite',
      action: 'run bun test after every multi-file edit',
      confidence: 0.9,
      domain: 'workflow',
      source: 'session-observation',
      scope: 'project',
      projectId: projectAContext.projectId,
      projectName: projectAContext.projectName,
      evidence: ['user explicitly requested bun test'],
      observationIds: [],
    })
    await skillLearning.upsertInstinct(commandSeed, { project: projectAContext })

    for (let i = 0; i < 4; i += 1) {
      const agentSeed = skillLearning.createInstinct({
        trigger: 'When debugging multi-step investigate flow',
        action: `step ${i + 1}: research root cause and verify`,
        confidence: 0.85,
        domain: 'debugging',
        source: 'session-observation',
        scope: 'project',
        projectId: projectAContext.projectId,
        projectName: projectAContext.projectName,
        evidence: [`debug step ${i + 1}`],
        observationIds: [],
      })
      await skillLearning.upsertInstinct(agentSeed, { project: projectAContext })
    }

    const allInstincts = await skillLearning.loadInstincts({ project: projectAContext })
    const skillCandidates = skillLearning.generateSkillCandidates(allInstincts, { cwd: projectA })
    const commandCandidates = skillLearning.generateCommandCandidates(allInstincts, { cwd: projectA })
    const agentCandidates = skillLearning.generateAgentCandidates(allInstincts, { cwd: projectA })
    record(
      'evolution skill path emits candidate (single high-conf instinct)',
      skillCandidates.length >= 1,
      `skillCandidates=${skillCandidates.length}`,
    )
    record(
      'evolution command path emits candidate (trigger matches user-asks heuristic)',
      commandCandidates.length >= 1,
      `commandCandidates=${commandCandidates.length}`,
    )
    record(
      'evolution agent path emits candidate (4+ debugging instincts)',
      agentCandidates.length >= 1,
      `agentCandidates=${agentCandidates.length}`,
    )

    // ----------------------------------------------------------------------
    // 4. Write learned skill + verify file on disk
    // ----------------------------------------------------------------------
    const firstDraft = skillCandidates[0]
    if (firstDraft) {
      const activePath = await skillLearning.writeLearnedSkill(firstDraft)
      // writeLearnedSkill returns the full SKILL.md path (not the directory).
      const exists = existsSync(activePath)
      record(
        'writeLearnedSkill produces SKILL.md',
        exists,
        `path=${activePath} exists=${exists}`,
      )
    } else {
      record('writeLearnedSkill produces SKILL.md', false, 'no skill candidate to write')
    }

    // ----------------------------------------------------------------------
    // 5. Cross-project promotion
    // ----------------------------------------------------------------------
    const projectBContext = projectCtx.resolveProjectContext(projectB)
    // Duplicate one high-confidence instinct into project B so promotion threshold
    // (>= 2 projects, avg conf >= 0.8) is met. We seeded a 0.9-confidence skill
    // instinct above, so this lookup succeeds deterministically.
    const pickable = allInstincts.find(i => i.confidence >= 0.8)
    if (pickable) {
      const projectBCopy = { ...pickable, projectId: projectBContext.projectId, projectName: projectBContext.projectName }
      await skillLearning.saveInstinct(projectBCopy, { project: projectBContext, scope: 'project' })
      // findPromotionCandidates groups by instinct id + distinct projectId
      // count; give it the real merged array seen across both project stores.
      const fromA = await skillLearning.loadInstincts({ project: projectAContext })
      const fromB = await skillLearning.loadInstincts({ project: projectBContext })
      const candidatesPre = skillLearning.findPromotionCandidates([
        ...fromA,
        ...fromB,
      ])
      record(
        'cross-project candidate visible',
        candidatesPre.length > 0,
        `${candidatesPre.length} promotable instincts across projects (A=${fromA.length} B=${fromB.length})`,
      )

      await skillLearning.checkPromotion({ project: projectAContext })
      const globalRoot = { scope: 'global' as const, rootDir: storage }
      const globalInstincts = await skillLearning.loadInstincts(globalRoot)
      record(
        'checkPromotion writes global instinct',
        globalInstincts.some(i => i.id === pickable.id),
        `global scope has ${globalInstincts.length} instincts; target id ${pickable.id} present=${globalInstincts.some(i => i.id === pickable.id)}`,
      )
    } else {
      record('cross-project promotion', false, 'no instinct with confidence >= 0.8 to promote')
    }

    // ----------------------------------------------------------------------
    // 6. Observer backend env switch probe
    // ----------------------------------------------------------------------
    const originalBackendEnv = process.env.SKILL_LEARNING_OBSERVER_BACKEND
    try {
      process.env.SKILL_LEARNING_OBSERVER_BACKEND = 'llm'
      skillLearning.resolveDefaultObserverBackend()
      const active = skillLearning.getActiveObserverBackend().name
      record('env switch llm activates', active === 'llm', `active backend=${active}`)

      process.env.SKILL_LEARNING_OBSERVER_BACKEND = 'unknown-typo'
      skillLearning.resolveDefaultObserverBackend()
      const stillActive = skillLearning.getActiveObserverBackend().name
      record('typo env does not crash', stillActive === 'llm', `active after typo=${stillActive}`)

      process.env.SKILL_LEARNING_OBSERVER_BACKEND = 'heuristic'
      skillLearning.resolveDefaultObserverBackend()
      record('env switch back to heuristic', skillLearning.getActiveObserverBackend().name === 'heuristic', `active=${skillLearning.getActiveObserverBackend().name}`)
    } finally {
      if (originalBackendEnv === undefined) delete process.env.SKILL_LEARNING_OBSERVER_BACKEND
      else process.env.SKILL_LEARNING_OBSERVER_BACKEND = originalBackendEnv
    }

    // ----------------------------------------------------------------------
    // 7. Gap state machine walk-through
    // ----------------------------------------------------------------------
    const prompt = 'auto-generate e2e verify script skeleton'
    const firstGap = await skillLearning.recordSkillGap({
      prompt,
      cwd: projectA,
      sessionId: 'e2e-a',
      project: projectAContext,
      rootDir: storage,
    })
    record('first gap is pending (no draft)', firstGap.status === 'pending' && !firstGap.draft, `status=${firstGap.status} draft=${!!firstGap.draft}`)

    const secondGap = await skillLearning.recordSkillGap({
      prompt,
      cwd: projectA,
      sessionId: 'e2e-a',
      project: projectAContext,
      rootDir: storage,
    })
    record('second occurrence promotes to draft', secondGap.status === 'draft' && !!secondGap.draft, `status=${secondGap.status} draftPath=${secondGap.draft?.skillPath ?? 'n/a'}`)

    // ----------------------------------------------------------------------
    // 8. Tool event observer wrapper invocation
    // ----------------------------------------------------------------------
    let wrappedRan = false
    const wrappedResult = await skillLearning.runToolCallWithSkillLearningHooks(
      'VerifyProbeTool',
      { sample: 'input' },
      { sessionId: skillLearning.RUNTIME_SESSION_ID, turn: 1 },
      async () => {
        wrappedRan = true
        return { data: { ok: true, payload: 42 } }
      },
    )
    record(
      'runToolCallWithSkillLearningHooks invokes inner fn',
      wrappedRan && (wrappedResult as { data?: { ok?: boolean } })?.data?.ok === true,
      `inner ran=${wrappedRan} result=${JSON.stringify(wrappedResult)}`,
    )

    // Observations produced by the wrapper are written under the project
    // context derived from process.cwd() (the test runner repo, not our
    // ephemeral projectA). Read from BOTH project scopes to catch either.
    const repoProject = projectCtx.resolveProjectContext(process.cwd())
    const [obsInProjectA, obsInRepo] = await Promise.all([
      skillLearning.readObservations({ project: projectAContext }),
      skillLearning.readObservations({ project: repoProject }),
    ])
    const toolHookRecords = [...obsInProjectA, ...obsInRepo].filter(
      o => o.source === 'tool-hook' && o.toolName === 'VerifyProbeTool',
    )
    record(
      'wrapper writes tool-hook observations',
      toolHookRecords.length > 0,
      `${toolHookRecords.length} tool-hook records on disk (projectA=${obsInProjectA.length} repo=${obsInRepo.length})`,
    )
  } catch (error) {
    record('uncaught exception', false, String(error))
  } finally {
    // Assert clean-room isolation held for the whole probe.
    record(
      'clean-room isolation: zero network calls',
      networkCalls === 0,
      `${networkCalls} network calls attempted`,
    )
    globalThis.fetch = originalFetch
    rmSync(storage, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    rmSync(projectA, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    rmSync(projectB, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }

  const passed = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length
  console.log(`\n=== SUMMARY ===\n${passed} pass, ${failed} fail, ${results.length} total`)
  process.exit(failed > 0 ? 1 : 0)
}

void main()
