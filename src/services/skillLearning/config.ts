export type SkillLearningLlmConfig = {
  readonly timeoutMs: number
  readonly maxCallsPerSession: number
  readonly cooldownMs: number
  readonly failureThreshold: number
  readonly circuitCooldownMs: number
}

export type SkillLearningConfig = {
  readonly minConfidence: number
  readonly minClusterSize: number
  readonly llm: SkillLearningLlmConfig
}

export type SkillLearningConfigOverrides = {
  minConfidence?: number
  minClusterSize?: number
  llm?: Partial<SkillLearningLlmConfig>
}

const DEFAULTS: SkillLearningConfig = {
  minConfidence: 0.75,
  minClusterSize: 3,
  llm: {
    timeoutMs: 10_000,
    maxCallsPerSession: 20,
    cooldownMs: 30_000,
    failureThreshold: 3,
    circuitCooldownMs: 60_000,
  },
}

let overrides: SkillLearningConfigOverrides | undefined

export function getSkillLearningConfig(): SkillLearningConfig {
  if (!overrides) return DEFAULTS
  return {
    minConfidence: overrides.minConfidence ?? DEFAULTS.minConfidence,
    minClusterSize: overrides.minClusterSize ?? DEFAULTS.minClusterSize,
    llm: { ...DEFAULTS.llm, ...overrides.llm },
  }
}

export function setSkillLearningConfigForTest(
  config: SkillLearningConfigOverrides,
): void {
  overrides = config
}

export function resetSkillLearningConfig(): void {
  overrides = undefined
}
