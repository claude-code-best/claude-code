import type { Product, ResolvedWorkspace } from '../domain/product'
import {
  type ProjectRecord,
  storeCreateProject,
  storeGetProject,
  storeListProjectsByOwnerProduct,
  storeUpdateProject,
} from '../store'

function requireOwnedProject(
  projectId: string,
  ownerId: string,
): ProjectRecord {
  const project = storeGetProject(projectId)
  if (!project || project.ownerId !== ownerId) {
    throw new Error('project not found')
  }
  return project
}

export function createChatProject(
  ownerId: string,
  name: string,
): ProjectRecord {
  const normalizedName = name.trim()
  if (!normalizedName) throw new Error('project name is required')
  return storeCreateProject({
    ownerId,
    product: 'chat',
    name: normalizedName,
    projectPrompt: '',
    promptRevision: 0,
    state: 'active',
    deviceId: null,
    workspaceKey: null,
    canonicalPath: null,
    gitRoot: null,
    gitRepoUrl: null,
    missingConfirmedAt: null,
  })
}

export function updateProjectPrompt(
  projectId: string,
  ownerId: string,
  prompt: string,
  expectedProduct?: Product,
): ProjectRecord {
  const project = requireOwnedProject(projectId, ownerId)
  if (expectedProduct && project.product !== expectedProduct) {
    throw new Error('project product mismatch')
  }
  if (project.state !== 'active') {
    throw new Error('project is not active')
  }
  if (project.projectPrompt === prompt) return project
  storeUpdateProject(project.id, {
    projectPrompt: prompt,
    promptRevision: project.promptRevision + 1,
  })
  return storeGetProject(project.id)!
}

export function upsertCodeProject(
  ownerId: string,
  workspace: ResolvedWorkspace,
): ProjectRecord {
  const existing = storeListProjectsByOwnerProduct(ownerId, 'code').find(
    project =>
      project.deviceId === workspace.deviceId &&
      project.workspaceKey === workspace.workspaceKey,
  )
  if (existing) {
    storeUpdateProject(existing.id, {
      gitRoot: workspace.gitRoot,
      gitRepoUrl: workspace.gitRepoUrl,
      state: 'active',
      missingConfirmedAt: null,
    })
    return storeGetProject(existing.id)!
  }
  const name = workspace.canonicalPath.split(/[\\/]/).filter(Boolean).at(-1)
  return storeCreateProject({
    ownerId,
    product: 'code',
    name: name || workspace.canonicalPath,
    projectPrompt: '',
    promptRevision: 0,
    state: 'active',
    deviceId: workspace.deviceId,
    workspaceKey: workspace.workspaceKey,
    canonicalPath: workspace.canonicalPath,
    gitRoot: workspace.gitRoot,
    gitRepoUrl: workspace.gitRepoUrl,
    missingConfirmedAt: null,
  })
}

export function archiveCodeProject(
  projectId: string,
  ownerId: string,
): ProjectRecord {
  const project = requireOwnedProject(projectId, ownerId)
  if (project.product !== 'code') throw new Error('project product mismatch')
  if (project.state !== 'archived') {
    storeUpdateProject(project.id, {
      state: 'archived',
      missingConfirmedAt: null,
    })
  }
  return storeGetProject(project.id)!
}

export function restoreCodeProject(
  projectId: string,
  ownerId: string,
): ProjectRecord {
  const project = requireOwnedProject(projectId, ownerId)
  if (project.product !== 'code') throw new Error('project product mismatch')
  if (project.state === 'missing') {
    throw new Error('missing workspace must be reopened from Code')
  }
  if (project.state !== 'active' || project.missingConfirmedAt !== null) {
    storeUpdateProject(project.id, {
      state: 'active',
      missingConfirmedAt: null,
    })
  }
  return storeGetProject(project.id)!
}

export function listProjectsByProduct(
  ownerId: string,
  product: Product,
): ProjectRecord[] {
  return storeListProjectsByOwnerProduct(ownerId, product)
}
