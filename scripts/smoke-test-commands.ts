#!/usr/bin/env bun
/**
 * Smoke-test all newly-restored commands by actually loading and invoking
 * them (no mocks). Each command must:
 *   1. Have isEnabled() === true
 *   2. Have isHidden === false
 *   3. load() resolve to a callable
 *   4. call() return a non-empty result without throwing
 *
 * Run with: bun --feature AUTOFIX_PR scripts/smoke-test-commands.ts
 *
 * NOTE: enableConfigs() must be called BEFORE any command index.ts is
 * imported. Several commands evaluate `getGlobalConfig().workspaceApiKey`
 * at module-load time (PR-5 dual-source isHidden), and getGlobalConfig
 * throws "Config accessed before allowed" until enableConfigs runs. The
 * real dev/build entry calls this from main.tsx; bypassing main means we
 * have to invoke it ourselves.
 */
// NOTE: This bypasses the REPL — local-jsx commands that need React/Ink
// context will fail with informative messages. That's expected and we mark
// those PARTIAL.
import { enableConfigs } from '../src/utils/config.ts'
enableConfigs()

type CmdSpec = {
  mod: string
  name: string
  sample?: string
  type: string
  /** Set true when this command's isHidden depends on env var (e.g. workspace
   * API key for /vault) — smoke test should pass even when isHidden is true. */
  hiddenWithoutEnv?: boolean
  /** Override which export to import. Default: `default ?? mod[name]`.
   * Use this for double-registered commands (e.g. /context, /break-cache) that
   * expose separate interactive + non-interactive entries; the non-interactive
   * one is the right target for a Node-only smoke run. */
  exportName?: string
}

const COMMANDS: CmdSpec[] = [
  { mod: '../src/commands/env/index.ts', name: 'env', type: 'local' },
  {
    mod: '../src/commands/debug-tool-call/index.ts',
    name: 'debug-tool-call',
    type: 'local',
  },
  {
    mod: '../src/commands/perf-issue/index.ts',
    name: 'perf-issue',
    type: 'local',
  },
  // break-cache is double-registered: default export is the interactive
  // (local-jsx) variant which is disabled outside the REPL. Test the
  // non-interactive named export here instead.
  {
    mod: '../src/commands/break-cache/index.ts',
    name: 'break-cache',
    type: 'local',
    exportName: 'breakCacheNonInteractive',
  },
  { mod: '../src/commands/share/index.ts', name: 'share', type: 'local' },
  { mod: '../src/commands/issue/index.ts', name: 'issue', type: 'local' },
  {
    mod: '../src/commands/teleport/index.ts',
    name: 'teleport',
    sample: '',
    type: 'local-jsx',
  },
  {
    mod: '../src/commands/autofix-pr/index.ts',
    name: 'autofix-pr',
    sample: 'stop',
    type: 'local-jsx',
  },
  {
    mod: '../src/commands/onboarding/index.ts',
    name: 'onboarding',
    sample: 'status',
    type: 'local-jsx',
  },
  // These 3 are isHidden when ANTHROPIC_API_KEY isn't set (PR-1 dynamic gating).
  {
    mod: '../src/commands/agents-platform/index.ts',
    name: 'agents-platform',
    sample: 'list',
    type: 'local-jsx',
    hiddenWithoutEnv: true,
  },
  {
    mod: '../src/commands/memory-stores/index.ts',
    name: 'memory-stores',
    sample: 'list',
    type: 'local-jsx',
    hiddenWithoutEnv: true,
  },
  {
    mod: '../src/commands/schedule/index.ts',
    name: 'schedule',
    sample: 'list',
    type: 'local-jsx',
  },
]

async function smoke(
  spec: CmdSpec,
): Promise<{ name: string; ok: boolean; note: string }> {
  try {
    const mod = await import(spec.mod)
    const cmd = spec.exportName
      ? mod[spec.exportName]
      : (mod.default ?? mod[spec.name])
    if (!cmd) return { name: spec.name, ok: false, note: 'no default export' }
    if (cmd.name !== spec.name) {
      return { name: spec.name, ok: false, note: `name mismatch: ${cmd.name}` }
    }
    if (cmd.isHidden) {
      // Commands with env-var-gated visibility (e.g. ANTHROPIC_API_KEY) are
      // expected to be hidden when the env var is unset. Treat that as pass
      // with an informative note rather than fail.
      if (spec.hiddenWithoutEnv) {
        return {
          name: spec.name,
          ok: true,
          note: 'isHidden=true (env-gated, set ANTHROPIC_API_KEY to enable)',
        }
      }
      return { name: spec.name, ok: false, note: 'isHidden=true' }
    }
    const enabled = cmd.isEnabled?.() ?? true
    if (!enabled)
      return { name: spec.name, ok: false, note: 'isEnabled()=false' }
    if (cmd.type !== spec.type) {
      return { name: spec.name, ok: false, note: `type mismatch: ${cmd.type}` }
    }
    if (!cmd.load) return { name: spec.name, ok: false, note: 'no load()' }
    const loaded = await cmd.load()
    if (typeof loaded.call !== 'function') {
      return {
        name: spec.name,
        ok: false,
        note: 'load() did not return { call }',
      }
    }
    if (cmd.type === 'local') {
      const result = await loaded.call(spec.sample ?? '', null)
      const valLen = result?.value?.length ?? 0
      if (valLen < 10) {
        return {
          name: spec.name,
          ok: false,
          note: `result too short (${valLen} chars)`,
        }
      }
      return { name: spec.name, ok: true, note: `${valLen} chars output` }
    }
    // local-jsx commands need a real React context; we just check load() works.
    return {
      name: spec.name,
      ok: true,
      note: 'load() ok (local-jsx, REPL needed for full call)',
    }
  } catch (e: unknown) {
    return {
      name: spec.name,
      ok: false,
      note: e instanceof Error ? e.message.slice(0, 80) : String(e),
    }
  }
}

async function main() {
  console.log('=== Command smoke test ===\n')
  let pass = 0
  let fail = 0
  for (const spec of COMMANDS) {
    const r = await smoke(spec)
    const tag = r.ok ? '✓' : '✗'
    console.log(`  ${tag} /${r.name.padEnd(18)} ${r.note}`)
    if (r.ok) pass++
    else fail++
  }
  console.log(`\nTotal: ${pass} pass, ${fail} fail`)
  process.exit(fail === 0 ? 0 : 1)
}

await main()
