import type { Command } from '../../types/command.js'

// Subcommands supported by `/onboarding`.
// - (no args) | full       — re-run the complete first-run flow
// - theme                  — re-pick the terminal theme
// - trust                  — re-confirm the workspace trust dialog
// - model                  — open the model picker (delegates to /model)
// - mcp                    — show MCP server setup instructions
// - status                 — print current onboarding state
//
// `/onboarding` exists in official v2.1.123 (string + telemetry confirmed:
// `tengu_onboarding_step`, `hasCompletedOnboarding`, `lastOnboardingVersion`).
// We expose the user-facing entry point so subscribers can re-run any step.
const onboarding: Command = {
  type: 'local-jsx',
  name: 'onboarding',
  description: 'Re-run the first-run setup (theme, trust, model, MCP)',
  argumentHint: '[full|theme|trust|model|mcp|status]',
  isEnabled: () => true,
  isHidden: false,
  bridgeSafe: false,
  getBridgeInvocationError: () =>
    'onboarding requires the local interactive UI and is not bridge-safe',
  load: async () => {
    const m = await import('./launchOnboarding.js')
    return { call: m.callOnboarding }
  },
}

export default onboarding
