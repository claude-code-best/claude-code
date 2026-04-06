/**
 * @ant/computer-use-swift — macOS display, apps, and screenshot (Swift native)
 *
 * This package wraps the macOS-only Swift .node native module.
 * For Windows/Linux, use src/utils/computerUse/platforms/ instead.
 */

export type {
  DisplayGeometry,
  PrepareDisplayResult,
  AppInfo,
  InstalledApp,
  RunningApp,
  ScreenshotResult,
  ResolvePrepareCaptureResult,
  WindowDisplayInfo,
} from './backends/darwin.js'

import type { ResolvePrepareCaptureResult } from './backends/darwin.js'

function loadBackend() {
  try {
    if (process.platform === 'darwin') {
      return require('./backends/darwin.js')
    } else if (process.platform === 'win32') {
      return require('./backends/win32.js')
    } else if (process.platform === 'linux') {
      return require('./backends/linux.js')
    }
  } catch {
    return null
  }
  return null
}

const backend = loadBackend()

export class ComputerUseAPI {
  apps = backend?.apps ?? {
    async prepareDisplay() { return { activated: '', hidden: [] } },
    async previewHideSet() { return [] },
    async findWindowDisplays(ids: string[]) { return ids.map((b: string) => ({ bundleId: b, displayIds: [] as number[] })) },
    async appUnderPoint() { return null },
    async listInstalled() { return [] },
    iconDataUrl() { return null },
    listRunning() { return [] },
    async open() { throw new Error('@ant/computer-use-swift: macOS only') },
    async unhide() {},
  }

  display = backend?.display ?? {
    getSize() { throw new Error('@ant/computer-use-swift: macOS only') },
    listAll() { throw new Error('@ant/computer-use-swift: macOS only') },
  }

  screenshot = backend?.screenshot ?? {
    async captureExcluding() { throw new Error('@ant/computer-use-swift: macOS only') },
    async captureRegion() { throw new Error('@ant/computer-use-swift: macOS only') },
  }

  async resolvePrepareCapture(
    allowedBundleIds: string[],
    _surrogateHost: string,
    quality: number,
    targetW: number,
    targetH: number,
    displayId?: number,
  ): Promise<ResolvePrepareCaptureResult> {
    return this.screenshot.captureExcluding(allowedBundleIds, quality, targetW, targetH, displayId)
  }
}
