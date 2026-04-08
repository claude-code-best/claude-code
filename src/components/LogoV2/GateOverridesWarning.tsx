import * as React from 'react'

/**
 * Internal-only component. Displays a warning when feature-gate overrides
 * (CLAUDE_INTERNAL_FC_OVERRIDES) are active. Stubbed — returns null in
 * non-internal builds.
 */
export function GateOverridesWarning(): React.ReactNode {
	return null
}
