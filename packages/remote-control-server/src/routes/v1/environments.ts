import { Hono } from 'hono'
import {
  registerEnvironment,
  deregisterEnvironment,
  reconnectEnvironment,
} from '../../services/environment'
import {
  apiKeyAuth,
  acceptCliHeaders,
  environmentLeaseAuth,
} from '../../auth/middleware'
import { storeBindSession } from '../../store'
import { reconnectWorkForEnvironment } from '../../services/work-dispatch'

const app = new Hono()

/** POST /v1/environments/bridge — Register an environment */
app.post('/bridge', acceptCliHeaders, apiKeyAuth, async c => {
  const body = await c.req.json()
  const username = c.get('username')
  const accountId = c.get('accountId')
  const result = registerEnvironment({ ...body, username, accountId })
  // Bind ACP session to the group ID so the web UI can find it by group
  if (result.session_id) {
    const groupId = body.bridge_id as string | undefined
    if (groupId) {
      storeBindSession(result.session_id, groupId)
    }
  }
  // Stable bridge registration represents a new connection lease. Requeue
  // durable idle sessions immediately so messages accepted while the worker
  // was offline are dispatched without requiring a second reconnect request.
  if (result.lease_token) {
    await reconnectWorkForEnvironment(result.environment_id)
  }
  return c.json(result, 200)
})

/** DELETE /v1/environments/bridge/:id — Deregister */
app.delete(
  '/bridge/:id',
  acceptCliHeaders,
  apiKeyAuth,
  environmentLeaseAuth,
  async c => {
    const envId = c.req.param('id')!
    deregisterEnvironment(envId)
    return c.json({ status: 'ok' }, 200)
  },
)

/** POST /v1/environments/:id/bridge/reconnect — Reconnect */
app.post(
  '/:id/bridge/reconnect',
  acceptCliHeaders,
  apiKeyAuth,
  environmentLeaseAuth,
  async c => {
    const envId = c.req.param('id')!
    reconnectEnvironment(envId)
    await reconnectWorkForEnvironment(envId)
    return c.json({ status: 'ok' }, 200)
  },
)

export default app
