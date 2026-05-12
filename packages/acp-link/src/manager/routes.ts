import { Hono } from 'hono'
import type { ProcessManager } from './manager.js'
import { MANAGER_HTML } from './html.js'

function logReq(method: string, path: string, status?: number) {
  const ts = new Date().toISOString()
  const suffix = status != null ? ` -> ${status}` : ''
  console.log(`[${ts}] [http] ${method} ${path}${suffix}`)
}

export function createApp(manager: ProcessManager): Hono {
  const app = new Hono()

  app.get('/', c => {
    logReq('GET', '/', 200)
    return c.html(MANAGER_HTML)
  })

  app.get('/api/instances', c => {
    const list = manager.list()
    logReq('GET', '/api/instances', 200)
    return c.json(list)
  })

  app.post('/api/instances', async c => {
    let body: { group?: string; command?: string }
    try {
      body = await c.req.json<{ group?: string; command?: string }>()
    } catch {
      logReq('POST', '/api/instances', 400)
      return c.json({ error: 'invalid JSON body' }, 400)
    }
    if (!body.group?.trim() || !body.command?.trim()) {
      logReq('POST', '/api/instances', 400)
      return c.json({ error: 'group and command are required' }, 400)
    }
    const instance = manager.create(body.group.trim(), body.command.trim())
    logReq('POST', `/api/instances group=${body.group}`, 201)
    return c.json(
      {
        id: instance.id,
        group: instance.group,
        command: instance.command,
        status: instance.status,
        pid: instance.pid,
        startTime: instance.startTime,
        exitCode: instance.exitCode,
      },
      201,
    )
  })

  app.post('/api/instances/:id/stop', c => {
    const id = c.req.param('id')
    const inst = manager.get(id)
    if (!inst) {
      logReq('POST', `/api/instances/${id.slice(0, 8)}/stop`, 404)
      return c.json({ error: 'not found' }, 404)
    }
    if (inst.status !== 'running') {
      logReq('POST', `/api/instances/${id.slice(0, 8)}/stop`, 400)
      return c.json({ error: 'not running' }, 400)
    }
    manager.stop(inst.id)
    logReq('POST', `/api/instances/${id.slice(0, 8)}/stop`, 200)
    return c.json({ ok: true })
  })

  app.delete('/api/instances/:id', c => {
    const id = c.req.param('id')
    const inst = manager.get(id)
    if (!inst) {
      logReq('DELETE', `/api/instances/${id.slice(0, 8)}`, 404)
      return c.json({ error: 'not found' }, 404)
    }
    if (inst.status === 'running') {
      logReq('DELETE', `/api/instances/${id.slice(0, 8)}`, 400)
      return c.json({ error: 'still running' }, 400)
    }
    manager.remove(inst.id)
    logReq('DELETE', `/api/instances/${id.slice(0, 8)}`, 200)
    return c.json({ ok: true })
  })

  app.get('/api/instances/:id/logs', c => {
    const id = c.req.param('id')
    const inst = manager.get(id)
    if (!inst) {
      logReq('GET', `/api/instances/${id.slice(0, 8)}/logs`, 404)
      return c.json({ error: 'not found' }, 404)
    }
    logReq('GET', `/api/instances/${id.slice(0, 8)}/logs SSE`)

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()

        const send = (data: string) => {
          try {
            controller.enqueue(encoder.encode(data))
          } catch {
            // stream closed
          }
        }

        // send historical logs
        for (const log of inst.logs) {
          send(`data: ${JSON.stringify(log)}\n\n`)
        }

        // subscribe to new logs
        const unsub = manager.subscribe(inst.id, entry => {
          send(`data: ${JSON.stringify(entry)}\n\n`)
        })

        // keepalive every 15s
        const keepalive = setInterval(() => {
          send(': keepalive\n\n')
        }, 15000)

        const cleanup = () => {
          unsub()
          clearInterval(keepalive)
          logReq('SSE', `/api/instances/${id.slice(0, 8)}/logs closed`)
          try {
            controller.close()
          } catch {
            // already closed
          }
        }

        c.req.raw.signal.addEventListener('abort', cleanup, { once: true })
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  })

  // Catch-all: log unmatched routes for debugging
  app.all('*', c => {
    logReq(c.req.method, c.req.path, 404)
    return c.json({ error: 'not found', path: c.req.path }, 404)
  })

  return app
}
