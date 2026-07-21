# Chat / Code Product Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Chat and Code independent product domains: Chat runs in disposable per-conversation storage without workspace write access, while Code binds immutable sessions to canonical remote workspaces and groups identical folders into one project.

**Architecture:** Persist an immutable `product` discriminator on projects and sessions, split the Web APIs at the server boundary, and extend the environment work protocol with durable commands for remote filesystem inspection and cleanup. The bridge launches Chat children in a fail-closed sandbox rooted at the session directory; Code children run in the chosen workspace and put platform-owned artifacts under `.real-agentc/`.

**Tech Stack:** Bun, TypeScript strict mode, Hono, `bun:sqlite`, React 19, Vite, Bun Test, `@anthropic-ai/sandbox-runtime`, Claude-in-Chrome MCP.

## Global Constraints

- Chat and Code projects, sessions, prompts, lists, and lifecycle operations must never cross product boundaries.
- Chat must not accept a workspace or Environment from the Web client and may write only inside `~/.real-agentc/chat-sessions/<session-id>/`.
- Chat may use browser, Web, remote MCP, Shell, file tools, subagents, and background work only when the same write boundary remains enforceable.
- Code workspace selection resolves on the remote runtime; invalid or untrusted paths fail and never fall back to the bridge directory.
- Code sessions have immutable workspaces. Selecting another folder creates another session.
- Platform-owned Code artifacts go to `<workspace>/.real-agentc/`; user-requested source and deliverables remain at user-selected paths.
- Chat deletion is permanent and cascades through messages, events, runtime files, owned browser tabs, and projects.
- Code project deletion archives it. Hard deletion occurs only after an online runtime confirms the folder is missing twice with a delay.
- Existing `source=web` sessions migrate conservatively to Code.
- Preserve all unrelated dirty-worktree changes. Stage only files named by the active task.
- `bun run typecheck` must pass with zero errors; final verification also runs `bun run test:all` when that script is present, otherwise the repository-equivalent `bun run typecheck && bun run lint && bun test`.

---

## File Responsibility Map

### Remote Control server

- `packages/remote-control-server/src/domain/product.ts`: shared product, project, workspace, and environment-command domain types plus validation helpers.
- `packages/remote-control-server/src/persistence/{schema,types,database}.ts`: schema v4, project/session product persistence, environment commands, and cleanup tombstones.
- `packages/remote-control-server/src/store.ts`: hydrated in-memory records and persistence synchronization.
- `packages/remote-control-server/src/services/project.ts`: project CRUD, prompt revisions, Code workspace upsert, archive/restore/missing transitions.
- `packages/remote-control-server/src/services/environment-command.ts`: durable remote command dispatch, result completion, timeout, and reconnect retry.
- `packages/remote-control-server/src/services/product-session.ts`: product-safe Chat/Code creation and product-scoped lookup.
- `packages/remote-control-server/src/services/chat-cleanup.ts`: idempotent Chat deletion orchestration and tombstones.
- `packages/remote-control-server/src/services/code-project-lifecycle.ts`: delayed workspace-missing confirmation and hard deletion.
- `packages/remote-control-server/src/routes/web/{chat,code}.ts`: explicit product APIs.
- `packages/remote-control-server/src/routes/v1/environments.work.ts`: environment command result endpoint.
- `packages/remote-control-server/src/services/work-dispatch.ts`: union work payload for sessions and environment commands.

### CLI / bridge runtime

- `src/bridge/productRuntime.ts`: list/resolve remote directories, create/remove Chat roots, create Code artifact roots, execute cleanup commands.
- `src/bridge/types.ts`: discriminated work payload types.
- `src/bridge/bridgeMain.ts`: execute non-session environment commands and reject invalid Code directories without fallback.
- `src/bridge/sessionRunner.ts`: pass product, data root, browser scope, and project prompt configuration to child CLI processes.
- `src/utils/productMode.ts`: validated child-process product configuration.
- `src/utils/projectPrompt.ts`: system-layer project prompt state and revision updates.
- `src/utils/permissions/productFilesystemPolicy.ts`: fail-closed Chat write-boundary checks.
- `src/utils/permissions/pathValidation.ts`: call the product boundary before internal writable-path exceptions.
- `src/utils/sandbox/sandbox-adapter.ts`: force and require sandboxing for Chat and restrict its writable roots.
- `src/services/mcp/productPolicy.ts`: permit remote/browser MCP in Chat and reject unsandboxed local-process MCP.
- `packages/@ant/claude-for-chrome-mcp/src/{browserTools,mcpSocketClient,bridgeClient}.ts`: close explicitly owned browser tabs by ID.

### Web app

- `packages/remote-control-server/web/src/types/index.ts`: product/project/workspace DTOs.
- `packages/remote-control-server/web/src/api/client.ts`: explicit Chat/Code/project/filesystem APIs.
- `packages/remote-control-server/web/src/hooks/useWorkspaceData.ts`: fetch and expose separately filtered product state.
- `packages/remote-control-server/web/src/shell/Sidebar.tsx`: never render sessions from the other product.
- `packages/remote-control-server/web/src/shell/createSession.ts`: separate Chat and Code creation helpers.
- `packages/remote-control-server/web/src/components/RemoteDirectoryPicker.tsx`: VS Code-style remote directory browser.
- `packages/remote-control-server/web/src/lib/remote-directory-model.ts`: pure path/history/file-vs-directory state transitions.
- `packages/remote-control-server/web/src/components/ProjectPromptEditor.tsx`: revision-aware prompt editor.
- `packages/remote-control-server/web/src/pages/{ChatHome,CodeHome,ChatProjectsPage,CodeProjectsPage}.tsx`: product-specific creation and project pages.
- `packages/remote-control-server/web/src/App.tsx`: explicit product routing and product-safe SessionDetail entry.

---

### Task 1: Persist Product Projects, Product Sessions, Commands, and Tombstones

**Files:**
- Create: `packages/remote-control-server/src/domain/product.ts`
- Modify: `packages/remote-control-server/src/persistence/schema.ts`
- Modify: `packages/remote-control-server/src/persistence/types.ts`
- Modify: `packages/remote-control-server/src/persistence/database.ts`
- Test: `packages/remote-control-server/src/__tests__/persistence.test.ts`

**Interfaces:**
- Produces: `Product`, `ProjectState`, `ProjectRecord`, `ResolvedWorkspace`, `EnvironmentCommandRecord`, `CleanupTombstoneRecord`.
- Produces database methods: `upsertProject`, `getProject`, `listProjects`, `deleteProject`, `createEnvironmentCommand`, `completeEnvironmentCommand`, `listPendingEnvironmentCommands`, `upsertCleanupTombstone`, `deleteCleanupTombstone`.
- Extends `PersistedSession` with `product`, `projectId`, `runtimeEnvironmentId`, `dataDirectory`, and `projectPromptRevision`.

- [ ] **Step 1: Write failing persistence and migration tests**

Add these cases to `persistence.test.ts`:

```ts
test('migrates legacy sessions to code and enforces project product matching', () => {
  const database = new RcsDatabase(':memory:')
  database.upsertProject({
    id: 'project-chat', ownerId: 'owner-1', product: 'chat', name: 'Research',
    projectPrompt: 'Cite sources.', promptRevision: 1, state: 'active',
    deviceId: null, workspaceKey: null, canonicalPath: null, gitRoot: null,
    gitRepoUrl: null, missingConfirmedAt: null, createdAt: 1, updatedAt: 1,
  })
  expect(() => database.upsertSession({
    id: 'session-code', environmentId: null, title: null, status: 'idle',
    source: 'web', permissionMode: null, directory: null, workerEpoch: 0,
    username: null, product: 'code', projectId: 'project-chat',
    runtimeEnvironmentId: null, dataDirectory: null,
    projectPromptRevision: null, createdAt: 1, updatedAt: 1, archivedAt: null,
  })).toThrow(/product mismatch/)
  database.close()
})

test('round-trips durable environment commands and cleanup tombstones', () => {
  const database = new RcsDatabase(':memory:')
  database.createEnvironmentCommand({
    id: 'cmd-1', environmentId: 'env-1', ownerId: 'owner-1',
    kind: 'list_directory', payload: { path: '/workspace' }, state: 'pending',
    result: null, error: null, attemptCount: 0, createdAt: 1, updatedAt: 1,
  })
  database.upsertCleanupTombstone({
    sessionId: 'session-1', environmentId: 'env-1',
    dataDirectory: '/scratch/session-1', browserScopeId: 'session-1',
    attemptCount: 0, lastError: null, createdAt: 1, updatedAt: 1,
  })
  expect(database.listPendingEnvironmentCommands('env-1')).toHaveLength(1)
  expect(database.getCleanupTombstone('session-1')?.dataDirectory)
    .toBe('/scratch/session-1')
  database.close()
})
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `bun test packages/remote-control-server/src/__tests__/persistence.test.ts`

Expected: FAIL because project, command, tombstone methods and new session fields do not exist.

- [ ] **Step 3: Add the domain types and schema v4**

Create `domain/product.ts` with these exact public types:

```ts
export type Product = 'chat' | 'code'
export type ProjectState = 'active' | 'archived' | 'missing'
export type EnvironmentCommandKind =
  | 'list_directory'
  | 'resolve_workspace'
  | 'cleanup_chat_session'
  | 'probe_workspace'

export interface ResolvedWorkspace {
  deviceId: string
  canonicalPath: string
  workspaceKey: string
  gitRoot: string | null
  gitRepoUrl: string | null
}

export function assertProjectShape(project: {
  product: Product
  deviceId: string | null
  workspaceKey: string | null
  canonicalPath: string | null
}): void {
  const workspaceValues = [
    project.deviceId,
    project.workspaceKey,
    project.canonicalPath,
  ]
  const hasAnyWorkspaceValue = workspaceValues.some(value => value !== null)
  const hasCompleteWorkspace = workspaceValues.every(
    value => typeof value === 'string' && value.length > 0,
  )
  if (project.product === 'chat' && hasAnyWorkspaceValue) {
    throw new Error('chat projects cannot contain workspace identity')
  }
  if (project.product === 'code' && !hasCompleteWorkspace) {
    throw new Error('code projects require workspace identity')
  }
}
```

Add schema version 4 with `projects`, `environment_commands`, and `cleanup_tombstones`; add the five session columns with `product TEXT NOT NULL DEFAULT 'code'`; add insert/update triggers that raise `session project product mismatch` when a non-null `project_id` points at the other product. Add a partial unique index on `(owner_id, device_id, workspace_key)` for Code projects.

- [ ] **Step 4: Add persistence row mapping and CRUD methods**

Implement the interfaces named above in `persistence/types.ts`, add SQL column lists and converters in `database.ts`, and use canonical JSON serialization for command payload/result fields. `completeEnvironmentCommand(id, result, error, now)` must atomically set state to `completed` or `failed` and increment `attempt_count` only on failed completion.

- [ ] **Step 5: Run the persistence tests and typecheck**

Run: `bun test packages/remote-control-server/src/__tests__/persistence.test.ts`

Expected: PASS.

Run: `bun run typecheck`

Expected: PASS with zero TypeScript errors.

- [ ] **Step 6: Commit the persistence foundation**

```bash
git add packages/remote-control-server/src/domain/product.ts packages/remote-control-server/src/persistence/schema.ts packages/remote-control-server/src/persistence/types.ts packages/remote-control-server/src/persistence/database.ts packages/remote-control-server/src/__tests__/persistence.test.ts
git commit -m "feat: persist chat and code product domains"
```

---

### Task 2: Add Project and Product-Session Services with Split Web Routes

**Files:**
- Create: `packages/remote-control-server/src/services/project.ts`
- Create: `packages/remote-control-server/src/services/product-session.ts`
- Create: `packages/remote-control-server/src/routes/web/chat.ts`
- Create: `packages/remote-control-server/src/routes/web/code.ts`
- Modify: `packages/remote-control-server/src/store.ts`
- Modify: `packages/remote-control-server/src/services/session.ts`
- Modify: `packages/remote-control-server/src/routes/web/sessions.ts`
- Modify: `packages/remote-control-server/src/index.ts`
- Test: `packages/remote-control-server/src/__tests__/store.test.ts`
- Test: `packages/remote-control-server/src/__tests__/services.test.ts`
- Test: `packages/remote-control-server/src/__tests__/routes.test.ts`

**Interfaces:**
- Consumes: Task 1 persistence types and methods.
- Produces: `createChatProject`, `updateProjectPrompt`, `assignChatSessionProject`, `upsertCodeProject`, `archiveCodeProject`, `restoreCodeProject`, `listProjectsByProduct`, `listSessionsByProduct`.
- Produces routes under `/web/chat/*` and `/web/code/*` while retaining `/web/sessions` as Code-compatible legacy behavior.

- [ ] **Step 1: Write failing service and cross-product route tests**

Add tests with these assertions:

```ts
test('increments project prompt revisions and rejects cross-product assignment', () => {
  const project = createChatProject('owner-1', 'Research')
  expect(updateProjectPrompt(project.id, 'Use citations.')).toMatchObject({
    promptRevision: 1,
    projectPrompt: 'Use citations.',
  })
  const codeSession = createProductSession({
    ownerId: 'owner-1', product: 'code', projectId: null,
    environmentId: null, directory: null, title: 'Legacy',
    permissionMode: 'default', dataDirectory: null,
  })
  expect(() => assignChatSessionProject(codeSession.id, project.id, 'owner-1'))
    .toThrow(/product mismatch/)
})

test('keeps chat and code session lists disjoint', async () => {
  const chat = await app.request('/web/chat/sessions?uuid=owner-1')
  const code = await app.request('/web/code/sessions?uuid=owner-1')
  expect((await resJson(chat)).every((s: any) => s.product === 'chat')).toBe(true)
  expect((await resJson(code)).every((s: any) => s.product === 'code')).toBe(true)
})
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `bun test packages/remote-control-server/src/__tests__/store.test.ts packages/remote-control-server/src/__tests__/services.test.ts packages/remote-control-server/src/__tests__/routes.test.ts`

Expected: FAIL because product services and routes are missing.

- [ ] **Step 3: Extend the store and add project services**

Hydrate projects at startup, persist all updates, and add these exact service signatures:

```ts
export function createChatProject(ownerId: string, name: string): ProjectRecord
export function updateProjectPrompt(
  projectId: string,
  ownerId: string,
  prompt: string,
): ProjectRecord
export function assignChatSessionProject(
  sessionId: string,
  projectId: string | null,
  ownerId: string,
): SessionRecord
export function upsertCodeProject(
  ownerId: string,
  workspace: ResolvedWorkspace,
): ProjectRecord
export function archiveCodeProject(
  projectId: string,
  ownerId: string,
): ProjectRecord
export function restoreCodeProject(
  projectId: string,
  ownerId: string,
): ProjectRecord
```

`updateProjectPrompt` trims no internal whitespace, increments `promptRevision` on content change, and leaves the revision unchanged for an identical value.

- [ ] **Step 4: Implement explicit Chat and Code routes**

Mount `webChat` and `webCode` in `index.ts`. Each route resolves the UUID owner before service calls. Chat project deletion is left for Task 6; Code hard deletion is left for Task 4. Update legacy `/web/sessions` creation to persist `product: 'code'` so no ambiguous rows are created after migration.

- [ ] **Step 5: Run service, route, and type tests**

Run: `bun test packages/remote-control-server/src/__tests__/store.test.ts packages/remote-control-server/src/__tests__/services.test.ts packages/remote-control-server/src/__tests__/routes.test.ts`

Expected: PASS.

Run: `bun run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit the domain services**

```bash
git add packages/remote-control-server/src/services/project.ts packages/remote-control-server/src/services/product-session.ts packages/remote-control-server/src/routes/web/chat.ts packages/remote-control-server/src/routes/web/code.ts packages/remote-control-server/src/store.ts packages/remote-control-server/src/services/session.ts packages/remote-control-server/src/routes/web/sessions.ts packages/remote-control-server/src/index.ts packages/remote-control-server/src/__tests__/store.test.ts packages/remote-control-server/src/__tests__/services.test.ts packages/remote-control-server/src/__tests__/routes.test.ts
git commit -m "feat: split chat and code server domains"
```

---

### Task 3: Add Durable Environment Commands and Remote Workspace Inspection

**Files:**
- Create: `packages/remote-control-server/src/services/environment-command.ts`
- Create: `src/bridge/productRuntime.ts`
- Modify: `packages/remote-control-server/src/services/work-dispatch.ts`
- Modify: `packages/remote-control-server/src/routes/v1/environments.work.ts`
- Modify: `packages/remote-control-server/src/types/api.ts`
- Modify: `src/bridge/types.ts`
- Modify: `src/bridge/bridgeMain.ts`
- Test: `packages/remote-control-server/src/__tests__/work-dispatch.test.ts`
- Test: `packages/remote-control-server/src/__tests__/routes.test.ts`
- Create test: `src/bridge/__tests__/productRuntime.test.ts`

**Interfaces:**
- Consumes: `EnvironmentCommandRecord`, `ResolvedWorkspace`.
- Produces: `runEnvironmentCommand`, `completeEnvironmentCommand`, `listRemoteDirectory`, `resolveRemoteWorkspace`, `executeEnvironmentCommand`.
- Extends `WorkResponse.data` into a discriminated union for `session`, `list_directory`, `resolve_workspace`, `cleanup_chat_session`, and `probe_workspace`.

- [ ] **Step 1: Write failing remote-runtime tests**

Create `productRuntime.test.ts`:

```ts
test('lists names and kinds without reading file contents', async () => {
  const root = mkdtempSync(join(tmpdir(), 'product-runtime-'))
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'README.md'), 'secret body')
  expect(await listRemoteDirectory(root)).toEqual({
    path: realpathSync(root),
    entries: [
      { name: 'README.md', kind: 'file' },
      { name: 'src', kind: 'directory' },
    ],
  })
  rmSync(root, { recursive: true, force: true })
})

test('resolves symlinks to one stable workspace identity', async () => {
  const root = mkdtempSync(join(tmpdir(), 'workspace-identity-'))
  const realPath = join(root, 'repo')
  const aliasPath = join(root, 'repo-link')
  mkdirSync(realPath)
  symlinkSync(realPath, aliasPath, 'dir')
  try {
    const resolved = await resolveRemoteWorkspace(aliasPath, 'device-1')
    expect(resolved.canonicalPath).toBe(realpathSync(realPath))
    expect(resolved.workspaceKey).toBe(
      deriveWorkspaceKey(realpathSync(realPath), resolved.gitRepoUrl),
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

Add server tests proving a command is returned once, completion is owner/environment authenticated, and timed-out commands transition to `failed` without losing cleanup commands.

- [ ] **Step 2: Run the tests and verify RED**

Run: `bun test src/bridge/__tests__/productRuntime.test.ts packages/remote-control-server/src/__tests__/work-dispatch.test.ts packages/remote-control-server/src/__tests__/routes.test.ts`

Expected: FAIL because the environment command protocol is absent.

- [ ] **Step 3: Implement the durable command service and work union**

Use this command result contract:

```ts
export type EnvironmentCommandResult =
  | { kind: 'list_directory'; value: RemoteDirectoryListing }
  | { kind: 'resolve_workspace'; value: ResolvedWorkspace }
  | { kind: 'cleanup_chat_session'; value: { removed: boolean; closedTabIds: number[] } }
  | { kind: 'probe_workspace'; value: { exists: boolean; canonicalPath: string | null } }

export async function runEnvironmentCommand<T extends EnvironmentCommandResult>(
  input: EnvironmentCommandInput,
  timeoutMs = 5_000,
): Promise<T>
```

`pollWork` must prefer pending cleanup commands, then interactive directory commands, then session work. Completion POST bodies contain `{ result }` or `{ error }`, never both.

- [ ] **Step 4: Implement remote directory listing and resolution**

`listRemoteDirectory(path)` uses `readdir({ withFileTypes: true })`, returns only `name` and `kind`, sorts directories before files and then locale-sorts names. `resolveRemoteWorkspace` requires an existing directory, checks `isPathTrusted(canonicalPath)`, resolves Git root/remote, and derives the workspace key from canonical path and normalized remote URL.

In `bridgeMain.ts`, remove the current invalid-directory fallback for product-aware Code jobs. A bad product-aware path completes the work with an explicit error and never spawns a child in `config.dir`.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `bun test src/bridge/__tests__/productRuntime.test.ts packages/remote-control-server/src/__tests__/work-dispatch.test.ts packages/remote-control-server/src/__tests__/routes.test.ts`

Expected: PASS.

Run: `bun run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit remote workspace inspection**

```bash
git add packages/remote-control-server/src/services/environment-command.ts packages/remote-control-server/src/services/work-dispatch.ts packages/remote-control-server/src/routes/v1/environments.work.ts packages/remote-control-server/src/types/api.ts src/bridge/productRuntime.ts src/bridge/types.ts src/bridge/bridgeMain.ts src/bridge/__tests__/productRuntime.test.ts packages/remote-control-server/src/__tests__/work-dispatch.test.ts packages/remote-control-server/src/__tests__/routes.test.ts
git commit -m "feat: inspect remote code workspaces"
```

---

### Task 4: Create Immutable Code Sessions and Manage Code Project Lifecycle

**Files:**
- Create: `packages/remote-control-server/src/services/code-project-lifecycle.ts`
- Modify: `packages/remote-control-server/src/routes/web/code.ts`
- Modify: `packages/remote-control-server/src/services/project.ts`
- Modify: `packages/remote-control-server/src/services/product-session.ts`
- Modify: `packages/remote-control-server/src/services/disconnect-monitor.ts`
- Modify: `packages/remote-control-server/src/services/work-dispatch.ts`
- Modify: `src/bridge/productRuntime.ts`
- Modify: `src/bridge/sessionRunner.ts`
- Test: `packages/remote-control-server/src/__tests__/routes.test.ts`
- Test: `packages/remote-control-server/src/__tests__/services.test.ts`
- Test: `src/bridge/__tests__/productRuntime.test.ts`

**Interfaces:**
- Consumes: remote `ResolvedWorkspace` command.
- Produces: `createCodeProductSession`, `probeArchivedCodeProjects`, `confirmMissingCodeProject`, `ensureCodeArtifactRoot`.
- Produces: `createCodeProductSession(input, deps)` where `input` contains owner, Environment, requested directory, title, and permission mode, and `deps.resolveWorkspace(environmentId, path)` returns `ResolvedWorkspace`.
- Produces: `recordWorkspaceProbe(projectId, result, checkedAt)` where `result` is `{ online: boolean; exists: boolean }`.

- [ ] **Step 1: Write failing Code creation and lifecycle tests**

```ts
test('creates two sessions in one project for the same canonical folder', async () => {
  const workspace = {
    deviceId: 'device-1', canonicalPath: '/real/repo', workspaceKey: 'wrk-1',
    gitRoot: '/real/repo', gitRepoUrl: 'https://example.test/repo.git',
  }
  const deps = { resolveWorkspace: async () => workspace }
  const first = await createCodeProductSession({
    ownerId: 'owner-1', environmentId: 'env-1',
    requestedDirectory: '/repo-link', title: 'First', permissionMode: 'default',
  }, deps)
  const second = await createCodeProductSession({
    ownerId: 'owner-1', environmentId: 'env-1',
    requestedDirectory: '/repo', title: 'Second', permissionMode: 'default',
  }, deps)
  expect(first.projectId).toBe(second.projectId)
  expect(first.directory).toBe('/real/repo')
})

test('archives on delete and hard-deletes only after two online missing probes', async () => {
  const project = upsertCodeProject('owner-1', {
    deviceId: 'device-1', canonicalPath: '/real/repo', workspaceKey: 'wrk-1',
    gitRoot: '/real/repo', gitRepoUrl: null,
  })
  expect(archiveCodeProject(project.id, 'owner-1').state).toBe('archived')
  await recordWorkspaceProbe(project.id, { online: true, exists: false }, 1_000)
  expect(getProject(project.id)?.state).toBe('missing')
  await recordWorkspaceProbe(project.id, { online: true, exists: false }, 1_000 + MISSING_RECHECK_MS)
  expect(getProject(project.id)).toBeNull()
  expect(listSessionsByProject(project.id)).toEqual([])
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `bun test packages/remote-control-server/src/__tests__/routes.test.ts packages/remote-control-server/src/__tests__/services.test.ts src/bridge/__tests__/productRuntime.test.ts`

Expected: FAIL because Code creation still trusts client directories and project lifecycle does not exist.

- [ ] **Step 3: Implement Code creation as resolve-then-create**

`POST /web/code/sessions` accepts exactly:

```ts
interface CreateCodeWebSessionRequest {
  environment_id: string
  requested_directory: string
  title?: string
  permission_mode?: string
}
```

It runs `resolve_workspace`, upserts the Code project, creates the session with canonical directory and immutable project ID, creates a session work item, and returns only after persistence succeeds. The session work payload includes `product`, `project_id`, `directory`, and `artifact_directory`.

- [ ] **Step 4: Implement Code artifact roots and lifecycle probes**

`ensureCodeArtifactRoot(workspace, sessionId)` creates:

```text
.real-agentc/sessions/<session-id>/downloads
.real-agentc/sessions/<session-id>/screenshots
.real-agentc/sessions/<session-id>/temp
.real-agentc/sessions/<session-id>/logs
.real-agentc/project
```

Use `MISSING_RECHECK_MS = 5 * 60_000`. Offline and timeout results do not modify project state. First confirmed missing probe records `missingConfirmedAt`; a second confirmed missing result after the delay deletes project sessions/events first and then the project row in one persistence transaction.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `bun test packages/remote-control-server/src/__tests__/routes.test.ts packages/remote-control-server/src/__tests__/services.test.ts src/bridge/__tests__/productRuntime.test.ts`

Expected: PASS.

Run: `bun run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit Code project behavior**

```bash
git add packages/remote-control-server/src/services/code-project-lifecycle.ts packages/remote-control-server/src/routes/web/code.ts packages/remote-control-server/src/services/project.ts packages/remote-control-server/src/services/product-session.ts packages/remote-control-server/src/services/disconnect-monitor.ts packages/remote-control-server/src/services/work-dispatch.ts src/bridge/productRuntime.ts src/bridge/sessionRunner.ts packages/remote-control-server/src/__tests__/routes.test.ts packages/remote-control-server/src/__tests__/services.test.ts src/bridge/__tests__/productRuntime.test.ts
git commit -m "feat: bind code sessions to immutable projects"
```

---

### Task 5: Enforce Chat Scratch Storage and Fail-Closed Tool Isolation

**Files:**
- Create: `src/utils/productMode.ts`
- Create: `src/utils/permissions/productFilesystemPolicy.ts`
- Create: `src/services/mcp/productPolicy.ts`
- Modify: `src/utils/permissions/pathValidation.ts`
- Modify: `src/utils/sandbox/sandbox-adapter.ts`
- Modify: `src/main.tsx`
- Modify: `src/bridge/productRuntime.ts`
- Modify: `src/bridge/sessionRunner.ts`
- Modify: `src/bridge/initReplBridge.ts`
- Modify: `packages/remote-control-server/src/routes/web/chat.ts`
- Modify: `packages/remote-control-server/src/services/product-session.ts`
- Test: `src/utils/permissions/__tests__/pathValidation.test.ts`
- Create test: `src/utils/permissions/__tests__/productFilesystemPolicy.test.ts`
- Create test: `src/services/mcp/__tests__/productPolicy.test.ts`
- Test: `packages/remote-control-server/src/__tests__/routes.test.ts`

**Interfaces:**
- Produces: `getProductRuntimeConfig`, `checkProductWriteBoundary`, `filterMcpConfigsForProduct`, `createChatDataRoot`.
- Produces test seam: `setProductRuntimeForTest(config | null)`; production reads the same validated shape from environment variables once at process startup.
- Chat child environment: `CLAUDE_CODE_PRODUCT=chat`, `CLAUDE_CODE_SESSION_DATA_DIR`, `CLAUDE_CODE_BROWSER_SCOPE_ID`, `CLAUDE_CODE_FORCE_SANDBOX=1`, `CLAUDE_CODE_SANDBOX_FAIL_IF_UNAVAILABLE=1`.

- [ ] **Step 1: Write failing boundary and route tests**

```ts
test('denies chat writes outside the canonical session root before internal exceptions', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'chat-root-'))
  try {
    mkdirSync(join(scratch, 'files'))
    setProductRuntimeForTest({ product: 'chat', dataDirectory: scratch })
    expect(checkProductWriteBoundary(join(scratch, 'files', 'out.txt'), 'write')).toBeNull()
    expect(checkProductWriteBoundary('/workspace/source.ts', 'write')?.allowed).toBe(false)
    expect(checkProductWriteBoundary(join(homedir(), '.claude', 'plans', 'x.md'), 'write')?.allowed).toBe(false)
  } finally {
    setProductRuntimeForTest(null)
    rmSync(scratch, { recursive: true, force: true })
  }
})

test('rejects symlink escapes from a chat root', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'chat-root-'))
  const outside = mkdtempSync(join(tmpdir(), 'chat-outside-'))
  try {
    symlinkSync(outside, join(scratch, 'escape'), 'dir')
    setProductRuntimeForTest({ product: 'chat', dataDirectory: scratch })
    expect(checkProductWriteBoundary(join(scratch, 'escape', 'source.ts'), 'write')?.allowed).toBe(false)
  } finally {
    setProductRuntimeForTest(null)
    rmSync(scratch, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
})

test('chat creation rejects client environment and directory fields', async () => {
  const response = await app.request('/web/chat/sessions?uuid=owner-1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'hello', environment_id: 'env-1', directory: '/repo' }),
  })
  expect(response.status).toBe(400)
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `bun test src/utils/permissions/__tests__/productFilesystemPolicy.test.ts src/utils/permissions/__tests__/pathValidation.test.ts src/services/mcp/__tests__/productPolicy.test.ts packages/remote-control-server/src/__tests__/routes.test.ts`

Expected: FAIL because Chat runtime configuration and product policies do not exist.

- [ ] **Step 3: Implement Chat runtime configuration and scratch creation**

`createChatDataRoot(sessionId)` creates `files`, `downloads`, `screenshots`, `temp`, and `logs` under the configured Chat root and rejects roots whose canonical path overlaps any registered Code workspace. `POST /web/chat/sessions` accepts only `title`, `project_id`, and initial message metadata; it automatically chooses an owned active Environment with `capabilities.chat_sandbox === true`.

- [ ] **Step 4: Enforce file and sandbox boundaries**

At the start of `isPathAllowed`, call:

```ts
const productBoundary = checkProductWriteBoundary(resolvedPath, operationType)
if (productBoundary !== null) return productBoundary
```

For Chat, `convertToSandboxRuntimeConfig` returns a write allowlist containing only the canonical session root and its dedicated temp directory, never settings-derived additional directories or worktree Git paths. `getSandboxEnabledSetting()` and `isSandboxRequired()` return true for Chat; `areUnsandboxedCommandsAllowed()` returns false. If sandbox dependencies are unavailable, the child exits before accepting its first message.

- [ ] **Step 5: Filter unsafe local MCP servers**

`filterMcpConfigsForProduct` keeps HTTP/SSE remote MCP and the built-in Claude-in-Chrome bridge. It removes arbitrary local stdio MCP in Chat unless the config has `chatSandboxed: true` and its process launcher receives the Chat cwd and sandbox wrapper. Code behavior remains unchanged.

- [ ] **Step 6: Run security tests and typecheck**

Run: `bun test src/utils/permissions/__tests__/productFilesystemPolicy.test.ts src/utils/permissions/__tests__/pathValidation.test.ts src/services/mcp/__tests__/productPolicy.test.ts packages/remote-control-server/src/__tests__/routes.test.ts`

Expected: PASS.

Run: `bun run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit Chat isolation**

```bash
git add src/utils/productMode.ts src/utils/permissions/productFilesystemPolicy.ts src/services/mcp/productPolicy.ts src/utils/permissions/pathValidation.ts src/utils/sandbox/sandbox-adapter.ts src/main.tsx src/bridge/productRuntime.ts src/bridge/sessionRunner.ts src/bridge/initReplBridge.ts packages/remote-control-server/src/routes/web/chat.ts packages/remote-control-server/src/services/product-session.ts src/utils/permissions/__tests__/productFilesystemPolicy.test.ts src/utils/permissions/__tests__/pathValidation.test.ts src/services/mcp/__tests__/productPolicy.test.ts packages/remote-control-server/src/__tests__/routes.test.ts
git commit -m "feat: isolate chat filesystem writes"
```

---

### Task 6: Apply Live Project Prompts and Idempotent Chat Cleanup

**Files:**
- Create: `src/utils/projectPrompt.ts`
- Create: `packages/remote-control-server/src/services/chat-cleanup.ts`
- Modify: `src/QueryEngine.ts`
- Modify: `src/entrypoints/sdk/controlSchemas.ts`
- Modify: `src/bridge/bridgeMessaging.ts`
- Modify: `src/bridge/sessionRunner.ts`
- Modify: `packages/remote-control-server/src/services/project.ts`
- Modify: `packages/remote-control-server/src/routes/web/chat.ts`
- Modify: `packages/remote-control-server/src/services/environment-command.ts`
- Modify: `packages/@ant/claude-for-chrome-mcp/src/browserTools.ts`
- Modify: `packages/@ant/claude-for-chrome-mcp/src/mcpSocketClient.ts`
- Modify: `packages/@ant/claude-for-chrome-mcp/src/bridgeClient.ts`
- Test: `src/entrypoints/sdk/__tests__/controlSchemas.test.ts`
- Create test: `src/utils/__tests__/projectPrompt.test.ts`
- Test: `src/bridge/__tests__/bridgeMessaging.test.ts`
- Test: `packages/remote-control-server/src/__tests__/services.test.ts`
- Test: `packages/remote-control-server/src/__tests__/routes.test.ts`

**Interfaces:**
- Produces: `getProjectPromptSection`, `setProjectPrompt`, SDK control subtype `set_project_prompt`, `deleteChatSession`, `deleteChatProject`.
- Browser cleanup tool: `tabs_close_mcp({ tabIds: number[] })`.

- [ ] **Step 1: Write failing prompt and cleanup tests**

```ts
test('updates project prompt as a system section on the next turn', () => {
  setProjectPrompt({ text: 'First', revision: 1 })
  expect(getProjectPromptSection()).toEqual('First')
  setProjectPrompt({ text: 'Second', revision: 2 })
  expect(getProjectPromptSection()).toEqual('Second')
  expect(() => setProjectPrompt({ text: 'Old', revision: 1 })).toThrow(/stale revision/)
})

test('deletes chat content immediately and retries offline runtime cleanup', async () => {
  seedChatSessionWithEvents('session-chat')
  environmentCommandMock.reject(new Error('offline'))
  await deleteChatSession('session-chat', 'owner-1')
  expect(getSession('session-chat')).toBeNull()
  expect(listEvents('session-chat')).toEqual([])
  expect(getCleanupTombstone('session-chat')).toMatchObject({ attemptCount: 1 })
})

test('chat project deletion cascades every session', async () => {
  const project = seedChatProjectWithSessions(2)
  await deleteChatProject(project.id, 'owner-1')
  expect(getProject(project.id)).toBeNull()
  expect(listSessionsByProject(project.id)).toEqual([])
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `bun test src/utils/__tests__/projectPrompt.test.ts src/entrypoints/sdk/__tests__/controlSchemas.test.ts src/bridge/__tests__/bridgeMessaging.test.ts packages/remote-control-server/src/__tests__/services.test.ts packages/remote-control-server/src/__tests__/routes.test.ts`

Expected: FAIL because dynamic prompt control and cleanup orchestration are absent.

- [ ] **Step 3: Implement system-layer prompt revisions**

Add `set_project_prompt` to the SDK control request union:

```ts
z.object({
  subtype: z.literal('set_project_prompt'),
  prompt: z.string(),
  revision: z.number().int().nonnegative(),
})
```

`sessionRunner` writes the initial prompt to the session-managed prompt file. `QueryEngine.ask()` reads `getProjectPromptSection()` while assembling each turn's system prompt and inserts it after the default/custom base prompt but before the user-configured append prompt. The bridge handler updates prompt state only between turns and rejects stale revisions. No prompt text enters the user message array.

- [ ] **Step 4: Implement browser ownership close support**

Add `tabs_close_mcp` with `{ tabIds: number[] }`. The Chrome client tracks the initial tab snapshot separately from later `tabs_create_mcp` results. Only later-created tab IDs are reported as owned. Cleanup sends owned IDs; missing/already-closed tab responses count as success. Existing attached tabs are never added to the owned set.

- [ ] **Step 5: Implement deletion orchestration and tombstone retry**

`deleteChatSession` follows this exact order: mark deleting, publish interrupt, send `cleanup_chat_session`, delete events/owners/session content, and retain a minimal tombstone only if runtime cleanup failed. `deleteChatProject` snapshots its Chat session IDs, calls the same idempotent deletion for each, then deletes the project. Reconnect processing drains tombstones before new sessions.

- [ ] **Step 6: Run focused tests and typecheck**

Run: `bun test src/utils/__tests__/projectPrompt.test.ts src/entrypoints/sdk/__tests__/controlSchemas.test.ts src/bridge/__tests__/bridgeMessaging.test.ts packages/remote-control-server/src/__tests__/services.test.ts packages/remote-control-server/src/__tests__/routes.test.ts`

Expected: PASS.

Run: `bun run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit prompts and cleanup**

```bash
git add src/utils/projectPrompt.ts packages/remote-control-server/src/services/chat-cleanup.ts src/QueryEngine.ts src/entrypoints/sdk/controlSchemas.ts src/bridge/bridgeMessaging.ts src/bridge/sessionRunner.ts packages/remote-control-server/src/services/project.ts packages/remote-control-server/src/routes/web/chat.ts packages/remote-control-server/src/services/environment-command.ts packages/@ant/claude-for-chrome-mcp/src/browserTools.ts packages/@ant/claude-for-chrome-mcp/src/mcpSocketClient.ts packages/@ant/claude-for-chrome-mcp/src/bridgeClient.ts src/entrypoints/sdk/__tests__/controlSchemas.test.ts src/utils/__tests__/projectPrompt.test.ts src/bridge/__tests__/bridgeMessaging.test.ts packages/remote-control-server/src/__tests__/services.test.ts packages/remote-control-server/src/__tests__/routes.test.ts
git commit -m "feat: apply project prompts and clean chat data"
```

---

### Task 7: Split Web Client State, Navigation, and Session Creation

**Files:**
- Modify: `packages/remote-control-server/web/src/types/index.ts`
- Modify: `packages/remote-control-server/web/src/api/client.ts`
- Modify: `packages/remote-control-server/web/src/hooks/useWorkspaceData.ts`
- Modify: `packages/remote-control-server/web/src/shell/Sidebar.tsx`
- Modify: `packages/remote-control-server/web/src/shell/createSession.ts`
- Modify: `packages/remote-control-server/web/src/App.tsx`
- Test: `packages/remote-control-server/web/src/__tests__/api-client.test.ts`
- Create test: `packages/remote-control-server/web/src/__tests__/product-state.test.ts`

**Interfaces:**
- Consumes: split server routes.
- Produces: `apiFetchChatSessions`, `apiFetchCodeSessions`, `apiFetchChatProjects`, `apiFetchCodeProjects`, `apiCreateChatSession`, `apiCreateCodeSession`, `apiListRemoteDirectory`, `apiUpdateProjectPrompt`.
- Produces pure `partitionProductSessions(sessions)` for rendering safeguards.

- [ ] **Step 1: Write failing API and state tests**

```ts
test('uses explicit product endpoints and distinct creation bodies', async () => {
  await client.apiCreateChatSession({ title: 'Hello', project_id: 'chat-1' })
  expect(fetchMock.lastUrl).toContain('/web/chat/sessions?')
  expect(fetchMock.lastOpts.body).toBe(JSON.stringify({ title: 'Hello', project_id: 'chat-1' }))
  await client.apiCreateCodeSession({ environment_id: 'env-1', requested_directory: '/repo' })
  expect(fetchMock.lastUrl).toContain('/web/code/sessions?')
})

test('partitions sessions without trusting the active route', () => {
  expect(partitionProductSessions([
    { id: 'a', product: 'chat', status: 'idle' },
    { id: 'b', product: 'code', status: 'idle' },
  ])).toEqual({ chat: [expect.objectContaining({ id: 'a' })], code: [expect.objectContaining({ id: 'b' })] })
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `bun test packages/remote-control-server/web/src/__tests__/api-client.test.ts packages/remote-control-server/web/src/__tests__/product-state.test.ts`

Expected: FAIL because explicit product client functions and partitioning do not exist.

- [ ] **Step 3: Implement product DTOs and APIs**

Make `Session.product` required. Add `Project`, `RemoteDirectoryEntry`, `RemoteDirectoryListing`, and `ResolvedWorkspace` DTOs matching server snake_case responses. Remove `environmentId` from Chat creation types. Keep Code creation types explicit and immutable.

- [ ] **Step 4: Split shared state and route rendering**

`useWorkspaceData` fetches Chat sessions/projects and Code sessions/projects independently. `Sidebar` receives only the active product's already-partitioned sessions. `App` rejects a URL that attempts to open a Code session through a Chat route, redirects to the correct product route, and never passes the combined list into a product sidebar.

- [ ] **Step 5: Run Web tests and build**

Run: `bun test packages/remote-control-server/web/src/__tests__/api-client.test.ts packages/remote-control-server/web/src/__tests__/product-state.test.ts`

Expected: PASS.

Run: `bun run --cwd packages/remote-control-server build:web`

Expected: Vite build exits 0.

- [ ] **Step 6: Commit Web product separation**

```bash
git add packages/remote-control-server/web/src/types/index.ts packages/remote-control-server/web/src/api/client.ts packages/remote-control-server/web/src/hooks/useWorkspaceData.ts packages/remote-control-server/web/src/shell/Sidebar.tsx packages/remote-control-server/web/src/shell/createSession.ts packages/remote-control-server/web/src/App.tsx packages/remote-control-server/web/src/__tests__/api-client.test.ts packages/remote-control-server/web/src/__tests__/product-state.test.ts
git commit -m "feat: separate chat and code web state"
```

---

### Task 8: Build Chat/Code Project Pages and the Remote Directory Picker

**Files:**
- Create: `packages/remote-control-server/web/src/lib/remote-directory-model.ts`
- Create: `packages/remote-control-server/web/src/components/RemoteDirectoryPicker.tsx`
- Create: `packages/remote-control-server/web/src/components/ProjectPromptEditor.tsx`
- Create: `packages/remote-control-server/web/src/pages/ChatProjectsPage.tsx`
- Create: `packages/remote-control-server/web/src/pages/CodeProjectsPage.tsx`
- Modify: `packages/remote-control-server/web/src/pages/ChatHome.tsx`
- Modify: `packages/remote-control-server/web/src/pages/CodeHome.tsx`
- Modify: `packages/remote-control-server/web/src/shell/Sidebar.tsx`
- Modify: `packages/remote-control-server/web/src/App.tsx`
- Remove after migration: `packages/remote-control-server/web/src/pages/ProjectsPage.tsx`
- Create test: `packages/remote-control-server/web/src/__tests__/remote-directory-model.test.ts`
- Create test: `packages/remote-control-server/web/src/__tests__/project-pages-model.test.ts`

**Interfaces:**
- Consumes: Task 7 product APIs.
- Produces: `createRemoteDirectoryState`, `enterDirectory`, `goToParent`, `goBack`, `applyListing`, `canConfirmWorkspace`.

- [ ] **Step 1: Write failing picker model and project model tests**

```ts
test('enters directories but never files', () => {
  const state = applyListing(createRemoteDirectoryState('/workspace'), {
    path: '/workspace',
    entries: [
      { name: 'src', kind: 'directory' },
      { name: 'README.md', kind: 'file' },
    ],
  })
  expect(enterDirectory(state, 'src').requestedPath).toBe('/workspace/src')
  expect(enterDirectory(state, 'README.md')).toEqual(state)
})

test('back, parent, refresh, and confirmation preserve canonical directory semantics', () => {
  const state = applyListing(createRemoteDirectoryState('/workspace/src'), {
    path: '/workspace/src', entries: [],
  })
  expect(goToParent(state).requestedPath).toBe('/workspace')
  expect(canConfirmWorkspace(state)).toBe(true)
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `bun test packages/remote-control-server/web/src/__tests__/remote-directory-model.test.ts packages/remote-control-server/web/src/__tests__/project-pages-model.test.ts`

Expected: FAIL because the picker and separate project models do not exist.

- [ ] **Step 3: Implement the pure picker state machine**

Use this state shape:

```ts
export interface RemoteDirectoryState {
  pathInput: string
  requestedPath: string
  validatedInputPath: string | null
  canonicalPath: string | null
  entries: RemoteDirectoryEntry[]
  backStack: string[]
  loading: boolean
  error: string | null
}
```

Folder entry changes push the prior path onto `backStack`; file entries are inert. Confirmation is enabled only when `validatedInputPath === requestedPath`, `canonicalPath` is non-null, loading is false, and error is null. This permits a symlink input to validate while still storing the canonical target for project identity.

- [ ] **Step 4: Implement the polished directory picker**

Match the approved interaction, not the rough mockup styling: editable absolute path bar, Back/Up/Refresh controls, clear device identity, loading skeleton, directory-first rows, folder chevrons, visually disabled file rows, keyboard Enter for paths, double-click/Enter for folders, and a footer that states the immutable selected workspace. Cancel stale requests with `AbortController` when the user changes paths rapidly.

- [ ] **Step 5: Replace the shared project page and creation controls**

`ChatHome` has no Environment or folder picker. It optionally selects a Chat project. `ChatProjectsPage` supports create, rename, prompt edit, move conversation, and destructive cascading delete confirmation. `CodeHome` uses `RemoteDirectoryPicker`; `CodeProjectsPage` shows canonical path, archive/restore, prompt edit, and sessions. Add a Code “项目” sidebar entry.

- [ ] **Step 6: Run Web tests and build**

Run: `bun test packages/remote-control-server/web/src/__tests__/remote-directory-model.test.ts packages/remote-control-server/web/src/__tests__/project-pages-model.test.ts packages/remote-control-server/web/src/__tests__/api-client.test.ts`

Expected: PASS.

Run: `bun run --cwd packages/remote-control-server build:web`

Expected: Vite build exits 0.

- [ ] **Step 7: Commit the product UX**

```bash
git add packages/remote-control-server/web/src/lib/remote-directory-model.ts packages/remote-control-server/web/src/components/RemoteDirectoryPicker.tsx packages/remote-control-server/web/src/components/ProjectPromptEditor.tsx packages/remote-control-server/web/src/pages/ChatProjectsPage.tsx packages/remote-control-server/web/src/pages/CodeProjectsPage.tsx packages/remote-control-server/web/src/pages/ChatHome.tsx packages/remote-control-server/web/src/pages/CodeHome.tsx packages/remote-control-server/web/src/shell/Sidebar.tsx packages/remote-control-server/web/src/App.tsx packages/remote-control-server/web/src/pages/ProjectsPage.tsx packages/remote-control-server/web/src/__tests__/remote-directory-model.test.ts packages/remote-control-server/web/src/__tests__/project-pages-model.test.ts
git commit -m "feat: add product projects and remote folder picker"
```

---

### Task 9: Verify Migration, Security, Cleanup, and End-to-End Product Isolation

**Files:**
- Modify: `packages/remote-control-server/src/__tests__/persistence.test.ts`
- Modify: `packages/remote-control-server/src/__tests__/routes.test.ts`
- Create: `packages/remote-control-server/src/__tests__/product-isolation.integration.test.ts`
- Create: `src/bridge/__tests__/chatSandbox.integration.test.ts`
- Create: `packages/remote-control-server/src/__tests__/product-isolation-harness.ts`
- Modify: `docs/features/bridge-mode.md`
- Modify: `README.md`
- Modify: `package.json`

**Interfaces:**
- Consumes all previous tasks.
- Produces no new runtime API; this task closes coverage and documentation gaps.
- Produces the test-only `ProductIsolationHarness` with concrete methods `createCodeSession`, `createChatProject`, `createChatSession`, `attemptChatWrite`, `deleteChatProject`, `archiveCodeProject`, and lookup/path helpers used by the integration test below.

- [ ] **Step 1: Add the full migration fixture and end-to-end isolation tests**

The integration test must execute this scenario:

```ts
test('keeps chat disposable and code workspace-bound across the full lifecycle', async () => {
  const harness = new ProductIsolationHarness()
  const code = await harness.createCodeSession('/repo-link')
  const codeAgain = await harness.createCodeSession('/real/repo')
  expect(code.project_id).toBe(codeAgain.project_id)

  const chatProject = await harness.createChatProject('Research')
  const chat = await harness.createChatSession(chatProject.id)
  expect(chat.product).toBe('chat')
  expect(chat.directory).toMatch(/chat-sessions\/session_/)
  expect(await harness.attemptChatWrite('/real/repo/source.ts')).toMatchObject({ allowed: false })
  expect(await harness.attemptChatWrite(join(chat.directory, 'files', 'notes.md'))).toMatchObject({ allowed: true })

  await harness.deleteChatProject(chatProject.id)
  expect(await harness.fetchChatSession(chat.id)).toBeNull()
  expect(await harness.pathExists(chat.directory)).toBe(false)

  await harness.archiveCodeProject(code.project_id)
  expect(await harness.pathExists('/real/repo')).toBe(true)
  expect(await harness.fetchArchivedCodeProject(code.project_id)).not.toBeNull()
})
```

Add a database fixture created at schema version 3 and verify reopening migrates all legacy sessions to `product='code'` without deleting events.

- [ ] **Step 2: Run integration tests and verify PASS**

Run: `bun test packages/remote-control-server/src/__tests__/product-isolation.integration.test.ts src/bridge/__tests__/chatSandbox.integration.test.ts`

Expected: PASS. If a test fails, return to the owning task's RED/GREEN cycle before continuing this verification task.

- [ ] **Step 3: Document operator-visible behavior**

Document the Chat scratch root configuration, `chat_sandbox` runtime capability, `.real-agentc/` Code artifact directory, legacy migration behavior, archive-versus-delete semantics, offline cleanup tombstones, and the fact that external browser actions are not reversible. Add this exact root script to `package.json`: `"test:all": "bun run typecheck && bun run lint && bun test && bun run --cwd packages/remote-control-server build:web"`.

- [ ] **Step 4: Run fresh full verification**

Run: `bun run typecheck`

Expected: exit 0, zero TypeScript errors.

Run: `bun run lint`

Expected: exit 0, zero lint errors.

Run: `bun test`

Expected: exit 0, zero failed tests.

Run: `bun run --cwd packages/remote-control-server build:web`

Expected: Vite build exits 0.

Run: `bun run test:all`

Expected: exit 0 after running typecheck, lint, all Bun tests, and the Remote Control Web build.

- [ ] **Step 5: Review the requirements line by line**

Confirm with fresh evidence that Chat cannot select a workspace, Chat writes only to its session root, Chat deletion cleans or tombstones runtime data, Code resolves folders remotely, identical real paths share a project, Code sessions cannot switch workspaces, platform artifacts use `.real-agentc/`, product prompts update on the next turn, product lists never cross, and Code hard deletion requires confirmed folder absence.

- [ ] **Step 6: Commit final coverage and documentation**

```bash
git add packages/remote-control-server/src/__tests__/persistence.test.ts packages/remote-control-server/src/__tests__/routes.test.ts packages/remote-control-server/src/__tests__/product-isolation.integration.test.ts packages/remote-control-server/src/__tests__/product-isolation-harness.ts src/bridge/__tests__/chatSandbox.integration.test.ts docs/features/bridge-mode.md README.md package.json
git commit -m "test: verify chat and code product isolation"
```

---

## Spec Coverage Matrix

- Domain model, migration, and product invariants: Tasks 1–2.
- Product-specific APIs and list isolation: Tasks 2 and 7.
- Remote directory browsing, canonical identity, and immutable Code workspaces: Tasks 3–4 and 8.
- `.real-agentc/` Code artifacts and archive/missing lifecycle: Task 4.
- Chat scratch directories, file-tool/Shell/subagent/MCP isolation, and fail-closed sandboxing: Task 5.
- Project prompt revisions, browser ownership, cascading deletion, and offline cleanup: Task 6.
- Chat/Code product UX and the approved folder-picker interaction: Tasks 7–8.
- Legacy migration, integration coverage, operator documentation, and final verification: Task 9.
