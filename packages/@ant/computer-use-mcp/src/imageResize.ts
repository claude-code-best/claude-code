/**
 * Port of the API's image transcoder target-size algorithm. Pre-sizing
 * screenshots to this function's output means the API's early-return fires
 * (tokens ≤ max) and the image is NOT resized server-side — so the model
 * sees exactly the dimensions in `ScreenshotResult.width/height` and
 * `scaleCoord` stays coherent.
 *
 * Rust reference: api/api/image_transcoder/rust_transcoder/src/utils/resize.rs
 * Sibling TS port: apps/claude-browser-use/src/utils/imageResize.ts (identical
 * algorithm, lives in the Chrome extension tree — not a shared package).
 *
 * See COORDINATES.md for why this matters for click accuracy.
 */

export interface ResizeParams {
  pxPerToken: number
  maxTargetPx: number
  maxTargetTokens: number
}

/**
 * Production defaults — match `resize.rs:160-164` and Chrome's
 * `CDPService.ts:638-642`. Vision encoder uses 28px tiles; 1568 is both
 * the long-edge cap (56 tiles) AND the token budget.
 */
export const API_RESIZE_PARAMS: ResizeParams = {
  pxPerToken: 28,
  maxTargetPx: 1568,
  maxTargetTokens: 1568,
}

/** ceil(px / pxPerToken). Matches resize.rs:74-76 (which uses integer ceil-div). */
export function nTokensForPx(px: number, pxPerToken: number): number {
  return Math.floor((px - 1) / pxPerToken) + 1
}

function nTokensForImg(
  width: number,
  height: number,
  pxPerToken: number,
): number {
  return nTokensForPx(width, pxPerToken) * nTokensForPx(height, pxPerToken)
}

/**
 * Binary-search along the width dimension for the largest image that:
 *   - preserves the input aspect ratio
 *   - has long edge ≤ maxTargetPx
 *   - has ceil(w/pxPerToken) × ceil(h/pxPerToken) ≤ maxTargetTokens
 *
 * Returns [width, height]. No-op if input already satisfies all three.
 *
 * The long-edge constraint alone (what we used to use) is insufficient on
 * squarer-than-16:9 displays: 1568×1014 (MBP 16" AR) is 56×37 = 2072 tokens,
 * over budget, and gets server-resized to 1372×887 — model then clicks in
 * 1372-space but scaleCoord assumed 1568-space → ~14% coord error.
 *
 * Matches resize.rs:91-155 exactly (verified against its test vectors).
 */
export function targetImageSize(
  width: number,
  height: number,
  params: ResizeParams,
): [number, number] {
  const { pxPerToken, maxTargetPx, maxTargetTokens } = params

  if (
    width <= maxTargetPx &&
    height <= maxTargetPx &&
    nTokensForImg(width, height, pxPerToken) <= maxTargetTokens
  ) {
    return [width, height]
  }

  // Normalize to landscape for the search; transpose result back.
  if (height > width) {
    const [w, h] = targetImageSize(height, width, params)
    return [h, w]
  }

  const aspectRatio = width / height

  // Loop invariant: lowerBoundWidth is always valid, upperBoundWidth is
  // always invalid. ~12 iterations for a 4000px image.
  let upperBoundWidth = width
  let lowerBoundWidth = 1

  for (;;) {
    if (lowerBoundWidth + 1 === upperBoundWidth) {
      return [
        lowerBoundWidth,
        Math.max(Math.round(lowerBoundWidth / aspectRatio), 1),
      ]
    }

    const middleWidth = Math.floor((lowerBoundWidth + upperBoundWidth) / 2)
    const middleHeight = Math.max(Math.round(middleWidth / aspectRatio), 1)

    if (
      middleWidth <= maxTargetPx &&
      nTokensForImg(middleWidth, middleHeight, pxPerToken) <= maxTargetTokens
    ) {
      lowerBoundWidth = middleWidth
    } else {
      upperBoundWidth = middleWidth
    }
  }
}
