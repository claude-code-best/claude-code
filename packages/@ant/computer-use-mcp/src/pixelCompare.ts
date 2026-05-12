/**
 * Staleness guard ported from the Vercept acquisition.
 *
 * Compares the model's last-seen screenshot against a fresh-right-now
 * screenshot at the click target, so the model never clicks pixels it hasn't
 * seen. If the 9×9 patch around the target differs, the click is aborted and
 * the model is told to re-screenshot. This is NOT a popup detector.
 *
 * Semantics preserved exactly:
 *   - Skip on no `lastScreenshot` (cold start) — click proceeds.
 *   - Skip on any internal error (crop throws, screenshot fails, etc.) —
 *     click proceeds. Validation failure must never block the action.
 *   - 9×9 exact byte equality on raw pixel bytes. No fuzzing, no tolerance.
 *   - Compare in percentage coords so Retina scale doesn't matter.
 *
 * JPEG decode + crop is INJECTED via `ComputerUseHostAdapter.cropRawPatch`.
 * The original used `sharp` (LGPL, native `.node` addon); we inject Electron's
 * `nativeImage` (Chromium decoders, BSD, nothing to bundle) from the host, so
 * this package never imports it — the crop is a function parameter.
 */

import type { ScreenshotResult } from './executor.js'
import type { Logger } from './types.js'

/** Injected by the host. See `ComputerUseHostAdapter.cropRawPatch`. */
export type CropRawPatchFn = (
  jpegBase64: string,
  rect: { x: number; y: number; width: number; height: number },
) => Buffer | null

/** 9×9 is empirically the sweet spot — large enough to catch a tooltip
 * appearing, small enough to not false-positive on surrounding animation.
 **/
const DEFAULT_GRID_SIZE = 9

export interface PixelCompareResult {
  /** true → click may proceed. false → patch changed, abort the click. */
  valid: boolean
  /** true → validation did not run (cold start, sub-gate off, or internal
   * error). The caller MUST treat this identically to `valid: true`. */
  skipped: boolean
  /** Populated when valid === false. Returned to the model verbatim. */
  warning?: string
}

/**
 * Compute the crop rect for a patch centered on (xPercent, yPercent).
 *
 * Dimensions come from ScreenshotResult.width/height (physical pixels). Both
 * screenshots have the same dimensions (same display, consecutive captures),
 * so the rect is the same for both.
 */
function computeCropRect(
  imgW: number,
  imgH: number,
  xPercent: number,
  yPercent: number,
  gridSize: number,
): { x: number; y: number; width: number; height: number } | null {
  if (!imgW || !imgH) return null

  const clampedX = Math.max(0, Math.min(100, xPercent))
  const clampedY = Math.max(0, Math.min(100, yPercent))

  const centerX = Math.round((clampedX / 100.0) * imgW)
  const centerY = Math.round((clampedY / 100.0) * imgH)

  const halfGrid = Math.floor(gridSize / 2)
  const cropX = Math.max(0, centerX - halfGrid)
  const cropY = Math.max(0, centerY - halfGrid)
  const cropW = Math.min(gridSize, imgW - cropX)
  const cropH = Math.min(gridSize, imgH - cropY)
  if (cropW <= 0 || cropH <= 0) return null

  return { x: cropX, y: cropY, width: cropW, height: cropH }
}

/**
 * Compare the same patch location between two screenshots.
 *
 * @returns true when the raw pixel bytes are identical. false on any
 * difference, or on any internal error (the caller treats an error here as
 * `skipped`, so the false is harmless).
 */
export function comparePixelAtLocation(
  crop: CropRawPatchFn,
  lastScreenshot: ScreenshotResult,
  freshScreenshot: ScreenshotResult,
  xPercent: number,
  yPercent: number,
  gridSize: number = DEFAULT_GRID_SIZE,
): boolean {
  // Both screenshots are of the same display — use the fresh one's
  // dimensions (less likely to be stale than last's).
  const rect = computeCropRect(
    freshScreenshot.width,
    freshScreenshot.height,
    xPercent,
    yPercent,
    gridSize,
  )
  if (!rect) return false

  const patch1 = crop(lastScreenshot.base64, rect)
  const patch2 = crop(freshScreenshot.base64, rect)
  if (!patch1 || !patch2) return false

  // Direct buffer equality. Note: nativeImage.toBitmap() gives BGRA, sharp's
  // .raw() gave RGB.
  // Doesn't matter — we're comparing two same-format buffers for equality.
  return patch1.equals(patch2)
}

/**
 * Battle-tested click-target validation ported from the Vercept acquisition,
 * with the fresh-screenshot capture delegated to the caller (we don't have
 * a global `SystemActions.takeScreenshot()` — the executor is injected).
 *
 * Skip conditions (any of these → `{ valid: true, skipped: true }`):
 *   - `lastScreenshot` is undefined (cold start).
 *   - `takeFreshScreenshot()` throws or returns null.
 *   - Injected crop function returns null (decode failure).
 *   - Any other exception.
 *
 * The caller decides whether to invoke this at all (sub-gate check lives
 * in toolCalls.ts, not here).
 */
export async function validateClickTarget(
  crop: CropRawPatchFn,
  lastScreenshot: ScreenshotResult | undefined,
  xPercent: number,
  yPercent: number,
  takeFreshScreenshot: () => Promise<ScreenshotResult | null>,
  logger: Logger,
  gridSize: number = DEFAULT_GRID_SIZE,
): Promise<PixelCompareResult> {
  if (!lastScreenshot) {
    return { valid: true, skipped: true }
  }

  try {
    const fresh = await takeFreshScreenshot()
    if (!fresh) {
      return { valid: true, skipped: true }
    }

    const pixelsMatch = comparePixelAtLocation(
      crop,
      lastScreenshot,
      fresh,
      xPercent,
      yPercent,
      gridSize,
    )

    if (pixelsMatch) {
      return { valid: true, skipped: false }
    }
    return {
      valid: false,
      skipped: false,
      warning:
        'Screen content at the target location changed since the last screenshot. Take a new screenshot before clicking.',
    }
  } catch (err) {
    // Skip validation on technical errors, execute action anyway.
    // Battle-tested: validation failure must never block the click.
    logger.debug('[pixelCompare] validation error, skipping', err)
    return { valid: true, skipped: true }
  }
}
