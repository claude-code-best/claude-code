export const PRODUCTS = ['chat', 'code'] as const
export type Product = (typeof PRODUCTS)[number]

export const PROJECT_STATES = ['active', 'archived', 'missing'] as const
export type ProjectState = (typeof PROJECT_STATES)[number]

export const ENVIRONMENT_COMMAND_KINDS = [
  'list_directory',
  'resolve_workspace',
  'cleanup_chat_session',
  'probe_workspace',
  'get_provider_catalog',
  'discover_provider_models',
  'save_provider_profile',
  'archive_provider_profile',
  'delete_provider_profile',
  'save_model_profile',
  'archive_model_profile',
  'delete_model_profile',
  'set_default_model',
  'validate_provider_model',
  'begin_provider_auth',
  'get_provider_auth_status',
  'submit_provider_auth_code',
  'cancel_provider_auth',
  'remove_provider_auth',
  'refresh_provider_auth',
  'begin_provider_secret',
  'terminate_session',
] as const
export type EnvironmentCommandKind = (typeof ENVIRONMENT_COMMAND_KINDS)[number]

export const ENVIRONMENT_COMMAND_STATES = [
  'pending',
  'dispatched',
  'completed',
  'failed',
  'expired',
  'cancelled',
] as const
export type EnvironmentCommandState =
  (typeof ENVIRONMENT_COMMAND_STATES)[number]

export interface ResolvedWorkspace {
  deviceId: string
  canonicalPath: string
  workspaceKey: string
  gitRoot: string | null
  gitRepoUrl: string | null
}

export function assertProjectShape(project: {
  product: Product
  deviceId: string | null
  workspaceKey: string | null
  canonicalPath: string | null
}): void {
  const workspaceValues = [
    project.deviceId,
    project.workspaceKey,
    project.canonicalPath,
  ]
  const hasAnyWorkspaceValue = workspaceValues.some(value => value !== null)
  const hasCompleteWorkspace = workspaceValues.every(
    value => typeof value === 'string' && value.length > 0,
  )

  if (project.product === 'chat' && hasAnyWorkspaceValue) {
    throw new Error('chat projects cannot contain workspace identity')
  }
  if (project.product === 'code' && !hasCompleteWorkspace) {
    throw new Error('code projects require workspace identity')
  }
}
