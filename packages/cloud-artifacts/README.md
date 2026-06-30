# cloud-artifacts

> **生产出口**：`https://cloud-artifacts.claude-code-best.win`
>
> 服务端（CLI / RCS 后台）通过单一 bearer token 上传 HTML，得到一个公开可访问的 URL。
> 文件到期由 R2 lifecycle rule 自动删除（默认 7 天，最长 30 天）。

## Quickstart

```bash
# 上传一份 html（默认随机 ID + 7 天 TTL）
echo '<h1>hello</h1>' > /tmp/t.html
curl -X POST "https://cloud-artifacts.claude-code-best.win/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: text/html" \
  --data-binary @/tmp/t.html
# {"id":"V1StGXR8_Z5jdHi6B-myT",
#  "url":"https://cloud-artifacts.claude-code-best.win/7d/V1StGXR8_Z5jdHi6B-myT.html",
#  "expiresAt":"2026-06-27T10:00:00.000Z"}

# 任何人拿到 url 都能访问
curl "https://cloud-artifacts.claude-code-best.win/7d/V1StGXR8_Z5jdHi6B-myT.html"
```

## 架构

```
                           ┌──────────────────────────┐
客户端  --POST /upload----▶│  Deno Deploy 边缘代理     │
                          │  cloud-artifacts.ccb.win  │
                          └────────────┬─────────────┘
                                       │ 透传
                                       ▼
                          ┌──────────────────────────┐
                          │  Cloudflare Worker        │
                          │  - 鉴权 + MIME + 大小校验  │
                          │  - ttl∈{7,30} + hash 校验 │
                          │  - R2 put / R2 get        │
                          └────────────┬─────────────┘
                                       │
                                       ▼
                          ┌──────────────────────────┐
                          │  R2 bucket                │
                          │  key: <7d|30d>/<id>.html  │
                          │  lifecycle:               │
                          │    7d/  -> expire 7 days  │
                          │    30d/ -> expire 30 days │
                          └──────────────────────────┘
```

- **POST /upload**：Bearer 鉴权 → text/html 校验 → 10MB 上限 → ttl ∈ {7,30} → R2 put
- **GET /<7d\|30d>/<id>.html**：Worker 从 R2 读 → 返回 `text/html; charset=utf-8` + `Cache-Control: public, max-age=86400`
- **TTL**：R2 prefix + lifecycle rule 实现，Worker 不参与过期处理（零额外代码）
- **覆盖**：指定 `?hash=` 时，先删 `7d/<hash>.html` 和 `30d/<hash>.html` 旧 key，再写新 key
- **ID**：默认 `nanoid(21)`（126 bit 熵），可指定 `?hash=<custom-id>`

## 为什么套一层 Deno Deploy

国内直连 Cloudflare Workers 边缘节点延迟高、丢包严重（DNS 污染 + 路由问题）。在 `cloud-artifacts.claude-code-best.win` 上套 Deno Deploy 边缘代理后：

- 国内访问延迟显著降低（Deno Deploy 在国内可达性好）
- POST/GET body 完整透传
- **副作用**：Deno Deploy 代理会把上游 HTTP status code 抹平为 200（但 body 内的 `{error: ...}` 字段完整保留）。客户端若依赖 status code 判断错误类型，应改为解析 body 中的 `error` 字段。直连 Worker 自身（如 `*.workers.dev`）时 status code 正常透传。

## API

### `POST /upload`

| Header / Query | 必填 | 说明 |
|----------------|------|------|
| `Authorization: Bearer <TOKEN>` | 是 | 与 Worker secret `TOKEN` 完全相等 |
| `Content-Type: text/html` | 是 | 不接受其他类型 |
| `?ttl=7\|30` | 否 | 默认 7，**只允许 7 或 30**（与 R2 lifecycle prefix 对应） |
| `?hash=<custom-id>` | 否 | 自定义 ID，校验 `^[A-Za-z0-9_-]{1,128}$`；指定时覆盖同 ID 旧版本 |
| body | 是 | 原始 HTML（`--data-binary @file.html`），≤10MB |

成功 200：

```json
{
  "id": "V1StGXR8_Z5jdHi6B-myT",
  "url": "https://cloud-artifacts.claude-code-best.win/7d/V1StGXR8_Z5jdHi6B-myT.html",
  "expiresAt": "2026-06-27T10:00:00.000Z"
}
```

错误（统一 `{ "error": "<code>" }`，状态码见下）：

| 状态码（直连） | error code | 触发条件 |
|--------|------------|----------|
| 400 | `invalid_ttl` | `ttl` 非 7 或 30 |
| 400 | `invalid_hash` | `hash` 不匹配 `^[A-Za-z0-9_-]{1,128}$` |
| 401 | `unauthorized` | 缺 Authorization / token 不匹配 |
| 404 | `not_found` | 非 `/upload` 路径或 GET 路径不匹配 `/<7d\|30d>/<id>.html` |
| 413 | `payload_too_large` | body > 10MB |
| 415 | `unsupported_media_type` | Content-Type 非 `text/html` |

> **经 Deno Deploy 代理时**：以上所有错误状态码统一返回 **200**，但 body 仍是上表中的 `{error: ...}` JSON。客户端解析逻辑应以 body 的 `error` 字段为准。

### `GET /<ttl-prefix>/<id>.html`

`ttl-prefix` 只能是 `7d` 或 `30d`（其他路径返回 404/not_found）。返回 `text/html; charset=utf-8` + `Cache-Control: public, max-age=86400`。任何人拿到 URL 都可访问，hash 即秘密。

## 示例

```bash
# 默认随机 ID + 7 天
curl -X POST "https://cloud-artifacts.claude-code-best.win/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: text/html" \
  --data-binary @/tmp/t.html

# 自定义 hash + 30 天（再次上传同 hash 覆盖）
curl -X POST "https://cloud-artifacts.claude-code-best.win/upload?ttl=30&hash=my-report" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: text/html" \
  --data-binary @/tmp/report.html

# 访问
curl "https://cloud-artifacts.claude-code-best.win/7d/V1StGXR8_Z5jdHi6B-myT.html"
```

## 覆盖语义

指定 `?hash=` 时：

1. 校验 hash 字符集（`^[A-Za-z0-9_-]{1,128}$`）
2. 删除 `7d/<hash>.html` 和 `30d/<hash>.html` 两个 key（R2 delete 不存在的 key 不报错，零成本）
3. 按 `?ttl=` 写入新 key
4. 返回新的 `expiresAt`

不指定 `?hash=` 时：用 `nanoid(21)` 随机 ID，几乎不可能碰撞，不做碰撞检查。

## 部署

前置：本机已 `npx wrangler login` 登录目标 Cloudflare 账号。Deno Deploy 代理层由部署者另配（CNAME `cloud-artifacts.<your-domain>` → `alias.deno.net`，并在 Deno Deploy 项目里把上游设为 `https://<worker>.<account>.workers.dev`）。

```bash
cd packages/cloud-artifacts
bun install                          # 在 monorepo 根执行也行（workspace 自动识别）

cp .dev.vars.example .dev.vars       # 填本地 dev 用的 TOKEN（仅 wrangler dev 读）
bun run setup                        # 创建 bucket + 加 lifecycle rule + 设生产 TOKEN secret

# 绑 Worker custom domain（如要在 Cloudflare 直连域名上访问）：
#   Dashboard: Workers & Pages > cloud-artifacts > Settings > Domains & Routes > Add > Custom Domain

# 改 wrangler.toml 中 [vars] PUBLIC_URL 为对外出口域名（生产用 https://cloud-artifacts.claude-code-best.win）

bun run deploy
```

## 测试

`scripts/test.sh` 覆盖 7 个错误用例 + 3 个成功用例 + R2 写入验证。**支持双模式**：直连 Worker 时按 HTTP status code 断言；经 Deno Deploy 代理（status 抹平为 200）时自动按 body 的 `error` 字段断言（标记 `[via body]`）。

```bash
WORKER_URL=https://cloud-artifacts.claude-code-best.win \
TOKEN=<your-token> \
bash scripts/test.sh
```

## 本地开发

```bash
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars 填 TOKEN

bun run dev                          # wrangler dev，启动本地 Miniflare + 本地 R2 模拟
curl -X POST "http://localhost:8787/upload" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: text/html" \
  --data-binary @/tmp/t.html
```

## 安全注意事项

- **TOKEN 是上传侧唯一鉴权**：值泄露后任何人可上传/覆盖。生产应使用 ≥32 字符的随机串，定期轮换（`wrangler secret put TOKEN` 即时生效，无需 redeploy）。
- **GET 完全公开**：URL 形如 `/<ttl>/<id>.html`，hash（21 字符 nanoId）即唯一秘密。不要把 URL 贴到公开频道再期望它"私密"。
- **覆盖即写**：知道 hash 的任何持 token 者都能覆盖该 ID 的内容。若需要"创建后不可改"语义，应在客户端自行约束（不传 `?hash=`）。
- **不校验 HTML 内容**：上传的 html 会被原样返回，浏览器渲染时会执行其中的 `<script>`。本服务定位是"托管自己产出的 html"，不要作为任意用户上传入口。
- **TTL 上限 30 天**：lifecycle rule 是 prefix 级全局规则，所有对象最多保留 30 天，无法延长。

## Troubleshooting

| 现象 | 原因 / 处理 |
|------|-------------|
| 所有请求返 HTTP 200 但业务出错 | 经 Deno Deploy 代理时正常现象，看 body 的 `error` 字段判断真实状态 |
| `curl` 到 `*.workers.dev` 超时 | 国内 DNS 污染 + 路由问题，走 `cloud-artifacts.claude-code-best.win` 出口或挂代理 |
| 响应 html 多一段 `<a href="/cdn-cgi/content...">` 和 `<script>` | Cloudflare 默认注入的 Browser Insights（RUM），不影响内容渲染。要纯净响应：dashboard → Workers & Pages → cloud-artifacts → 关 Web Analytics |
| 上传 413 但文件不到 10MB | 检查 `Content-Length` header 是否被中间层改写；Worker 同时按 `Content-Length` 和 `arrayBuffer().byteLength` 双重校验 |
| `?ttl=14` 返 400 | 设计如此，只允许 7 或 30（对应 R2 lifecycle prefix） |
| `wrangler secret list` 看到 TOKEN 但上传 401 | token 值不一致。重新 `wrangler secret put TOKEN` 设正确值 |

## 依赖

- `wrangler` ^4 — Cloudflare Workers CLI
- `nanoid` ^5 — ID 生成（纯 ESM，Worker 兼容）

## 不被主 CLI 引用

这是独立 Cloudflare Worker 服务，类似 `packages/remote-control-server/` 的定位。Monorepo 根 `package.json` 的 `workspaces: ["packages/*", ...]` 自动识别本包，但主 CLI 不会 import 它。
