import { Hono } from 'hono'
import { uuidAuth } from '../../auth/middleware'
import { listActiveEnvironmentsByAccountIdResponse } from '../../services/environment'

const app = new Hono()

/** GET /web/environments — List active environments owned by this Web account. */
app.get('/environments', uuidAuth, async c => {
  const envs = listActiveEnvironmentsByAccountIdResponse(c.get('accountId')!)
  return c.json(envs, 200)
})

export default app
