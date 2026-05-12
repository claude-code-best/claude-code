/**
 * Input Indicator — floating label showing what Computer Use is doing
 * on the bound window.
 *
 * Displays a small overlay near the bottom of the bound window:
 *   ⌨ Typing "hello world..."
 *   🖱 Click (120, 50)
 *   ⌨ Ctrl+S
 *   📜 Scroll ↓ 3
 *   ✅ Done
 *
 * Auto-fades after 2 seconds of inactivity.
 * Click-through, TOPMOST, no taskbar icon.
 */

import * as fs from 'fs'
import * as path from 'path'
import { validateHwnd, getTmpDir } from './shared.js'

const INDICATOR_WIDTH = 350
const INDICATOR_HEIGHT = 28
const FADE_AFTER_MS = 2000
const BG_COLOR = '30, 30, 30' // dark background
const TEXT_COLOR = '220, 220, 220' // light text

let indicatorProc: ReturnType<typeof Bun.spawn> | null = null
let stopFile: string | null = null
let scriptFile: string | null = null
let msgFile: string | null = null

function buildIndicatorScript(hwnd: string, sf: string): string {
  const sfEsc = sf.replace(/\\/g, '\\\\')
  return `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class Indicator {
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll",SetLastError=true)] public static extern int SetWindowLong(IntPtr h, int i, int v);
    [DllImport("user32.dll",SetLastError=true)] public static extern int GetWindowLong(IntPtr h, int i);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int w, int h2, uint f);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L,T,R,B; }
    public const int GWL_EXSTYLE = -20;
    public const int WS_EX_LAYERED = 0x80000;
    public const int WS_EX_TRANSPARENT = 0x20;
    public const int WS_EX_TOOLWINDOW = 0x80;
    public const int WS_EX_NOACTIVATE = 0x08000000;
    public static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
    public const uint SWP_NOACTIVATE = 0x0010;
    public const uint SWP_SHOWWINDOW = 0x0040;
    public static void MakeOverlay(IntPtr h) {
        int ex = GetWindowLong(h, GWL_EXSTYLE);
        ex |= WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE;
        SetWindowLong(h, GWL_EXSTYLE, ex);
    }
}
'@

$targetHwnd = [IntPtr]::new([long]${hwnd})
$stopFile = '${sfEsc}'
$msgFile = $stopFile + '.msg'

$form = New-Object System.Windows.Forms.Form
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$form.ShowInTaskbar = $false
$form.TopMost = $true
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$form.Size = New-Object System.Drawing.Size(${INDICATOR_WIDTH}, ${INDICATOR_HEIGHT})
$form.Location = New-Object System.Drawing.Point(-32000, -32000)
$form.BackColor = [System.Drawing.Color]::FromArgb(240, ${BG_COLOR})
$form.Opacity = 0.92

$label = New-Object System.Windows.Forms.Label
$label.Dock = [System.Windows.Forms.DockStyle]::Fill
$label.ForeColor = [System.Drawing.Color]::FromArgb(${TEXT_COLOR})
$label.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Regular)
$label.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
$label.Padding = New-Object System.Windows.Forms.Padding(8, 0, 8, 0)
$label.Text = ""
$form.Controls.Add($label)

$form.Show()
[Indicator]::MakeOverlay($form.Handle)

$script:lastMsg = ""
$script:lastMsgTime = [DateTime]::MinValue
$script:visible = $false

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 50  # 20fps

$timer.Add_Tick({
    if (-not [Indicator]::IsWindow($targetHwnd)) {
        $timer.Stop(); $form.Close()
        [System.Windows.Forms.Application]::ExitThread()
        return
    }
    if (Test-Path $stopFile) {
        $timer.Stop(); $form.Close()
        try { Remove-Item $stopFile -ErrorAction SilentlyContinue } catch {}
        try { Remove-Item $msgFile -ErrorAction SilentlyContinue } catch {}
        [System.Windows.Forms.Application]::ExitThread()
        return
    }

    # Read new message
    if (Test-Path $msgFile) {
        try {
            $msg = Get-Content $msgFile -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
            if ($msg) {
                $script:lastMsg = $msg.Trim()
                $script:lastMsgTime = [DateTime]::Now
                Remove-Item $msgFile -ErrorAction SilentlyContinue
            }
        } catch {}
    }

    # Fade logic: hide after ${FADE_AFTER_MS}ms of no updates
    $elapsed = ([DateTime]::Now - $script:lastMsgTime).TotalMilliseconds
    if ($elapsed -gt ${FADE_AFTER_MS} -and $script:visible) {
        $form.Visible = $false
        $script:visible = $false
        return
    }
    if ($elapsed -le ${FADE_AFTER_MS} -and $script:lastMsg -ne "") {
        # Position at bottom-center of the bound window
        $wr = New-Object Indicator+RECT
        [Indicator]::GetWindowRect($targetHwnd, [ref]$wr) | Out-Null
        $ww = $wr.R - $wr.L
        $fx = $wr.L + [int](($ww - ${INDICATOR_WIDTH}) / 2)
        $fy = $wr.B - ${INDICATOR_HEIGHT} - 8
        $label.Text = $script:lastMsg
        [Indicator]::SetWindowPos($form.Handle, [Indicator]::HWND_TOPMOST,
            $fx, $fy, 0, 0,
            0x0001 -bor [Indicator]::SWP_NOACTIVATE -bor [Indicator]::SWP_SHOWWINDOW) | Out-Null
        $form.Visible = $true
        $script:visible = $true
        # Fade opacity near end
        if ($elapsed -gt ${FADE_AFTER_MS * 0.7}) {
            $form.Opacity = [Math]::Max(0.3, 0.92 * (1.0 - ($elapsed - ${FADE_AFTER_MS * 0.7}) / ${FADE_AFTER_MS * 0.3}))
        } else {
            $form.Opacity = 0.92
        }
    }
})

$timer.Start()
[System.Windows.Forms.Application]::Run()
`
}

/** Start the input indicator for a bound window */
export function showIndicator(hwnd: string): boolean {
  hwnd = validateHwnd(hwnd)
  hideIndicator()
  try {
    const tmpDir = getTmpDir()
    const ts = Date.now()
    stopFile = path.join(tmpDir, `cu_indicator_stop_${ts}`)
    scriptFile = path.join(tmpDir, `cu_indicator_${ts}.ps1`)
    msgFile = stopFile + '.msg'
    fs.writeFileSync(scriptFile, buildIndicatorScript(hwnd, stopFile), 'utf-8')
    indicatorProc = Bun.spawn(
      [
        'powershell',
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptFile,
      ],
      { stdout: 'ignore', stderr: 'ignore' },
    )
    return true
  } catch {
    return false
  }
}

/** Update the indicator message */
export function updateIndicator(message: string): void {
  if (!msgFile) return
  try {
    fs.writeFileSync(msgFile, message, 'utf-8')
  } catch {}
}

/** Hide and destroy the indicator */
export function hideIndicator(): void {
  if (stopFile) {
    try {
      fs.writeFileSync(stopFile, 'STOP', 'utf-8')
    } catch {}
    setTimeout(() => {
      try {
        indicatorProc?.kill()
      } catch {}
      try {
        if (scriptFile) fs.unlinkSync(scriptFile)
      } catch {}
      try {
        if (stopFile) fs.unlinkSync(stopFile)
      } catch {}
      try {
        if (msgFile) fs.unlinkSync(msgFile)
      } catch {}
    }, 2000)
  }
  indicatorProc = null
  stopFile = null
  scriptFile = null
  msgFile = null
}

// ── Convenience methods for common actions ──

export function indicateTyping(text: string): void {
  const preview = text.length > 30 ? text.slice(0, 30) + '...' : text
  updateIndicator(`\u2328 Typing "${preview}"`)
}

export function indicateKey(combo: string): void {
  updateIndicator(`\u2328 ${combo}`)
}

export function indicateClick(
  x: number,
  y: number,
  button: string = 'left',
): void {
  updateIndicator(
    `\uD83D\uDDB1 ${button === 'right' ? 'Right-click' : 'Click'} (${x}, ${y})`,
  )
}

export function indicateScroll(direction: string, amount: number): void {
  const arrow =
    direction === 'up'
      ? '\u2191'
      : direction === 'down'
        ? '\u2193'
        : direction === 'left'
          ? '\u2190'
          : '\u2192'
  updateIndicator(`\uD83D\uDCDC Scroll ${arrow} ${amount}`)
}

export function indicateDone(): void {
  updateIndicator('\u2705 Done')
}
