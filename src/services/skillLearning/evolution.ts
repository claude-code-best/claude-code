import type { Instinct } from './instinctParser.js'
import { shouldGenerateSkillFromInstincts } from './learningPolicy.js'
import {
  generateSkillDraft,
  type SkillGeneratorOptions,
} from './skillGenerator.js'
import {
  generateCommandDraft,
  type CommandGeneratorOptions,
  type LearnedCommandDraft,
} from './commandGenerator.js'
import {
  generateAgentDraft,
  type AgentGeneratorOptions,
  type LearnedAgentDraft,
} from './agentGenerator.js'
import { getSkillLearningConfig } from './config.js'
import type { LearnedSkillDraft } from './types.js'

export type EvolutionCandidate = {
  target: 'skill' | 'command' | 'agent'
  trigger: string
  domain: string
  instincts: Instinct[]
  averageConfidence: number
}

export type LearnedArtifactDraft =
  | { kind: 'skill'; draft: LearnedSkillDraft }
  | { kind: 'command'; draft: LearnedCommandDraft }
  | { kind: 'agent'; draft: LearnedAgentDraft }

export function clusterInstincts(instincts: Instinct[]): EvolutionCandidate[] {
  const groups = new Map<string, Instinct[]>()
  for (const instinct of instincts) {
    if (instinct.status !== 'active' && instinct.status !== 'pending') continue
    const key = `${instinct.domain}:${normalizedTrigger(instinct.trigger)}`
    const group = groups.get(key) ?? []
    group.push(instinct)
    groups.set(key, group)
  }

  return Array.from(groups.values())
    .filter(group => {
      // Require the cluster-size floor unconditionally. Single-shot
      // high-confidence instincts previously bypassed this via the
      // `|| confidence >= 0.8` OR, which let one message become a
      // persistent policy — exactly the H15 risk the threshold guards
      // against. Repeated independent observation is non-negotiable.
      return group.length >= getSkillLearningConfig().minClusterSize
    })
    .map(group => {
      const averageConfidence =
        group.reduce((sum, instinct) => sum + instinct.confidence, 0) /
        group.length
      return {
        target: classifyEvolutionTarget(group),
        trigger: group[0]?.trigger ?? 'learned pattern',
        domain: group[0]?.domain ?? 'project',
        instincts: group,
        averageConfidence: Number(averageConfidence.toFixed(2)),
      }
    })
    .sort((a, b) => b.averageConfidence - a.averageConfidence)
}

export function classifyEvolutionTarget(
  instinctsOrCandidate: Instinct[] | EvolutionCandidate,
): 'skill' | 'command' | 'agent' {
  const instincts = Array.isArray(instinctsOrCandidate)
    ? instinctsOrCandidate
    : instinctsOrCandidate.instincts
  const text = instincts
    .map(i => `${i.trigger} ${i.action}`)
    .join(' ')
    .toLowerCase()
  if (/user asks|explicitly request|command|run /.test(text)) return 'command'
  if (
    instincts.length >= 4 &&
    /(debug|investigate|research|multi-step)/.test(text)
  ) {
    return 'agent'
  }
  return 'skill'
}

export function suggestEvolutions(instincts: Instinct[]): EvolutionCandidate[] {
  return clusterInstincts(instincts)
}

export function generateSkillCandidates(
  instincts: Instinct[],
  options?: SkillGeneratorOptions,
): LearnedSkillDraft[] {
  return clusterInstincts(instincts)
    .filter(
      candidate =>
        candidate.target === 'skill' &&
        shouldGenerateSkillFromInstincts(candidate.instincts),
    )
    .map(candidate =>
      generateSkillDraft(candidate.instincts, {
        ...options,
        scope: candidate.instincts[0]?.scope ?? 'project',
      }),
    )
}

export function generateCommandCandidates(
  instincts: Instinct[],
  options?: CommandGeneratorOptions,
): LearnedCommandDraft[] {
  return clusterInstincts(instincts)
    .filter(
      candidate =>
        candidate.target === 'command' &&
        shouldGenerateSkillFromInstincts(candidate.instincts),
    )
    .map(candidate =>
      generateCommandDraft(candidate.instincts, {
        ...options,
        scope: candidate.instincts[0]?.scope ?? 'project',
      }),
    )
}

export function generateAgentCandidates(
  instincts: Instinct[],
  options?: AgentGeneratorOptions,
): LearnedAgentDraft[] {
  return clusterInstincts(instincts)
    .filter(
      candidate =>
        candidate.target === 'agent' &&
        shouldGenerateSkillFromInstincts(candidate.instincts),
    )
    .map(candidate =>
      generateAgentDraft(candidate.instincts, {
        ...options,
        scope: candidate.instincts[0]?.scope ?? 'project',
      }),
    )
}

export function generateAllCandidates(
  instincts: Instinct[],
  options?: {
    skill?: SkillGeneratorOptions
    command?: CommandGeneratorOptions
    agent?: AgentGeneratorOptions
  },
): LearnedArtifactDraft[] {
  return [
    ...generateSkillCandidates(instincts, options?.skill).map(
      (draft): LearnedArtifactDraft => ({ kind: 'skill', draft }),
    ),
    ...generateCommandCandidates(instincts, options?.command).map(
      (draft): LearnedArtifactDraft => ({ kind: 'command', draft }),
    ),
    ...generateAgentCandidates(instincts, options?.agent).map(
      (draft): LearnedArtifactDraft => ({ kind: 'agent', draft }),
    ),
  ]
}

function normalizedTrigger(trigger: string): string {
  return trigger
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join(' ')
}
