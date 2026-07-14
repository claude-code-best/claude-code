# Chat/Code Project UX Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the Web UI to the product-specific Chat/Code project APIs, expose project details and prompts, and reduce the session UI to a compact, product-isolated workspace.

**Architecture:** Keep the existing AppShell and WorkCenter, but replace the mixed legacy `/web/sessions` data source with product-specific API slices. Use a shared project/session list presentation with product adapters, while keeping Chat project assignment and Code workspace upsert rules separate. Pass the persisted project prompt through the work payload into the bridge CLI only for newly spawned sessions.

**Tech Stack:** Bun, Hono, React 19, TypeScript, Vite, Tailwind utility classes, Radix DropdownMenu, Bun test.

## Global Constraints

- Chat sessions must call `/web/chat/sessions` and must not submit workspace/environment fields.
- Code sessions must call `/web/code/sessions` and must include `environment_id` and `requested_directory`.
- Project identity must remain product-specific; never use an environment id as a project id.
- Code project deletion remains archive-only; restore uses the existing restore endpoint.
- Project prompts are additive system instructions and apply to newly spawned sessions only.
- Preserve unrelated user changes in the dirty worktree; stage only files belonging to each task.
- Use red-green-refactor for every new behavior and run `bun run typecheck` plus the relevant test suite after each task.

---

### Task 1: Product data contracts, API client, and workspace slices

**Files:**
- Modify: `packages/remote-control-server/web/src/types/index.ts`
- Modify: `packages/remote-control-server/web/src/api/client.ts`
- Modify: `packages/remote-control-server/web/src/hooks/useWorkspaceData.ts`
- Test: `packages/remote-control-server/web/src/__tests__/api-client.test.ts`
- Test: `packages/remote-control-server/web/src/__tests__/work-center-model.test.ts`

**Interfaces:**
- Produce `Project` with `id`, `product`, `name`, `project_prompt`, `prompt_revision`, `state`, optional Code workspace fields, and timestamps.
- Produce `ProductWorkspaceData` with `{ sessions, projects, environments }` for `chat` and `code` slices.
- Produce API functions: `apiFetchChatProjects`, `apiCreateChatProject`, `apiUpdateProjectPrompt`, `apiFetchChatSessions`, `apiCreateChatSession`, `apiAssignChatSessionProject`, `apiDeleteChatProject`, `apiFetchCodeProjects`, `apiFetchCodeSessions`, `apiCreateCodeSession`, `apiArchiveCodeProject`, `apiRestoreCodeProject`.

- [ ] **Step 1: Write failing API and slice tests**

Add tests that assert product endpoints and request bodies. Reuse the in-memory `fetch` replacement already defined in `api-client.test.ts`:

```ts
test('creates a Chat session with only title and project_id', async () => {
  fetchMock.responseData = { id: 's1' };
  await apiCreateChatSession({ title: 'Idea', project_id: 'chat-project-1' });
  expect(fetchMock.lastUrl).toContain('/web/chat/sessions');
  expect(JSON.parse(fetchMock.lastOpts.body as string)).toEqual({ title: 'Idea', project_id: 'chat-project-1' });
});

test('creates a Code session with workspace fields', async () => {
  fetchMock.responseData = { id: 's1' };
  await apiCreateCodeSession({
    environment_id: 'env-1', requested_directory: '/repo', permission_mode: 'default', title: 'Fix bug',
  });
  expect(fetchMock.lastUrl).toContain('/web/code/sessions');
  expect(JSON.parse(fetchMock.lastOpts.body as string)).toMatchObject({ environment_id: 'env-1', requested_directory: '/repo' });
});
```

Run: `bun test packages/remote-control-server/web/src/__tests__/api-client.test.ts`

Expected: FAIL because the product functions do not exist.

- [ ] **Step 2: Implement product types and client functions**

Extend `Session` with `product`, `project_id`, `data_directory`, and `project_prompt_revision`; add `Project`; implement each function through the existing `api()` helper so UUID/token behavior remains centralized.

- [ ] **Step 3: Implement product-specific `useWorkspaceData`**

Fetch Chat sessions/projects, Code sessions/projects, and environments in one `Promise.all`, expose `chat`, `code`, `environments`, `loaded`, and `refresh`, and retain a compatibility `sessions` getter that returns the currently combined non-archived list only for legacy pages.

- [ ] **Step 4: Run tests and typecheck**

Run: `bun test packages/remote-control-server/web/src/__tests__/api-client.test.ts && bun run typecheck`

Expected: PASS with zero TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add packages/remote-control-server/web/src/types/index.ts packages/remote-control-server/web/src/api/client.ts packages/remote-control-server/web/src/hooks/useWorkspaceData.ts packages/remote-control-server/web/src/__tests__/api-client.test.ts
git commit -m "feat: add product-specific project APIs"
```

### Task 2: Make project prompts effective in newly spawned sessions

**Files:**
- Modify: `packages/remote-control-server/src/services/work-dispatch.ts`
- Modify: `src/bridge/types.ts`
- Modify: `src/bridge/bridgeMain.ts`
- Modify: `src/bridge/sessionRunner.ts`
- Test: `packages/remote-control-server/src/__tests__/work-dispatch.test.ts`
- Test: `src/bridge/__tests__/bridgeApi.test.ts`

**Interfaces:**
- `SessionWorkData` gains optional `project_prompt?: string`.
- `SessionSpawnOpts` gains optional `projectPrompt?: string`.
- `createSessionSpawner` appends `['--append-system-prompt', projectPrompt]` when the prompt is non-empty.

- [ ] **Step 1: Write the failing propagation tests**

Add a work-dispatch assertion that a session with `projectId` returns the project prompt, and a session-runner spawn assertion that the CLI args contain the prompt flag.

Run: `bun test packages/remote-control-server/src/__tests__/work-dispatch.test.ts src/bridge/__tests__/bridgeApi.test.ts`

Expected: FAIL because the work payload and spawn options omit the prompt.

- [ ] **Step 2: Implement the minimal propagation**

Read `storeGetProject(session.projectId)` in `pollWork`; include only a non-empty prompt. Forward it from `bridgeMain` to `SessionSpawnOpts`; append the CLI flag in `sessionRunner` without changing existing product sandbox behavior.

- [ ] **Step 3: Run focused tests and typecheck**

Run: `bun test packages/remote-control-server/src/__tests__/work-dispatch.test.ts src/bridge/__tests__/bridgeApi.test.ts && bun run typecheck`

Expected: PASS with zero TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add packages/remote-control-server/src/services/work-dispatch.ts src/bridge/types.ts src/bridge/bridgeMain.ts src/bridge/sessionRunner.ts packages/remote-control-server/src/__tests__/work-dispatch.test.ts src/bridge/__tests__/bridgeApi.test.ts
git commit -m "feat: apply project prompts to new bridge sessions"
```

### Task 3: Product project pages and creation flows

**Files:**
- Modify: `packages/remote-control-server/web/src/pages/ChatHome.tsx`
- Modify: `packages/remote-control-server/web/src/pages/CodeHome.tsx`
- Modify: `packages/remote-control-server/web/src/pages/ProjectsPage.tsx`
- Modify: `packages/remote-control-server/web/src/shell/createSession.ts`
- Create: `packages/remote-control-server/web/src/pages/ProjectDetailPage.tsx`
- Modify: `packages/remote-control-server/web/src/App.tsx`
- Modify: `packages/remote-control-server/web/src/shell/Sidebar.tsx`
- Test: `packages/remote-control-server/web/src/__tests__/project-pages.test.tsx`

**Interfaces:**
- `ChatHome` receives Chat projects and creates a Chat session with optional `project_id`.
- `CodeHome` creates Code sessions with `environment_id` and `requested_directory`.
- `ProjectDetailPage` accepts `{ product, project, sessions, environments, onOpenSession, onRefresh }` and owns prompt save/archive/restore actions.
- `ShellNav` adds `goCodeProjects` and `goCodeProject`; `ShellView` adds `code-projects` and `code-project`.

- [ ] **Step 1: Write failing page behavior tests**

Cover Chat project selection/new project, Code session request body, and Code project navigation using `renderToStaticMarkup`, matching the existing Web tests (the package has no DOM testing dependency):

```tsx
test('Code projects render workspace identity and prompt editor', () => {
  const markup = renderToStaticMarkup(createElement(ProjectDetailPage, {
    product: 'code', project: codeProject, sessions: [], environments: [], onRefresh: () => {},
  }));
  expect(markup).toContain('/repo');
  expect(markup).toContain('项目提示词');
});
```

Run: `bun test packages/remote-control-server/web/src/__tests__/project-pages.test.tsx`

Expected: FAIL because the product-aware props/routes do not exist.

- [ ] **Step 2: Implement ChatHome project picker and creation**

Remove `EnvPicker` from ChatHome, add a top-right/project toolbar selector with “无项目”, existing project options, and an inline new-project dialog. Submit through `apiCreateChatSession`, storing the pending first message for SessionDetail as the existing shell helper does.

- [ ] **Step 3: Implement CodeHome product session creation**

Keep environment, permission, and directory controls; call `apiCreateCodeSession`, pass `requested_directory` (defaulting to selected environment directory), and navigate to the created session.

- [ ] **Step 4: Replace environment-as-project page with product project detail**

Use `Project` records instead of `Environment` records. Chat projects can be created/deleted and edit prompts; Code projects show canonical path/git fields and archive/restore. Filter sessions by `project_id` and render shared session rows.

- [ ] **Step 5: Add App routes and sidebar entries**

Parse `/code/projects` and `#project=<id>` for Code, wire product-specific data slices into pages, and ensure Chat and Code project links call their own navigation functions.

- [ ] **Step 6: Run focused tests, typecheck, and commit**

Run: `bun test packages/remote-control-server/web/src/__tests__/project-pages.test.tsx && bun run typecheck`

```bash
git add packages/remote-control-server/web/src/pages/ChatHome.tsx packages/remote-control-server/web/src/pages/CodeHome.tsx packages/remote-control-server/web/src/pages/ProjectsPage.tsx packages/remote-control-server/web/src/pages/ProjectDetailPage.tsx packages/remote-control-server/web/src/App.tsx packages/remote-control-server/web/src/shell/Sidebar.tsx packages/remote-control-server/web/src/__tests__/project-pages.test.tsx
git commit -m "feat: expose product project pages and creation flows"
```

### Task 4: Session actions, right-click menu, and compact runtime layout

**Files:**
- Create: `packages/remote-control-server/web/src/components/SessionListItem.tsx`
- Create: `packages/remote-control-server/web/src/components/SessionContextMenu.tsx`
- Modify: `packages/remote-control-server/web/src/components/SessionActions.tsx`
- Modify: `packages/remote-control-server/web/src/pages/ChatsPage.tsx`
- Modify: `packages/remote-control-server/web/src/pages/ProjectsPage.tsx`
- Modify: `packages/remote-control-server/web/src/shell/Sidebar.tsx`
- Modify: `packages/remote-control-server/web/src/shell/AppShell.tsx`
- Modify: `packages/remote-control-server/web/src/pages/SessionDetail.tsx`
- Test: `packages/remote-control-server/web/src/__tests__/session-actions-ui.test.tsx`

**Interfaces:**
- `SessionContextMenu` accepts `session`, `product`, pointer coordinates, `onClose`, lifecycle callbacks, and optional Chat project assignment callbacks.
- `SessionListItem` renders a row with left-click navigation, right-click menu, and accessible More button.

- [ ] **Step 1: Write failing UI tests**

Test that a context-menu event opens actions and that the compact header retains the title while omitting the old cwd/creation block.

Run: `bun test packages/remote-control-server/web/src/__tests__/session-actions-ui.test.tsx`

Expected: FAIL because the context menu/list item does not exist.

- [ ] **Step 2: Implement the shared context menu**

Use a controlled absolute-position menu rendered from a portal/root overlay; prevent the browser menu, clamp coordinates to viewport, close on escape/outside click, and reuse existing `SessionActions` callbacks. Keep the three-dot trigger for pointer and keyboard users.

- [ ] **Step 3: Replace list rows in sidebar, chats, and project details**

Use `SessionListItem` in all three places, pass only product-compatible actions, and show project names in Chat rows where available.

- [ ] **Step 4: Compact SessionDetail and move runtime information**

Reduce the header to one row, remove cwd/created-at metadata and the standalone `SessionControlBar` from the chat column, and surface its controls through the existing WorkCenter runtime/context panels. Keep ACP detail compact as well.

- [ ] **Step 5: Persist sidebar collapse and increase typography**

Initialize `collapsed` from `localStorage` key `rcs-sidebar-collapsed`, write on change, set expanded width to 300px, and raise nav/recent/section classes to at least 14/14/12px while preserving tooltips and mobile behavior.

- [ ] **Step 6: Run focused tests, typecheck, and commit**

Run: `bun test packages/remote-control-server/web/src/__tests__/session-actions-ui.test.tsx && bun run typecheck`

```bash
git add packages/remote-control-server/web/src/components/SessionListItem.tsx packages/remote-control-server/web/src/components/SessionContextMenu.tsx packages/remote-control-server/web/src/components/SessionActions.tsx packages/remote-control-server/web/src/pages/ChatsPage.tsx packages/remote-control-server/web/src/pages/ProjectsPage.tsx packages/remote-control-server/web/src/shell/Sidebar.tsx packages/remote-control-server/web/src/shell/AppShell.tsx packages/remote-control-server/web/src/pages/SessionDetail.tsx packages/remote-control-server/web/src/__tests__/session-actions-ui.test.tsx
git commit -m "feat: add session context actions and compact runtime layout"
```

### Task 5: Integration verification and frontend rebuild

**Files:**
- Modify only files required by failing integration checks.
- Test: all Web and Remote Control Server tests.

- [ ] **Step 1: Run full tests**

Run: `bun test packages/remote-control-server/src packages/remote-control-server/web/src`

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run typecheck and lint**

Run: `bun run typecheck && bun run lint`

Expected: exit code 0 with no TypeScript or lint errors.

- [ ] **Step 3: Build the frontend**

Run: `bun run build:web` from `packages/remote-control-server`.

Expected: Vite emits `web/dist` successfully.

- [ ] **Step 4: Run a static smoke check**

Start the RCS in an approved host process, request `/health`, `/code/`, `/code/chat`, and `/code/projects`, then stop only the process started for this check.

- [ ] **Step 5: Commit integration fixes**

If integration fixes are required, first review `git diff --name-only`, stage each changed path explicitly, and run `git commit -m "test: verify product project experience"`; if no fixes are required, leave this task uncommitted.
