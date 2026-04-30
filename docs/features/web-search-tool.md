# WEB_SEARCH_TOOL — 网页搜索工具

> 实现状态：适配器架构完成，支持 API / Bing / Brave 三种后端
> 引用数：核心工具，无 feature flag 门控（始终启用）

## 一、功能概述

WebSearchTool 让模型可以搜索互联网获取最新信息。原始实现仅支持 Anthropic API 服务端搜索（`web_search_20250305` server tool），在第三方代理端点下不可用。现已重构为适配器架构，支持 API 服务端搜索，以及 Bing / Brave 两个 HTML 解析后端，确保任何 API 端点都能使用搜索功能。

## 二、实现架构

### 2.1 适配器模式

```
WebSearchTool.call()
       │
       ▼
  createAdapter()  ← 适配器工厂
       │
       ├── ApiSearchAdapter  — Anthropic 官方 API 服务端搜索
       │     └── 使用 web_search_20250305 server tool
       │         通过 queryModelWithStreaming 二次调用 API
       │
       ├── BingSearchAdapter  — Bing HTML 抓取 + 正则提取
       │     └── 直接抓取 Bing 搜索页 HTML
       │         正则提取 b_algo 块中的标题/URL/摘要
       │
       └── BraveSearchAdapter — Brave LLM Context API
             └── 调用 Brave HTTPS GET 接口
                 将 grounding payload 映射为标题/URL/摘要
```

### 2.2 模块结构

| 模块 | 文件 | 说明 |
|------|------|------|
| 工具入口 | `packages/builtin-tools/src/tools/WebSearchTool/WebSearchTool.ts` | `buildTool()` 定义：schema、权限、执行、输出格式化 |
| 工具 prompt | `packages/builtin-tools/src/tools/WebSearchTool/prompt.ts` | 搜索工具的系统提示词 |
| UI 渲染 | `packages/builtin-tools/src/tools/WebSearchTool/UI.tsx` | 搜索结果的终端渲染组件 |
| 适配器接口 | `packages/builtin-tools/src/tools/WebSearchTool/adapters/types.ts` | `WebSearchAdapter` 接口、`SearchResult`/`SearchOptions`/`SearchProgress` 类型 |
| 适配器工厂 | `packages/builtin-tools/src/tools/WebSearchTool/adapters/index.ts` | `createAdapter()` 工厂函数，选择后端 |
| API 适配器 | `packages/builtin-tools/src/tools/WebSearchTool/adapters/apiAdapter.ts` | 封装原有 `queryModelWithStreaming` 逻辑，使用 server tool |
| Bing 适配器 | `packages/builtin-tools/src/tools/WebSearchTool/adapters/bingAdapter.ts` | Bing HTML 抓取 + 正则解析 |
| Brave 适配器 | `packages/builtin-tools/src/tools/WebSearchTool/adapters/braveAdapter.ts` | Brave LLM Context API 适配与结果映射 |
| 单元测试 | `packages/builtin-tools/src/tools/WebSearchTool/__tests__/bingAdapter.test.ts`, `packages/builtin-tools/src/tools/WebSearchTool/__tests__/braveAdapter*.test.ts`, `packages/builtin-tools/src/tools/WebSearchTool/__tests__/adapterFactory.test.ts` | Bing / Brave 解析与工厂逻辑测试 |
| 集成测试 | `packages/builtin-tools/src/tools/WebSearchTool/__tests__/bingAdapter.integration.ts`, `packages/builtin-tools/src/tools/WebSearchTool/__tests__/braveAdapter.integration.ts` | 真实网络请求验证 |

### 2.3 数据流

```
模型调用 WebSearchTool(query, allowed_domains, blocked_domains)
       │
       ▼
  validateInput() — 校验 query 非空、allowed/block 不共存
       │
       ▼
  createAdapter() → ApiSearchAdapter | BingSearchAdapter | BraveSearchAdapter
       │
       ▼
  adapter.search(query, { allowedDomains, blockedDomains, signal, onProgress })
       │
       ├── onProgress({ type: 'query_update', query })
       │
       ├── axios.get(search-engine-url)
       │     └── API 鉴权请求头
       │
       ├── extractResults(payload) — 按后端提取结果
       │     └── grounding → SearchResult[] 映射
       │
       ├── 客户端域名过滤 (allowedDomains / blockedDomains)
       │
       ├── onProgress({ type: 'search_results_received', resultCount })
       │
       ▼
  格式化为 markdown 链接列表返回给模型
```

## 三、Bing 适配器技术细节

### 3.1 反爬绕过

使用 13 个 Edge 浏览器请求头（含 `Sec-Ch-Ua`、`Sec-Fetch-*` 等），避免 Bing 返回 JS 渲染的空页面：

```typescript
const BROWSER_HEADERS = {
  'User-Agent': '...Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  'Sec-Ch-Ua': '"Microsoft Edge";v="131", "Chromium";v="131", ...',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  // ... 共 13 个标头
}
```

`setmkt=en-US` 参数强制美式英语市场，避免 IP 地理定位导致区域化结果。

### 3.2 URL 解码（`resolveBingUrl()`）

Bing 返回的重定向 URL 格式：`bing.com/ck/a?...&u=a1aHR0cHM6Ly9...`

- `u` 参数前 2 字符为协议前缀：`a1` = https，`a0` = http
- 剩余部分为 base64url 编码的真实 URL
- Bing 内部链接和相对路径被过滤返回 `undefined`

### 3.3 摘要提取（`extractSnippet()`）

三级降级策略：

1. `<p class="b_lineclamp...">` — Bing 的搜索摘要段落
2. `<div class="b_caption">` 内的 `<p>` — 备选摘要位置
3. `<div class="b_caption">` 直接文本 — 最终 fallback

### 3.4 域名过滤

客户端侧实现，支持子域名匹配：
- `allowedDomains`：白名单，结果域名必须匹配列表中的某项（含子域名）
- `blockedDomains`：黑名单，匹配的结果被过滤
- 两者不可同时使用（`validateInput` 校验）

## 四、适配器选择逻辑

`createAdapter()` 按以下优先级选择后端，并按选中的后端 key 缓存适配器实例：

```typescript
export function createAdapter(): WebSearchAdapter {
  // 1. WEB_SEARCH_ADAPTER=api|bing|brave 显式指定
  // 2. Anthropic 官方 API Base URL → ApiSearchAdapter
  // 3. 第三方代理 / 非官方端点 → BingSearchAdapter
}
```

显式指定 `WEB_SEARCH_ADAPTER=brave` 时，会改用 Brave LLM Context API 后端，并要求
`BRAVE_SEARCH_API_KEY` 或 `BRAVE_API_KEY`。

## 五、接口定义

### WebSearchAdapter

```typescript
interface WebSearchAdapter {
  search(query: string, options: SearchOptions): Promise<SearchResult[]>
}

interface SearchResult {
  title: string
  url: string
  snippet?: string
}

interface SearchOptions {
  allowedDomains?: string[]
  blockedDomains?: string[]
  signal?: AbortSignal
  onProgress?: (progress: SearchProgress) => void
}

interface SearchProgress {
  type: 'query_update' | 'search_results_received'
  query?: string
  resultCount?: number
}
```

### 工具 Input Schema

```typescript
{
  query: string              // 搜索关键词，最少 2 字符
  allowed_domains?: string[] // 域名白名单
  blocked_domains?: string[] // 域名黑名单
}
```

## 六、文件索引

| 文件 | 职责 |
|------|------|
| `packages/builtin-tools/src/tools/WebSearchTool/WebSearchTool.ts` | 工具定义入口 |
| `packages/builtin-tools/src/tools/WebSearchTool/prompt.ts` | 搜索工具 prompt |
| `packages/builtin-tools/src/tools/WebSearchTool/UI.tsx` | 终端 UI 渲染 |
| `packages/builtin-tools/src/tools/WebSearchTool/adapters/types.ts` | 适配器接口 |
| `packages/builtin-tools/src/tools/WebSearchTool/adapters/index.ts` | 适配器工厂 |
| `packages/builtin-tools/src/tools/WebSearchTool/adapters/apiAdapter.ts` | API 服务端搜索适配器 |
| `packages/builtin-tools/src/tools/WebSearchTool/adapters/bingAdapter.ts` | Bing HTML 解析适配器 |
| `packages/builtin-tools/src/tools/WebSearchTool/__tests__/bingAdapter.test.ts` | 单元测试 (32 cases) |
| `packages/builtin-tools/src/tools/WebSearchTool/__tests__/bingAdapter.integration.ts` | 集成测试 |
| `src/tools.ts` | 工具注册 |
