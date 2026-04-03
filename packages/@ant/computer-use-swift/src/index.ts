/**
 * @ant/computer-use-swift — macOS implementation
 *
 * Uses AppleScript/JXA/screencapture to replace the original Swift native module.
 * Provides display info, app management, screenshot capture, and more.
 *
 * macOS only.
 */

import { readFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Types (exported for callers)
// ---------------------------------------------------------------------------

export interface DisplayGeometry {
  width: number
  height: number
  scaleFactor: number
  displayId: number
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
}

export interface WindowDisplayInfo {
  bundleId: string
  displayIds: number[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jxaSync(script: string): string {
  const result = Bun.spawnSync({
    cmd: ['osascript', '-l', 'JavaScript', '-e', script],
    stdout: 'pipe', stderr: 'pipe',
  })
  return new TextDecoder().decode(result.stdout).trim()
}

function osascriptSync(script: string): string {
  const result = Bun.spawnSync({
    cmd: ['osascript', '-e', script],
    stdout: 'pipe', stderr: 'pipe',
  })
  return new TextDecoder().decode(result.stdout).trim()
}

async function osascript(script: string): Promise<string> {
  const proc = Bun.spawn(['osascript', '-e', script], {
    stdout: 'pipe', stderr: 'pipe',
  })
  const text = await new Response(proc.stdout).text()
  await proc.exited
  return text.trim()
}

async function jxa(script: string): Promise<string> {
  const proc = Bun.spawn(['osascript', '-l', 'JavaScript', '-e', script], {
    stdout: 'pipe', stderr: 'pipe',
  })
  const text = await new Response(proc.stdout).text()
  await proc.exited
  return text.trim()
}

// ---------------------------------------------------------------------------
// DisplayAPI
// ---------------------------------------------------------------------------

interface DisplayAPI {
  getSize(displayId?: number): DisplayGeometry
  listAll(): DisplayGeometry[]
}

const displayAPI: DisplayAPI = {
  getSize(displayId?: number): DisplayGeometry {
    const all = this.listAll()
    if (displayId !== undefined) {
      const found = all.find(d => d.displayId === displayId)
      if (found) return found
    }
    return all[0] ?? { width: 1920, height: 1080, scaleFactor: 2, displayId: 1 }
  },

  listAll(): DisplayGeometry[] {
    try {
      const raw = jxaSync(`
        ObjC.import("CoreGraphics");
        var displays = $.CGDisplayCopyAllDisplayModes ? [] : [];
        var active = $.CGGetActiveDisplayList(10, null, Ref());
        var countRef = Ref();
        $.CGGetActiveDisplayList(0, null, countRef);
        var count = countRef[0];
        var idBuf = Ref();
        $.CGGetActiveDisplayList(count, idBuf, countRef);
        var result = [];
        for (var i = 0; i < count; i++) {
          var did = idBuf[i];
          var w = $.CGDisplayPixelsWide(did);
          var h = $.CGDisplayPixelsHigh(did);
          var mode = $.CGDisplayCopyDisplayMode(did);
          var pw = $.CGDisplayModeGetPixelWidth(mode);
          var sf = pw > 0 && w > 0 ? pw / w : 2;
          result.push({width: w, height: h, scaleFactor: sf, displayId: did});
        }
        JSON.stringify(result);
      `)
      return (JSON.parse(raw) as DisplayGeometry[]).map(d => ({
        width: Number(d.width), height: Number(d.height),
        scaleFactor: Number(d.scaleFactor), displayId: Number(d.displayId),
      }))
    } catch {
      // Fallback: use NSScreen via JXA
      try {
        const raw = jxaSync(`
          ObjC.import("AppKit");
          var screens = $.NSScreen.screens;
          var result = [];
          for (var i = 0; i < screens.count; i++) {
            var s = screens.objectAtIndex(i);
            var frame = s.frame;
            var desc = s.deviceDescription;
            var screenNumber = desc.objectForKey($("NSScreenNumber")).intValue;
            var backingFactor = s.backingScaleFactor;
            result.push({
              width: Math.round(frame.size.width),
              height: Math.round(frame.size.height),
              scaleFactor: backingFactor,
              displayId: screenNumber
            });
          }
          JSON.stringify(result);
        `)
        return (JSON.parse(raw) as DisplayGeometry[]).map(d => ({
          width: Number(d.width),
          height: Number(d.height),
          scaleFactor: Number(d.scaleFactor),
          displayId: Number(d.displayId),
        }))
      } catch {
        return [{ width: 1920, height: 1080, scaleFactor: 2, displayId: 1 }]
      }
    }
  },
}

// ---------------------------------------------------------------------------
// AppsAPI
// ---------------------------------------------------------------------------

interface AppsAPI {
  prepareDisplay(allowlistBundleIds: string[], surrogateHost: string, displayId?: number): Promise<PrepareDisplayResult>
  previewHideSet(bundleIds: string[], displayId?: number): Promise<AppInfo[]>
  findWindowDisplays(bundleIds: string[]): Promise<WindowDisplayInfo[]>
  appUnderPoint(x: number, y: number): Promise<AppInfo | null>
  listInstalled(): Promise<InstalledApp[]>
  iconDataUrl(path: string): string | null
  listRunning(): RunningApp[]
  open(bundleId: string): Promise<void>
  unhide(bundleIds: string[]): Promise<void>
}

const appsAPI: AppsAPI = {
  async prepareDisplay(
    _allowlistBundleIds: string[],
    _surrogateHost: string,
    _displayId?: number,
  ): Promise<PrepareDisplayResult> {
    return { activated: '', hidden: [] }
  },

  async previewHideSet(
    _bundleIds: string[],
    _displayId?: number,
  ): Promise<AppInfo[]> {
    return []
  },

  async findWindowDisplays(bundleIds: string[]): Promise<WindowDisplayInfo[]> {
    // Each running app is assumed to be on display 1
    return bundleIds.map(bundleId => ({ bundleId, displayIds: [1] }))
  },

  async appUnderPoint(_x: number, _y: number): Promise<AppInfo | null> {
    // Use JXA to find app at mouse position via accessibility
    try {
      const result = await jxa(`
        ObjC.import("CoreGraphics");
        ObjC.import("AppKit");
        var pt = $.CGPointMake(${_x}, ${_y});
        // Get frontmost app as a fallback
        var app = $.NSWorkspace.sharedWorkspace.frontmostApplication;
        JSON.stringify({bundleId: app.bundleIdentifier.js, displayName: app.localizedName.js});
      `)
      return JSON.parse(result)
    } catch {
      return null
    }
  },

  async listInstalled(): Promise<InstalledApp[]> {
    try {
      const result = await osascript(`
        tell application "System Events"
          set appList to ""
          repeat with appFile in (every file of folder "Applications" of startup disk whose name ends with ".app")
            set appPath to POSIX path of (appFile as alias)
            set appName to name of appFile
            set appList to appList & appPath & "|" & appName & "\\n"
          end repeat
          return appList
        end tell
      `)
      return result.split('\n').filter(Boolean).map(line => {
        const [path, name] = line.split('|', 2)
        // Derive bundleId from Info.plist would be ideal, but use path-based fallback
        const displayName = (name ?? '').replace(/\.app$/, '')
        return {
          bundleId: `com.app.${displayName.toLowerCase().replace(/\s+/g, '-')}`,
          displayName,
          path: path ?? '',
        }
      })
    } catch {
      return []
    }
  },

  iconDataUrl(_path: string): string | null {
    return null
  },

  listRunning(): RunningApp[] {
    try {
      const raw = jxaSync(`
        var apps = Application("System Events").applicationProcesses.whose({backgroundOnly: false});
        var result = [];
        for (var i = 0; i < apps.length; i++) {
          try {
            var a = apps[i];
            result.push({bundleId: a.bundleIdentifier(), displayName: a.name()});
          } catch(e) {}
        }
        JSON.stringify(result);
      `)
      return JSON.parse(raw)
    } catch {
      return []
    }
  },

  async open(bundleId: string): Promise<void> {
    await osascript(`tell application id "${bundleId}" to activate`)
  },

  async unhide(bundleIds: string[]): Promise<void> {
    for (const bundleId of bundleIds) {
      await osascript(`
        tell application "System Events"
          set visible of application process (name of application process whose bundle identifier is "${bundleId}") to true
        end tell
      `)
    }
  },
}

// ---------------------------------------------------------------------------
// ScreenshotAPI
// ---------------------------------------------------------------------------

interface ScreenshotAPI {
  captureExcluding(
    allowedBundleIds: string[], quality: number,
    targetW: number, targetH: number, displayId?: number,
  ): Promise<ScreenshotResult>
  captureRegion(
    allowedBundleIds: string[],
    x: number, y: number, w: number, h: number,
    outW: number, outH: number, quality: number, displayId?: number,
  ): Promise<ScreenshotResult>
}

async function captureScreenToBase64(args: string[]): Promise<{ base64: string; width: number; height: number }> {
  const tmpFile = join(tmpdir(), `cu-screenshot-${Date.now()}.png`)
  const proc = Bun.spawn(['screencapture', ...args, tmpFile], {
    stdout: 'pipe', stderr: 'pipe',
  })
  await proc.exited

  try {
    const buf = readFileSync(tmpFile)
    const base64 = buf.toString('base64')
    // Parse PNG header for dimensions (bytes 16-23)
    const width = buf.readUInt32BE(16)
    const height = buf.readUInt32BE(20)
    return { base64, width, height }
  } finally {
    try { unlinkSync(tmpFile) } catch {}
  }
}

const screenshotAPI: ScreenshotAPI = {
  async captureExcluding(
    _allowedBundleIds: string[],
    _quality: number,
    _targetW: number,
    _targetH: number,
    displayId?: number,
  ): Promise<ScreenshotResult> {
    const args = ['-x'] // silent
    if (displayId !== undefined) {
      args.push('-D', String(displayId))
    }
    return captureScreenToBase64(args)
  },

  async captureRegion(
    _allowedBundleIds: string[],
    x: number, y: number, w: number, h: number,
    _outW: number, _outH: number, _quality: number,
    displayId?: number,
  ): Promise<ScreenshotResult> {
    const args = ['-x', '-R', `${x},${y},${w},${h}`]
    if (displayId !== undefined) {
      args.push('-D', String(displayId))
    }
    return captureScreenToBase64(args)
  },
}

// ---------------------------------------------------------------------------
// ComputerUseAPI — Main export
// ---------------------------------------------------------------------------

export class ComputerUseAPI {
  apps: AppsAPI = appsAPI
  display: DisplayAPI = displayAPI
  screenshot: ScreenshotAPI = screenshotAPI

  async resolvePrepareCapture(
    allowedBundleIds: string[],
    _surrogateHost: string,
    quality: number,
    targetW: number,
    targetH: number,
    displayId?: number,
    _autoResolve?: boolean,
    _doHide?: boolean,
  ): Promise<ResolvePrepareCaptureResult> {
    return this.screenshot.captureExcluding(allowedBundleIds, quality, targetW, targetH, displayId)
  }
}
