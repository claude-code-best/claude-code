// Bundled workflow initialization.
// Called by tools.ts when WORKFLOW_SCRIPTS feature flag is enabled.
// Sets up any pre-bundled workflow scripts that ship with the CLI.

/**
 * Initialize bundled workflows. Called once at startup when the
 * WORKFLOW_SCRIPTS feature flag is active. This is the hook point
 * for registering any workflow scripts that are compiled into the
 * binary (as opposed to user-authored ones in .claude/workflows/).
 */
export function initBundledWorkflows(): void {
  // Bundled workflows are registered here at startup.
  // Currently a no-op — all workflows are user-authored in .claude/workflows/.
  // This function exists as the extension point for future built-in workflows.
}
