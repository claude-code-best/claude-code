#!/usr/bin/env bun
/**
 * Verify GrowthBook gate defaults and compile-time feature flags.
 *
 * Usage:
 *   bun run scripts/verify-gates.ts
 *
 * This script checks that LOCAL_GATE_DEFAULTS are being returned correctly
 * when GrowthBook is not connected, and that compile-time feature flags
 * are properly enabled.
 */

// We can't import feature() from bun:bundle in a standalone script,
// so we test the GrowthBook layer directly.

import {
  getFeatureValue_CACHED_MAY_BE_STALE,
  checkStatsigFeatureGate_CACHED_MAY_BE_STALE,
} from '../src/services/analytics/growthbook.js'

interface GateCheck {
  name: string
  gate: string
  expected: unknown
  category: string
  /** If set, this compile flag must also be enabled at build time */
  compileFlag?: string
}

const gates: GateCheck[] = [
  // P0: Pure local
  { name: 'Custom keybindings', gate: 'tengu_keybinding_customization_release', expected: true, category: 'P0' },
  { name: 'Streaming tool exec', gate: 'tengu_streaming_tool_execution2', expected: true, category: 'P0' },
  { name: 'Cron tasks', gate: 'tengu_kairos_cron', expected: true, category: 'P0' },
  { name: 'JSON tools format', gate: 'tengu_amber_json_tools', expected: true, category: 'P0' },
  { name: 'Immediate model cmd', gate: 'tengu_immediate_model_command', expected: true, category: 'P0' },
  { name: 'MCP delta', gate: 'tengu_basalt_3kr', expected: true, category: 'P0' },
  { name: 'Leaf pruning', gate: 'tengu_pebble_leaf_prune', expected: true, category: 'P0' },
  { name: 'Message smooshing', gate: 'tengu_chair_sermon', expected: true, category: 'P0' },
  { name: 'Deep link', gate: 'tengu_lodestone_enabled', expected: true, category: 'P0', compileFlag: 'LODESTONE' },
  { name: 'Auto background', gate: 'tengu_auto_background_agents', expected: true, category: 'P0' },
  { name: 'Fine-grained tools', gate: 'tengu_fgts', expected: true, category: 'P0' },

  // P1: API-dependent
  { name: 'Session memory', gate: 'tengu_session_memory', expected: true, category: 'P1' },
  { name: 'Auto memory extract', gate: 'tengu_passport_quail', expected: true, category: 'P1', compileFlag: 'EXTRACT_MEMORIES' },
  { name: 'Memory skip index', gate: 'tengu_moth_copse', expected: true, category: 'P1' },
  { name: 'Memory search section', gate: 'tengu_coral_fern', expected: true, category: 'P1' },
  { name: 'Prompt suggestions', gate: 'tengu_chomp_inflection', expected: true, category: 'P1' },
  { name: 'Verification agent', gate: 'tengu_hive_evidence', expected: true, category: 'P1', compileFlag: 'VERIFICATION_AGENT' },
  { name: 'Brief mode', gate: 'tengu_kairos_brief', expected: true, category: 'P1', compileFlag: 'KAIROS_BRIEF' },
  { name: 'Away summary', gate: 'tengu_sedge_lantern', expected: true, category: 'P1', compileFlag: 'AWAY_SUMMARY' },
  { name: 'Idle return prompt', gate: 'tengu_willow_mode', expected: 'dialog', category: 'P1' },

  // Kill switches
  { name: 'Ultrathink', gate: 'tengu_turtle_carbon', expected: true, category: 'KS', compileFlag: 'ULTRATHINK' },
  { name: 'Explore/Plan agents', gate: 'tengu_amber_stoat', expected: true, category: 'KS', compileFlag: 'BUILTIN_EXPLORE_PLAN_AGENTS' },
  { name: 'Agent teams', gate: 'tengu_amber_flint', expected: true, category: 'KS' },
  { name: 'Slim subagent CLAUDE.md', gate: 'tengu_slim_subagent_claudemd', expected: true, category: 'KS' },
  { name: 'Bash security', gate: 'tengu_birch_trellis', expected: true, category: 'KS' },
  { name: 'macOS clipboard', gate: 'tengu_collage_kaleidoscope', expected: true, category: 'KS' },
  { name: 'Compact cache prefix', gate: 'tengu_compact_cache_prefix', expected: true, category: 'KS' },
  { name: 'Durable cron', gate: 'tengu_kairos_cron_durable', expected: true, category: 'KS' },
  { name: 'Attribution header', gate: 'tengu_attribution_header', expected: true, category: 'KS' },
  { name: 'Agent progress', gate: 'tengu_slate_prism', expected: true, category: 'KS' },
]

console.log('=== GrowthBook Local Gate Verification ===\n')

let pass = 0
let fail = 0

for (const category of ['P0', 'P1', 'KS']) {
  const label = category === 'KS' ? 'Kill Switches' : category
  console.log(`--- ${label} ---`)

  for (const check of gates.filter(g => g.category === category)) {
    const actual = typeof check.expected === 'boolean'
      ? checkStatsigFeatureGate_CACHED_MAY_BE_STALE(check.gate)
      : getFeatureValue_CACHED_MAY_BE_STALE(check.gate, null)

    const matches = typeof check.expected === 'boolean'
      ? actual === check.expected
      : actual === check.expected || JSON.stringify(actual) === JSON.stringify(check.expected)

    const status = matches ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'
    const flagNote = check.compileFlag ? ` [needs feature('${check.compileFlag}')]` : ''

    console.log(`  ${status}  ${check.name}: ${check.gate} = ${JSON.stringify(actual)}${flagNote}`)

    if (matches) pass++
    else fail++
  }
  console.log()
}

console.log(`\nResult: ${pass} passed, ${fail} failed out of ${pass + fail} gates`)

if (fail > 0) {
  console.log('\n\x1b[31mSome gates are not returning expected values!\x1b[0m')
  console.log('If CLAUDE_CODE_DISABLE_LOCAL_GATES=1 is set, all gates will return defaults.')
  process.exit(1)
}

console.log('\n\x1b[32mAll GrowthBook gates returning expected local defaults.\x1b[0m')
console.log('\nNote: Compile-time feature() flags cannot be verified in this script.')
console.log('Use "bun run dev" and test manually for features with [needs feature()] markers.')
