// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered
import { feature } from 'bun:bundle'
import { getWorkflowKeywordTriggerEnabled } from './settings/settings.js'

/**
 * The "ultracode" keyword trigger (official 2.1.330, settings schema L908578
 * + keyword detection L919001): including the keyword in a prompt opts that
 * turn into the Workflow tool — the prompt-side opt-in path of the /ultracode
 * playbook (see skills/bundled/ultracode.ts: "The user included the keyword
 * 'ultracode' in their prompt (you'll see a system-reminder confirming it)").
 *
 * 'ultracode' is NOT an effort level (see utils/effort.ts) — it never enters
 * EffortLevel/EffortValue. This module owns the keyword detection and the
 * trigger's gates only.
 */

/** The keyword that opts a turn into the Workflow tool. */
export const WORKFLOW_KEYWORD = 'ultracode'

/**
 * Check if text contains the "ultracode" keyword. Structural twin of
 * hasUltrathinkKeyword (official hLi/yLi are the same detector shape):
 * case-insensitive, word-bounded.
 */
export function hasUltracodeKeyword(text: string): boolean {
  return /\bultracode\b/i.test(text)
}

/**
 * Whether the keyword trigger is active. Two gates, mirroring
 * isUltrathinkEnabled's build-time + runtime pattern:
 *
 * 1. Build-time: feature('WORKFLOW_SCRIPTS') — without the Workflow tool the
 *    keyword trigger is inert (the attachment would advertise a tool that
 *    isn't registered).
 * 2. Runtime: settings `workflowKeywordTriggerEnabled` (default true) — the
 *    total switch for the keyword trigger path, toggled by meta+w
 *    (chat:workflowKeywordToggle). When false, a prompt containing
 *    "ultracode" does NOT trigger; the /ultracode command is unaffected
 *    (official semantics: this is the "keyword trigger" switch).
 */
export function isWorkflowKeywordTriggerActive(): boolean {
  if (!feature('WORKFLOW_SCRIPTS')) {
    return false
  }
  return getWorkflowKeywordTriggerEnabled()
}
