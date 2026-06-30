# Artifacts Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `ArtifactTool` (deferred) that uploads local HTML to `cloud-artifacts` service and returns a public URL + hash, a `/artifacts` panel command to browse uploaded files in the current session, and a `/use-artifacts` bundled skill that teaches the agent when/how to use artifacts.

**Architecture:** Tool is a deferred `@claude-code-best/builtin-tools` entry that wraps a `fetch`-based HTTP client; the client reads token/URL from hardcoded defaults with env var override, parses the `{error}` field in body for failure detection (Deno Deploy proxy flattens HTTP status to 200). The panel command is a `local-jsx` slash command that scans `context.messages` for `artifact` tool_use + tool_result pairs. The skill is a bundled skill that injects guidance on artifact types, cadence, and the two-step `SearchExtraTools` + `ExecuteExtraTool` invocation flow.

**Tech Stack:** Bun, TypeScript strict, Zod v4 (`zod/v4`), React (Ink via `packages/@ant/ink`), `bun:test`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `packages/builtin-tools/src/tools/ArtifactTool/config.ts` | Token/URL constants + env var override helpers |
| `packages/builtin-tools/src/tools/ArtifactTool/client.ts` | `uploadArtifact()` — HTTP POST to cloud-artifacts, body error parsing |
| `packages/builtin-tools/src/tools/ArtifactTool/prompt.ts` | `ARTIFACT_TOOL_NAME`, async `description()` / `prompt()` |
| `packages/builtin-tools/src/tools/ArtifactTool/ArtifactTool.ts` | `buildTool()` definition: schema, `call`, render, map |
| `packages/builtin-tools/src/tools/ArtifactTool/__tests__/client.test.ts` | client unit tests (mock fetch) |
| `packages/builtin-tools/src/tools/ArtifactTool/__tests__/ArtifactTool.test.ts` | Tool end-to-end tests (real temp file + mock fetch) |
| `packages/builtin-tools/src/index.ts` | Barrel export for `ArtifactTool` (modify) |
| `src/tools.ts` | Register `ArtifactTool` in the tools array (modify) |
| `src/skills/bundled/useArtifacts.ts` | Bundled skill body + `registerUseArtifactsSkill()` |
| `src/skills/bundled/index.ts` | Call `registerUseArtifactsSkill()` in `initBundledSkills()` (modify) |
| `src/commands/artifacts/scanner.ts` | Pure `extractArtifacts(messages)` — scan tool_use/tool_result pairs |
| `src/commands/artifacts/__tests__/scanner.test.ts` | scanner unit tests |
| `src/commands/artifacts/ArtifactsMenu.tsx` | React/Ink list component with Enter/c/Esc |
| `src/commands/artifacts/artifacts.tsx` | `call(onDone, context)` entry — calls scanner, renders menu |
| `src/commands/artifacts/index.ts` | `satisfies Command` definition with lazy `load` |
| `src/commands.ts` | Register `artifacts` command (modify) |

---

## Task 1: ArtifactTool config (token/URL defaults)

**Files:**
- Create: `packages/builtin-tools/src/tools/ArtifactTool/config.ts`

- [ ] **Step 1: Write config file**

```typescript
// packages/builtin-tools/src/tools/ArtifactTool/config.ts
/**
 * Cloud Artifacts service configuration.
 * Token/URL have hardcoded production defaults; env vars override for self-hosted deployments.
 */
export const ARTIFACTS_DEFAULT_TOKEN = 'claude-code-best'
export const ARTIFACTS_DEFAULT_URL = 'https://cloud-artifacts.claude-code-best.win'

export function getArtifactsToken(): string {
  return process.env.CLAUDE_ARTIFACTS_TOKEN ?? ARTIFACTS_DEFAULT_TOKEN
}

export function getArtifactsBaseUrl(): string {
  return process.env.CLAUDE_ARTIFACTS_URL ?? ARTIFACTS_DEFAULT_URL
}

/** Strip trailing slash so `${base}/upload` is well-formed. */
export function getUploadUrl(): string {
  const base = getArtifactsBaseUrl()
  return base.endsWith('/') ? `${base}upload` : `${base}/upload`
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/builtin-tools/src/tools/ArtifactTool/config.ts
git commit -m "feat(artifact): add cloud-artifacts config with token/URL defaults"
```

---

## Task 2: ArtifactTool client (TDD — uploadArtifact)

**Files:**
- Create: `packages/builtin-tools/src/tools/ArtifactTool/client.ts`
- Test: `packages/builtin-tools/src/tools/ArtifactTool/__tests__/client.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/builtin-tools/src/tools/ArtifactTool/__tests__/client.test.ts
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { uploadArtifact } from '../client.js'

const originalFetch = globalThis.fetch

function mockFetch(body: object, status = 200): typeof fetch {
  return mock((_url: string | URL | Request, _init?: RequestInit) =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  ) as unknown as typeof fetch
}

describe('uploadArtifact', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('returns id/url/expiresAt on successful upload', async () => {
    globalThis.fetch = mockFetch({
      id: 'V1StGXR8_Z5jdHi6B',
      url: 'https://cloud-artifacts.claude-code-best.win/7d/V1StGXR8_Z5jdHi6B.html',
      expiresAt: '2026-06-27T10:00:00.000Z',
    })

    const result = await uploadArtifact({
      html: '<h1>hello</h1>',
      token: 'test-token',
      uploadUrl: 'https://example.test/upload',
    })

    expect(result).toEqual({
      id: 'V1StGXR8_Z5jdHi6B',
      url: 'https://cloud-artifacts.claude-code-best.win/7d/V1StGXR8_Z5jdHi6B.html',
      expiresAt: '2026-06-27T10:00:00.000Z',
    })
  })

  test('passes hash as query param when provided', async () => {
    const fetchMock = mockFetch({ id: 'my-id', url: 'https://x/y.html', expiresAt: '2026-06-27T00:00:00.000Z' })
    globalThis.fetch = fetchMock

    await uploadArtifact({
      html: '<p>x</p>',
      token: 't',
      uploadUrl: 'https://example.test/upload',
      hash: 'my-id',
    })

    const calledUrl = (fetchMock as unknown as { mock: { calls: [string | URL | Request][] } }).mock.calls[0][0]
    expect(calledUrl.toString()).toContain('hash=my-id')
  })

  test('passes ttl=30 query param when provided', async () => {
    const fetchMock = mockFetch({ id: 'x', url: 'https://x', expiresAt: '2026-07-20T00:00:00.000Z' })
    globalThis.fetch = fetchMock

    await uploadArtifact({
      html: '<p>x</p>',
      token: 't',
      uploadUrl: 'https://example.test/upload',
      ttl: 30,
    })

    const calledUrl = (fetchMock as unknown as { mock: { calls: [string | URL | Request][] } }).mock.calls[0][0]
    expect(calledUrl.toString()).toContain('ttl=30')
  })

  test('throws with error code when body contains {error} (Deno Deploy flattens status)', async () => {
    globalThis.fetch = mockFetch({ error: 'payload_too_large' }, 200)

    await expect(
      uploadArtifact({
        html: 'x'.repeat(100),
        token: 't',
        uploadUrl: 'https://example.test/upload',
      }),
    ).rejects.toThrow(/payload_too_large/)
  })

  test('throws on non-JSON body', async () => {
    globalThis.fetch = mock((_u: string | URL | Request) =>
      Promise.resolve(new Response('Internal Server Error', { status: 500 })),
    ) as unknown as typeof fetch

    await expect(
      uploadArtifact({ html: '<p/>', token: 't', uploadUrl: 'https://example.test/upload' }),
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test packages/builtin-tools/src/tools/ArtifactTool/__tests__/client.test.ts
```

Expected: FAIL with `Cannot find module '../client.js'` or similar.

- [ ] **Step 3: Implement the client**

```typescript
// packages/builtin-tools/src/tools/ArtifactTool/client.ts
export type UploadResult = {
  id: string
  url: string
  expiresAt: string
}

export type UploadParams = {
  html: string
  token: string
  uploadUrl: string
  hash?: string
  ttl?: 7 | 30
}

export async function uploadArtifact(params: UploadParams): Promise<UploadResult> {
  const url = new URL(params.uploadUrl)
  if (params.hash) url.searchParams.set('hash', params.hash)
  if (params.ttl) url.searchParams.set('ttl', String(params.ttl))

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.token}`,
      'Content-Type': 'text/html',
    },
    body: params.html,
  })

  // Deno Deploy proxy flattens upstream status to 200; the Worker embeds the
  // real error in the body as `{ "error": "<code>" }`. Always parse body first.
  const text = await response.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`Artifact upload failed: HTTP ${response.status} (non-JSON body)`)
  }

  if (parsed && typeof parsed === 'object' && 'error' in parsed) {
    const code = (parsed as { error: unknown }).error
    throw new Error(`Artifact upload failed: ${String(code)}`)
  }

  const data = parsed as Partial<UploadResult>
  if (typeof data.id !== 'string' || typeof data.url !== 'string' || typeof data.expiresAt !== 'string') {
    throw new Error(`Artifact upload returned malformed body: ${text.slice(0, 200)}`)
  }
  return { id: data.id, url: data.url, expiresAt: data.expiresAt }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test packages/builtin-tools/src/tools/ArtifactTool/__tests__/client.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/builtin-tools/src/tools/ArtifactTool/client.ts packages/builtin-tools/src/tools/ArtifactTool/__tests__/client.test.ts
git commit -m "feat(artifact): add HTTP client with body-error parsing"
```

---

## Task 3: ArtifactTool prompt (name + description)

**Files:**
- Create: `packages/builtin-tools/src/tools/ArtifactTool/prompt.ts`

- [ ] **Step 1: Write prompt file**

```typescript
// packages/builtin-tools/src/tools/ArtifactTool/prompt.ts
export const ARTIFACT_TOOL_NAME = 'artifact'

export async function describeArtifactTool(): Promise<string> {
  return 'Upload an HTML file to the cloud-artifacts hosting service and get back a public URL. Pass `hash` to overwrite a previously-uploaded artifact (keeps URL stable).'
}

export async function getArtifactToolPrompt(): Promise<string> {
  return `Upload an HTML file to a public hosting service and return a shareable URL plus an internal \`id\` (the "hash").

## Inputs
- \`file_path\` (required): absolute path to a local HTML file.
- \`hash\` (optional): if provided, overwrites the artifact with the same hash (URL stays the same). If omitted, a new random id is generated.
- \`ttl\` (optional, default \`7\`): artifact lifetime in days. Must be \`7\` or \`30\`.

## Output
\`{ id, url, expiresAt }\` — \`id\` is the hash (save it for future overwrite calls), \`url\` is publicly accessible.

## Workflow
1. Use the Write tool to create a local HTML file.
2. Call this tool with its \`file_path\`.
3. If iterating on the same artifact, pass back the \`id\` returned from the first call as \`hash\` so the URL stays stable.

## Errors
The tool surfaces backend error codes verbatim (e.g. \`payload_too_large\`, \`unauthorized\`). If the file does not exist or is not a regular file, the tool returns an \`error\` field without making an HTTP request.`
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/builtin-tools/src/tools/ArtifactTool/prompt.ts
git commit -m "feat(artifact): add tool name, description, and prompt"
```

---

## Task 4: ArtifactTool definition (schema + call + render + map)

**Files:**
- Create: `packages/builtin-tools/src/tools/ArtifactTool/ArtifactTool.ts`

- [ ] **Step 1: Write the tool definition**

```typescript
// packages/builtin-tools/src/tools/ArtifactTool/ArtifactTool.ts
import { stat, readFile } from 'fs/promises'
import { z } from 'zod/v4'
import type { ToolResultBlockParam } from 'src/Tool.js'
import { buildTool } from 'src/Tool.js'
import { lazySchema } from 'src/utils/lazySchema.js'
import { ARTIFACT_TOOL_NAME, describeArtifactTool, getArtifactToolPrompt } from './prompt.js'
import { getArtifactsToken, getUploadUrl } from './config.js'
import { uploadArtifact } from './client.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    file_path: z.string().describe('Absolute path to a local HTML file to upload.'),
    hash: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,128}$/, 'must match ^[A-Za-z0-9_-]{1,128}$')
      .optional()
      .describe('If provided, overwrites the existing artifact with this hash (URL stays stable). If omitted, a new random id is generated.'),
    ttl: z.union([z.literal(7), z.literal(30)]).default(7).describe('Lifetime in days. Must be 7 or 30. Default 7.'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>
type ArtifactInput = z.infer<InputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    id: z.string(),
    url: z.string(),
    expiresAt: z.string(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
type ArtifactOutput = z.infer<OutputSchema>
type ArtifactErrorOutput = ArtifactOutput & { error?: string }

export const ArtifactTool = buildTool({
  name: ARTIFACT_TOOL_NAME,
  searchHint: 'upload html artifact share url cloud publish progress report public link',
  maxResultSizeChars: 2_000,
  shouldDefer: true,
  strict: true,

  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },

  async description() {
    return describeArtifactTool()
  },
  async prompt() {
    return getArtifactToolPrompt()
  },

  isEnabled() {
    return true
  },
  isConcurrencySafe() {
    return false
  },
  isReadOnly() {
    return false
  },
  requiresUserInteraction() {
    return true
  },
  userFacingName() {
    return 'Artifact'
  },

  renderToolUseMessage(input: Partial<ArtifactInput>) {
    const hashPart = input.hash ? ` (hash=${input.hash})` : ''
    return `Upload artifact: ${input.file_path ?? '...'}${hashPart}`
  },

  mapToolResultToToolResultBlockParam(content: ArtifactErrorOutput, toolUseID: string): ToolResultBlockParam {
    if (content.error) {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        is_error: true,
        content: content.error,
      }
    }
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `Artifact uploaded: ${content.url} (id: ${content.id}, expires: ${content.expiresAt})`,
    }
  },

  async call(input: ArtifactInput) {
    const { file_path, hash, ttl } = input

    let size: number
    try {
      const fileStat = await stat(file_path)
      if (!fileStat.isFile()) {
        return { data: { id: '', url: '', expiresAt: '', error: `Path is not a regular file: ${file_path}` } }
      }
      size = fileStat.size
    } catch {
      return { data: { id: '', url: '', expiresAt: '', error: `File does not exist or is not readable: ${file_path}` } }
    }

    if (size > 10 * 1024 * 1024) {
      return { data: { id: '', url: '', expiresAt: '', error: `File is ${size} bytes; backend limit is 10MB.` } }
    }

    let html: string
    try {
      html = await readFile(file_path, 'utf8')
    } catch {
      return { data: { id: '', url: '', expiresAt: '', error: `Failed to read file: ${file_path}` } }
    }

    try {
      const result = await uploadArtifact({
        html,
        token: getArtifactsToken(),
        uploadUrl: getUploadUrl(),
        hash,
        ttl,
      })
      return { data: result }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return { data: { id: '', url: '', expiresAt: '', error: message } }
    }
  },
})
```

- [ ] **Step 2: Commit**

```bash
git add packages/builtin-tools/src/tools/ArtifactTool/ArtifactTool.ts
git commit -m "feat(artifact): add buildTool definition with file validation"
```

---

## Task 5: Tool end-to-end tests

**Files:**
- Test: `packages/builtin-tools/src/tools/ArtifactTool/__tests__/ArtifactTool.test.ts`

- [ ] **Step 1: Write the e2e tool test**

```typescript
// packages/builtin-tools/src/tools/ArtifactTool/__tests__/ArtifactTool.test.ts
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { ArtifactTool } from '../ArtifactTool.js'

const TEST_DIR = join(tmpdir(), 'artifact-tool-test')
const TEST_FILE = join(TEST_DIR, 'report.html')
const MISSING_FILE = join(TEST_DIR, 'does-not-exist.html')
const DIR_AS_FILE = TEST_DIR

const originalFetch = globalThis.fetch

function mockFetchSuccess(body: object): typeof fetch {
  return mock(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  ) as unknown as typeof fetch
}

describe('ArtifactTool.call', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true })
    writeFileSync(TEST_FILE, '<h1>test report</h1>', 'utf8')
    process.env.CLAUDE_ARTIFACTS_TOKEN = 'test-token'
    process.env.CLAUDE_ARTIFACTS_URL = 'https://example.test'
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true })
    delete process.env.CLAUDE_ARTIFACTS_TOKEN
    delete process.env.CLAUDE_ARTIFACTS_URL
    globalThis.fetch = originalFetch
  })

  test('uploads existing HTML file and returns id/url/expiresAt', async () => {
    globalThis.fetch = mockFetchSuccess({
      id: 'abc123',
      url: 'https://example.test/7d/abc123.html',
      expiresAt: '2026-06-27T10:00:00.000Z',
    })

    const result = await ArtifactTool.call({ file_path: TEST_FILE, ttl: 7 }, {} as never, {} as never, {} as never)

    expect(result.data).toMatchObject({
      id: 'abc123',
      url: 'https://example.test/7d/abc123.html',
      expiresAt: '2026-06-27T10:00:00.000Z',
    })
    expect((result.data as { error?: string }).error).toBeUndefined()
  })

  test('passes hash through when overwriting', async () => {
    const fetchMock = mockFetchSuccess({
      id: 'stable-id',
      url: 'https://example.test/7d/stable-id.html',
      expiresAt: '2026-06-27T10:00:00.000Z',
    })
    globalThis.fetch = fetchMock

    await ArtifactTool.call({ file_path: TEST_FILE, hash: 'stable-id', ttl: 7 }, {} as never, {} as never, {} as never)

    const calledUrl = (fetchMock as unknown as { mock: { calls: [string | URL | Request][] } }).mock.calls[0][0]
    expect(calledUrl.toString()).toContain('hash=stable-id')
  })

  test('returns error when file does not exist (no HTTP call)', async () => {
    let fetchCalled = false
    globalThis.fetch = mock(() => {
      fetchCalled = true
      return Promise.resolve(new Response('{}'))
    }) as unknown as typeof fetch

    const result = await ArtifactTool.call({ file_path: MISSING_FILE, ttl: 7 }, {} as never, {} as never, {} as never)

    expect(fetchCalled).toBe(false)
    expect((result.data as { error?: string }).error).toContain('does not exist')
  })

  test('returns error when path is a directory', async () => {
    const result = await ArtifactTool.call({ file_path: DIR_AS_FILE, ttl: 7 }, {} as never, {} as never, {} as never)

    expect((result.data as { error?: string }).error).toContain('not a regular file')
  })

  test('returns error verbatim when backend rejects', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ error: 'payload_too_large' }), { status: 200 })),
    ) as unknown as typeof fetch

    // Force the size guard to pass by writing a small file but having backend complain.
    const result = await ArtifactTool.call({ file_path: TEST_FILE, ttl: 7 }, {} as never, {} as never, {} as never)

    expect((result.data as { error?: string }).error).toContain('payload_too_large')
  })
})
```

- [ ] **Step 2: Run the e2e test**

```bash
bun test packages/builtin-tools/src/tools/ArtifactTool/__tests__/ArtifactTool.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 3: Commit**

```bash
git add packages/builtin-tools/src/tools/ArtifactTool/__tests__/ArtifactTool.test.ts
git commit -m "test(artifact): add end-to-end tool tests for upload/error paths"
```

---

## Task 6: Export ArtifactTool from builtin-tools barrel

**Files:**
- Modify: `packages/builtin-tools/src/index.ts`

- [ ] **Step 1: Read barrel to find an insertion point**

```bash
grep -n "SendUserFile" packages/builtin-tools/src/index.ts
```

- [ ] **Step 2: Add the export (insert after the SendUserFileTool line, keep alphabetical/grouped ordering)**

Add this single line next to the other tool exports:

```typescript
export { ArtifactTool } from './tools/ArtifactTool/ArtifactTool.js'
```

- [ ] **Step 3: Verify export works**

```bash
bun -e "import('@claude-code-best/builtin-tools').then(m => console.log(typeof m.ArtifactTool))"
```

Expected output: `object` (the built tool).

- [ ] **Step 4: Commit**

```bash
git add packages/builtin-tools/src/index.ts
git commit -m "feat(artifact): export ArtifactTool from builtin-tools barrel"
```

---

## Task 7: Register ArtifactTool in src/tools.ts

**Files:**
- Modify: `src/tools.ts`

- [ ] **Step 1: Add the require import (place near other non-feature-gated tools)**

Find a clean spot in the top section (near other `const X = require(...)` declarations) and add:

```typescript
const ArtifactTool = require('@claude-code-best/builtin-tools/tools/ArtifactTool/ArtifactTool.js').ArtifactTool
```

- [ ] **Step 2: Spread into the tools array (find the main returned array and add ArtifactTool unconditionally)**

Add `ArtifactTool,` to the array literal that returns the assembled tool list (e.g. next to `BriefTool,`).

- [ ] **Step 3: Verify by importing**

```bash
bun -e "import('./src/tools.js').then(m => { const t = (m.getTools ?? m.tools); const arr = typeof t === 'function' ? t({mode:'default',additionalWorkingDirectories:new Set(),alwaysAllowRules:{deny:[],allow:[]},alwaysDenyRules:{deny:[],allow:[]},alwaysAskRules:{deny:[],allow:[]},isBypassPermissionsModeAvailable:false}) : t; console.log(arr.map(x=>x.name).includes('artifact')) })"
```

If the dynamic shape is hard to invoke, instead just typecheck:

```bash
bunx tsc --noEmit -p tsconfig.json 2>&1 | head -50
```

Expected: no new errors mentioning ArtifactTool.

- [ ] **Step 4: Commit**

```bash
git add src/tools.ts
git commit -m "feat(artifact): register ArtifactTool in tools list"
```

---

## Task 8: /use-artifacts bundled skill

**Files:**
- Create: `src/skills/bundled/useArtifacts.ts`
- Modify: `src/skills/bundled/index.ts`

- [ ] **Step 1: Write the skill file**

```typescript
// src/skills/bundled/useArtifacts.ts
import { registerBundledSkill } from '../bundledSkills.js'

const USE_ARTIFACTS_PROMPT = `# Using Artifacts

Artifacts are public HTML pages you upload to a hosting service. They have stable URLs that you can share with the user or open in a browser. Use them to surface work-in-progress, summaries, and reports.

## When to use artifacts

**Good artifact content:**
- Progress panels / kanbans (task list with status)
- Research reports and analysis (data + findings + recommendations)
- Design docs / decision records (with context and rationale)
- Data visualizations (tables, SVG charts, flow diagrams)
- Final deliverables (the "thing the user asked for" rendered as HTML)

**Do NOT use artifacts for:**
- Code snippets — use files directly
- One-line answers — keep them in chat
- Internal debug logs — keep them in chat
- Large data dumps — link to source files instead

## Cadence — when to upload

- **Task start**: if the task is complex (multi-step, research, deliverable), upload a skeleton artifact first as scaffolding (placeholder sections).
- **Milestones**: when you complete a phase (research done / implementation done / tests pass), update the artifact.
- **User asks**: upload immediately.
- **Task end**: ship the final artifact as the deliverable.

**Do NOT upload:**
- After every tool call (noise)
- Mid-step with no meaningful change (e.g. fixed a typo)

## How to invoke (deferred tool)

\`artifact\` is a deferred tool. The first call requires two steps; subsequent calls one step.

**First upload (creates a new artifact):**
\`\`\`
1. Use the Write tool to write HTML to a local file (location is your choice).
2. SearchExtraTools({ query: "select:artifact" })   // loads the tool schema
3. ExecuteExtraTool({ tool_name: "artifact", params: { file_path: "<absolute-path>.html" } })
4. Save the returned \`id\` from the tool result — this is the hash.
\`\`\`

**Subsequent updates (overwrites in place, URL stays stable):**
\`\`\`
1. Update the local HTML file.
2. ExecuteExtraTool({ tool_name: "artifact", params: { file_path: "<absolute-path>.html", hash: "<id-from-first-call>" } })
\`\`\`

The URL returned on every call is the same when you pass the same \`hash\`. The user can open it at any time to see the latest version.

## Minimal HTML skeleton

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Artifact Title</title>
  <style>
    body { font: 14px/1.5 -apple-system, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
    h1, h2 { color: #1a1a1a; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
  </style>
</head>
<body>
  <h1>Artifact Title</h1>
  <!-- content here -->
</body>
</html>
\`\`\`

The hosting service serves the HTML verbatim (including any \`<script>\` you include), so you can use vanilla JS/SVG/CSS as needed. Do not embed secrets.

## Notes

- Artifacts expire (default 7 days; pass \`ttl: 30\` for 30-day retention).
- Anyone with the URL can view the artifact — treat the URL as the secret.
- The \`/artifacts\` slash command (user-invoked) shows all artifacts uploaded in the current session.
`

export function registerUseArtifactsSkill(): void {
  registerBundledSkill({
    name: 'use-artifacts',
    description:
      'Teach the agent when and how to use the artifact tool: what content belongs in artifacts, when to upload/update, and the SearchExtraTools + ExecuteExtraTool invocation flow for the deferred artifact tool.',
    whenToUse:
      'Use this skill at the start of any complex task that would benefit from a living progress document or a deliverable HTML report.',
    userInvocable: true,
    argumentHint: '[optional focus note]',
    async getPromptForCommand(args) {
      let prompt = USE_ARTIFACTS_PROMPT
      if (args && args.trim().length > 0) {
        prompt += `\n\n## Additional Focus\n\n${args.trim()}\n`
      }
      return [{ type: 'text', text: prompt }]
    },
  })
}
```

- [ ] **Step 2: Register in `src/skills/bundled/index.ts`**

Add the import near the other bundled skill imports:

```typescript
import { registerUseArtifactsSkill } from './useArtifacts.js'
```

Call the register function inside `initBundledSkills()` (place near `registerSimplifySkill()` for ordering consistency):

```typescript
registerUseArtifactsSkill()
```

- [ ] **Step 3: Verify the skill registers**

```bash
bun -e "import('./src/skills/bundled/index.js').then(m => { m.initBundledSkills(); import('./src/skills/bundledSkills.js').then(s => { const list = s.bundledSkills ?? s.getBundledSkills?.() ?? []; console.log(Array.isArray(list) ? list.map(c => c.name).filter(n => n === 'use-artifacts') : 'no list'); }) })"
```

If the runtime shape is awkward to introspect, fall back to typecheck only:

```bash
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -i artifact
```

Expected: no errors mentioning `useArtifacts` or `use-artifacts`.

- [ ] **Step 4: Commit**

```bash
git add src/skills/bundled/useArtifacts.ts src/skills/bundled/index.ts
git commit -m "feat(artifact): add /use-artifacts bundled skill"
```

---

## Task 9: /artifacts scanner (TDD — extractArtifacts)

**Files:**
- Create: `src/commands/artifacts/scanner.ts`
- Test: `src/commands/artifacts/__tests__/scanner.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/commands/artifacts/__tests__/scanner.test.ts
import { describe, expect, test } from 'bun:test'
import { extractArtifacts } from '../scanner.js'
import type { Message } from 'src/types/message.js'

function assistantToolUse(id: string, input: Record<string, unknown>): Message {
  return {
    role: 'assistant',
    content: [{ type: 'tool_use', id, name: 'artifact', input }],
  } as unknown as Message
}

function userToolResult(id: string, content: string, isError = false): Message {
  return {
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: id, content, is_error: isError }],
  } as unknown as Message
}

describe('extractArtifacts', () => {
  test('returns empty list when no artifact tool_use messages', () => {
    expect(extractArtifacts([])).toEqual([])
    expect(extractArtifacts([{ role: 'user', content: [{ type: 'text', text: 'hi' }] } as unknown as Message])).toEqual([])
  })

  test('pairs a successful tool_use with its tool_result and returns parsed fields', () => {
    const messages: Message[] = [
      assistantToolUse('tu1', { file_path: '/tmp/report.html', ttl: 7 }),
      userToolResult('tu1', 'Artifact uploaded: https://x.test/7d/abc.html (id: abc, expires: 2026-06-27T10:00:00.000Z)'),
    ]

    const result = extractArtifacts(messages)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      filePath: '/tmp/report.html',
      hash: 'abc',
      url: 'https://x.test/7d/abc.html',
      expiresAt: '2026-06-27T10:00:00.000Z',
      basename: 'report.html',
      isError: false,
    })
  })

  test('skips artifact tool_use without a matching tool_result', () => {
    const messages: Message[] = [assistantToolUse('tu1', { file_path: '/tmp/report.html', ttl: 7 })]

    expect(extractArtifacts(messages)).toEqual([])
  })

  test('keeps error results with isError=true and no parsed fields', () => {
    const messages: Message[] = [
      assistantToolUse('tu1', { file_path: '/tmp/missing.html', ttl: 7 }),
      userToolResult('tu1', 'File does not exist or is not readable: /tmp/missing.html', true),
    ]

    const result = extractArtifacts(messages)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      filePath: '/tmp/missing.html',
      basename: 'missing.html',
      isError: true,
    })
    expect(result[0].url).toBeUndefined()
  })

  test('orders newest first (last in conversation appears at top)', () => {
    const messages: Message[] = [
      assistantToolUse('tu1', { file_path: '/tmp/a.html', ttl: 7 }),
      userToolResult('tu1', 'Artifact uploaded: https://x.test/7d/a.html (id: a, expires: 2026-06-27T10:00:00.000Z)'),
      assistantToolUse('tu2', { file_path: '/tmp/b.html', ttl: 7 }),
      userToolResult('tu2', 'Artifact uploaded: https://x.test/7d/b.html (id: b, expires: 2026-06-27T10:00:00.000Z)'),
    ]

    const result = extractArtifacts(messages)

    expect(result.map((r) => r.basename)).toEqual(['b.html', 'a.html'])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bun test src/commands/artifacts/__tests__/scanner.test.ts
```

Expected: FAIL with `Cannot find module '../scanner.js'`.

- [ ] **Step 3: Implement scanner.ts**

```typescript
// src/commands/artifacts/scanner.ts
import { basename } from 'path'
import type { Message } from 'src/types/message.js'

export type ArtifactInfo = {
  toolUseId: string
  filePath: string
  basename: string
  hash?: string
  url?: string
  expiresAt?: string
  rawContent: string
  isError: boolean
}

const URL_REGEX = /https?:\/\/\S+\.html\b/
const ID_REGEX = /\bid:\s*([A-Za-z0-9_-]+)/
const EXPIRES_REGEX = /\bexpires:\s*([0-9T:.Z+-]+)/

export function extractArtifacts(messages: Message[]): ArtifactInfo[] {
  const results: ArtifactInfo[] = []

  for (const message of messages) {
    if (message.role !== 'assistant') continue
    const content = message.content
    if (!Array.isArray(content)) continue

    for (const block of content) {
      if (typeof block !== 'object' || block === null) continue
      if (block.type !== 'tool_use') continue
      if (block.name !== 'artifact') continue

      const toolUseId = block.id
      const input = block.input as { file_path?: string } | undefined
      const filePath = input?.file_path ?? '<unknown>'

      const resultBlock = findToolResult(messages, toolUseId)
      if (!resultBlock) continue

      const rawContent =
        typeof resultBlock.content === 'string'
          ? resultBlock.content
          : Array.isArray(resultBlock.content)
            ? resultBlock.content.map((c) => (typeof c === 'string' ? c : 'text' in c ? c.text : '')).join('')
            : ''

      const isError = resultBlock.is_error === true
      const urlMatch = rawContent.match(URL_REGEX)
      const idMatch = rawContent.match(ID_REGEX)
      const expiresMatch = rawContent.match(EXPIRES_REGEX)

      results.push({
        toolUseId,
        filePath,
        basename: basename(filePath),
        hash: idMatch?.[1],
        url: urlMatch?.[0],
        expiresAt: expiresMatch?.[1],
        rawContent,
        isError,
      })
    }
  }

  // newest first
  return results.reverse()
}

function findToolResult(
  messages: Message[],
  toolUseId: string,
): { content: unknown; is_error?: boolean } | null {
  for (const message of messages) {
    if (message.role !== 'user') continue
    const content = message.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (typeof block !== 'object' || block === null) continue
      if (block.type !== 'tool_result') continue
      if (block.tool_use_id !== toolUseId) continue
      return { content: block.content, is_error: block.is_error }
    }
  }
  return null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
bun test src/commands/artifacts/__tests__/scanner.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/commands/artifacts/scanner.ts src/commands/artifacts/__tests__/scanner.test.ts
git commit -m "feat(artifact): add extractArtifacts message scanner"
```

---

## Task 10: /artifacts ArtifactsMenu component

**Files:**
- Create: `src/commands/artifacts/ArtifactsMenu.tsx`

- [ ] **Step 1: Inspect an existing Ink list component for style**

```bash
ls src/components/agents/
```

(Skim `AgentsMenu.tsx` for the `onExit` + keybinding pattern. Borrow only the structural shell — do not copy code that doesn't apply.)

- [ ] **Step 2: Write the component**

```tsx
// src/commands/artifacts/ArtifactsMenu.tsx
import * as React from 'react'
import { Box, Text, useInput } from '@ant/ink'
import type { ArtifactInfo } from './scanner.js'
import { openBrowser } from 'src/utils/browser.js'

type Props = {
  artifacts: ArtifactInfo[]
  onExit: () => void
}

export function ArtifactsMenu({ artifacts, onExit }: Props): React.ReactElement {
  const [selected, setSelected] = React.useState(0)

  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      onExit()
      return
    }
    if (artifacts.length === 0) return
    if (key.upArrow) {
      setSelected((s) => (s - 1 + artifacts.length) % artifacts.length)
      return
    }
    if (key.downArrow) {
      setSelected((s) => (s + 1) % artifacts.length)
      return
    }
    if (key.return) {
      const target = artifacts[selected]
      if (target.url) {
        void openBrowser(target.url)
      }
      return
    }
    if (input === 'c') {
      const target = artifacts[selected]
      if (target.url) {
        copyToClipboard(target.url)
      }
    }
  })

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      <Box marginBottom={1}>
        <Text bold>Artifacts ({artifacts.length})</Text>
      </Box>

      {artifacts.length === 0 ? (
        <Text color="gray">No artifacts uploaded this session. Run /use-artifacts to learn how.</Text>
      ) : (
        <Box flexDirection="column">
          {artifacts.map((a, idx) => (
            <ArtifactRow key={a.toolUseId} artifact={a} isSelected={idx === selected} />
          ))}
          <Box marginTop={1}>
            <Text color="gray">↑/↓ select · Enter open · c copy URL · Esc exit</Text>
          </Box>
        </Box>
      )}
    </Box>
  )
}

function ArtifactRow({ artifact, isSelected }: { artifact: ArtifactInfo; isSelected: boolean }): React.ReactElement {
  const marker = isSelected ? '›' : ' '
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={isSelected ? 'blue' : undefined}>{marker} </Text>
        <Text bold={isSelected} color={artifact.isError ? 'red' : undefined}>
          {artifact.basename}
        </Text>
        {artifact.hash ? <Text color="gray"> ({artifact.hash})</Text> : null}
      </Box>
      {artifact.url ? (
        <Box marginLeft={2}>
          <Text color="cyan">{artifact.url}</Text>
        </Box>
      ) : (
        <Box marginLeft={2}>
          <Text color="red">{artifact.rawContent}</Text>
        </Box>
      )}
      {artifact.expiresAt ? (
        <Box marginLeft={2}>
          <Text color="gray">expires: {artifact.expiresAt}</Text>
        </Box>
      ) : null}
    </Box>
  )
}

// macOS-only clipboard via pbcopy. The CLI is primarily macOS-targeted; on
// other platforms this is a no-op (URL is still rendered above for the user
// to select and copy manually).
function copyToClipboard(text: string): void {
  try {
    const { spawnSync } = require('node:child_process') as typeof import('node:child_process')
    spawnSync('pbcopy', [], { input: text })
  } catch {
    // best-effort
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/commands/artifacts/ArtifactsMenu.tsx
git commit -m "feat(artifact): add ArtifactsMenu Ink component"
```

---

## Task 11: /artifacts command entry (artifacts.tsx + index.ts)

**Files:**
- Create: `src/commands/artifacts/artifacts.tsx`
- Create: `src/commands/artifacts/index.ts`

- [ ] **Step 1: Write the call() function**

```tsx
// src/commands/artifacts/artifacts.tsx
import * as React from 'react'
import type { LocalJSXCommandOnDone } from 'src/types/command.js'
import type { ToolUseContext } from 'src/Tool.js'
import { ArtifactsMenu } from './ArtifactsMenu.js'
import { extractArtifacts } from './scanner.js'

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: ToolUseContext,
): Promise<React.ReactNode> {
  const messages = context.messages ?? []
  const artifacts = extractArtifacts(messages)
  return <ArtifactsMenu artifacts={artifacts} onExit={onDone} />
}
```

- [ ] **Step 2: Write the command definition**

```typescript
// src/commands/artifacts/index.ts
import type { Command } from '../../commands.js'

const artifacts = {
  type: 'local-jsx',
  name: 'artifacts',
  description: 'List HTML artifacts uploaded to cloud-artifacts in this session',
  isEnabled: () => true,
  userFacingName: () => 'Artifacts',
  load: () => import('./artifacts.js'),
} satisfies Command

export default artifacts
```

- [ ] **Step 3: Commit**

```bash
git add src/commands/artifacts/artifacts.tsx src/commands/artifacts/index.ts
git commit -m "feat(artifact): add /artifacts slash command entry"
```

---

## Task 12: Register /artifacts in src/commands.ts

**Files:**
- Modify: `src/commands.ts`

- [ ] **Step 1: Add import near other command imports**

```typescript
import artifacts from './commands/artifacts/index.js'
```

(Place alphabetically — likely right after `addDir` or near `agents`.)

- [ ] **Step 2: Add to the COMMANDS array**

Add `artifacts,` to the memoized `COMMANDS()` array (e.g. as the first entry, or after `agents`).

- [ ] **Step 3: Verify by typecheck**

```bash
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -i artifact
```

Expected: no new errors mentioning artifacts.

- [ ] **Step 4: Commit**

```bash
git add src/commands.ts
git commit -m "feat(artifact): register /artifacts command"
```

---

## Task 13: Full precheck (typecheck + lint + test)

- [ ] **Step 1: Run the project precheck**

```bash
bun run precheck
```

Expected: typecheck passes, lint fix applies cleanly, all tests pass (including the new artifact tests).

- [ ] **Step 2: Fix any issues that surface**

If type errors mention artifact-related files, fix them. If lint complaints surface (e.g. import ordering, unused vars), apply the suggested fixes.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "chore(artifact): precheck fixes"
```

(Skip this step if precheck was already clean.)

---

## Task 14: Smoke test checklist (manual)

This task is a manual checklist — no automated test. After implementation, verify in a dev session:

- [ ] **Step 1: Start dev mode**

```bash
bun run dev
```

- [ ] **Step 2: Verify /use-artifacts registers**

In the REPL, type `/use-artifacts` and confirm it appears in the slash command autocomplete and executes (injects the prompt).

- [ ] **Step 3: Verify /artifacts empty state**

Type `/artifacts` before any uploads. Confirm you see the empty-state message: "No artifacts uploaded this session. Run /use-artifacts to learn how."

- [ ] **Step 4: Verify tool discovery**

In a conversation, prompt the agent: "Create an HTML file at /tmp/test-artifact.html with `<h1>hello</h1>` then upload it as an artifact."

Confirm the agent calls `SearchExtraTools({ query: "select:artifact" })` then `ExecuteExtraTool({ tool_name: "artifact", params: { file_path: "/tmp/test-artifact.html" } })` and returns a URL.

- [ ] **Step 5: Verify /artifacts list after upload**

After the agent uploads, type `/artifacts` again. Confirm you see the artifact row with the URL. Press `Enter` to open in browser (verifies the URL renders). Press `c` to copy to clipboard (verify pbcopy works on macOS). Press `Esc` to exit.

- [ ] **Step 6: Verify overwrite**

Ask the agent: "Update the same artifact — change the HTML to `<h1>updated</h1>` and upload with the same hash." Confirm the second call uses `hash` and returns the same URL.

- [ ] **Step 7: Document any rough edges**

If anything in steps 2-6 fails, file a follow-up. Otherwise no commit needed.

---

## Self-Review

**Spec coverage check:**
- ✅ ArtifactTool (deferred, filepath input, returns url + hash) — Tasks 1-5
- ✅ Overwrite mechanism via hash param — Task 4 (schema + call), Task 2 (client passes hash)
- ✅ /artifacts panel shows uploaded files — Tasks 9-12
- ✅ /use-artifacts builtin skill teaches workflow — Task 8
- ✅ Token/URL config (hardcoded default + env override) — Task 1
- ✅ Error handling (stat precheck, body error parsing, no retry) — Tasks 2, 4
- ✅ Permission (always ask) — Task 4 (`requiresUserInteraction: () => true`)
- ✅ Panel UX (Enter open, c copy, Esc exit, empty state) — Task 10
- ✅ Session-scoped data source — Task 9 (`extractArtifacts(messages)`)

**Placeholder scan:** No TBD/TODO/"implement later". All code blocks contain complete, runnable code. No "similar to Task N" references.

**Type consistency:**
- `ArtifactInput` / `ArtifactOutput` defined in Task 4, used consistently.
- `UploadParams` / `UploadResult` defined in Task 2, used in Task 4's `call()`.
- `ArtifactInfo` defined in Task 9 (scanner), imported by Task 10 (ArtifactsMenu) and Task 11 (artifacts.tsx). Field names (`filePath`, `basename`, `hash`, `url`, `expiresAt`, `rawContent`, `isError`) match across all consumers.
- Tool name constant `ARTIFACT_TOOL_NAME = 'artifact'` defined in Task 3, used in Task 4. Same string literal `'artifact'` used in Task 9 scanner filter.
- Skill name `'use-artifacts'` defined in Task 8.
- Command name `'artifacts'` defined in Task 11.

**Gaps:**
- React component testing is intentionally omitted (the codebase has minimal React/Ink component tests; the pure scanner logic in Task 9 carries the testable burden).
- Cross-platform clipboard in Task 10 is macOS-only (pbcopy) — documented as a best-effort no-op on other platforms.
