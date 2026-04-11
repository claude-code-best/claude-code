/**
 * Windows platform backend for Computer Use.
 *
 * Combines:
 * - PowerShell SetCursorPos/SendInput for global input (fallback)
 * - win32/windowMessage.ts for window-bound SendMessage input (preferred)
 * - Python Bridge (bridge.py) for screenshots (mss + ctypes PrintWindow)
 * - win32/windowEnum.ts for EnumWindows app listing
 * - No PowerShell for screenshots (Python Bridge only, no PS fallback)
 * - PowerShell Screen.AllScreens for display enumeration
 *
 * CRITICAL: All screenshots output JPEG (ImageFormat::Jpeg), not PNG.
 */

import type { Platform } from './index.js'
import type {
  InputPlatform,
  ScreenshotPlatform,
  DisplayPlatform,
  AppsPlatform,
  WindowHandle,
  ScreenshotResult,
  DisplayInfo,
  InstalledApp,
  FrontmostAppInfo,
} from './types.js'
import { listWindows } from '../win32/windowEnum.js'
import { detectAppType, openWithController } from '../win32/appDispatcher.js'
import {
  markBound,
  unmarkBound,
  cleanupAllBorders,
} from '../win32/windowBorder.js'
import {
  showVirtualCursor,
  hideVirtualCursor,
  moveVirtualCursor,
} from '../win32/virtualCursor.js'
import { showIndicator, hideIndicator } from '../win32/inputIndicator.js'
import {
  ps,
  psAsync,
  validateHwnd,
  VK_MAP,
  MODIFIER_KEYS,
} from '../win32/shared.js'
import { logForDebugging } from '../../debug.js'

// ---------------------------------------------------------------------------
// Python Bridge (lazy-loaded, preferred over PowerShell for screenshots)
// ---------------------------------------------------------------------------

let _bridge: typeof import('../win32/bridgeClient.js') | undefined
function getBridge() {
  if (!_bridge) {
    try {
      _bridge =
        require('../win32/bridgeClient.js') as typeof import('../win32/bridgeClient.js')
    } catch {}
  }
  return _bridge
}

/** Try a bridge call, return null on failure (caller falls back to PS) */
function bridgeCallSync<T>(
  method: string,
  params: Record<string, unknown> = {},
): T | null {
  try {
    const b = getBridge()
    if (!b) return null
    return b.callSync<T>(method, params)
  } catch {
    return null
  }
}

// validateHwnd, ps, psAsync, VK_MAP, MODIFIER_KEYS imported from '../win32/shared.js'

// ---------------------------------------------------------------------------
// Win32 P/Invoke types (compiled once per PS session)
// ---------------------------------------------------------------------------

const WIN32_TYPES = `
Add-Type -Language CSharp @'
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Diagnostics;

public class CuWin32 {
    // --- Cursor ---
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }

    // --- SendInput ---
    [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT {
        public int dx; public int dy; public int mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo;
    }
    [StructLayout(LayoutKind.Explicit)] public struct INPUT {
        [FieldOffset(0)] public uint type;
        [FieldOffset(4)] public MOUSEINPUT mi;
    }
    [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT {
        public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo;
    }
    [StructLayout(LayoutKind.Explicit)] public struct KINPUT {
        [FieldOffset(0)] public uint type;
        [FieldOffset(4)] public KEYBDINPUT ki;
    }
    [DllImport("user32.dll", SetLastError=true)] public static extern uint SendInput(uint n, INPUT[] i, int cb);
    [DllImport("user32.dll", SetLastError=true)] public static extern uint SendInput(uint n, KINPUT[] i, int cb);

    // --- Keyboard ---
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")] public static extern short VkKeyScan(char ch);

    // --- Window ---
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder sb, int max);

    // Constants
    public const uint INPUT_MOUSE = 0, INPUT_KEYBOARD = 1;
    public const uint MOUSEEVENTF_LEFTDOWN = 0x0002, MOUSEEVENTF_LEFTUP = 0x0004;
    public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008, MOUSEEVENTF_RIGHTUP = 0x0010;
    public const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020, MOUSEEVENTF_MIDDLEUP = 0x0040;
    public const uint MOUSEEVENTF_WHEEL = 0x0800, MOUSEEVENTF_HWHEEL = 0x1000;
    public const uint KEYEVENTF_KEYUP = 0x0002;
}
'@
`

// VK_MAP and MODIFIER_KEYS imported from '../win32/shared.js'

// ---------------------------------------------------------------------------
// Session-level HWND binding — all operations target this handle
// ---------------------------------------------------------------------------

let boundHwnd: string | null = null
let boundPid: number | null = null
let boundAppType: import('../win32/appDispatcher.js').AppType | null = null
let boundFilePath: string | null = null

/** Get the bound HWND, or null if not bound */
export function getBoundHwnd(): string | null {
  return boundHwnd
}

/** Get the bound app type */
export function getBoundAppType(): string | null {
  return boundAppType
}

/** Bind to a window HWND — all subsequent input/screenshot operations target this handle */
export function bindWindow(hwnd: string, pid?: number): void {
  hwnd = validateHwnd(hwnd)
  // Clean up previous binding
  if (boundHwnd) {
    unmarkBound(boundHwnd)
    hideVirtualCursor()
    hideIndicator()
  }
  boundHwnd = hwnd
  boundPid = pid ?? null
  boundAppType = 'generic'
  boundFilePath = null

  // 1. Brief activation: set the window to accept input, then restore user's focus.
  //    Some apps (UWP/Electron) don't process SendMessage when never-activated.
  //    Save current foreground → activate target → restore original foreground.
  const activateScript = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class CuActivate {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
}
'@
$prev = [CuActivate]::GetForegroundWindow()
$target = [IntPtr]::new([long]${hwnd})
if ([CuActivate]::IsIconic($target)) { [CuActivate]::ShowWindow($target, 9) | Out-Null }
[CuActivate]::SetForegroundWindow($target) | Out-Null
Start-Sleep -Milliseconds 100
if ($prev -ne [IntPtr]::Zero -and $prev -ne $target) {
    [CuActivate]::SetForegroundWindow($prev) | Out-Null
}
`
  ps(activateScript)

  // 2. Visual indicators
  markBound(hwnd)
  showVirtualCursor(hwnd)
  showIndicator(hwnd)
}

/** Bind to a COM-controlled file (Excel/Word — no window needed) */
export function bindFile(
  filePath: string,
  appType: import('../win32/appDispatcher.js').AppType,
): void {
  boundHwnd = null
  boundPid = null
  boundAppType = appType
  boundFilePath = filePath
}

/** Unbind — revert to global mode, remove overlays */
export function unbindWindow(): void {
  if (boundHwnd) unmarkBound(boundHwnd)
  hideVirtualCursor()
  hideIndicator()
  // Clear cached edit-child / InputSite mappings
  getWm().clearEditChildCache()
  boundHwnd = null
  boundPid = null
  boundAppType = null
  boundFilePath = null
}

// ---------------------------------------------------------------------------
// Window Message module (lazy loaded)
// ---------------------------------------------------------------------------

let _wm: typeof import('../win32/windowMessage.js') | undefined
function getWm() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (_wm ??=
    require('../win32/windowMessage.js') as typeof import('../win32/windowMessage.js'))
}

// ---------------------------------------------------------------------------
// Input — ALL text/key input goes through SendMessage when HWND is bound.
// Global SendInput/keybd_event is DISABLED to avoid interfering with user.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Input — When HWND is bound, ALL operations go through SendMessage.
// NO global API (SetCursorPos/SendInput/keybd_event/SendKeys) is used.
// This ensures the user's desktop is never disturbed.
// ---------------------------------------------------------------------------

const input: InputPlatform = {
  async moveMouse(x, y) {
    if (boundHwnd) {
      // Bound mode: move virtual cursor (visual only), no real cursor movement
      moveVirtualCursor(Math.round(x), Math.round(y))
      return
    }
    ps(
      `${WIN32_TYPES}; [CuWin32]::SetCursorPos(${Math.round(x)}, ${Math.round(y)}) | Out-Null`,
    )
  },

  async click(x, y, button) {
    if (boundHwnd) {
      moveVirtualCursor(Math.round(x), Math.round(y), true)
      // Find the deepest child window at these client coords and click on it.
      const editHwnd = getWm().findEditChild(boundHwnd)
      const targetHwnd = editHwnd ?? boundHwnd
      const ok = getWm().sendClick(
        targetHwnd,
        Math.round(x),
        Math.round(y),
        button as 'left' | 'right',
      )
      if (!ok) {
        getWm().sendClick(boundHwnd, Math.round(x), Math.round(y), button as 'left' | 'right')
      }
      return
    }
    const downFlag =
      button === 'left'
        ? 'MOUSEEVENTF_LEFTDOWN'
        : button === 'right'
          ? 'MOUSEEVENTF_RIGHTDOWN'
          : 'MOUSEEVENTF_MIDDLEDOWN'
    const upFlag =
      button === 'left'
        ? 'MOUSEEVENTF_LEFTUP'
        : button === 'right'
          ? 'MOUSEEVENTF_RIGHTUP'
          : 'MOUSEEVENTF_MIDDLEUP'
    ps(
      `${WIN32_TYPES}; [CuWin32]::SetCursorPos(${Math.round(x)}, ${Math.round(y)}) | Out-Null; $i = New-Object CuWin32+INPUT; $i.type=[CuWin32]::INPUT_MOUSE; $i.mi.dwFlags=[CuWin32]::${downFlag}; [CuWin32]::SendInput(1, @($i), [Runtime.InteropServices.Marshal]::SizeOf($i)) | Out-Null; $i.mi.dwFlags=[CuWin32]::${upFlag}; [CuWin32]::SendInput(1, @($i), [Runtime.InteropServices.Marshal]::SizeOf($i)) | Out-Null`,
    )
  },

  async typeText(text) {
    // COM-controlled apps: write directly via COM API
    if (boundAppType === 'word' && boundFilePath) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { appendText } =
        require('../win32/comWord.js') as typeof import('../win32/comWord.js')
      appendText(boundFilePath, text)
      return
    }
    // HWND-bound apps: SendMessageW(WM_CHAR) or clipboard paste
    if (boundHwnd) {
      const ok = getWm().sendText(boundHwnd, text)
      if (!ok) {
        throw new Error(
          `typeText failed: SendMessage to HWND ${boundHwnd} returned false. ` +
            `The edit control may not have been found (findEditChild returned null).`,
        )
      }
      return
    }
    throw new Error(
      'typeText requires a bound window or file. Call open() first.',
    )
  },

  async key(name, action) {
    if (boundHwnd) {
      const lower = name.toLowerCase()
      const vk = VK_MAP[lower] ?? (name.length === 1 ? name.charCodeAt(0) : 0)
      if (vk)
        getWm().sendKey(boundHwnd, vk, action === 'release' ? 'up' : 'down')
      return
    }
    throw new Error('key requires a bound window HWND. Call open() first.')
  },

  async keys(parts) {
    if (boundHwnd) {
      const ok = getWm().sendKeys(boundHwnd, parts)
      if (!ok) {
        throw new Error(`keys [${parts.join('+')}] failed on HWND ${boundHwnd}`)
      }
      return
    }
    throw new Error('keys requires a bound window HWND. Call open() first.')
  },

  async scroll(amount, direction) {
    if (boundHwnd) {
      // WM_VSCROLL / WM_HSCROLL for window-bound scrolling
      const msg = direction === 'vertical' ? '0x0115' : '0x0114' // WM_VSCROLL / WM_HSCROLL
      const wParam = amount > 0 ? '1' : '0' // SB_LINEDOWN=1 (positive=down) / SB_LINEUP=0 (negative=up)
      const n = Math.abs(Math.round(amount))
      let script = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class WScroll {
    [DllImport("user32.dll", CharSet=CharSet.Unicode, EntryPoint="SendMessageW")]
    public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
}
'@
`
      for (let i = 0; i < n; i++) {
        script += `[WScroll]::SendMessage([IntPtr]::new([long]${boundHwnd}), ${msg}, [IntPtr]${wParam}, [IntPtr]::Zero) | Out-Null; `
      }
      ps(script)
      return
    }
    const flag =
      direction === 'vertical' ? 'MOUSEEVENTF_WHEEL' : 'MOUSEEVENTF_HWHEEL'
    ps(
      `${WIN32_TYPES}; $i = New-Object CuWin32+INPUT; $i.type=[CuWin32]::INPUT_MOUSE; $i.mi.dwFlags=[CuWin32]::${flag}; $i.mi.mouseData=${amount * 120}; [CuWin32]::SendInput(1, @($i), [Runtime.InteropServices.Marshal]::SizeOf($i)) | Out-Null`,
    )
  },

  async mouseLocation() {
    // Always returns real cursor position (informational, doesn't move it)
    const out = ps(
      `${WIN32_TYPES}; $p = New-Object CuWin32+POINT; [CuWin32]::GetCursorPos([ref]$p) | Out-Null; "$($p.X),$($p.Y)"`,
    )
    const [xStr, yStr] = out.split(',')
    return { x: Number(xStr), y: Number(yStr) }
  },

  async sendChar(hwnd, char) {
    getWm().sendChar(String(hwnd), char)
  },
  async sendKey(hwnd, vk, action) {
    getWm().sendKey(String(hwnd), vk, action)
  },
  async sendClick(hwnd, x, y, button) {
    getWm().sendClick(String(hwnd), x, y, button)
  },
  async sendText(hwnd, text) {
    getWm().sendText(String(hwnd), text)
  },
}

// ---------------------------------------------------------------------------
// Screenshot — JPEG output only
// ---------------------------------------------------------------------------

const screenshot: ScreenshotPlatform = {
  async captureScreen(displayId): Promise<ScreenshotResult> {
    // If HWND is bound, capture that specific window
    if (boundHwnd) {
      const result = await this.captureWindow?.(String(boundHwnd))
      if (result) return result
    }

    // Python Bridge (mss + Pillow, ~300ms)
    const bridgeResult = bridgeCallSync<ScreenshotResult>('screenshot', {
      display_id: displayId ?? 0,
    })
    if (bridgeResult && bridgeResult.base64) {
      return bridgeResult
    }

    throw new Error(
      '[computer-use] Screenshot failed: Python bridge returned no data. ' +
        'Ensure python3 + mss + Pillow are installed (pip install mss Pillow).',
    )
  },

  async captureRegion(x, y, w, h): Promise<ScreenshotResult> {
    // When HWND is bound, the window IS the region (matches macOS behavior)
    if (boundHwnd) {
      const result = await this.captureWindow?.(String(boundHwnd))
      if (result) return result
    }
    return this.captureScreen()
  },

  async captureWindow(hwnd) {
    // Python Bridge (ctypes PrintWindow + GDI → Pillow JPEG, ~300ms)
    const bridgeResult = bridgeCallSync<ScreenshotResult>('screenshot_window', {
      hwnd: String(hwnd),
    })
    if (bridgeResult && bridgeResult.base64) {
      return bridgeResult
    }

    throw new Error(
      `[computer-use] Window screenshot failed for HWND ${hwnd}: Python bridge returned no data.`,
    )
  },
}

// ---------------------------------------------------------------------------
// Display — Screen.AllScreens
// ---------------------------------------------------------------------------

const display: DisplayPlatform = {
  listAll(): DisplayInfo[] {
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
          const [w, h, id] = entry.split(',')
          return {
            width: Number(w),
            height: Number(h),
            scaleFactor: 1,
            displayId: Number(id),
          }
        })
    } catch {
      return [{ width: 1920, height: 1080, scaleFactor: 1, displayId: 0 }]
    }
  },

  getSize(displayId): DisplayInfo {
    const all = this.listAll()
    if (displayId !== undefined) {
      const found = all.find(d => d.displayId === displayId)
      if (found) return found
    }
    return all[0] ?? { width: 1920, height: 1080, scaleFactor: 1, displayId: 0 }
  },
}

// ---------------------------------------------------------------------------
// Find existing window by process name or title (avoid launching new instance)
// ---------------------------------------------------------------------------

function findExistingWindow(
  hint: string,
): { hwnd: string; pid: number } | null {
  const windows = listWindows()
  const lower = hint.toLowerCase()
  // Match by window title containing the hint
  for (const w of windows) {
    const titleLower = (w.title ?? '').toLowerCase()
    if (titleLower.includes(lower)) {
      return { hwnd: w.hwnd, pid: w.pid }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Apps — EnumWindows + registry + AppxPackage
// ---------------------------------------------------------------------------

const apps: AppsPlatform = {
  listRunning(): WindowHandle[] {
    const windows = listWindows()
    return windows.map(w => ({
      id: String(w.hwnd),
      pid: w.pid,
      title: w.title,
    }))
  },

  async listInstalled(): Promise<InstalledApp[]> {
    try {
      const raw = await psAsync(`
$apps = @()

# Traditional Win32 apps from registry
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

# UWP/MSIX apps (Windows 10/11 Store apps)
Get-AppxPackage -ErrorAction SilentlyContinue | Where-Object { $_.IsFramework -eq $false -and $_.SignatureKind -eq 'Store' } | ForEach-Object {
  $cleanName = $_.Name -replace '^Microsoft\\.Windows', '' -replace '^Microsoft\\.', ''
  $apps += "$cleanName|$($_.InstallLocation)|$($_.PackageFamilyName)"
}

$apps | Select-Object -Unique | Select-Object -First 300
`)
      return raw
        .split('\n')
        .filter(Boolean)
        .map(line => {
          const [name, path, id] = line.trim().split('|', 3)
          return {
            id: (id ?? name ?? '').trim(),
            displayName: (name ?? '').trim(),
            path: (path ?? '').trim(),
          }
        })
    } catch {
      return []
    }
  },

  async open(name) {
    // Detect app type and route to appropriate controller
    const appType = detectAppType(name)

    // Excel/Word → COM automation (no window, no HWND)
    if (appType === 'excel' || appType === 'word') {
      const result = await openWithController(name)
      if (result.filePath) {
        bindFile(result.filePath, result.type)
      }
      return
    }

    // Text/Browser/Generic → exe launch + HWND bind (offscreen)
    // If name is a UWP PackageFamilyName (e.g. Microsoft.WindowsNotepad_8wekyb3d8bbwe),
    // extract the app name and try as exe. This avoids launching through UWP shell.
    let launchName = name
    if (name.includes('_') && name.includes('.')) {
      // Microsoft.WindowsNotepad_xxx → Notepad
      // Microsoft.WindowsCalculator_xxx → Calculator
      // Microsoft.WindowsTerminal_xxx → Terminal
      const parts = name.split('_')[0]?.split('.') ?? []
      const appPart = parts[parts.length - 1] ?? name
      // Strip "Windows" prefix: WindowsNotepad → Notepad
      launchName = appPart.replace(/^Windows/, '') || appPart
    }

    // --- Try to find an EXISTING window first (by process name or title) ---
    // If found, auto-bind to it. Use bind_window tool to switch later.
    const existingHwnd = findExistingWindow(launchName)
    if (existingHwnd) {
      bindWindow(existingHwnd.hwnd, existingHwnd.pid)
      return
    }
    const escaped = launchName.replace(/'/g, "''")
    const result = await psAsync(`
${WIN32_TYPES}
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class CuLaunch {
    public delegate bool EnumProc(IntPtr h, IntPtr lp);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lp);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder sb, int n);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
    public const int SW_SHOWMINNOACTIVE = 7;
    // Get all visible window HWNDs as array
    public static long[] GetAllVisibleHwnds() {
        var list = new System.Collections.Generic.List<long>();
        EnumWindows((h, _) => {
            if (IsWindowVisible(h)) list.Add(h.ToInt64());
            return true;
        }, IntPtr.Zero);
        return list.ToArray();
    }
    // Get PID for a single HWND
    public static uint GetPidForHwnd(long hwnd) {
        uint pid; GetWindowThreadProcessId((IntPtr)hwnd, out pid);
        return pid;
    }
    // Get title for a single HWND
    public static string GetTitle(long hwnd) {
        var sb = new StringBuilder(256);
        GetWindowText((IntPtr)hwnd, sb, 256);
        return sb.ToString();
    }
}
'@
# Launch strategy: all exe-based, no GUI dialogs.
# 1) exact path  2) exe in PATH  3) registry install dir  4) raw name
$target = '${escaped}'
$proc = $null

# 1. Exact file path
if (Test-Path $target) {
    $proc = Start-Process $target -PassThru -ErrorAction SilentlyContinue
}

# 2. exe name in PATH (notepad.exe, code.exe, chrome.exe, etc.)
if (-not $proc) {
    # Try with .exe suffix if not already
    $tryExe = if ($target -notmatch '[.]exe$') { "$target.exe" } else { $target }
    $found = Get-Command $tryExe -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $found) { $found = Get-Command $target -ErrorAction SilentlyContinue | Select-Object -First 1 }
    if ($found) { $proc = Start-Process $found.Source -PassThru -ErrorAction SilentlyContinue }
}

# 3. Search registry for install location by display name → find .exe
if (-not $proc) {
    $regPaths = @('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*')
    foreach ($p in $regPaths) {
        $app = Get-ItemProperty $p -ErrorAction SilentlyContinue | Where-Object {
            $_.DisplayName -and $_.DisplayName -match [regex]::Escape($target)
        } | Select-Object -First 1
        if ($app) {
            # Try DisplayIcon (often the exe path), then InstallLocation
            $exePath = $null
            if ($app.DisplayIcon -and $app.DisplayIcon -match '[.]exe') {
                $exePath = ($app.DisplayIcon -split ',')[0].Trim('"')
            }
            if (-not $exePath -and $app.InstallLocation) {
                $exeFile = Get-ChildItem $app.InstallLocation -Filter '*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
                if ($exeFile) { $exePath = $exeFile.FullName }
            }
            if ($exePath -and (Test-Path $exePath)) {
                $proc = Start-Process $exePath -PassThru -ErrorAction SilentlyContinue
                break
            }
        }
    }
}

# 4. Last resort: direct Start-Process (Windows may resolve it)
if (-not $proc) { $proc = Start-Process -FilePath $target -PassThru -ErrorAction SilentlyContinue }

if (-not $proc) { Write-Host "LAUNCH_FAILED"; exit }

# Snapshot ALL visible window HWNDs before the new window appears
$beforeHwnds = [CuLaunch]::GetAllVisibleHwnds()

# Wait for a NEW window from our process PID
$hwnd = 0
for ($i = 0; $i -lt 50; $i++) {
    Start-Sleep -Milliseconds 200
    $afterHwnds = [CuLaunch]::GetAllVisibleHwnds()
    # Find new windows (in after but not in before)
    foreach ($h in $afterHwnds) {
        if ($beforeHwnds -contains $h) { continue }
        # New window found — check PID
        $wPid = [CuLaunch]::GetPidForHwnd($h)
        if ($wPid -eq [uint32]$proc.Id) {
            $hwnd = $h; break  # exact PID match
        }
    }
    if ($hwnd -ne 0) { break }
    # PID didn't match (process redirect) — accept new window matching title hint
    if ($i -gt 10) {
        $hint = '${escaped}'.Split('\\')[-1].Replace('.exe','')
        foreach ($h in $afterHwnds) {
            if ($beforeHwnds -contains $h) { continue }
            $title = [CuLaunch]::GetTitle($h)
            if ($title -and $title.IndexOf($hint, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
                $hwnd = $h; break
            }
        }
        if ($hwnd -ne 0) { break }
    }
}
if ($hwnd -eq 0) { Write-Host "HWND_NOT_FOUND|$($proc.Id)"; exit }
# Move offscreen instead of minimizing — keeps window restored so
# PrintWindow and SendMessage work without needing restore/re-minimize.
# User cannot see the window at -32000,-32000.
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class CuPos {
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int w, int h2, uint f);
    public const uint SWP_NOSIZE = 0x0001;
    public const uint SWP_NOZORDER = 0x0004;
    public const uint SWP_NOACTIVATE = 0x0010;
}
'@
[CuPos]::SetWindowPos([IntPtr]::new([long]$hwnd), [IntPtr]::Zero, -32000, -32000, 0, 0, [CuPos]::SWP_NOSIZE -bor [CuPos]::SWP_NOZORDER -bor [CuPos]::SWP_NOACTIVATE) | Out-Null
Write-Host "$hwnd|$($proc.Id)"
`)
    if (!result) {
      throw new Error(
        `open(): failed to launch '${name}' — no output from launcher script`,
      )
    }
    if (result.startsWith('LAUNCH_FAILED')) {
      throw new Error(
        `open(): failed to launch '${name}' — process did not start (${result})`,
      )
    }
    if (result.startsWith('HWND_NOT_FOUND')) {
      throw new Error(
        `open(): launched '${name}' but could not find its window HWND (${result})`,
      )
    }
    const parts = result.trim().split('|')
    const hwnd = parts[0]!.trim()
    const pid = Number(parts[1])
    if (hwnd && hwnd !== '0') {
      // Bind to the launched window — all subsequent operations target this HWND
      bindWindow(hwnd, pid)
    }
  },

  getFrontmostApp(): FrontmostAppInfo | null {
    try {
      const out = ps(`${WIN32_TYPES}
$hwnd = [CuWin32]::GetForegroundWindow()
$procId = [uint32]0
[CuWin32]::GetWindowThreadProcessId($hwnd, [ref]$procId) | Out-Null
$proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
"$($proc.MainModule.FileName)|$($proc.ProcessName)"`)
      if (!out || !out.includes('|')) return null
      const [exePath, appName] = out.split('|', 2)
      return { id: exePath!, appName: appName! }
    } catch {
      return null
    }
  },

  findWindowByTitle(title): WindowHandle | null {
    const windows = listWindows()
    const found = windows.find(w => w.title.includes(title))
    if (!found) return null
    return { id: String(found.hwnd), pid: found.pid, title: found.title }
  },
}

// ---------------------------------------------------------------------------
// Window Management — Win32 API calls targeted at bound HWND.
// NO global shortcuts (Win+Down, Alt+F4, etc.)
// Uses ShowWindow, SetWindowPos, SendMessage(WM_CLOSE) directly.
// ---------------------------------------------------------------------------

const WINDOW_MGMT_TYPES = `
Add-Type @'
using System;
using System.Runtime.InteropServices;

public class CuWinMgmt {
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hAfter, int X, int Y, int cx, int cy, uint uFlags);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll", CharSet=CharSet.Unicode, EntryPoint="SendMessageW")]
    public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsZoomed(IntPtr hWnd);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left; public int Top; public int Right; public int Bottom;
    }

    // ShowWindow constants
    public const int SW_MINIMIZE = 6;
    public const int SW_MAXIMIZE = 3;
    public const int SW_RESTORE = 9;
    public const int SW_SHOWNOACTIVATE = 4;
    public const int SW_SHOWMINNOACTIVE = 7;

    // SetWindowPos flags
    public const uint SWP_NOSIZE = 0x0001;
    public const uint SWP_NOMOVE = 0x0002;
    public const uint SWP_NOZORDER = 0x0004;
    public const uint SWP_NOACTIVATE = 0x0010;
    public const uint SWP_SHOWWINDOW = 0x0040;

    // WM_CLOSE
    public const uint WM_CLOSE = 0x0010;
    // WM_SYSCOMMAND
    public const uint WM_SYSCOMMAND = 0x0112;
    public const int SC_MINIMIZE = 0xF020;
    public const int SC_MAXIMIZE = 0xF030;
    public const int SC_RESTORE = 0xF120;
    public const int SC_CLOSE = 0xF060;
}
'@
`

import type { WindowManagementPlatform, WindowAction } from './types.js'

const windowManagement: WindowManagementPlatform = {
  manageWindow(action: WindowAction, opts?): boolean {
    if (!boundHwnd) return false
    const hwnd = boundHwnd

    switch (action) {
      case 'minimize': {
        // ShowWindow(SW_MINIMIZE) — targeted at HWND, not global
        const r = ps(
          `${WINDOW_MGMT_TYPES}; [CuWinMgmt]::ShowWindow([IntPtr]::new([long]${hwnd}), [CuWinMgmt]::SW_SHOWMINNOACTIVE)`,
        )
        return r !== ''
      }
      case 'maximize': {
        const r = ps(
          `${WINDOW_MGMT_TYPES}; [CuWinMgmt]::ShowWindow([IntPtr]::new([long]${hwnd}), [CuWinMgmt]::SW_MAXIMIZE)`,
        )
        return r !== ''
      }
      case 'restore': {
        const r = ps(
          `${WINDOW_MGMT_TYPES}; [CuWinMgmt]::ShowWindow([IntPtr]::new([long]${hwnd}), [CuWinMgmt]::SW_RESTORE)`,
        )
        return r !== ''
      }
      case 'close': {
        // SendMessage(WM_CLOSE) — graceful close targeted at HWND
        // Also clean up border overlay
        unmarkBound(hwnd)
        ps(
          `${WINDOW_MGMT_TYPES}; [CuWinMgmt]::SendMessage([IntPtr]::new([long]${hwnd}), [CuWinMgmt]::WM_CLOSE, [IntPtr]::Zero, [IntPtr]::Zero)`,
        )
        unbindWindow()
        return true
      }
      case 'focus': {
        // Restore if minimized, then bring to front
        ps(`${WINDOW_MGMT_TYPES}
$h = [IntPtr]::new([long]${hwnd})
if ([CuWinMgmt]::IsIconic($h)) {
    [CuWinMgmt]::ShowWindow($h, [CuWinMgmt]::SW_RESTORE) | Out-Null
}
[CuWinMgmt]::SetForegroundWindow($h) | Out-Null
[CuWinMgmt]::BringWindowToTop($h) | Out-Null
`)
        return true
      }
      case 'move_offscreen': {
        // Move to -32000,-32000 — keeps window in restored state for SendMessage/PrintWindow
        ps(
          `${WINDOW_MGMT_TYPES}; [CuWinMgmt]::SetWindowPos([IntPtr]::new([long]${hwnd}), [IntPtr]::Zero, -32000, -32000, 0, 0, [CuWinMgmt]::SWP_NOSIZE -bor [CuWinMgmt]::SWP_NOZORDER -bor [CuWinMgmt]::SWP_NOACTIVATE)`,
        )
        return true
      }
      case 'move_resize': {
        if (opts?.x !== undefined && opts?.y !== undefined) {
          this.moveResize(opts.x, opts.y, opts.width, opts.height)
        }
        return true
      }
      case 'get_rect': {
        // get_rect is handled separately by getWindowRect(), not through manageWindow
        // Return true to indicate the action is recognized
        return true
      }
      default:
        return false
    }
  },

  moveResize(x: number, y: number, width?: number, height?: number): boolean {
    if (!boundHwnd) return false
    const hwnd = boundHwnd
    if (width !== undefined && height !== undefined) {
      ps(
        `${WINDOW_MGMT_TYPES}; [CuWinMgmt]::SetWindowPos([IntPtr]::new([long]${hwnd}), [IntPtr]::Zero, ${x}, ${y}, ${width}, ${height}, [CuWinMgmt]::SWP_NOZORDER -bor [CuWinMgmt]::SWP_NOACTIVATE)`,
      )
    } else {
      ps(
        `${WINDOW_MGMT_TYPES}; [CuWinMgmt]::SetWindowPos([IntPtr]::new([long]${hwnd}), [IntPtr]::Zero, ${x}, ${y}, 0, 0, [CuWinMgmt]::SWP_NOSIZE -bor [CuWinMgmt]::SWP_NOZORDER -bor [CuWinMgmt]::SWP_NOACTIVATE)`,
      )
    }
    return true
  },

  getWindowRect(): {
    x: number
    y: number
    width: number
    height: number
  } | null {
    if (!boundHwnd) return null
    const out = ps(`${WINDOW_MGMT_TYPES}
$rect = New-Object CuWinMgmt+RECT
if ([CuWinMgmt]::GetWindowRect([IntPtr]::new([long]${boundHwnd}), [ref]$rect)) {
    "$($rect.Left),$($rect.Top),$($rect.Right),$($rect.Bottom)"
} else { "FAIL" }
`)
    if (!out || out === 'FAIL') return null
    const [l, t, r, b] = out.split(',').map(Number)
    return { x: l, y: t, width: r - l, height: b - t }
  },
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

// Clean up all overlays on process exit
function cleanupAll() {
  cleanupAllBorders()
  hideVirtualCursor()
  hideIndicator()
  // Stop the Python bridge subprocess if it was started
  try {
    getBridge()?.stopBridge()
  } catch {}
}
process.on('exit', cleanupAll)
process.on('SIGINT', () => {
  cleanupAll()
  process.exit()
})
process.on('SIGTERM', () => {
  cleanupAll()
  process.exit()
})

export const platform: Platform = {
  input,
  screenshot,
  display,
  apps,
  windowManagement,
}
