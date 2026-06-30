import { nanoid } from 'nanoid'

// TOKEN 通过 `wrangler secret put TOKEN` 注入，wrangler types 不为 secret 生成类型
// 所以这里显式扩展全局 Env（与 worker-configuration.d.ts 合并）
declare global {
  interface Env {
    TOKEN: string
  }
}

const HASH_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const TTL_PREFIXES = ['7d', '30d']
const ALLOWED_TTLS = [7, 30]
const HTML_CONTENT_TYPE = 'text/html; charset=utf-8'
// GET /<prefix>/<id>.html —— prefix 与 lifecycle rule 对应，限制只能是 7d 或 30d
const GET_PATH_PATTERN = /^\/(7d|30d)\/([A-Za-z0-9_-]{1,128})\.html$/

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)

    if (req.method === 'GET') {
      return handleGet(url, env)
    }
    if (url.pathname === '/upload' && req.method === 'POST') {
      return handleUpload(req, env, url)
    }
    return json({ error: 'not_found' }, 404)
  },
} satisfies ExportedHandler<Env>

// GET /7d/<id>.html 或 /30d/<id>.html —— 从 R2 读，返回 text/html
async function handleGet(url: URL, env: Env): Promise<Response> {
  const match = GET_PATH_PATTERN.exec(url.pathname)
  if (!match) {
    return json({ error: 'not_found' }, 404)
  }
  const [, prefix, id] = match
  const obj = await env.BUCKET.get(`${prefix}/${id}.html`)
  if (obj === null) {
    return new Response('Not Found', { status: 404 })
  }
  const headers = new Headers()
  obj.writeHttpMetadata(headers)
  headers.set('content-type', HTML_CONTENT_TYPE)
  headers.set('cache-control', 'public, max-age=86400')
  return new Response(obj.body, { headers, status: 200 })
}

async function handleUpload(
  req: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!env.TOKEN || !token || token !== env.TOKEN) {
    return json({ error: 'unauthorized' }, 401)
  }

  const contentType = (req.headers.get('content-type') ?? '').toLowerCase()
  if (!contentType.startsWith('text/html')) {
    return json({ error: 'unsupported_media_type' }, 415)
  }

  const maxBytes = Number.parseInt(env.MAX_BYTES, 10) || 10 * 1024 * 1024
  const declaredLength = Number.parseInt(
    req.headers.get('content-length') ?? '',
    10,
  )
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return json({ error: 'payload_too_large' }, 413)
  }

  const defaultTtl = Number.parseInt(env.DEFAULT_TTL_DAYS, 10) || 7
  const ttlParam = url.searchParams.get('ttl')
  const ttl = ttlParam === null ? defaultTtl : Number.parseInt(ttlParam, 10)
  if (!Number.isFinite(ttl) || !ALLOWED_TTLS.includes(ttl)) {
    return json({ error: 'invalid_ttl' }, 400)
  }

  const hashParam = url.searchParams.get('hash')
  let id: string
  if (hashParam !== null) {
    if (!HASH_PATTERN.test(hashParam)) {
      return json({ error: 'invalid_hash' }, 400)
    }
    id = hashParam
    // 覆盖：先删所有 ttl prefix 下可能的旧 key（R2 delete 不存在的 key 不报错）
    await Promise.all(
      TTL_PREFIXES.map(p => env.BUCKET.delete(`${p}/${id}.html`)),
    )
  } else {
    id = nanoid(21)
  }

  const body = await req.arrayBuffer()
  if (body.byteLength > maxBytes) {
    return json({ error: 'payload_too_large' }, 413)
  }

  const key = `${ttl}d/${id}.html`
  await env.BUCKET.put(key, body, {
    httpMetadata: { contentType: HTML_CONTENT_TYPE },
  })

  const expiresAt = new Date(Date.now() + ttl * 24 * 60 * 60 * 1000)
  return json(
    { id, url: `${env.PUBLIC_URL}/${key}`, expiresAt: expiresAt.toISOString() },
    200,
  )
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
