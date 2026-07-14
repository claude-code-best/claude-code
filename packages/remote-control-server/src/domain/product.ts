export const PRODUCTS = ['chat', 'code'] as const
export type Product = (typeof PRODUCTS)[number]

export const PROJECT_STATES = ['active', 'archived', 'missing'] as const
export type ProjectState = (typeof PROJECT_STATES)[number]

export const ENVIRONMENT_COMMAND_KINDS = [
  'list_directory',
  'resolve_workspace',
  'cleanup_chat_session',
  'probe_workspace',
] as const
export type EnvironmentCommandKind = (typeof ENVIRONMENT_COMMAND_KINDS)[number]

export const ENVIRONMENT_COMMAND_STATES = [
  'pending',
  'dispatched',
  'completed',
  'failed',
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
