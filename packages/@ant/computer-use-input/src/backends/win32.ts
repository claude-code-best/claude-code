/**
 * Windows backend for computer-use-input
 *
 * Uses PowerShell with Win32 P/Invoke (SetCursorPos, SendInput, keybd_event,
 * GetForegroundWindow) to control mouse and keyboard.
 *
 * All P/Invoke types are compiled once at module load and reused across calls.
 */

import type { FrontmostAppInfo, InputBackend } from '../types.js'

// ---------------------------------------------------------------------------
// PowerShell helper — run a script and return trimmed stdout
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
// P/Invoke type definitions (compiled once, cached by PowerShell session)
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

// ---------------------------------------------------------------------------
// Virtual key code mapping
// ---------------------------------------------------------------------------

const VK_MAP: Record<string, number> = {
  return: 0x0d,
  enter: 0x0d,
  tab: 0x09,
  space: 0x20,
  backspace: 0x08,
  delete: 0x2e,
  escape: 0x1b,
  esc: 0x1b,
  left: 0x25,
  up: 0x26,
  right: 0x27,
  down: 0x28,
  home: 0x24,
  end: 0x23,
  pageup: 0x21,
  pagedown: 0x22,
  f1: 0x70,
  f2: 0x71,
  f3: 0x72,
  f4: 0x73,
  f5: 0x74,
  f6: 0x75,
  f7: 0x76,
  f8: 0x77,
  f9: 0x78,
  f10: 0x79,
  f11: 0x7a,
  f12: 0x7b,
  shift: 0xa0,
  lshift: 0xa0,
  rshift: 0xa1,
  control: 0xa2,
  ctrl: 0xa2,
  lcontrol: 0xa2,
  rcontrol: 0xa3,
  alt: 0xa4,
  option: 0xa4,
  lalt: 0xa4,
  ralt: 0xa5,
  win: 0x5b,
  meta: 0x5b,
  command: 0x5b,
  cmd: 0x5b,
  super: 0x5b,
  insert: 0x2d,
  printscreen: 0x2c,
  pause: 0x13,
  numlock: 0x90,
  capslock: 0x14,
  scrolllock: 0x91,
}

const MODIFIER_KEYS = new Set([
  'shift',
  'lshift',
  'rshift',
  'control',
  'ctrl',
  'lcontrol',
  'rcontrol',
  'alt',
  'option',
  'lalt',
  'ralt',
  'win',
  'meta',
  'command',
  'cmd',
  'super',
])

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export const moveMouse: InputBackend['moveMouse'] = async (x, y, _animated) => {
  ps(
    `${WIN32_TYPES}; [CuWin32]::SetCursorPos(${Math.round(x)}, ${Math.round(y)}) | Out-Null`,
  )
}

export const mouseLocation: InputBackend['mouseLocation'] = async () => {
  const out = ps(
    `${WIN32_TYPES}; $p = New-Object CuWin32+POINT; [CuWin32]::GetCursorPos([ref]$p) | Out-Null; "$($p.X),$($p.Y)"`,
  )
  const [xStr, yStr] = out.split(',')
  return { x: Number(xStr), y: Number(yStr) }
}

export const mouseButton: InputBackend['mouseButton'] = async (
  button,
  action,
  count,
) => {
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

  if (action === 'click') {
    const n = count ?? 1
    let clicks = ''
    for (let i = 0; i < n; i++) {
      clicks += `$i.mi.dwFlags=[CuWin32]::${downFlag}; [CuWin32]::SendInput(1, @($i), [Runtime.InteropServices.Marshal]::SizeOf($i)) | Out-Null; $i.mi.dwFlags=[CuWin32]::${upFlag}; [CuWin32]::SendInput(1, @($i), [Runtime.InteropServices.Marshal]::SizeOf($i)) | Out-Null; `
    }
    ps(
      `${WIN32_TYPES}; $i = New-Object CuWin32+INPUT; $i.type=[CuWin32]::INPUT_MOUSE; ${clicks}`,
    )
  } else if (action === 'press') {
    ps(
      `${WIN32_TYPES}; $i = New-Object CuWin32+INPUT; $i.type=[CuWin32]::INPUT_MOUSE; $i.mi.dwFlags=[CuWin32]::${downFlag}; [CuWin32]::SendInput(1, @($i), [Runtime.InteropServices.Marshal]::SizeOf($i)) | Out-Null`,
    )
  } else {
    ps(
      `${WIN32_TYPES}; $i = New-Object CuWin32+INPUT; $i.type=[CuWin32]::INPUT_MOUSE; $i.mi.dwFlags=[CuWin32]::${upFlag}; [CuWin32]::SendInput(1, @($i), [Runtime.InteropServices.Marshal]::SizeOf($i)) | Out-Null`,
    )
  }
}

export const mouseScroll: InputBackend['mouseScroll'] = async (
  amount,
  direction,
) => {
  const flag =
    direction === 'vertical' ? 'MOUSEEVENTF_WHEEL' : 'MOUSEEVENTF_HWHEEL'
  ps(
    `${WIN32_TYPES}; $i = New-Object CuWin32+INPUT; $i.type=[CuWin32]::INPUT_MOUSE; $i.mi.dwFlags=[CuWin32]::${flag}; $i.mi.mouseData=${amount * 120}; [CuWin32]::SendInput(1, @($i), [Runtime.InteropServices.Marshal]::SizeOf($i)) | Out-Null`,
  )
}

export const key: InputBackend['key'] = async (keyName, action) => {
  const lower = keyName.toLowerCase()
  const vk = VK_MAP[lower]
  const flags = action === 'release' ? '2' : '0'
  if (vk !== undefined) {
    ps(
      `${WIN32_TYPES}; [CuWin32]::keybd_event(${vk}, 0, ${flags}, [UIntPtr]::Zero)`,
    )
  } else if (keyName.length === 1) {
    // Single character — use VkKeyScan to resolve
    const charCode = keyName.charCodeAt(0)
    ps(
      `${WIN32_TYPES}; $vk = [CuWin32]::VkKeyScan([char]${charCode}) -band 0xFF; [CuWin32]::keybd_event([byte]$vk, 0, ${flags}, [UIntPtr]::Zero)`,
    )
  }
}

export const keys: InputBackend['keys'] = async parts => {
  const modifiers: number[] = []
  let finalKey: string | null = null

  for (const part of parts) {
    const lower = part.toLowerCase()
    if (MODIFIER_KEYS.has(lower)) {
      const vk = VK_MAP[lower]
      if (vk !== undefined) modifiers.push(vk)
    } else {
      finalKey = part
    }
  }
  if (!finalKey) return

  // Build script: press modifiers → press key → release key → release modifiers
  let script = WIN32_TYPES + '; '
  for (const vk of modifiers) {
    script += `[CuWin32]::keybd_event(${vk}, 0, 0, [UIntPtr]::Zero); `
  }
  const lower = finalKey.toLowerCase()
  const vk = VK_MAP[lower]
  if (vk !== undefined) {
    script += `[CuWin32]::keybd_event(${vk}, 0, 0, [UIntPtr]::Zero); [CuWin32]::keybd_event(${vk}, 0, 2, [UIntPtr]::Zero); `
  } else if (finalKey.length === 1) {
    const charCode = finalKey.charCodeAt(0)
    script += `$vk = [CuWin32]::VkKeyScan([char]${charCode}) -band 0xFF; [CuWin32]::keybd_event([byte]$vk, 0, 0, [UIntPtr]::Zero); [CuWin32]::keybd_event([byte]$vk, 0, 2, [UIntPtr]::Zero); `
  }
  for (const mk of modifiers.reverse()) {
    script += `[CuWin32]::keybd_event(${mk}, 0, 2, [UIntPtr]::Zero); `
  }
  ps(script)
}

export const typeText: InputBackend['typeText'] = async text => {
  const escaped = text.replace(/'/g, "''")
  ps(
    `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${escaped}')`,
  )
}

export const getFrontmostAppInfo: InputBackend['getFrontmostAppInfo'] = () => {
  try {
    const out = ps(`${WIN32_TYPES}
$hwnd = [CuWin32]::GetForegroundWindow()
$procId = [uint32]0
[CuWin32]::GetWindowThreadProcessId($hwnd, [ref]$procId) | Out-Null
$proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
"$($proc.MainModule.FileName)|$($proc.ProcessName)"`)
    if (!out || !out.includes('|')) return null
    const [exePath, appName] = out.split('|', 2)
    return { bundleId: exePath!, appName: appName! }
  } catch {
    return null
  }
}
