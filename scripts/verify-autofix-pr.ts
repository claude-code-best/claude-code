#!/usr/bin/env bun
// One-shot verification: import the autofix-pr command exactly the way
// commands.ts does, and dump its registration shape + isEnabled() result.
// Run with: bun --feature AUTOFIX_PR scripts/verify-autofix-pr.ts

import autofixPr from '../src/commands/autofix-pr/index.ts'

console.log('=== /autofix-pr Command Registration ===')
console.log('name:               ', autofixPr.name)
console.log('type:               ', autofixPr.type)
console.log('description:        ', autofixPr.description)
console.log('argumentHint:       ', autofixPr.argumentHint)
console.log('isHidden:           ', autofixPr.isHidden)
console.log('bridgeSafe:         ', autofixPr.bridgeSafe)
console.log('isEnabled():        ', autofixPr.isEnabled?.())
console.log()
console.log('Bridge invocation validation:')
const cases: Array<[string, string]> = [
  ['', 'empty (should reject)'],
  ['stop', 'stop (should accept)'],
  ['off', 'off (should accept)'],
  ['386', 'PR# (should accept)'],
  ['anthropics/claude-code#999', 'cross-repo (should accept)'],
  ['fix the typo', 'freeform (should reject for bridge)'],
]
for (const [arg, label] of cases) {
  const err = autofixPr.getBridgeInvocationError?.(arg)
  console.log(`  ${label.padEnd(35)} → ${err ?? 'OK (no error)'}`)
}
console.log()
console.log('=== Verdict ===')
const enabled = autofixPr.isEnabled?.()
const visible = !autofixPr.isHidden && enabled
console.log(`Visible in slash menu: ${visible ? 'YES ✓' : 'NO ✗'}`)
if (!visible) {
  console.log('  - isEnabled():', enabled)
  console.log('  - isHidden:  ', autofixPr.isHidden)
  console.log('  Hint: ensure FEATURE_AUTOFIX_PR=1 or AUTOFIX_PR is in')
  console.log('        DEFAULT_BUILD_FEATURES (scripts/defines.ts).')
}
