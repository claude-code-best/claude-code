import { Hono } from 'hono'
import {
  createCodeSession,
  getSession,
  incrementEpoch,
} from '../../services/session'
import { apiKeyAuth, acceptCliHeaders } from '../../auth/middleware'
import { generateWorkerJwt } from '../../auth/jwt'
import { getBaseUrl, config } from '../../config'

const app = new Hono()

/** POST /v1/code/sessions — Create code session (wrapped response for TUI compat) */
app.post('/', acceptCliHeaders, apiKeyAuth, async c => {
  const body = await c.req.json()
  const session = createCodeSession(body)
  return c.json({ session }, 200)
})

/** POST /v1/code/sessions/:id/bridge — Get connection info + worker JWT */
app.post('/:id/bridge', acceptCliHeaders, apiKeyAuth, async c => {
  const sessionId = c.req.param('id')!
  const session = getSession(sessionId)
  if (!session) {
    return c.json(
      { error: { type: 'not_found', message: 'Session not found' } },
      404,
    )
  }

  const epoch = incrementEpoch(sessionId)
  const expiresInSeconds = config.jwtExpiresIn
  const workerJwt = generateWorkerJwt(sessionId, expiresInSeconds)

  return c.json(
    {
      api_base_url: getBaseUrl(),
      worker_epoch: epoch,
      worker_jwt: workerJwt,
      expires_in: expiresInSeconds,
    },
    200,
  )
})

export default app
