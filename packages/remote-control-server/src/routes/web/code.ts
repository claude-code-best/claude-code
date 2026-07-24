import { Hono } from 'hono'
import { uuidAuth } from '../../auth/middleware'
import {
  storeGetEnvironment,
  type ProjectRecord,
  type SessionRecord,
} from '../../store'
import {
  archiveCodeProject,
  listProjectsByProduct,
  restoreCodeProject,
  updateProjectPrompt,
} from '../../services/project'
import {
  createCodeProductSession,
  listSessionsByProduct,
} from '../../services/product-session'
import {
  runEnvironmentCommand,
  type EnvironmentCommandResult,
} from '../../services/environment-command'

const app = new Hono()

function projectResponse(project: ProjectRecord) {
  return {
    id: project.id,
    product: project.product,
    name: project.name,
    project_prompt: project.projectPrompt,
    prompt_revision: project.promptRevision,
    state: project.state,
    device_id: project.deviceId,
    workspace_key: project.workspaceKey,
    canonical_path: project.canonicalPath,
    git_root: project.gitRoot,
    git_repo_url: project.gitRepoUrl,
    created_at: project.createdAt.getTime(),
    updated_at: project.updatedAt.getTime(),
  }
}

function sessionResponse(session: SessionRecord) {
  return {
    id: session.id,
    product: session.product,
    project_id: session.projectId,
    environment_id: session.environmentId,
    title: session.title,
    status: session.status,
    source: session.source,
    permission_mode: session.permissionMode,
    directory: session.directory,
    runtime_environment_id: session.runtimeEnvironmentId,
    data_directory: session.dataDirectory,
    project_prompt_revision: session.projectPromptRevision,
    model_selection: session.modelSelection
      ? {
          provider_id: session.modelSelection.providerId,
          model_profile_id: session.modelSelection.modelProfileId,
          resolved_model_id: session.modelSelection.resolvedModelId,
          provider_config_revision:
            session.modelSelection.providerConfigRevision,
          updated_at: session.modelSelection.updatedAt,
        }
      : null,
    created_at: session.createdAt.getTime() / 1000,
    updated_at: session.updatedAt.getTime() / 1000,
  }
}

app.get('/code/projects', uuidAuth, c => {
  const includeArchived = c.req.query('include_archived') === '1'
  const projects = listProjectsByProduct(c.get('uuid')!, 'code').filter(
    project => includeArchived || project.state === 'active',
  )
  return c.json(projects.map(projectResponse), 200)
})

app.patch('/code/projects/:id/prompt', uuidAuth, async c => {
  try {
    const body = (await c.req.json()) as { prompt?: unknown }
    if (typeof body.prompt !== 'string')
      throw new Error('prompt must be a string')
    const project = updateProjectPrompt(
      c.req.param('id')!,
      c.get('uuid')!,
      body.prompt,
      'code',
    )
    return c.json(projectResponse(project), 200)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid request'
    return c.json({ error: { type: 'invalid_request', message } }, 400)
  }
})

app.get('/code/sessions', uuidAuth, c => {
  const includeArchived = c.req.query('include_archived') === '1'
  return c.json(
    listSessionsByProduct(c.get('uuid')!, 'code', includeArchived).map(
      sessionResponse,
    ),
    200,
  )
})

app.post('/code/sessions', uuidAuth, async c => {
  try {
    const body = (await c.req.json()) as Record<string, unknown>
    const allowedKeys = new Set([
      'environment_id',
      'requested_directory',
      'title',
      'permission_mode',
    ])
    if (Object.keys(body).some(key => !allowedKeys.has(key))) {
      throw new Error('unsupported Code session field')
    }
    if (typeof body.environment_id !== 'string') {
      throw new Error('environment_id is required')
    }
    if (typeof body.requested_directory !== 'string') {
      throw new Error('requested_directory is required')
    }
    if (
      body.title !== undefined &&
      body.title !== null &&
      typeof body.title !== 'string'
    ) {
      throw new Error('title must be a string')
    }
    if (
      body.permission_mode !== undefined &&
      typeof body.permission_mode !== 'string'
    ) {
      throw new Error('permission_mode must be a string')
    }

    const session = await createCodeProductSession({
      ownerId: c.get('uuid')!,
      accountId: c.get('accountId')!,
      environmentId: body.environment_id,
      requestedDirectory: body.requested_directory,
      title: (body.title as string | undefined) ?? null,
      permissionMode: (body.permission_mode as string | undefined) ?? null,
    })
    return c.json(sessionResponse(session), 200)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid request'
    return c.json({ error: { type: 'invalid_request', message } }, 400)
  }
})

app.post('/code/environments/:id/directory', uuidAuth, async c => {
  try {
    const environmentId = c.req.param('id')!
    const environment = storeGetEnvironment(environmentId)
    if (
      !environment ||
      environment.status !== 'active' ||
      environment.workerType === 'acp' ||
      environment.accountId !== c.get('accountId')!
    ) {
      throw new Error('environment not found or offline')
    }
    const body = (await c.req.json()) as { path?: unknown }
    const path = typeof body.path === 'string' ? body.path.trim() : ''
    if (!path) throw new Error('path is required')

    const result = await runEnvironmentCommand<EnvironmentCommandResult>({
      environmentId,
      ownerId: c.get('uuid')!,
      kind: 'list_directory',
      payload: { path },
    })
    if (result.kind !== 'list_directory') {
      throw new Error('invalid directory listing result')
    }
    return c.json(result.value, 200)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid request'
    return c.json({ error: { type: 'invalid_request', message } }, 400)
  }
})

app.delete('/code/projects/:id', uuidAuth, c => {
  try {
    return c.json(
      projectResponse(archiveCodeProject(c.req.param('id')!, c.get('uuid')!)),
      200,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid request'
    return c.json({ error: { type: 'invalid_request', message } }, 400)
  }
})

app.post('/code/projects/:id/restore', uuidAuth, c => {
  try {
    return c.json(
      projectResponse(restoreCodeProject(c.req.param('id')!, c.get('uuid')!)),
      200,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid request'
    return c.json({ error: { type: 'invalid_request', message } }, 400)
  }
})

export default app
