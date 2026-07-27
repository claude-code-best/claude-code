import { Hono, type Context } from 'hono'
import { uuidAuth } from '../../auth/middleware'
import {
  ProviderWebError,
  providerExpectedRevision,
  providerOperationId,
  requireOwnedProviderEnvironment,
  runProviderWebCommand,
} from '../../services/provider-web'
import { providerSecretRelay } from '../../services/provider-secret-relay'
import { getPersistence } from '../../persistence/runtime'

const app = new Hono()

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProviderWebError('invalid_request', 400)
  }
  return value as Record<string, unknown>
}

function text(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ProviderWebError('invalid_request', 400)
  }
  return value
}

function boolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') {
    throw new ProviderWebError('invalid_request', 400)
  }
  return value
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined) return undefined
  return text(value)
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const keys = new Set(allowed)
  if (Object.keys(value).some(key => !keys.has(key))) {
    throw new ProviderWebError('invalid_request', 400)
  }
}

function modelProfile(value: unknown) {
  const input = object(value)
  exactKeys(input, [
    'id',
    'display_name',
    'remote_model_id',
    'enabled',
    'archived',
    'validation',
  ])
  const validation = object(input.validation)
  exactKeys(validation, ['status'])
  return {
    id: text(input.id),
    displayName: text(input.display_name),
    remoteModelId: text(input.remote_model_id),
    enabled: boolean(input.enabled, true),
    archived: boolean(input.archived, false),
    validation: { status: text(validation.status) },
  }
}

function providerProfile(value: unknown) {
  const input = object(value)
  exactKeys(input, [
    'id',
    'display_name',
    'kind',
    'base_url',
    'auth',
    'compat_rule',
    'enabled',
    'archived',
    'models',
  ])
  const auth = object(input.auth)
  exactKeys(auth, ['scheme', 'source', 'env_name'])
  if (!Array.isArray(input.models)) {
    throw new ProviderWebError('invalid_request', 400)
  }
  return {
    id: text(input.id),
    displayName: text(input.display_name),
    kind: text(input.kind),
    ...(optionalText(input.base_url) === undefined
      ? {}
      : { baseUrl: optionalText(input.base_url) }),
    auth: {
      scheme: text(auth.scheme),
      source: text(auth.source),
      ...(optionalText(auth.env_name) === undefined
        ? {}
        : { envName: optionalText(auth.env_name) }),
    },
    ...(optionalText(input.compat_rule) === undefined
      ? {}
      : { compatRule: optionalText(input.compat_rule) }),
    enabled: boolean(input.enabled, true),
    archived: boolean(input.archived, false),
    models: input.models.map(modelProfile),
  }
}

async function body(c: Context): Promise<Record<string, unknown>> {
  try {
    return object(await c.req.json())
  } catch (error) {
    if (error instanceof ProviderWebError) throw error
    throw new ProviderWebError('invalid_request', 400)
  }
}

function commandContext(c: Context) {
  return {
    environmentId: c.req.param('environmentId')!,
    accountId: c.get('accountId')!,
    ownerId: c.get('uuid')!,
  }
}

function failure(c: Context, error: unknown) {
  const failure =
    error instanceof ProviderWebError
      ? error
      : new ProviderWebError('invalid_request', 400)
  const response = {
    error: { type: failure.code, message: failure.code },
    ...(failure.catalog === undefined ? {} : { catalog: failure.catalog }),
    ...(failure.operationId === undefined
      ? {}
      : { operation_id: failure.operationId }),
  }
  switch (failure.status) {
    case 202:
      return c.json(response, 202)
    case 403:
      return c.json(response, 403)
    case 404:
      return c.json(response, 404)
    case 409:
      return c.json(response, 409)
    case 422:
      return c.json(response, 422)
    case 502:
      return c.json(response, 502)
    case 503:
      return c.json(response, 503)
    case 504:
      return c.json(response, 504)
    default:
      return c.json(response, 400)
  }
}

/** Poll the durable result of a provider write that exceeded the short HTTP window. */
app.get(
  '/environments/:environmentId/provider-operations/:operationId',
  uuidAuth,
  async c => {
    try {
      const environment = requireOwnedProviderEnvironment(
        c.req.param('environmentId')!,
        c.get('accountId')!,
      )
      const operationId = providerOperationId(c.req.param('operationId'))
      const command = getPersistence()
        .listEnvironmentCommands(environment.id)
        .find(candidate => candidate.operationId === operationId)
      if (!command) {
        return c.json(
          {
            error: {
              type: 'operation_not_found',
              message: 'operation_not_found',
            },
          },
          404,
        )
      }
      if (command.state === 'pending' || command.state === 'dispatched') {
        return c.json({ status: 'pending', operation_id: operationId }, 202)
      }
      if (command.state !== 'completed') {
        return c.json(
          {
            status: command.state,
            operation_id: operationId,
            error: { type: command.error ?? 'provider_operation_failed' },
          },
          409,
        )
      }
      return c.json(
        {
          status: 'completed',
          operation_id: operationId,
          result: command.result,
        },
        200,
      )
    } catch (error) {
      return failure(c, error)
    }
  },
)

app.get('/environments/:environmentId/providers', uuidAuth, async c => {
  try {
    return c.json(
      await runProviderWebCommand({
        ...commandContext(c),
        kind: 'get_provider_catalog',
        payload: {},
        forceRefresh: c.req.query('refresh') === '1',
      }),
      200,
    )
  } catch (error) {
    return failure(c, error)
  }
})

app.get(
  '/environments/:environmentId/providers/:providerId/models/discover',
  uuidAuth,
  async c => {
    try {
      return c.json(
        await runProviderWebCommand({
          ...commandContext(c),
          kind: 'discover_provider_models',
          write: true,
          payload: {
            providerId: text(c.req.param('providerId')),
          },
        }),
        200,
      )
    } catch (error) {
      return failure(c, error)
    }
  },
)

async function saveProvider(c: Context) {
  try {
    const input = await body(c)
    exactKeys(input, ['operation_id', 'expected_revision', 'provider'])
    const provider = providerProfile(input.provider)
    const routeId = c.req.param('providerId')
    if (routeId && routeId !== provider.id) {
      throw new ProviderWebError('provider_id_mismatch', 400)
    }
    return c.json(
      await runProviderWebCommand({
        ...commandContext(c),
        kind: 'save_provider_profile',
        write: true,
        payload: {
          operationId: providerOperationId(input.operation_id),
          expectedRevision: providerExpectedRevision(input.expected_revision),
          provider,
        },
      }),
      200,
    )
  } catch (error) {
    return failure(c, error)
  }
}

app.post('/environments/:environmentId/providers', uuidAuth, saveProvider)
app.patch(
  '/environments/:environmentId/providers/:providerId',
  uuidAuth,
  saveProvider,
)

app.post(
  '/environments/:environmentId/providers/:providerId/archive',
  uuidAuth,
  async c => {
    try {
      const input = await body(c)
      exactKeys(input, ['operation_id', 'expected_revision'])
      return c.json(
        await runProviderWebCommand({
          ...commandContext(c),
          kind: 'archive_provider_profile',
          write: true,
          payload: {
            operationId: providerOperationId(input.operation_id),
            expectedRevision: providerExpectedRevision(input.expected_revision),
            providerId: text(c.req.param('providerId')),
          },
        }),
        200,
      )
    } catch (error) {
      return failure(c, error)
    }
  },
)

app.delete(
  '/environments/:environmentId/providers/:providerId',
  uuidAuth,
  async c => {
    try {
      const input = await body(c)
      exactKeys(input, ['operation_id', 'expected_revision'])
      return c.json(
        await runProviderWebCommand({
          ...commandContext(c),
          kind: 'delete_provider_profile',
          write: true,
          payload: {
            operationId: providerOperationId(input.operation_id),
            expectedRevision: providerExpectedRevision(input.expected_revision),
            providerId: text(c.req.param('providerId')),
          },
        }),
        200,
      )
    } catch (error) {
      return failure(c, error)
    }
  },
)

async function saveModel(c: Context) {
  try {
    const input = await body(c)
    exactKeys(input, ['operation_id', 'expected_revision', 'model'])
    const model = modelProfile(input.model)
    const routeId = c.req.param('modelId')
    if (routeId && routeId !== model.id) {
      throw new ProviderWebError('model_id_mismatch', 400)
    }
    return c.json(
      await runProviderWebCommand({
        ...commandContext(c),
        kind: 'save_model_profile',
        write: true,
        payload: {
          operationId: providerOperationId(input.operation_id),
          expectedRevision: providerExpectedRevision(input.expected_revision),
          providerId: text(c.req.param('providerId')),
          model,
        },
      }),
      200,
    )
  } catch (error) {
    return failure(c, error)
  }
}

app.post(
  '/environments/:environmentId/providers/:providerId/models',
  uuidAuth,
  saveModel,
)
app.patch(
  '/environments/:environmentId/providers/:providerId/models/:modelId',
  uuidAuth,
  saveModel,
)

app.post(
  '/environments/:environmentId/providers/:providerId/models/:modelId/archive',
  uuidAuth,
  async c => {
    try {
      const input = await body(c)
      exactKeys(input, ['operation_id', 'expected_revision'])
      return c.json(
        await runProviderWebCommand({
          ...commandContext(c),
          kind: 'archive_model_profile',
          write: true,
          payload: {
            operationId: providerOperationId(input.operation_id),
            expectedRevision: providerExpectedRevision(input.expected_revision),
            providerId: text(c.req.param('providerId')),
            modelProfileId: text(c.req.param('modelId')),
          },
        }),
        200,
      )
    } catch (error) {
      return failure(c, error)
    }
  },
)

app.delete(
  '/environments/:environmentId/providers/:providerId/models/:modelId',
  uuidAuth,
  async c => {
    try {
      const input = await body(c)
      exactKeys(input, ['operation_id', 'expected_revision'])
      return c.json(
        await runProviderWebCommand({
          ...commandContext(c),
          kind: 'delete_model_profile',
          write: true,
          payload: {
            operationId: providerOperationId(input.operation_id),
            expectedRevision: providerExpectedRevision(input.expected_revision),
            providerId: text(c.req.param('providerId')),
            modelProfileId: text(c.req.param('modelId')),
          },
        }),
        200,
      )
    } catch (error) {
      return failure(c, error)
    }
  },
)

app.post(
  '/environments/:environmentId/providers/default',
  uuidAuth,
  async c => {
    try {
      const input = await body(c)
      exactKeys(input, [
        'operation_id',
        'expected_revision',
        'model',
        'allow_unverified',
      ])
      const selected = input.model === null ? null : object(input.model)
      if (selected) exactKeys(selected, ['provider_id', 'model_profile_id'])
      return c.json(
        await runProviderWebCommand({
          ...commandContext(c),
          kind: 'set_default_model',
          write: true,
          payload: {
            operationId: providerOperationId(input.operation_id),
            expectedRevision: providerExpectedRevision(input.expected_revision),
            model:
              selected === null
                ? null
                : {
                    providerId: text(selected.provider_id),
                    modelProfileId: text(selected.model_profile_id),
                  },
            allowUnverified: boolean(input.allow_unverified, false),
          },
        }),
        200,
      )
    } catch (error) {
      return failure(c, error)
    }
  },
)

app.post(
  '/environments/:environmentId/providers/:providerId/models/:modelId/validate',
  uuidAuth,
  async c => {
    try {
      const input = await body(c)
      exactKeys(input, ['operation_id', 'expected_revision'])
      return c.json(
        await runProviderWebCommand({
          ...commandContext(c),
          kind: 'validate_provider_model',
          write: true,
          payload: {
            operationId: providerOperationId(input.operation_id),
            expectedRevision: providerExpectedRevision(input.expected_revision),
            providerId: text(c.req.param('providerId')),
            modelProfileId: text(c.req.param('modelId')),
          },
        }),
        200,
      )
    } catch (error) {
      return failure(c, error)
    }
  },
)

async function authCommand(
  c: Context,
  kind:
    | 'begin_provider_auth'
    | 'remove_provider_auth'
    | 'refresh_provider_auth',
) {
  try {
    const input = kind === 'remove_provider_auth' ? {} : await body(c)
    exactKeys(input, ['operation_id', 'method', 'action'])
    return c.json(
      await runProviderWebCommand({
        ...commandContext(c),
        kind,
        write: true,
        payload: {
          operationId: providerOperationId(input.operation_id),
          providerId: text(c.req.param('providerId')),
          ...(optionalText(input.method) === undefined
            ? {}
            : { method: optionalText(input.method) }),
          ...(optionalText(input.action) === undefined
            ? {}
            : { action: optionalText(input.action) }),
        },
      }),
      200,
    )
  } catch (error) {
    return failure(c, error)
  }
}

app.post(
  '/environments/:environmentId/providers/:providerId/auth/begin',
  uuidAuth,
  c => authCommand(c, 'begin_provider_auth'),
)
app.delete(
  '/environments/:environmentId/providers/:providerId/auth',
  uuidAuth,
  c => authCommand(c, 'remove_provider_auth'),
)
app.post(
  '/environments/:environmentId/providers/:providerId/auth/refresh',
  uuidAuth,
  c => authCommand(c, 'refresh_provider_auth'),
)

app.post(
  '/environments/:environmentId/providers/:providerId/auth/secret/begin',
  uuidAuth,
  async c => {
    try {
      const input = await body(c)
      exactKeys(input, ['operation_id', 'method'])
      return c.json(
        await runProviderWebCommand({
          ...commandContext(c),
          kind: 'begin_provider_secret',
          write: true,
          payload: {
            operationId: providerOperationId(input.operation_id),
            providerId: text(c.req.param('providerId')),
            method: text(input.method),
          },
        }),
        200,
      )
    } catch (error) {
      return failure(c, error)
    }
  },
)

app.post(
  '/environments/:environmentId/providers/:providerId/auth/secret',
  uuidAuth,
  async c => {
    let relayId: string | undefined
    try {
      const input = await body(c)
      exactKeys(input, ['operation_id', 'method', 'envelope'])
      const operationId = providerOperationId(input.operation_id)
      const providerId = text(c.req.param('providerId'))
      const context = commandContext(c)
      requireOwnedProviderEnvironment(
        context.environmentId,
        context.accountId,
        true,
      )
      relayId = providerSecretRelay.put({
        environmentId: context.environmentId,
        providerId,
        operationId,
        envelope: object(input.envelope),
      })
      return c.json(
        await runProviderWebCommand({
          ...context,
          kind: 'begin_provider_secret',
          write: true,
          payload: {
            operationId,
            providerId,
            method: text(input.method),
            action: relayId,
          },
        }),
        200,
      )
    } catch (error) {
      return failure(c, error)
    } finally {
      if (relayId) providerSecretRelay.delete(relayId)
    }
  },
)

app.get(
  '/environments/:environmentId/provider-auth/:authOperationId',
  uuidAuth,
  async c => {
    try {
      return c.json(
        await runProviderWebCommand({
          ...commandContext(c),
          kind: 'get_provider_auth_status',
          payload: { authOperationId: text(c.req.param('authOperationId')) },
        }),
        200,
      )
    } catch (error) {
      return failure(c, error)
    }
  },
)

for (const [suffix, kind] of [
  ['code', 'submit_provider_auth_code'],
  ['cancel', 'cancel_provider_auth'],
] as const) {
  app.post(
    `/environments/:environmentId/provider-auth/:authOperationId/${suffix}`,
    uuidAuth,
    async c => {
      try {
        const input = await body(c)
        exactKeys(input, kind === 'submit_provider_auth_code' ? ['code'] : [])
        return c.json(
          await runProviderWebCommand({
            ...commandContext(c),
            kind,
            payload: {
              authOperationId: text(c.req.param('authOperationId')),
              ...(kind === 'submit_provider_auth_code'
                ? { code: text(input.code) }
                : {}),
            },
          }),
          200,
        )
      } catch (error) {
        return failure(c, error)
      }
    },
  )
}

export default app
