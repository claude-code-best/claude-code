import type { CompatRule } from '../providerRegistry/types.js'
import type { APIProvider } from '../../utils/model/providers.js'

export type ProviderRuntimeSelection = Readonly<{
  providerId: string
  modelProfileId: string
  resolvedModelId: string
  providerConfigRevision: number
  updatedAt: number
}>

export type ProviderRuntimeSnapshot = Readonly<{
  providerId: string
  modelProfileId: string
  resolvedModelId: string
  providerConfigRevision: number
  updatedAt: number
  apiProvider: APIProvider
  compatRule?: CompatRule
  environmentTemplate: Readonly<Record<string, string | undefined>>
  credentialSourceEnvName?: string
  credentialTargetEnvName?: string
}>

export type ProviderRuntimeResolutionErrorCode =
  | 'provider_revision_conflict'
  | 'provider_not_found'
  | 'model_not_found'
  | 'resolved_model_mismatch'
  | 'provider_unavailable'
  | 'model_unavailable'
  | 'invalid_model'
  | 'model_not_allowed'
  | 'authentication_required'

export class ProviderRuntimeResolutionError extends Error {
  constructor(readonly code: ProviderRuntimeResolutionErrorCode) {
    super(code)
    this.name = 'ProviderRuntimeResolutionError'
  }
}
