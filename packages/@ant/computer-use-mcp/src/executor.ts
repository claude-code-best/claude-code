export interface DisplayGeometry {
  displayId: number
  width: number
  height: number
  scaleFactor: number
  originX: number
  originY: number
  label?: string
  isPrimary?: boolean
}

export interface ScreenshotResult {
  base64: string
  width: number
  height: number
  displayWidth: number
  displayHeight: number
  originX: number
  originY: number
  displayId?: number
  /** Accessibility snapshot — structured GUI element tree as model-friendly text. Windows only. */
  accessibilityText?: string
}

export interface FrontmostApp {
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
  pid?: number
}

export interface ResolvePrepareCaptureResult extends ScreenshotResult {
  hidden: string[]
  activated?: string
  displayId: number
  captureError?: string
}

export interface ComputerExecutorCapabilities {
  screenshotFiltering: 'native' | 'none'
  platform: 'darwin' | 'win32'
  hostBundleId: string
}

export interface ComputerExecutor {
  capabilities: ComputerExecutorCapabilities
  prepareForAction(
    allowlistBundleIds: string[],
    displayId?: number,
  ): Promise<string[]>
  previewHideSet(
    allowlistBundleIds: string[],
    displayId?: number,
  ): Promise<Array<{ bundleId: string; displayName: string }>>
  getDisplaySize(displayId?: number): Promise<DisplayGeometry>
  listDisplays(): Promise<DisplayGeometry[]>
  findWindowDisplays(
    bundleIds: string[],
  ): Promise<Array<{ bundleId: string; displayIds: number[] }>>
  resolvePrepareCapture(opts: {
    allowedBundleIds: string[]
    preferredDisplayId?: number
    autoResolve: boolean
    doHide?: boolean
  }): Promise<ResolvePrepareCaptureResult>
  screenshot(opts: {
    allowedBundleIds: string[]
    displayId?: number
  }): Promise<ScreenshotResult>
  zoom(
    regionLogical: { x: number; y: number; w: number; h: number },
    allowedBundleIds: string[],
    displayId?: number,
  ): Promise<{ base64: string; width: number; height: number }>
  key(keySequence: string, repeat?: number): Promise<void>
  holdKey(keyNames: string[], durationMs: number): Promise<void>
  type(text: string, opts: { viaClipboard: boolean }): Promise<void>
  readClipboard(): Promise<string>
  writeClipboard(text: string): Promise<void>
  moveMouse(x: number, y: number): Promise<void>
  click(
    x: number,
    y: number,
    button: 'left' | 'right' | 'middle',
    count: 1 | 2 | 3,
    modifiers?: string[],
  ): Promise<void>
  mouseDown(): Promise<void>
  mouseUp(): Promise<void>
  getCursorPosition(): Promise<{ x: number; y: number }>
  drag(
    from: { x: number; y: number } | undefined,
    to: { x: number; y: number },
  ): Promise<void>
  scroll(x: number, y: number, dx: number, dy: number): Promise<void>
  getFrontmostApp(): Promise<FrontmostApp | null>
  appUnderPoint(
    x: number,
    y: number,
  ): Promise<{ bundleId: string; displayName: string } | null>
  listInstalledApps(): Promise<InstalledApp[]>
  getAppIcon(path: string): Promise<string | undefined>
  listRunningApps(): Promise<RunningApp[]>
  openApp(bundleId: string): Promise<void>

  // ── Window management (Windows only, optional) ──────────────────────────
  /** Perform a window management action on the bound window. Win32 API only — no global shortcuts. */
  manageWindow?(
    action: string,
    opts?: { x?: number; y?: number; width?: number; height?: number },
  ): Promise<boolean>
  /** Get the current window rect of the bound window */
  getWindowRect?(): Promise<{
    x: number
    y: number
    width: number
    height: number
  } | null>

  // ── Element-targeted actions (Windows UIA, optional) ────────────────────
  /** Open terminal and launch an agent CLI */
  openTerminal?(opts: {
    agent: 'claude' | 'codex' | 'gemini' | 'custom'
    command?: string
    terminal?: 'wt' | 'powershell' | 'cmd'
    workingDirectory?: string
  }): Promise<{ hwnd: string; title: string; launched: boolean } | null>
  /** Bind to a window by hwnd/title/pid. Returns bound window info or null. */
  bindToWindow?(query: {
    hwnd?: string
    title?: string
    pid?: number
  }): Promise<{ hwnd: string; title: string; pid: number } | null>
  /** Unbind from the current window */
  unbindFromWindow?(): Promise<void>
  /** Cheap binding-state check for window-targeted routing decisions. */
  hasBoundWindow?(): Promise<boolean>
  /** Get current binding status */
  getBindingStatus?(): Promise<{
    bound: boolean
    hwnd?: string
    title?: string
    pid?: number
    rect?: { x: number; y: number; width: number; height: number }
  } | null>
  /** List all visible windows */
  listVisibleWindows?(): Promise<
    Array<{ hwnd: string; pid: number; title: string }>
  >
  /** Control the status indicator overlay */
  statusIndicator?(
    action: 'show' | 'hide' | 'status',
    message?: string,
  ): Promise<{ active: boolean; message?: string }>
  /** Virtual keyboard — send keys/text/combos to bound window only */
  virtualKeyboard?(opts: {
    action: 'type' | 'combo' | 'press' | 'release' | 'hold'
    text: string
    duration?: number
    repeat?: number
  }): Promise<boolean>
  /** Virtual mouse — click/move/drag on bound window only */
  virtualMouse?(opts: {
    action:
      | 'click'
      | 'double_click'
      | 'right_click'
      | 'move'
      | 'drag'
      | 'down'
      | 'up'
    x: number
    y: number
    startX?: number
    startY?: number
  }): Promise<boolean>
  /** Mouse wheel scroll at client coordinates (works on Excel, browsers, modern UI) */
  mouseWheel?(
    x: number,
    y: number,
    delta: number,
    horizontal?: boolean,
  ): Promise<boolean>
  /** Activate the bound window (foreground + click to focus) */
  activateWindow?(clickX?: number, clickY?: number): Promise<boolean>
  /** Handle a terminal prompt (yes/no/select/type + enter) */
  respondToPrompt?(opts: {
    responseType: 'yes' | 'no' | 'enter' | 'escape' | 'select' | 'type'
    arrowDirection?: 'up' | 'down'
    arrowCount?: number
    text?: string
  }): Promise<boolean>
  /** Click an element by name/role/automationId via UI Automation */
  clickElement?(query: {
    name?: string
    role?: string
    automationId?: string
  }): Promise<boolean>
  /** Type text into an element by name/role/automationId via UI Automation ValuePattern */
  typeIntoElement?(
    query: { name?: string; role?: string; automationId?: string },
    text: string,
  ): Promise<boolean>
}
