import { Hono } from 'hono'
import {
  pollWork,
  ackWork,
  stopWork,
  releaseWork,
  heartbeatWork,
  markControlLaneReady,
} from '../../services/work-dispatch'
import {
  apiKeyAuth,
  acceptCliHeaders,
  environmentLeaseAuth,
} from '../../auth/middleware'
import { updatePollTime } from '../../services/environment'
import { completeEnvironmentCommand } from '../../services/environment-command'

const app = new Hono()

/** GET /v1/environments/:id/work/poll — Long-poll for work */
app.get(
  '/:id/work/poll',
  acceptCliHeaders,
  apiKeyAuth,
  environmentLeaseAuth,
  async c => {
    const envId = c.req.param('id')!
    updatePollTime(envId)
    const rawLane = c.req.query('lane')
    const lane =
      rawLane === 'control' || rawLane === 'session' ? rawLane : 'mixed'
    // A mixed poll still services the control queue first. It therefore
    // establishes the control lane while capacity is available; only a
    // session-only poll must not satisfy the readiness contract.
    if (lane !== 'session') markControlLaneReady(envId)
    const result = await pollWork(envId, undefined, lane)
    if (!result) {
      // Return 204 No Content so the client's axios parses it as null
      return c.body(null, 204)
    }
    return c.json(result, 200)
  },
)

/** POST /v1/environments/:id/work/:workId/result — Complete a durable environment command. */
app.post(
  '/:id/work/:workId/result',
  acceptCliHeaders,
  apiKeyAuth,
  environmentLeaseAuth,
  async c => {
    let body: { result?: unknown; error?: unknown }
    try {
      body = await c.req.json()
    } catch {
      return c.json(
        { error: { type: 'invalid_request', message: 'Invalid JSON body' } },
        400,
      )
    }

    const hasResult = Object.hasOwn(body, 'result')
    const hasError = Object.hasOwn(body, 'error')
    if (
      hasResult === hasError ||
      (hasError && typeof body.error !== 'string')
    ) {
      return c.json(
        {
          error: {
            type: 'invalid_request',
            message: 'Provide exactly one of result or error',
          },
        },
        400,
      )
    }

    try {
      const command = completeEnvironmentCommand({
        commandId: c.req.param('workId')!,
        environmentId: c.req.param('id')!,
        ...(hasResult
          ? { result: body.result }
          : { error: body.error as string }),
      })
      return c.json({ status: 'ok', state: command.state }, 200)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const status = message.includes('not found') ? 404 : 409
      return c.json(
        {
          error: {
            type: status === 404 ? 'not_found' : 'conflict',
            message,
          },
        },
        status,
      )
    }
  },
)

/** POST /v1/environments/:id/work/:workId/ack — Acknowledge work */
app.post(
  '/:id/work/:workId/ack',
  acceptCliHeaders,
  apiKeyAuth,
  environmentLeaseAuth,
  async c => {
    const workId = c.req.param('workId')!
    ackWork(workId)
    return c.json({ status: 'ok' }, 200)
  },
)

/** POST /v1/environments/:id/work/:workId/stop — Stop work */
app.post(
  '/:id/work/:workId/stop',
  acceptCliHeaders,
  apiKeyAuth,
  environmentLeaseAuth,
  async c => {
    const workId = c.req.param('workId')!
    stopWork(workId)
    return c.json({ status: 'ok' }, 200)
  },
)

/** POST /.../release — release a failed session startup without consuming input. */
app.post(
  '/:id/work/:workId/release',
  acceptCliHeaders,
  apiKeyAuth,
  environmentLeaseAuth,
  async c => {
    let body: {
      failure?: { code?: unknown; message?: unknown; retryable?: unknown }
    } = {}
    try {
      body = await c.req.json()
    } catch {
      return c.json(
        { error: { type: 'invalid_request', message: 'Invalid JSON body' } },
        400,
      )
    }
    const failure = body.failure
    if (
      !failure ||
      typeof failure.code !== 'string' ||
      typeof failure.message !== 'string' ||
      typeof failure.retryable !== 'boolean'
    ) {
      return c.json(
        { error: { type: 'invalid_request', message: 'failure is required' } },
        400,
      )
    }
    const released = releaseWork(c.req.param('workId')!, {
      code: failure.code,
      message: failure.message,
      retryable: failure.retryable,
    })
    return c.json({ status: released ? 'released' : 'already_complete' }, 200)
  },
)

/** POST /v1/environments/:id/work/:workId/heartbeat — Heartbeat */
app.post(
  '/:id/work/:workId/heartbeat',
  acceptCliHeaders,
  apiKeyAuth,
  environmentLeaseAuth,
  async c => {
    const workId = c.req.param('workId')!
    const result = heartbeatWork(workId)
    return c.json(result, 200)
  },
)

export default app
