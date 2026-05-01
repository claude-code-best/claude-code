/**
 * Windows backend for computer-use-swift
 *
 * Uses PowerShell with .NET System.Drawing / System.Windows.Forms for
 * screenshots and Win32 P/Invoke for window/process management.
 */

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

import { listWindows } from 'src/utils/computerUse/win32/windowEnum.js'
import {
  captureWindow,
  captureWindowByHwnd,
} from 'src/utils/computerUse/win32/windowCapture.js'

// ---------------------------------------------------------------------------
// PowerShell helper
// ---------------------------------------------------------------------------

function ps(script: string): string {
  const result = Bun.spawnSync({
    cmd: ['powershell', '-NoProfile', '-NonInteractive', '-Command', script],
    stdout: 'pipe',
    stderr: 'pipe',
  })
  return new TextDecoder().decode(result.stdout).trim()
}

async function psAsync(script: string): Promise<string> {
  const proc = Bun.spawn(
    ['powershell', '-NoProfile', '-NonInteractive', '-Command', script],
    { stdout: 'pipe', stderr: 'pipe' },
  )
  const out = await new Response(proc.stdout).text()
  await proc.exited
  return out.trim()
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
    return all[0] ?? { width: 1920, height: 1080, scaleFactor: 1, displayId: 0 }
  },

  listAll(): DisplayGeometry[] {
    try {
      const raw = ps(`
Add-Type -AssemblyName System.Windows.Forms
$result = @()
$idx = 0
foreach ($s in [System.Windows.Forms.Screen]::AllScreens) {
  $result += "$($s.Bounds.Width),$($s.Bounds.Height),$idx,$($s.Primary)"
  $idx++
}
$result -join "|"
`)
      return raw
        .split('|')
        .filter(Boolean)
        .map(entry => {
          const [w, h, id, primary] = entry.split(',')
          return {
            width: Number(w),
            height: Number(h),
            scaleFactor: 1, // Windows DPI scaling handled at system level
            displayId: Number(id),
          }
        })
    } catch {
      return [{ width: 1920, height: 1080, scaleFactor: 1, displayId: 0 }]
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
    return bundleIds.map(bundleId => ({ bundleId, displayIds: [0] }))
  },

  async appUnderPoint(_x, _y) {
    try {
      const out = ps(`
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class WinPt {
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
}
'@
$pt = New-Object WinPt+POINT
$pt.X = ${_x}; $pt.Y = ${_y}
$hwnd = [WinPt]::WindowFromPoint($pt)
$pid = [uint32]0
[WinPt]::GetWindowThreadProcessId($hwnd, [ref]$pid) | Out-Null
$proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
"$($proc.MainModule.FileName)|$($proc.ProcessName)"
`)
      if (!out || !out.includes('|')) return null
      const [exePath, name] = out.split('|', 2)
      return { bundleId: exePath!, displayName: name! }
    } catch {
      return null
    }
  },

  async listInstalled() {
    try {
      const raw = await psAsync(`
$apps = @()
$paths = @(
  'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
foreach ($p in $paths) {
  Get-ItemProperty $p -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | ForEach-Object {
    $apps += "$($_.DisplayName)|$($_.InstallLocation)|$($_.PSChildName)"
  }
}
$apps | Select-Object -Unique | Select-Object -First 200
`)
      return raw
        .split('\n')
        .filter(Boolean)
        .map(line => {
          const [name, path, id] = line.split('|', 3)
          return {
            bundleId: id ?? name ?? '',
            displayName: name ?? '',
            path: path ?? '',
          }
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
      const windows = listWindows()
      return windows.map(w => ({
        bundleId: String(w.hwnd),
        displayName: w.title,
      }))
    } catch {
      return []
    }
  },

  async open(name) {
    // On Windows, name is the exe path (bundleId) or process name.
    // Try exe path first, fall back to process name lookup.
    const escaped = name.replace(/'/g, "''")
    await psAsync(`
if (Test-Path '${escaped}') {
  Start-Process '${escaped}'
} else {
  Start-Process -FilePath '${escaped}' -ErrorAction SilentlyContinue
}`)
  },

  async unhide(bundleIds) {
    // Windows: bring window to foreground
    for (const name of bundleIds) {
      await psAsync(`
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class WinShow {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@
$proc = Get-Process -Name "${name}" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($proc) { [WinShow]::ShowWindow($proc.MainWindowHandle, 9) | Out-Null; [WinShow]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null }
`)
    }
  },
}

// ---------------------------------------------------------------------------
// ScreenshotAPI
// ---------------------------------------------------------------------------

export const screenshot: ScreenshotAPI = {
  async captureExcluding(
    _allowedBundleIds,
    _quality,
    _targetW,
    _targetH,
    displayId,
  ) {
    const raw = await psAsync(`
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$screen = if (${displayId ?? -1} -ge 0) { [System.Windows.Forms.Screen]::AllScreens[${displayId ?? 0}] } else { [System.Windows.Forms.Screen]::PrimaryScreen }
$bounds = $screen.Bounds
$bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$g.Dispose()
$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$bytes = $ms.ToArray()
$ms.Dispose()
"$($bounds.Width),$($bounds.Height)," + [Convert]::ToBase64String($bytes)
`)
    const firstComma = raw.indexOf(',')
    const secondComma = raw.indexOf(',', firstComma + 1)
    const width = Number(raw.slice(0, firstComma))
    const height = Number(raw.slice(firstComma + 1, secondComma))
    const base64 = raw.slice(secondComma + 1)
    return { base64, width, height }
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
    _displayId,
  ) {
    const raw = await psAsync(`
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap(${w}, ${h})
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen(${x}, ${y}, 0, 0, (New-Object System.Drawing.Size(${w}, ${h})))
$g.Dispose()
$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$bytes = $ms.ToArray()
$ms.Dispose()
"${w},${h}," + [Convert]::ToBase64String($bytes)
`)
    const firstComma = raw.indexOf(',')
    const secondComma = raw.indexOf(',', firstComma + 1)
    const base64 = raw.slice(secondComma + 1)
    return { base64, width: w, height: h }
  },

  /**
   * Capture a specific window by title or HWND using PrintWindow.
   * Works even for occluded or background windows.
   */
  captureWindowTarget(titleOrHwnd: string | number): ScreenshotResult | null {
    if (typeof titleOrHwnd === 'number') {
      return captureWindowByHwnd(titleOrHwnd)
    }
    return captureWindow(titleOrHwnd)
  },
}
