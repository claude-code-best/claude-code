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
  AppInfo, AppsAPI, DisplayAPI, DisplayGeometry, InstalledApp,
  PrepareDisplayResult, RunningApp, ScreenshotAPI, ScreenshotResult,
  SwiftBackend, WindowDisplayInfo,
} from '../types.js'

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
        width: Number(d.width), height: Number(d.height),
        scaleFactor: Number(d.scaleFactor), displayId: Number(d.displayId),
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
          width: Number(d.width), height: Number(d.height),
          scaleFactor: Number(d.scaleFactor), displayId: Number(d.displayId),
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
      // Use NSBundle via JXA ObjC bridge to read real CFBundleIdentifier.
      // The old AppleScript used "every file of folder Applications" which
      // misses .app bundles — packages are directories, not files on macOS.
      const raw = await jxa(`
        ObjC.import("Foundation");
        var fm = $.NSFileManager.defaultManager;
        var home = ObjC.unwrap($.NSHomeDirectory());
        var searchDirs = ["/Applications", home + "/Applications"];
        var result = [];
        for (var d = 0; d < searchDirs.length; d++) {
          var items = fm.contentsOfDirectoryAtPathError($(searchDirs[d]), null);
          if (!items) continue;
          for (var i = 0; i < items.count; i++) {
            var name = ObjC.unwrap(items.objectAtIndex(i));
            if (!name || !name.endsWith(".app")) continue;
            var appPath = searchDirs[d] + "/" + name;
            var bundle = $.NSBundle.bundleWithPath($(appPath));
            if (!bundle) continue;
            var bid = bundle.bundleIdentifier;
            if (!bid) continue;
            var bidStr = ObjC.unwrap(bid);
            if (!bidStr) continue;
            result.push({ bundleId: bidStr, displayName: name.slice(0, -4), path: appPath });
          }
        }
        JSON.stringify(result);
      `)
      return JSON.parse(raw) as InstalledApp[]
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

/**
 * Parse width/height from a JPEG buffer by scanning for the SOF0/SOF2 marker.
 * Returns [0, 0] if parsing fails (caller should fall back to a separate query).
 */
function readJpegDimensions(buf: Buffer): [number, number] {
  let i = 2 // skip SOI marker (FF D8)
  while (i + 3 < buf.length) {
    if (buf[i] !== 0xff) break
    const marker = buf[i + 1]
    const segLen = buf.readUInt16BE(i + 2)
    // SOF markers: C0 (baseline), C1, C2 (progressive) — all have dims at same offsets
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      // [2 len][1 precision][2 height][2 width]
      const h = buf.readUInt16BE(i + 5)
      const w = buf.readUInt16BE(i + 7)
      return [w, h]
    }
    i += 2 + segLen
  }
  return [0, 0]
}

async function captureAndResizeToBase64(
  captureArgs: string[],
  targetW: number,
  targetH: number,
  quality: number,
): Promise<{ base64: string; width: number; height: number }> {
  const ts = Date.now()
  const tmpPng = join(tmpdir(), `cu-screenshot-${ts}.png`)
  const tmpJpeg = join(tmpdir(), `cu-screenshot-${ts}.jpg`)

  const proc = Bun.spawn(['screencapture', ...captureArgs, tmpPng], {
    stdout: 'pipe', stderr: 'pipe',
  })
  await proc.exited

  try {
    // Resize to fit within targetW × targetH and convert to JPEG so the
    // media type matches the hardcoded "image/jpeg" in toolCalls.ts.
    // sips -Z scales the longest edge while preserving aspect ratio.
    // formatOptions takes an integer 0-100 for JPEG quality.
    const maxDim = Math.max(targetW, targetH)
    const qualityInt = String(Math.round(quality * 100))
    const sips = Bun.spawn(
      ['sips', '-Z', String(maxDim), '-s', 'format', 'jpeg', '-s', 'formatOptions', qualityInt, tmpPng, '--out', tmpJpeg],
      { stdout: 'pipe', stderr: 'pipe' },
    )
    await sips.exited

    const buf = readFileSync(tmpJpeg)
    const base64 = buf.toString('base64')
    const [width, height] = readJpegDimensions(buf)
    return { base64, width, height }
  } finally {
    try { unlinkSync(tmpPng) } catch {}
    try { unlinkSync(tmpJpeg) } catch {}
  }
}

export const screenshot: ScreenshotAPI = {
  async captureExcluding(_allowedBundleIds, quality, targetW, targetH, displayId) {
    const args = ['-x']
    if (displayId !== undefined) args.push('-D', String(displayId))
    return captureAndResizeToBase64(args, targetW, targetH, quality)
  },

  async captureRegion(_allowedBundleIds, x, y, w, h, outW, outH, quality, displayId) {
    const args = ['-x', '-R', `${x},${y},${w},${h}`]
    if (displayId !== undefined) args.push('-D', String(displayId))
    return captureAndResizeToBase64(args, outW, outH, quality)
  },
}
