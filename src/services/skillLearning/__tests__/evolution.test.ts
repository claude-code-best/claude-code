import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInstinct } from '../instinctParser.js'
import {
  classifyEvolutionTarget,
  clusterInstincts,
  generateAgentCandidates,
  generateCommandCandidates,
  generateSkillCandidates,
} from '../evolution.js'

describe('evolution', () => {
  test('clusters related instincts by trigger and domain', () => {
    const instincts = [
      createInstinct({
        trigger: 'when writing tests',
        action: 'use testing-library',
        confidence: 0.7,
        domain: 'testing',
        source: 'session-observation',
        scope: 'project',
        evidence: ['one'],
      }),
      createInstinct({
        trigger: 'when writing tests',
        action: 'avoid implementation mocks',
        confidence: 0.8,
        domain: 'testing',
        source: 'session-observation',
        scope: 'project',
        evidence: ['two'],
      }),
      createInstinct({
        trigger: 'when writing tests',
        action: 'prefer describe/test structure',
        confidence: 0.75,
        domain: 'testing',
        source: 'session-observation',
        scope: 'project',
        evidence: ['three'],
      }),
    ]

    const clusters = clusterInstincts(instincts)
    expect(clusters).toHaveLength(1)
    expect(clusters[0]?.averageConfidence).toBe(0.75)
  })

  test('classifies explicit user-invoked workflows as command candidates', () => {
    expect(
      classifyEvolutionTarget([
        createInstinct({
          trigger: 'when user asks to create migration',
          action: 'run command steps',
          confidence: 0.8,
          domain: 'workflow',
          source: 'session-observation',
          scope: 'project',
          evidence: ['one'],
        }),
      ]),
    ).toBe('command')
  })

  test('generates skill candidates for high-confidence skill clusters', () => {
    // Cluster-size floor (>=3) is non-negotiable post-H15 fix: a single
    // high-confidence instinct must not become a persistent skill. Three
    // independent observations are required to promote.
    const instincts = [
      createInstinct({
        trigger: 'when writing tests',
        action: 'use testing-library',
        confidence: 0.8,
        domain: 'testing',
        source: 'session-observation',
        scope: 'project',
        evidence: ['one'],
      }),
      createInstinct({
        trigger: 'when writing tests',
        action: 'avoid implementation mocks',
        confidence: 0.8,
        domain: 'testing',
        source: 'session-observation',
        scope: 'project',
        evidence: ['two'],
      }),
      createInstinct({
        trigger: 'when writing tests',
        action: 'prefer describe/test structure',
        confidence: 0.8,
        domain: 'testing',
        source: 'session-observation',
        scope: 'project',
        evidence: ['three'],
      }),
    ]

    expect(generateSkillCandidates(instincts)).toHaveLength(1)
  })

  describe('three-path generation', () => {
    let tmp: string
    beforeEach(() => {
      tmp = mkdtempSync(join(tmpdir(), 'skill-learning-evolve-'))
    })
    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true })
    })

    test('command-triggered instincts produce command candidates, not skill candidates', () => {
      // Need >=3 instincts to satisfy the cluster-size floor post-H15.
      const instincts = Array.from({ length: 3 }, (_, i) =>
        createInstinct({
          trigger: 'when user asks to create migration',
          action: 'run command: pnpm run migration',
          confidence: 0.85,
          domain: 'workflow',
          source: 'session-observation',
          scope: 'project',
          evidence: [`user invocation ${i}`],
        }),
      )

      const commands = generateCommandCandidates(instincts, { cwd: tmp })
      const skills = generateSkillCandidates(instincts, { cwd: tmp })
      expect(commands).toHaveLength(1)
      expect(skills).toHaveLength(0)
      expect(commands[0]?.content).toContain('/')
    })

    test('four debug multi-step instincts cluster into an agent candidate', () => {
      const instincts = Array.from({ length: 4 }, (_, i) =>
        createInstinct({
          trigger: 'when debugging multi-step regressions',
          action: 'investigate stack trace, reproduce locally, and add test',
          confidence: 0.82,
          domain: 'debugging',
          source: 'session-observation',
          scope: 'project',
          evidence: [`incident-${i}`],
        }),
      )

      const agents = generateAgentCandidates(instincts, { cwd: tmp })
      expect(agents).toHaveLength(1)
      expect(agents[0]?.content).toContain('Playbook')
    })
  })
})
