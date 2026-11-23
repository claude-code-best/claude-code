/**
 * ctrl+y restore of the esc-cleared input (official 2.1.330, batch4-verified
 * behavior: esc on a non-empty agents-view input box clears it and shows
 * `Cleared · ctrl+y to restore`; ctrl+y brings the just-cleared text back).
 *
 * The stash is a one-shot snapshot taken at clear time:
 * - clearing again replaces it with the newest text ("再清空取最新");
 * - any new typing or a dispatch (enter) drops it — once the user moved on,
 *   the "Cleared" hint is stale and ctrl+y must not resurrect old text;
 * - restore only fires while the box is still empty and a stash exists.
 *
 * Pure state rules kept here so AgentsView's useInput wiring stays thin and
 * the semantics are pinned by tests.
 */

export type ClearedInputStash = {
  /** The text that was in the box when esc cleared it. */
  text: string
} | null

/** esc on a non-empty input: stash the text (replaces any earlier stash). */
export function stashClearedInput(text: string): ClearedInputStash {
  return { text }
}

/**
 * ctrl+y: restore the stashed text — but only while the box is still empty
 * and a stash exists. Returns the restored text (null = nothing restored)
 * and the consumed stash.
 */
export function restoreClearedInput(
  stash: ClearedInputStash,
  input: string,
): { restored: string | null; stash: ClearedInputStash } {
  if (stash === null || input !== '') {
    return { restored: null, stash }
  }
  return { restored: stash.text, stash: null }
}

/**
 * Any new typing or a dispatch invalidates the stash. Called from the
 * printable-character branch of the raw useInput and after a successful
 * dispatchPrompt.
 */
export function dropClearedInput(stash: ClearedInputStash): ClearedInputStash {
  return null
}
