# Feature Capabilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make feature environment values predictable and expose the compiled capabilities and usage of the current CLI through text and JSON output.

**Architecture:** Centralize feature resolution in a pure build helper used by dev, Bun build, and Vite. Inject the final feature set into a compile-time macro and render it through a lightweight CLI handler, while preserving Bun's direct conditional `feature('X')` requirements.

**Tech Stack:** Bun build features, Vite/Rollup plugin, TypeScript, Commander, `bun:test`.

## Global Constraints

- Truthy values are `1`, `true`, `yes`, `on`; false values are `0`, `false`, `no`, `off`, case-insensitive.
- Explicit false removes a feature from defaults; unknown non-empty values warn and are ignored.
- `BRIDGE_MODE`, `SESSION_TERMINALS`, and `DAEMON` remain in the unmodified default build set.
- The manifest describes compile-time state and cannot be altered by setting `FEATURE_*` when starting an already-built artifact.
- Do not replace or dynamically call `feature()` in production source.
- Existing unrelated dirty-worktree changes must be preserved; strict typecheck remains zero-error.
- Files already dirty at task start are never whole-file staged by this plan; clean task-owned files may be committed separately.

---

## File Map

- `scripts/feature-resolution.ts`: shared pure environment parser.
- `scripts/__tests__/feature-resolution.test.ts`: truth table and required-default tests.
- `scripts/defines.ts`: `MACRO.COMPILED_FEATURES` define.
- `scripts/dev.ts`, `build.ts`, `scripts/vite-plugin-feature-flags.ts`: shared final set.
- `src/types/global.d.ts`, `src/entrypoints/cli.tsx`: macro typing/fallback and fast path.
- `src/cli/handlers/capabilities.ts`: capability model and text/JSON rendering.
- `src/cli/handlers/__tests__/capabilities.test.ts`: output contract.
- `src/main.tsx`: root help registration.
- `docs/features/all-features-guide.md`: discovery documentation.

### Task 1: Centralize feature environment resolution

**Files:**
- Create: `scripts/feature-resolution.ts`
- Create: `scripts/__tests__/feature-resolution.test.ts`
- Modify: `scripts/dev.ts`
- Modify: `build.ts`
- Modify: `scripts/vite-plugin-feature-flags.ts`

**Interfaces:**
- Produces `resolveEnabledFeatures(defaults: readonly string[], env: NodeJS.ProcessEnv, warn?: (message: string) => void): string[]`.

- [ ] **Step 1: Write the failing truth-table test**

```ts
const result = resolveEnabledFeatures(['DEFAULT', 'DISABLED'], {
  FEATURE_DEFAULT: '0',
  FEATURE_DISABLED: 'false',
  FEATURE_ADDED: 'YeS',
  FEATURE_OTHER: 'on',
  FEATURE_UNKNOWN: 'maybe',
}, warning => warnings.push(warning))

expect(result).toEqual(['ADDED', 'OTHER'])
expect(warnings).toEqual([
  'Ignoring FEATURE_UNKNOWN=maybe; expected 1/true/yes/on or 0/false/no/off',
])
```

Also assert `DEFAULT_BUILD_FEATURES` contains `BRIDGE_MODE`, `SESSION_TERMINALS`, and `DAEMON`.

- [ ] **Step 2: Verify RED**

Run: `bun test scripts/__tests__/feature-resolution.test.ts`

Expected: FAIL because shared resolver does not exist.

- [ ] **Step 3: Implement and adopt the resolver**

Start from a `Set(defaults)`, sort `FEATURE_*` entries by key for deterministic warnings, add/remove recognized values, preserve default order followed by sorted additions, and return an array. Replace all name-only environment scans in the three build paths with this function.

- [ ] **Step 4: Verify GREEN**

Run: `bun test scripts/__tests__/feature-resolution.test.ts`

Expected: PASS, including `FEATURE_DEFAULT=0` removal.

- [ ] **Step 5: Commit**

```bash
git add scripts/feature-resolution.ts scripts/__tests__/feature-resolution.test.ts scripts/dev.ts build.ts scripts/vite-plugin-feature-flags.ts
git commit -m "fix: 统一 feature 环境变量语义"
```

### Task 2: Inject the compiled feature manifest

**Files:**
- Modify: `scripts/defines.ts`
- Modify: `scripts/dev.ts`
- Modify: `build.ts`
- Modify: `src/types/global.d.ts`
- Modify: `src/entrypoints/cli.tsx`
- Test: `scripts/__tests__/feature-resolution.test.ts`

**Interfaces:**
- Changes signature to `getMacroDefines(compiledFeatures?: readonly string[]): Record<string, string>`.
- Produces compile-time `MACRO.COMPILED_FEATURES: readonly string[]`.

- [ ] **Step 1: Write a failing macro test**

```ts
expect(JSON.parse(getMacroDefines(['A', 'B'])['MACRO.COMPILED_FEATURES']!)).toEqual(['A', 'B'])
```

- [ ] **Step 2: Verify RED**

Run: `bun test scripts/__tests__/feature-resolution.test.ts`

Expected: FAIL because the macro is absent.

- [ ] **Step 3: Add and wire the macro**

Pass the final resolved set to `getMacroDefines(features)` in dev and build; declare `COMPILED_FEATURES` globally. The direct-source fallback in `cli.tsx` sets it to `[]`, accurately indicating that a raw unsupported launch did not receive a compiled manifest.

- [ ] **Step 4: Verify GREEN and typecheck**

Run: `bun test scripts/__tests__/feature-resolution.test.ts && bun run typecheck`

Expected: PASS and zero type errors.

- [ ] **Step 5: Commit**

```bash
git add scripts/defines.ts scripts/dev.ts build.ts src/types/global.d.ts src/entrypoints/cli.tsx scripts/__tests__/feature-resolution.test.ts
git commit -m "feat: 注入已编译 feature 清单"
```

### Task 3: Build the capabilities model and renderer

**Files:**
- Create: `src/cli/handlers/capabilities.ts`
- Create: `src/cli/handlers/__tests__/capabilities.test.ts`

**Interfaces:**
- Produces `CapabilityActivation = 'always' | 'runtime-config' | 'environment' | 'not-compiled'`.
- Produces `buildCapabilities(compiledFeatures: readonly string[]): Capability[]`.
- Produces `formatCapabilitiesText(capabilities: readonly Capability[]): string`.
- Produces `getCapabilitiesOutput(options: { json: boolean; compiledFeatures?: readonly string[] }): string`.

- [ ] **Step 1: Write failing output-contract tests**

Assert that `BRIDGE_MODE`, `DAEMON`, and `SESSION_TERMINALS` map to documented commands; every unknown manifest item remains present; `model-streaming` is always compiled and includes the exact headless flags; a missing feature has `activation: 'not-compiled'`; parsed JSON has `version === 1` and a non-empty `capabilities` array.

```ts
expect(streaming.usage).toContain(
  '--print --verbose --output-format stream-json --include-partial-messages',
)
```

- [ ] **Step 2: Verify RED**

Run: `bun test src/cli/handlers/__tests__/capabilities.test.ts`

Expected: FAIL because the handler does not exist.

- [ ] **Step 3: Implement deterministic model and rendering**

Use a metadata map for common features and append virtual `model-streaming`, `headless-output`, and `model-providers` capabilities. Sort by name. Text output uses fixed headings and one capability per block; JSON uses two-space indentation and a trailing newline.

- [ ] **Step 4: Verify GREEN**

Run: `bun test src/cli/handlers/__tests__/capabilities.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/handlers/capabilities.ts src/cli/handlers/__tests__/capabilities.test.ts
git commit -m "feat: 添加 CLI 能力清单模型"
```

### Task 4: Expose `ccb capabilities`

**Files:**
- Modify: `src/entrypoints/cli.tsx`
- Modify: `src/main.tsx`
- Test: `src/cli/handlers/__tests__/capabilities.test.ts`

**Interfaces:**
- Consumes `getCapabilitiesOutput` and `MACRO.COMPILED_FEATURES`.
- Produces `capabilities [--json]` fast path and root help entry.

- [ ] **Step 1: Add a failing argument-parser test**

Export and test `parseCapabilitiesArgs(args: readonly string[]): { json: boolean }`; accept no args or only `--json`, and throw `Unknown capabilities option: --bad` for anything else.

- [ ] **Step 2: Verify RED**

Run: `bun test src/cli/handlers/__tests__/capabilities.test.ts`

Expected: FAIL because parser is missing.

- [ ] **Step 3: Wire fast path and help**

Handle `args[0] === 'capabilities'` before loading full `main.tsx`, dynamically import the handler, write its output, and set exit code 1 on invalid options. Register a matching Commander command so root `--help` lists it, even though normal invocations take the fast path.

- [ ] **Step 4: Verify CLI behavior**

Run: `bun run dev capabilities --json`

Expected: valid JSON with `BRIDGE_MODE`, `DAEMON`, `SESSION_TERMINALS`, and `model-streaming`.

Run: `bun run dev capabilities --bad`

Expected: nonzero exit with `Unknown capabilities option: --bad`.

- [ ] **Step 5: Commit**

```bash
git add src/entrypoints/cli.tsx src/main.tsx src/cli/handlers/capabilities.ts src/cli/handlers/__tests__/capabilities.test.ts
git commit -m "feat: 添加 capabilities CLI 命令"
```

### Task 5: Document and verify feature discovery

**Files:**
- Modify: `docs/features/all-features-guide.md`
- Modify: `README.md`

- [ ] **Step 1: Document truth values and discovery commands**

Add `ccb capabilities`, `ccb capabilities --json`, the recognized true/false values, the fact that false overrides defaults, and the exact headless streaming invocation.

- [ ] **Step 2: Run phase verification**

Run: `bun test scripts/__tests__/feature-resolution.test.ts src/cli/handlers/__tests__/capabilities.test.ts && bun run typecheck && bun run dev capabilities --json`

Expected: tests PASS, zero type errors, and valid JSON output.

- [ ] **Step 3: Build and inspect production output**

Run: `bun run build && bun dist/cli-bun.js capabilities --json`

Expected: production output reports the three required default features as compiled.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/features/all-features-guide.md
git commit -m "docs: 添加 feature 能力发现说明"
```
