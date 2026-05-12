/**
 * SendMessage-based input for Win32 windows.
 *
 * ALL text/keyboard operations target a specific HWND via SendMessageW.
 * No SendInput / keybd_event / SendKeys — those are global and conflict with the user.
 *
 * Text input strategy:
 * 1. Short text (≤ CLIPBOARD_THRESHOLD chars): SendMessageW(WM_CHAR) per codepoint
 * 2. Long text (> threshold): Clipboard.SetText() + SendMessageW(Ctrl+V) paste
 * Both paths support full Unicode (Chinese, emoji, etc.) without IME involvement.
 */

import { validateHwnd, runPs, VK_MAP, MODIFIER_KEYS } from './shared.js'

/** Cache findEditChild results — window structure doesn't change while bound */
const editChildCache = new Map<string, string | null>()

/** Clear cached edit-child mappings. Call on unbind. */
export function clearEditChildCache(hwnd?: string): void {
  if (hwnd) {
    editChildCache.delete(hwnd)
  } else {
    editChildCache.clear()
  }
}

/**
 * Resolve the HWND that should actually receive input messages.
 * For WinUI 3 apps, returns the InputSite child window.
 * For traditional Win32 apps, returns the edit control or the original HWND.
 */
export function resolveInputHwnd(hwnd: string): string {
  hwnd = validateHwnd(hwnd)
  return findEditChild(hwnd) ?? hwnd
}

const WINMSG_TYPE = `
Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public class WinMsg {
    public delegate bool EnumChildProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumChildWindows(IntPtr parent, EnumChildProc proc, IntPtr lParam);

    [DllImport("user32.dll", CharSet=CharSet.Unicode)]
    public static extern int GetClassName(IntPtr h, StringBuilder sb, int max);

    // CRITICAL: CharSet.Unicode → resolves to SendMessageW
    // SendMessageW sends Unicode WM_CHAR (full UTF-16 codepoints including CJK)
    [DllImport("user32.dll", CharSet=CharSet.Unicode, EntryPoint="SendMessageW")]
    public static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", CharSet=CharSet.Unicode, EntryPoint="PostMessageW")]
    public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern uint MapVirtualKeyW(uint uCode, uint uMapType);

    public static IntPtr MakeLParam(int lo, int hi) {
        return (IntPtr)((hi << 16) | (lo & 0xFFFF));
    }

    // Build lParam for WM_KEYDOWN / WM_KEYUP with correct scan code
    // lParam bits: 0-15 repeat count, 16-23 scan code, 24 extended, 30 prev state, 31 transition
    public static IntPtr KeyDownLParam(uint vk) {
        uint scanCode = MapVirtualKeyW(vk, 0); // MAPVK_VK_TO_VSC = 0
        return (IntPtr)(1 | (scanCode << 16));  // repeat=1, scanCode in bits 16-23
    }
    public static IntPtr KeyUpLParam(uint vk) {
        uint scanCode = MapVirtualKeyW(vk, 0);
        return (IntPtr)(1 | (scanCode << 16) | (1 << 30) | (1u << 31)); // prev=1, transition=1
    }

    public const uint WM_CHAR = 0x0102;
    public const uint WM_KEYDOWN = 0x0100;
    public const uint WM_KEYUP = 0x0101;
    public const uint WM_LBUTTONDOWN = 0x0201;
    public const uint WM_LBUTTONUP = 0x0202;
    public const uint WM_RBUTTONDOWN = 0x0204;
    public const uint WM_RBUTTONUP = 0x0205;

    public static List<string> childResults = new List<string>();

    public static void FindChildren(IntPtr parent) {
        childResults.Clear();
        EnumChildWindows(parent, delegate(IntPtr hWnd, IntPtr lParam) {
            StringBuilder sb = new StringBuilder(256);
            GetClassName(hWnd, sb, sb.Capacity);
            childResults.Add(hWnd.ToInt64() + "|" + sb.ToString());
            return true;
        }, IntPtr.Zero);
    }
}
'@
`

// Edit class names in priority order
const EDIT_CLASSES = [
  'Windows.UI.Input.InputSite.WindowClass', // WinUI 3 input bridge (Windows Terminal, etc.)
  'RichEditD2DPT', // Win11 Notepad (WinUI 3)
  'RichEdit20W', // WordPad
  'Edit', // Classic edit controls
  'Scintilla', // Scintilla-based editors (Notepad++, etc.)
  'Chrome_RenderWidgetHostHWND', // Chrome/Electron
  'TextBox', // WPF TextBox
  'RichTextBox', // WPF RichTextBox
  'Windows.UI.Core.CoreWindow', // UWP CoreWindow (input target for some UWP apps)
]

/**
 * Find the first edit-capable child window of a parent HWND.
 *
 * Strategy:
 * 1. EnumChildWindows — search for known edit control class names
 * 2. UI Automation fallback — find the first Edit/Document element and get its native HWND
 *
 * EnumChildWindows is recursive and enumerates all descendant windows,
 * but for UWP apps the edit control may be in a different process (hosted
 * inside ApplicationFrameHost). UI Automation crosses process boundaries.
 */
export function findEditChild(parentHwnd: string): string | null {
  parentHwnd = validateHwnd(parentHwnd)

  // Cache hit
  if (editChildCache.has(parentHwnd)) {
    return editChildCache.get(parentHwnd)!
  }

  // Strategy 1: EnumChildWindows (fast, works for Win32 apps)
  const script = `${WINMSG_TYPE}
[WinMsg]::FindChildren([IntPtr]::new([long]${parentHwnd}))
[WinMsg]::childResults | ForEach-Object { $_ }
`
  const raw = runPs(script)
  if (raw) {
    const children = raw
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const trimmed = line.trim()
        const pipe = trimmed.indexOf('|')
        if (pipe === -1) return null
        return {
          hwnd: trimmed.slice(0, pipe),
          className: trimmed.slice(pipe + 1),
        }
      })
      .filter(
        (item): item is { hwnd: string; className: string } => item !== null,
      )

    // Search in priority order
    for (const editClass of EDIT_CLASSES) {
      const match = children.find(c => c.className === editClass)
      if (match) {
        editChildCache.set(parentHwnd, match.hwnd)
        return match.hwnd
      }
    }
  }

  // Strategy 2: UI Automation (crosses process boundaries, finds UWP edit controls)
  const uiaScript = `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class UiaHelper {
    [DllImport("user32.dll")]
    public static extern bool IsWindow(IntPtr hWnd);
}
'@
try {
    $el = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]::new([long]${parentHwnd}))
    if ($el -eq $null) { Write-Output 'NONE'; exit }

    # Search for Edit or Document control types (covers text editors)
    $editCond = [System.Windows.Automation.PropertyCondition]::new(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        [System.Windows.Automation.ControlType]::Edit)
    $docCond = [System.Windows.Automation.PropertyCondition]::new(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        [System.Windows.Automation.ControlType]::Document)
    $orCond = [System.Windows.Automation.OrCondition]::new($editCond, $docCond)

    $found = $el.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $orCond)
    if ($found -eq $null) { Write-Output 'NONE'; exit }

    $nativeHwnd = $found.Current.NativeWindowHandle
    if ($nativeHwnd -ne 0) {
        Write-Output $nativeHwnd
    } else {
        Write-Output 'NONE'
    }
} catch {
    Write-Output 'NONE'
}
`
  const uiaResult = runPs(uiaScript)
  if (uiaResult && uiaResult !== 'NONE') {
    const hwnd = uiaResult.trim()
    if (hwnd && hwnd !== '0') {
      editChildCache.set(parentHwnd, hwnd)
      return hwnd
    }
  }

  editChildCache.set(parentHwnd, null)
  return null
}

/**
 * Send a single Unicode character to a window via SendMessageW(WM_CHAR).
 * Handles surrogate pairs for characters outside BMP (emoji, rare CJK, etc.).
 */
export function sendChar(hwnd: string, char: string): boolean {
  hwnd = validateHwnd(hwnd)
  const codePoint = char.codePointAt(0)
  if (codePoint === undefined) return false

  const hwndExpr = `[IntPtr]::new([long]${hwnd})`

  // BMP character (U+0000 to U+FFFF): single WM_CHAR
  if (codePoint <= 0xffff) {
    const script = `${WINMSG_TYPE}
[WinMsg]::SendMessage(${hwndExpr}, [WinMsg]::WM_CHAR, [IntPtr]${codePoint}, [IntPtr]0)
`
    return runPs(script) !== null
  }

  // Supplementary character (U+10000+): send as UTF-16 surrogate pair
  // Windows processes surrogate pairs as two sequential WM_CHAR messages
  const hi = Math.floor((codePoint - 0x10000) / 0x400) + 0xd800
  const lo = ((codePoint - 0x10000) % 0x400) + 0xdc00
  const script = `${WINMSG_TYPE}
[WinMsg]::SendMessage(${hwndExpr}, [WinMsg]::WM_CHAR, [IntPtr]${hi}, [IntPtr]0)
[WinMsg]::SendMessage(${hwndExpr}, [WinMsg]::WM_CHAR, [IntPtr]${lo}, [IntPtr]0)
`
  return runPs(script) !== null
}

/**
 * Build PowerShell lines that send each codepoint via WM_CHAR.
 * Handles surrogate pairs for supplementary characters.
 */
function buildWmCharLines(hwnd: string, text: string): string[] {
  const hwndExpr = `[IntPtr]::new([long]${hwnd})`
  const lines: string[] = []
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    if (cp <= 0xffff) {
      lines.push(
        `[WinMsg]::SendMessage(${hwndExpr}, [WinMsg]::WM_CHAR, [IntPtr]${cp}, [IntPtr]0)`,
      )
    } else {
      const hi = Math.floor((cp - 0x10000) / 0x400) + 0xd800
      const lo = ((cp - 0x10000) % 0x400) + 0xdc00
      lines.push(
        `[WinMsg]::SendMessage(${hwndExpr}, [WinMsg]::WM_CHAR, [IntPtr]${hi}, [IntPtr]0)`,
      )
      lines.push(
        `[WinMsg]::SendMessage(${hwndExpr}, [WinMsg]::WM_CHAR, [IntPtr]${lo}, [IntPtr]0)`,
      )
    }
  }
  return lines
}

/**
 * Send text to a window via WM_CHAR per Unicode codepoint.
 * Always uses the WM_CHAR path — reliable across all window types including
 * Windows Terminal / ConPTY where clipboard-based Ctrl+V doesn't work.
 * Window-targeted, no global input APIs.
 */
export function sendText(hwnd: string, text: string): boolean {
  const targetHwnd = resolveInputHwnd(hwnd)
  const charLines = buildWmCharLines(targetHwnd, text)
  const script = `${WINMSG_TYPE}
${charLines.join('\n')}
`
  return runPs(script) !== null
}

/**
 * Send a key down or key up event via PostMessageW(WM_KEYDOWN / WM_KEYUP).
 * Uses PostMessage (async) instead of SendMessage — required for Windows Terminal
 * and ConPTY-based console windows to correctly process key events.
 * lParam includes the correct scan code via MapVirtualKeyW.
 */
export function sendKey(
  hwnd: string,
  vk: number,
  action: 'down' | 'up',
): boolean {
  hwnd = validateHwnd(hwnd)
  const msg = action === 'down' ? '0x0100' : '0x0101'
  const lParamFn = action === 'down' ? 'KeyDownLParam' : 'KeyUpLParam'
  const script = `${WINMSG_TYPE}
[WinMsg]::PostMessage([IntPtr]::new([long]${hwnd}), ${msg}, [IntPtr]${vk}, [WinMsg]::${lParamFn}(${vk}))
`
  return runPs(script) !== null
}

/**
 * Send a key combination (e.g. ['ctrl', 'a']).
 * Holds modifiers via WM_KEYDOWN, presses the key, then releases in reverse.
 * All via SendMessageW — no global APIs.
 */
export function sendKeys(hwnd: string, combo: string[]): boolean {
  hwnd = resolveInputHwnd(hwnd)
  if (combo.length === 0) return false

  const modifiers: number[] = []
  let mainKey: number | undefined

  for (const key of combo) {
    const lower = key.toLowerCase()
    const vk = VK_MAP[lower]
    if (vk !== undefined) {
      if (MODIFIER_KEYS.has(lower)) {
        modifiers.push(vk)
      } else {
        mainKey = vk
      }
    } else if (lower.length === 1) {
      // Single character — use its uppercase VK code
      mainKey = lower.toUpperCase().charCodeAt(0)
    } else {
      return false
    }
  }

  if (mainKey === undefined) return false

  // Build script: modifiers down, key down, key up, modifiers up (reverse)
  // Uses PostMessage (async) + correct lParam (scan code) — required for
  // Windows Terminal / ConPTY to correctly translate key events.
  const hwndExpr = `[IntPtr]::new([long]${hwnd})`
  const lines: string[] = []
  for (const mod of modifiers) {
    lines.push(
      `[WinMsg]::PostMessage(${hwndExpr}, [WinMsg]::WM_KEYDOWN, [IntPtr]${mod}, [WinMsg]::KeyDownLParam(${mod}))`,
    )
  }
  lines.push(
    `[WinMsg]::PostMessage(${hwndExpr}, [WinMsg]::WM_KEYDOWN, [IntPtr]${mainKey}, [WinMsg]::KeyDownLParam(${mainKey}))`,
  )
  lines.push(
    `[WinMsg]::PostMessage(${hwndExpr}, [WinMsg]::WM_KEYUP, [IntPtr]${mainKey}, [WinMsg]::KeyUpLParam(${mainKey}))`,
  )
  for (const mod of [...modifiers].reverse()) {
    lines.push(
      `[WinMsg]::PostMessage(${hwndExpr}, [WinMsg]::WM_KEYUP, [IntPtr]${mod}, [WinMsg]::KeyUpLParam(${mod}))`,
    )
  }

  const script = `${WINMSG_TYPE}
${lines.join('\n')}
`
  return runPs(script) !== null
}

// ── Console Input Buffer (WriteConsoleInput) ─────────────────────────
// For terminal/console windows, SendMessageW doesn't reliably inject
// key events into the Console Input Buffer that raw-mode stdin reads.
// This function uses AttachConsole + WriteConsoleInput to inject directly.

const CONSOLE_INPUT_TYPE = `
Add-Type @'
using System;
using System.Runtime.InteropServices;

public class ConsoleInput {
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern bool AttachConsole(uint dwProcessId);

    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern bool FreeConsole();

    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern IntPtr GetStdHandle(int nStdHandle);

    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern bool WriteConsoleInput(
        IntPtr hConsoleInput,
        INPUT_RECORD[] lpBuffer,
        uint nLength,
        out uint lpNumberOfEventsWritten);

    [DllImport("kernel32.dll")]
    public static extern uint MapVirtualKeyW(uint uCode, uint uMapType);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    public const int STD_INPUT_HANDLE = -10;

    [StructLayout(LayoutKind.Explicit)]
    public struct INPUT_RECORD {
        [FieldOffset(0)] public ushort EventType;
        [FieldOffset(4)] public KEY_EVENT_RECORD KeyEvent;
    }

    [StructLayout(LayoutKind.Explicit, CharSet=CharSet.Unicode)]
    public struct KEY_EVENT_RECORD {
        [FieldOffset(0)]  public bool bKeyDown;
        [FieldOffset(4)]  public ushort wRepeatCount;
        [FieldOffset(6)]  public ushort wVirtualKeyCode;
        [FieldOffset(8)]  public ushort wVirtualScanCode;
        [FieldOffset(10)] public char UnicodeChar;
        [FieldOffset(12)] public uint dwControlKeyState;
    }

    public static bool SendKeyToConsole(IntPtr hwnd, ushort vk, char ch) {
        uint pid;
        GetWindowThreadProcessId(hwnd, out pid);
        if (pid == 0) return false;

        FreeConsole();
        if (!AttachConsole(pid)) return false;

        try {
            IntPtr hInput = GetStdHandle(STD_INPUT_HANDLE);
            if (hInput == IntPtr.Zero || hInput == (IntPtr)(-1)) return false;

            ushort scanCode = (ushort)MapVirtualKeyW(vk, 0);
            INPUT_RECORD[] records = new INPUT_RECORD[2];

            // Key down
            records[0].EventType = 1; // KEY_EVENT
            records[0].KeyEvent.bKeyDown = true;
            records[0].KeyEvent.wRepeatCount = 1;
            records[0].KeyEvent.wVirtualKeyCode = vk;
            records[0].KeyEvent.wVirtualScanCode = scanCode;
            records[0].KeyEvent.UnicodeChar = ch;
            records[0].KeyEvent.dwControlKeyState = 0;

            // Key up
            records[1].EventType = 1;
            records[1].KeyEvent.bKeyDown = false;
            records[1].KeyEvent.wRepeatCount = 1;
            records[1].KeyEvent.wVirtualKeyCode = vk;
            records[1].KeyEvent.wVirtualScanCode = scanCode;
            records[1].KeyEvent.UnicodeChar = ch;
            records[1].KeyEvent.dwControlKeyState = 0;

            uint written;
            return WriteConsoleInput(hInput, records, 2, out written);
        } finally {
            FreeConsole();
        }
    }

    public static bool SendTextToConsole(IntPtr hwnd, string text) {
        uint pid;
        GetWindowThreadProcessId(hwnd, out pid);
        if (pid == 0) return false;

        FreeConsole();
        if (!AttachConsole(pid)) return false;

        try {
            IntPtr hInput = GetStdHandle(STD_INPUT_HANDLE);
            if (hInput == IntPtr.Zero || hInput == (IntPtr)(-1)) return false;

            INPUT_RECORD[] records = new INPUT_RECORD[text.Length * 2];
            for (int i = 0; i < text.Length; i++) {
                char c = text[i];
                ushort vk = 0;
                ushort sc = 0;

                // Key down
                records[i * 2].EventType = 1;
                records[i * 2].KeyEvent.bKeyDown = true;
                records[i * 2].KeyEvent.wRepeatCount = 1;
                records[i * 2].KeyEvent.wVirtualKeyCode = vk;
                records[i * 2].KeyEvent.wVirtualScanCode = sc;
                records[i * 2].KeyEvent.UnicodeChar = c;
                records[i * 2].KeyEvent.dwControlKeyState = 0;

                // Key up
                records[i * 2 + 1].EventType = 1;
                records[i * 2 + 1].KeyEvent.bKeyDown = false;
                records[i * 2 + 1].KeyEvent.wRepeatCount = 1;
                records[i * 2 + 1].KeyEvent.wVirtualKeyCode = vk;
                records[i * 2 + 1].KeyEvent.wVirtualScanCode = sc;
                records[i * 2 + 1].KeyEvent.UnicodeChar = c;
                records[i * 2 + 1].KeyEvent.dwControlKeyState = 0;
            }

            uint written;
            return WriteConsoleInput(hInput, records, (uint)records.Length, out written);
        } finally {
            FreeConsole();
        }
    }
}
'@
`

/**
 * Send a key to a console window via WriteConsoleInput (Console Input Buffer).
 * This is required for terminal apps like Claude Code REPL that read stdin in raw mode.
 */
export function consoleKey(
  hwnd: string,
  vk: number,
  ch: string = '\0',
): boolean {
  hwnd = validateHwnd(hwnd)
  const charCode = ch.charCodeAt(0)
  const script = `${CONSOLE_INPUT_TYPE}
[ConsoleInput]::SendKeyToConsole([IntPtr]::new([long]${hwnd}), ${vk}, [char]${charCode})
`
  return runPs(script) !== null
}

/**
 * Send text + Enter to a console window via WriteConsoleInput.
 * Directly injects into the Console Input Buffer — works for raw-mode stdin.
 */
export function consoleText(hwnd: string, text: string): boolean {
  hwnd = validateHwnd(hwnd)
  // Escape single quotes for PowerShell
  const escaped = text.replace(/'/g, "''")
  const script = `${CONSOLE_INPUT_TYPE}
[ConsoleInput]::SendTextToConsole([IntPtr]::new([long]${hwnd}), '${escaped}')
`
  return runPs(script) !== null
}

/**
 * Send a mouse click at client-area coordinates (x, y) relative to the window.
 * Via SendMessageW — window-targeted, no cursor movement.
 */
export function sendClick(
  hwnd: string,
  x: number,
  y: number,
  button: 'left' | 'right',
): boolean {
  hwnd = resolveInputHwnd(hwnd)
  const downMsg = button === 'left' ? '0x0201' : '0x0204'
  const upMsg = button === 'left' ? '0x0202' : '0x0205'
  const hwndExpr = `[IntPtr]::new([long]${hwnd})`

  const script = `${WINMSG_TYPE}
$lp = [WinMsg]::MakeLParam(${x}, ${y})
[WinMsg]::SendMessage(${hwndExpr}, ${downMsg}, [IntPtr]0, $lp)
[WinMsg]::SendMessage(${hwndExpr}, ${upMsg}, [IntPtr]0, $lp)
`
  return runPs(script) !== null
}

/**
 * Send a mouse-button-down at client-area coordinates (x, y).
 * Via SendMessageW(WM_LBUTTONDOWN) — window-targeted, no cursor movement.
 */
export function sendMouseDown(hwnd: string, x: number, y: number): boolean {
  hwnd = resolveInputHwnd(hwnd)
  const script = `${WINMSG_TYPE}
$lp = [WinMsg]::MakeLParam(${x}, ${y})
[WinMsg]::SendMessage([IntPtr]::new([long]${hwnd}), [WinMsg]::WM_LBUTTONDOWN, [IntPtr]1, $lp)
`
  return runPs(script) !== null
}

/**
 * Send a mouse-button-up at client-area coordinates (x, y).
 * Via SendMessageW(WM_LBUTTONUP) — window-targeted, no cursor movement.
 */
export function sendMouseUp(hwnd: string, x: number, y: number): boolean {
  hwnd = resolveInputHwnd(hwnd)
  const script = `${WINMSG_TYPE}
$lp = [WinMsg]::MakeLParam(${x}, ${y})
[WinMsg]::SendMessage([IntPtr]::new([long]${hwnd}), [WinMsg]::WM_LBUTTONUP, [IntPtr]0, $lp)
`
  return runPs(script) !== null
}

/**
 * Send a WM_MOUSEMOVE at client-area coordinates (x, y).
 * Used during drag operations. Via SendMessageW — window-targeted.
 */
export function sendMouseMove(hwnd: string, x: number, y: number): boolean {
  hwnd = resolveInputHwnd(hwnd)
  const script = `${WINMSG_TYPE}
$lp = [WinMsg]::MakeLParam(${x}, ${y})
[WinMsg]::SendMessage([IntPtr]::new([long]${hwnd}), 0x0200, [IntPtr]1, $lp)
`
  return runPs(script) !== null
}

/**
 * Send mouse wheel scroll at client-area coordinates (x, y).
 * Via SendMessageW(WM_MOUSEWHEEL / WM_MOUSEHWHEEL).
 *
 * WM_MOUSEWHEEL:  vertical scroll (positive delta = scroll up)
 * WM_MOUSEHWHEEL: horizontal scroll (positive delta = scroll right)
 *
 * delta is in multiples of WHEEL_DELTA (120). One "click" = 120.
 * lParam = screen coordinates (not client), wParam high word = delta.
 *
 * Works on Excel, browsers, modern UI — unlike WM_VSCROLL/WM_HSCROLL
 * which only work on traditional scrollbar controls.
 */
export function sendMouseWheel(
  hwnd: string,
  x: number,
  y: number,
  delta: number,
  horizontal: boolean = false,
): boolean {
  hwnd = resolveInputHwnd(hwnd)
  // WM_MOUSEWHEEL = 0x020A, WM_MOUSEHWHEEL = 0x020E
  const msg = horizontal ? '0x020E' : '0x020A'
  // wParam: high word = wheel delta (signed short), low word = modifier keys (0)
  // delta is in units of WHEEL_DELTA (120). Positive = up/right, negative = down/left.
  const wheelDelta = Math.round(delta) * 120
  // Pack delta into high word of wParam: (delta << 16) as signed
  // lParam: screen coordinates packed as MAKELPARAM(screenX, screenY)
  const script = `${WINMSG_TYPE}
# WM_MOUSEWHEEL/WM_MOUSEHWHEEL require screen coords in lParam
# and wheel delta in high word of wParam
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class WheelHelper {
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd, ref POINT p);
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }

    [DllImport("user32.dll", CharSet=CharSet.Unicode, EntryPoint="SendMessageW")]
    public static extern IntPtr SendMsg(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

    public static void Scroll(IntPtr hWnd, int clientX, int clientY, int delta, uint msg) {
        POINT pt; pt.X = clientX; pt.Y = clientY;
        ClientToScreen(hWnd, ref pt);
        IntPtr wParam = (IntPtr)(delta << 16);
        IntPtr lParam = (IntPtr)((pt.Y << 16) | (pt.X & 0xFFFF));
        SendMsg(hWnd, msg, wParam, lParam);
    }
}
'@
[WheelHelper]::Scroll([IntPtr]::new([long]${hwnd}), ${x}, ${y}, ${wheelDelta}, ${msg})
`
  return runPs(script) !== null
}
