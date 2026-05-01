export interface DisplayGeometry {
  width: number
  height: number
  scaleFactor: number
  displayId: number
  label?: string
  isPrimary?: boolean
}

export interface PrepareDisplayResult {
  activated: string
  hidden: string[]
}

export interface AppInfo {
  bundleId: string
  displayName: string
}

export interface InstalledApp {
  bundleId: string
  displayName: string
  path: string
  iconDataUrl?: string
}

export interface RunningApp {
  bundleId: string
  displayName: string
}

export interface ScreenshotResult {
  base64: string
  width: number
  height: number
}

export interface ResolvePrepareCaptureResult {
  base64: string
  width: number
  height: number
  captureError?: string
  displayId?: number
  hidden?: string[]
}

export interface WindowDisplayInfo {
  bundleId: string
  displayIds: number[]
}

export interface DisplayAPI {
  getSize(displayId?: number): DisplayGeometry
  listAll(): DisplayGeometry[]
}

export interface AppsAPI {
  prepareDisplay(
    allowlistBundleIds: string[],
    surrogateHost: string,
    displayId?: number,
  ): Promise<PrepareDisplayResult>
  previewHideSet(bundleIds: string[], displayId?: number): Promise<AppInfo[]>
  findWindowDisplays(bundleIds: string[]): Promise<WindowDisplayInfo[]>
  appUnderPoint(x: number, y: number): Promise<AppInfo | null>
  listInstalled(): Promise<InstalledApp[]>
  iconDataUrl(path: string): string | null
  listRunning(): RunningApp[]
  open(bundleId: string): Promise<void>
  unhide(bundleIds: string[]): Promise<void>
}

export interface ScreenshotAPI {
  captureExcluding(
    allowedBundleIds: string[],
    quality: number,
    targetW: number,
    targetH: number,
    displayId?: number,
  ): Promise<ScreenshotResult>
  captureRegion(
    allowedBundleIds: string[],
    x: number,
    y: number,
    w: number,
    h: number,
    outW: number,
    outH: number,
    quality: number,
    displayId?: number,
  ): Promise<ScreenshotResult>
  captureWindowTarget(titleOrHwnd: string | number): ScreenshotResult | null
}

export interface SwiftBackend {
  display: DisplayAPI
  apps: AppsAPI
  screenshot: ScreenshotAPI
}
