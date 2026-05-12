/**
 * macOS backend for computer-use-swift
 *
 * Uses AppleScript/JXA/screencapture for display info, app management,
 * and screenshots.
 */

import { readFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type {
  AppInfo,
  AppsAPI,
  DisplayAPI,
  DisplayGeometry,
  InstalledApp,
  PrepareDisplayResult,
  RunningApp,
  ScreenshotAPI,
  ScreenshotResult,
  SwiftBackend,
  WindowDisplayInfo,
} from '../types.js'

export type {
  DisplayGeometry,
  PrepareDisplayResult,
  AppInfo,
  InstalledApp,
  RunningApp,
  ScreenshotResult,
  ResolvePrepareCaptureResult,
  WindowDisplayInfo,
} from '../types.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jxaSync(script: string): string {
  const result = Bun.spawnSync({
    cmd: ['osascript', '-l', 'JavaScript', '-e', script],
    stdout: 'pipe',
    stderr: 'pipe',
  })
  return new TextDecoder().decode(result.stdout).trim()
}

function osascriptSync(script: string): string {
  const result = Bun.spawnSync({
    cmd: ['osascript', '-e', script],
    stdout: 'pipe',
    stderr: 'pipe',
  })
  return new TextDecoder().decode(result.stdout).trim()
}

async function osascript(script: string): Promise<string> {
  const proc = Bun.spawn(['osascript', '-e', script], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const text = await new Response(proc.stdout).text()
  await proc.exited
  return text.trim()
}

async function jxa(script: string): Promise<string> {
  const proc = Bun.spawn(['osascript', '-l', 'JavaScript', '-e', script], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const text = await new Response(proc.stdout).text()
  await proc.exited
  return text.trim()
}

// ---------------------------------------------------------------------------
// DisplayAPI
// ---------------------------------------------------------------------------

export const display: DisplayAPI = {
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
        width: Number(d.width),
        height: Number(d.height),
        scaleFactor: Number(d.scaleFactor),
        displayId: Number(d.displayId),
      }))
    } catch {
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

export const apps: AppsAPI = {
  async prepareDisplay(_allowlistBundleIds, _surrogateHost, _displayId) {
    return { activated: '', hidden: [] }
  },

  async previewHideSet(_bundleIds, _displayId) {
    return []
  },

  async findWindowDisplays(bundleIds) {
    return bundleIds.map(bundleId => ({ bundleId, displayIds: [1] }))
  },

  async appUnderPoint(_x, _y) {
    try {
      const result = await jxa(`
        ObjC.import("CoreGraphics");
        ObjC.import("AppKit");
        var pt = $.CGPointMake(${_x}, ${_y});
        var app = $.NSWorkspace.sharedWorkspace.frontmostApplication;
        JSON.stringify({bundleId: app.bundleIdentifier.js, displayName: app.localizedName.js});
      `)
      return JSON.parse(result)
    } catch {
      return null
    }
  },

  async listInstalled() {
    try {
      // Use mdls to enumerate apps and get real bundle identifiers.
      // The previous AppleScript approach generated fake bundle IDs
      // (com.app.display-name) which prevented request_access from matching
      // apps by their real bundle ID (e.g. com.google.Chrome).
      const dirs = ['/Applications', '~/Applications', '/System/Applications']
      const allApps: InstalledApp[] = []
      for (const dir of dirs) {
        const expanded = dir.startsWith('~')
          ? join(process.env.HOME ?? '~', dir.slice(1))
          : dir
        const proc = Bun.spawn(
          [
            'bash',
            '-c',
            `for f in "${expanded}"/*.app; do [ -d "$f" ] || continue; bid=$(mdls -name kMDItemCFBundleIdentifier "$f" 2>/dev/null | sed 's/.*= "//;s/"//'); name=$(basename "$f" .app); echo "$f|$name|$bid"; done`,
          ],
          { stdout: 'pipe', stderr: 'pipe' },
        )
        const text = await new Response(proc.stdout).text()
        await proc.exited
        for (const line of text.split('\n').filter(Boolean)) {
          const [path, displayName, bundleId] = line.split('|', 3)
          if (path && displayName && bundleId && bundleId !== '(null)') {
            allApps.push({ bundleId, displayName, path })
          }
        }
      }
      // Deduplicate by bundleId (prefer /Applications over ~/Applications)
      const seen = new Set<string>()
      return allApps.filter(app => {
        if (seen.has(app.bundleId)) return false
        seen.add(app.bundleId)
        return true
      })
    } catch {
      return []
    }
  },

  iconDataUrl(_path) {
    return null
  },

  listRunning() {
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

  async open(bundleId) {
    await osascript(`tell application id "${bundleId}" to activate`)
  },

  async unhide(bundleIds) {
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

async function captureScreenToBase64(
  args: string[],
): Promise<{ base64: string; width: number; height: number }> {
  const tmpFile = join(tmpdir(), `cu-screenshot-${Date.now()}.png`)
  const proc = Bun.spawn(['screencapture', ...args, tmpFile], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  await proc.exited
  try {
    const buf = readFileSync(tmpFile)
    const base64 = buf.toString('base64')
    const width = buf.readUInt32BE(16)
    const height = buf.readUInt32BE(20)
    return { base64, width, height }
  } finally {
    try {
      unlinkSync(tmpFile)
    } catch {}
  }
}

export const screenshot: ScreenshotAPI = {
  async captureExcluding(
    _allowedBundleIds,
    _quality,
    _targetW,
    _targetH,
    displayId,
  ) {
    const args = ['-x']
    if (displayId !== undefined) args.push('-D', String(displayId))
    return captureScreenToBase64(args)
  },

  async captureRegion(
    _allowedBundleIds,
    x,
    y,
    w,
    h,
    _outW,
    _outH,
    _quality,
    displayId,
  ) {
    const args = ['-x', '-R', `${x},${y},${w},${h}`]
    if (displayId !== undefined) args.push('-D', String(displayId))
    return captureScreenToBase64(args)
  },

  captureWindowTarget(_titleOrHwnd: string | number): ScreenshotResult | null {
    // Window capture not supported on macOS via this backend
    return null
  },
}
