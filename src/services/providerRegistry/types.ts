import { z } from 'zod'

/**
 * Compat rule identifiers. Each maps to a CompatProfile in providerCompatMatrix.ts.
 */
export const CompatRuleSchema = z.enum([
  'cerebras',
  'groq',
  'deepseek',
  'strict-openai',
  'permissive',
])

export type CompatRule = z.infer<typeof CompatRuleSchema>

/**
 * The only supported provider kind for PR-2. Future PR-3+ may add 'oauth', 'bedrock-compat', etc.
 */
export const ProviderKindSchema = z.literal('openai-compat')
export type ProviderKind = z.infer<typeof ProviderKindSchema>

/**
 * Zod schema for a single provider configuration entry.
 *
 * Rules:
 * - id: kebab-case identifier used in /provider use <id>
 * - kind: only 'openai-compat' in PR-2
 * - baseUrl: full base URL including /v1 suffix if needed
 * - apiKeyEnv: name of the env var that holds the API key
 * - defaultModel: model string passed as OPENAI_MODEL
 * - compatRule: selects CompatProfile from providerCompatMatrix
 */
export const ProviderConfigSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'id must be kebab-case'),
  kind: ProviderKindSchema,
  baseUrl: z.string().url(),
  apiKeyEnv: z.string().min(1),
  defaultModel: z.string().min(1),
  compatRule: CompatRuleSchema,
})

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>

/**
 * Schema for the entire ~/.claude/providers.json file.
 * Top-level must be an array of ProviderConfig.
 */
export const ProvidersFileSchema = z.array(ProviderConfigSchema)
