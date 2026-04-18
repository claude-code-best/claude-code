import type { AttributionData, AttributionState } from './commitAttribution.js'
import { getPublicModelName, getMainLoopModel } from './model/model.js'
import { PRODUCT_URL } from '../constants/product.js'

/**
 * Build git-trailer lines for a PR description (squash-merge survival).
 *
 * When the repo uses squash_merge_commit_message=PR_BODY, these trailers
 * in the PR body become proper git trailers on the squash commit.
 *
 * @param attributionData Computed attribution data from calculateCommitAttribution
 * @param attribution     Live attribution state from AppState (for prompt/steer counts)
 */
export function buildPRTrailers(
  attributionData: AttributionData,
  attribution: AttributionState | undefined,
): string[] {
  const { summary } = attributionData
  if (summary.claudePercent === 0) {
    return []
  }

  const modelName = getPublicModelName(getMainLoopModel())
  const trailers: string[] = []

  trailers.push(`Co-Authored-By: ${modelName} <noreply@anthropic.com>`)

  // Steer count = prompts since last commit (user guidance interactions)
  const steers = attribution
    ? Math.max(0, attribution.promptCount - attribution.promptCountAtLastCommit)
    : 0

  trailers.push(
    `Claude-Attribution: claude=${summary.claudePercent}% steers=${steers} files=${Object.keys(attributionData.files).length}`,
  )

  return trailers
}
