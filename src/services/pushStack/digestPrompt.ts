/**
 * Digest prompt for `/pop` (docs/features/push-pop-context-stack.md §3, §4.6).
 *
 * Passed as PartialCompactOptions.promptOverride so it REPLACES the generic
 * partial-compact template. It still instructs the model to emit
 * <analysis> + <summary> so formatCompactSummary (strips <analysis>, turns
 * <summary> into a "Summary:" section) and the no-tools trailer stay consistent.
 * The four columns live inside <summary>.
 */
export const DIGEST_PROMPT = `Your task is to distill a DISCUSSION BRANCH that just concluded into a compact digest. This discussion branched off the mainline conversation; it is now being rolled up and only your digest will remain — the mainline continues on top of it. Capture only what the mainline needs; drop the back-and-forth, dead ends already resolved, and verbatim tool output.

First think in an <analysis> block (this is scratch work and will be discarded): what was actually decided, what was rejected and why, what stayed open, and what the mainline must now do.

Then write the digest in a <summary> block using EXACTLY these four sections, each a short bulleted list (omit a section's bullets only if truly empty, but keep the header):

<summary>
[Decisions] What the discussion concluded, with the key reasoning.
[Rejected] Options considered and turned down, with why (so the mainline does not revisit them).
[Open questions] Points the discussion did not resolve.
[Action items] Concrete effects on / TODOs for the mainline task.
</summary>

Be precise and faithful — do not invent conclusions the discussion did not reach.`

/**
 * Feedback appended as "Additional Instructions" (secondary to promptOverride).
 * Kept short; the structure is enforced by DIGEST_PROMPT above.
 */
export const DIGEST_TEMPLATE =
  'This is a /pop of a discussion branch. Prioritize decisions and their rationale; keep it tight.'
