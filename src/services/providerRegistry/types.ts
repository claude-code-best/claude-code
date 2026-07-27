import { z } from 'zod'

const StableIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9-]+$/, 'id must be kebab-case')

const EnvironmentNameSchema = z
  .string()
  .min(1)
  .regex(
    /^[A-Za-z_][A-Za-z0-9_]*$/,
    'envName must be a valid environment variable name',
  )

/**
 * Compat rule identifiers. Each maps to a CompatProfile in
 * providerCompatMatrix.ts.
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
 * Legacy provider entries remain available while the terminal switcher is
 * migrated. The legacy kind is intentionally not part of the v2 enum.
 */
export const LegacyProviderKindSchema = z.literal('openai-compat')
export type LegacyProviderKind = z.infer<typeof LegacyProviderKindSchema>

export const LegacyProviderConfigSchema = z.object({
  id: StableIdSchema,
  kind: LegacyProviderKindSchema,
  baseUrl: z.url(),
  apiKeyEnv: z.string().min(1),
  defaultModel: z.string().min(1),
  compatRule: CompatRuleSchema,
})

export type LegacyProviderConfig = z.infer<typeof LegacyProviderConfigSchema>

/** @deprecated Use LegacyProviderConfigSchema during the migration period. */
export const ProviderConfigSchema = LegacyProviderConfigSchema
/** @deprecated Use LegacyProviderConfig during the migration period. */
export type ProviderConfig = LegacyProviderConfig

/** Schema for the legacy ~/.claude/providers.json array. */
export const ProvidersFileSchema = z.array(LegacyProviderConfigSchema)

export const ProviderKindSchema = z.enum([
  'anthropic',
  'anthropic-compatible',
  'openai-compatible',
  'chatgpt',
  'gemini',
  'grok',
  'bedrock',
  'vertex',
  'foundry',
])

export type ProviderKind = z.infer<typeof ProviderKindSchema>

export const AuthSchemeSchema = z.enum([
  'oauth',
  'api-key',
  'bearer',
  'aws-iam',
  'gcp-adc',
  'azure-ad',
  'proxy',
])

export type AuthScheme = z.infer<typeof AuthSchemeSchema>

export const AuthSourceSchema = z.enum([
  'secure-storage',
  'settings',
  'environment',
  'helper',
  'cloud-chain',
])

export type AuthSource = z.infer<typeof AuthSourceSchema>

/**
 * A non-secret reference to where authentication is resolved at runtime.
 * Credential values must never be added to this persisted shape.
 */
export const AuthReferenceSchema = z
  .object({
    scheme: AuthSchemeSchema,
    source: AuthSourceSchema,
    envName: EnvironmentNameSchema.optional(),
  })
  .strict()

export type AuthReference = z.infer<typeof AuthReferenceSchema>

export const ModelValidationSchema = z
  .object({
    status: z.enum(['unverified', 'valid', 'invalid']),
  })
  .strict()

export type ModelValidation = z.infer<typeof ModelValidationSchema>

export const ModelProfileSchema = z
  .object({
    id: StableIdSchema,
    displayName: z.string().trim().min(1),
    remoteModelId: z.string().trim().min(1),
    enabled: z.boolean(),
    archived: z.boolean(),
    validation: ModelValidationSchema,
  })
  .strict()

export type ModelProfile = z.infer<typeof ModelProfileSchema>

export const ProviderProfileSchema = z
  .object({
    id: StableIdSchema,
    displayName: z.string().trim().min(1),
    kind: ProviderKindSchema,
    baseUrl: z.url().optional(),
    auth: AuthReferenceSchema,
    compatRule: CompatRuleSchema.optional(),
    enabled: z.boolean(),
    archived: z.boolean(),
    models: z.array(ModelProfileSchema),
  })
  .strict()

export type ProviderProfile = z.infer<typeof ProviderProfileSchema>

export const ModelRefSchema = z
  .object({
    providerId: StableIdSchema,
    modelProfileId: StableIdSchema,
  })
  .strict()

export type ModelRef = z.infer<typeof ModelRefSchema>

const ProviderConfigurationV2BaseSchema = z
  .object({
    version: z.literal(2),
    revision: z.number().int().nonnegative(),
    defaultModel: ModelRefSchema.nullable(),
    providers: z.array(ProviderProfileSchema),
  })
  .strict()

export const ProviderConfigurationV2Schema =
  ProviderConfigurationV2BaseSchema.superRefine((configuration, context) => {
    const providerIds = new Set<string>()

    for (const [providerIndex, provider] of configuration.providers.entries()) {
      if (providerIds.has(provider.id)) {
        context.addIssue({
          code: 'custom',
          message: `duplicate provider id: ${provider.id}`,
          path: ['providers', providerIndex, 'id'],
        })
      }
      providerIds.add(provider.id)

      const modelIds = new Set<string>()
      for (const [modelIndex, model] of provider.models.entries()) {
        if (modelIds.has(model.id)) {
          context.addIssue({
            code: 'custom',
            message: `duplicate model id: ${model.id}`,
            path: ['providers', providerIndex, 'models', modelIndex, 'id'],
          })
        }
        modelIds.add(model.id)
      }
    }

    if (configuration.defaultModel === null) return

    const provider = configuration.providers.find(
      candidate => candidate.id === configuration.defaultModel?.providerId,
    )
    const model = provider?.models.find(
      candidate => candidate.id === configuration.defaultModel?.modelProfileId,
    )

    if (
      provider === undefined ||
      model === undefined ||
      !provider.enabled ||
      provider.archived ||
      !model.enabled ||
      model.archived ||
      model.validation.status === 'invalid'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'defaultModel must reference an available model',
        path: ['defaultModel'],
      })
    }
  })

export type ProviderConfigurationV2 = z.infer<
  typeof ProviderConfigurationV2Schema
>

/** Authentication metadata safe to publish to the browser. */
export const RedactedAuthReferenceSchema = AuthReferenceSchema.extend({
  configured: z.boolean(),
  expiresAt: z.number().int().nonnegative().optional(),
  lastErrorCode: z.string().min(1).optional(),
}).strict()

export type RedactedAuthReference = z.infer<typeof RedactedAuthReferenceSchema>

export const RedactedProviderProfileSchema = ProviderProfileSchema.extend({
  auth: RedactedAuthReferenceSchema,
}).strict()

export type RedactedProviderProfile = z.infer<
  typeof RedactedProviderProfileSchema
>

export const RedactedProviderModelCatalogSchema = z
  .object({
    version: z.literal(1),
    revision: z.number().int().nonnegative(),
    defaultModel: ModelRefSchema.nullable(),
    providers: z.array(RedactedProviderProfileSchema),
  })
  .strict()

export type RedactedProviderModelCatalog = z.infer<
  typeof RedactedProviderModelCatalogSchema
>
