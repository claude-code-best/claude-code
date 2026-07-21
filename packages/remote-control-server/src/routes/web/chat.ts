import { Hono } from 'hono'
import { uuidAuth } from '../../auth/middleware'
import type { ProjectRecord, SessionRecord } from '../../store'
import {
  createChatProject,
  listProjectsByProduct,
  updateProjectPrompt,
} from '../../services/project'
import {
  assignChatSessionProject,
  createChatProductSession,
  listSessionsByProduct,
} from '../../services/product-session'
import {
  deleteChatProject,
  deleteChatSession,
} from '../../services/chat-cleanup'

const app = new Hono()

function projectResponse(project: ProjectRecord) {
  return {
    id: project.id,
    product: project.product,
    name: project.name,
    project_prompt: project.projectPrompt,
    prompt_revision: project.promptRevision,
    state: project.state,
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

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'invalid request'
  const status = message.includes('not found') ? 404 : 400
  return { message, status } as const
}

app.get('/chat/projects', uuidAuth, c => {
  const ownerId = c.get('uuid')!
  return c.json(
    listProjectsByProduct(ownerId, 'chat').map(projectResponse),
    200,
  )
})

app.post('/chat/projects', uuidAuth, async c => {
  try {
    const body = (await c.req.json()) as { name?: unknown }
    const project = createChatProject(
      c.get('uuid')!,
      typeof body.name === 'string' ? body.name : '',
    )
    return c.json(projectResponse(project), 200)
  } catch (error) {
    const failure = errorResponse(error)
    return c.json(
      { error: { type: 'invalid_request', message: failure.message } },
      failure.status,
    )
  }
})

app.patch('/chat/projects/:id/prompt', uuidAuth, async c => {
  try {
    const body = (await c.req.json()) as { prompt?: unknown }
    if (typeof body.prompt !== 'string')
      throw new Error('prompt must be a string')
    const project = updateProjectPrompt(
      c.req.param('id')!,
      c.get('uuid')!,
      body.prompt,
      'chat',
    )
    return c.json(projectResponse(project), 200)
  } catch (error) {
    const failure = errorResponse(error)
    return c.json(
      { error: { type: 'invalid_request', message: failure.message } },
      failure.status,
    )
  }
})

app.get('/chat/sessions', uuidAuth, c => {
  const ownerId = c.get('uuid')!
  const includeArchived = c.req.query('include_archived') === '1'
  return c.json(
    listSessionsByProduct(ownerId, 'chat', includeArchived).map(
      sessionResponse,
    ),
    200,
  )
})

app.post('/chat/sessions', uuidAuth, async c => {
  try {
    const body = (await c.req.json()) as Record<string, unknown>
    const allowedKeys = new Set(['title', 'project_id'])
    if (Object.keys(body).some(key => !allowedKeys.has(key))) {
      throw new Error('Chat sessions do not accept workspace inputs')
    }
    if (body.title !== undefined && typeof body.title !== 'string') {
      throw new Error('title must be a string')
    }
    if (
      body.project_id !== undefined &&
      body.project_id !== null &&
      typeof body.project_id !== 'string'
    ) {
      throw new Error('project_id must be a string or null')
    }
    const session = createChatProductSession({
      ownerId: c.get('uuid')!,
      accountId: c.get('accountId')!,
      projectId: typeof body.project_id === 'string' ? body.project_id : null,
      title: typeof body.title === 'string' ? body.title : 'New Chat',
    })
    return c.json(sessionResponse(session), 200)
  } catch (error) {
    const failure = errorResponse(error)
    return c.json(
      { error: { type: 'invalid_request', message: failure.message } },
      failure.status,
    )
  }
})

app.post('/chat/sessions/:id/project', uuidAuth, async c => {
  try {
    const body = (await c.req.json()) as { project_id?: unknown }
    if (body.project_id !== null && typeof body.project_id !== 'string') {
      throw new Error('project_id must be a string or null')
    }
    return c.json(
      sessionResponse(
        assignChatSessionProject(
          c.req.param('id')!,
          body.project_id ?? null,
          c.get('uuid')!,
        ),
      ),
      200,
    )
  } catch (error) {
    const failure = errorResponse(error)
    return c.json(
      { error: { type: 'invalid_request', message: failure.message } },
      failure.status,
    )
  }
})

app.delete('/chat/sessions/:id', uuidAuth, async c => {
  try {
    return c.json(
      await deleteChatSession(c.req.param('id')!, c.get('uuid')!),
      200,
    )
  } catch (error) {
    const failure = errorResponse(error)
    return c.json(
      { error: { type: 'invalid_request', message: failure.message } },
      failure.status,
    )
  }
})

app.delete('/chat/projects/:id', uuidAuth, async c => {
  try {
    return c.json(
      await deleteChatProject(c.req.param('id')!, c.get('uuid')!),
      200,
    )
  } catch (error) {
    const failure = errorResponse(error)
    return c.json(
      { error: { type: 'invalid_request', message: failure.message } },
      failure.status,
    )
  }
})

export default app
