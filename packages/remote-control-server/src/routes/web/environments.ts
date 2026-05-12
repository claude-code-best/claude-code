import { Hono } from 'hono'
import { uuidAuth } from '../../auth/middleware'
import { listActiveEnvironmentsResponse } from '../../services/environment'

const app = new Hono()

/** GET /web/environments — List active environments (UUID-based, no user filtering) */
app.get('/environments', uuidAuth, async c => {
  // Environments are shared across all UUIDs for now
  const envs = listActiveEnvironmentsResponse()
  return c.json(envs, 200)
})

export default app
