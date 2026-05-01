/**
 * Linux backend for computer-use-input
 *
 * Uses xdotool for mouse and keyboard simulation.
 * Requires: xdotool (apt install xdotool)
 */

import type { FrontmostAppInfo, InputBackend } from '../types.js'

// ---------------------------------------------------------------------------
// Shell helper — run a command and return trimmed stdout
// ---------------------------------------------------------------------------

function run(cmd: string[]): string {
  const result = Bun.spawnSync({
    cmd,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  return new TextDecoder().decode(result.stdout).trim()
}

async function runAsync(cmd: string[]): Promise<string> {
  const proc = Bun.spawn(cmd, { stdout: 'pipe', stderr: 'pipe' })
  const out = await new Response(proc.stdout).text()
  await proc.exited
  return out.trim()
}

// ---------------------------------------------------------------------------
// xdotool key name mapping
// ---------------------------------------------------------------------------

const KEY_MAP: Record<string, string> = {
  return: 'Return',
  enter: 'Return',
  tab: 'Tab',
  space: 'space',
  backspace: 'BackSpace',
  delete: 'Delete',
  escape: 'Escape',
  esc: 'Escape',
  left: 'Left',
  up: 'Up',
  right: 'Right',
  down: 'Down',
  home: 'Home',
  end: 'End',
  pageup: 'Prior',
  pagedown: 'Next',
  f1: 'F1',
  f2: 'F2',
  f3: 'F3',
  f4: 'F4',
  f5: 'F5',
  f6: 'F6',
  f7: 'F7',
  f8: 'F8',
  f9: 'F9',
  f10: 'F10',
  f11: 'F11',
  f12: 'F12',
  shift: 'shift',
  lshift: 'shift',
  rshift: 'shift',
  control: 'ctrl',
  ctrl: 'ctrl',
  lcontrol: 'ctrl',
  rcontrol: 'ctrl',
  alt: 'alt',
  option: 'alt',
  lalt: 'alt',
  ralt: 'alt',
  win: 'super',
  meta: 'super',
  command: 'super',
  cmd: 'super',
  super: 'super',
  insert: 'Insert',
  printscreen: 'Print',
  pause: 'Pause',
  numlock: 'Num_Lock',
  capslock: 'Caps_Lock',
  scrolllock: 'Scroll_Lock',
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

function mapKey(name: string): string {
  return KEY_MAP[name.toLowerCase()] ?? name
}

// ---------------------------------------------------------------------------
// xdotool mouse button mapping
// ---------------------------------------------------------------------------

function mouseButtonNum(button: 'left' | 'right' | 'middle'): string {
  return button === 'left' ? '1' : button === 'right' ? '3' : '2'
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export const moveMouse: InputBackend['moveMouse'] = async (x, y, _animated) => {
  run([
    'xdotool',
    'mousemove',
    '--sync',
    String(Math.round(x)),
    String(Math.round(y)),
  ])
}

export const mouseLocation: InputBackend['mouseLocation'] = async () => {
  const out = run(['xdotool', 'getmouselocation'])
  // Output format: "x:123 y:456 screen:0 window:12345678"
  const xMatch = out.match(/x:(\d+)/)
  const yMatch = out.match(/y:(\d+)/)
  return {
    x: xMatch ? Number(xMatch[1]) : 0,
    y: yMatch ? Number(yMatch[1]) : 0,
  }
}

export const mouseButton: InputBackend['mouseButton'] = async (
  button,
  action,
  count,
) => {
  const btn = mouseButtonNum(button)
  if (action === 'click') {
    const n = count ?? 1
    run(['xdotool', 'click', '--repeat', String(n), btn])
  } else if (action === 'press') {
    run(['xdotool', 'mousedown', btn])
  } else {
    run(['xdotool', 'mouseup', btn])
  }
}

export const mouseScroll: InputBackend['mouseScroll'] = async (
  amount,
  direction,
) => {
  // xdotool click 4=scroll up, 5=scroll down, 6=scroll left, 7=scroll right
  // Positive amount = down/right, negative = up/left
  if (direction === 'vertical') {
    const btn = amount >= 0 ? '5' : '4'
    const repeats = Math.abs(Math.round(amount))
    if (repeats > 0) {
      run(['xdotool', 'click', '--repeat', String(repeats), btn])
    }
  } else {
    const btn = amount >= 0 ? '7' : '6'
    const repeats = Math.abs(Math.round(amount))
    if (repeats > 0) {
      run(['xdotool', 'click', '--repeat', String(repeats), btn])
    }
  }
}

export const key: InputBackend['key'] = async (keyName, action) => {
  const mapped = mapKey(keyName)
  if (action === 'press') {
    run(['xdotool', 'keydown', mapped])
  } else {
    run(['xdotool', 'keyup', mapped])
  }
}

export const keys: InputBackend['keys'] = async parts => {
  // xdotool key accepts "modifier+modifier+key" format
  const modifiers: string[] = []
  let finalKey: string | null = null

  for (const part of parts) {
    if (MODIFIER_KEYS.has(part.toLowerCase())) {
      modifiers.push(mapKey(part))
    } else {
      finalKey = part
    }
  }
  if (!finalKey) return

  const combo = [...modifiers, mapKey(finalKey)].join('+')
  run(['xdotool', 'key', combo])
}

export const typeText: InputBackend['typeText'] = async text => {
  run(['xdotool', 'type', '--delay', '12', text])
}

export const getFrontmostAppInfo: InputBackend['getFrontmostAppInfo'] = () => {
  try {
    const windowId = run(['xdotool', 'getactivewindow'])
    if (!windowId) return null

    const pidStr = run(['xdotool', 'getwindowpid', windowId])
    if (!pidStr) return null

    const pid = pidStr.trim()

    // Read the executable path from /proc
    let exePath = ''
    try {
      exePath = run(['readlink', '-f', `/proc/${pid}/exe`])
    } catch {
      /* ignore */
    }

    // Read the process name from /proc/comm
    let appName = ''
    try {
      appName = run(['cat', `/proc/${pid}/comm`])
    } catch {
      /* ignore */
    }

    if (!exePath && !appName) return null
    return {
      bundleId: exePath || `/proc/${pid}/exe`,
      appName: appName || 'unknown',
    }
  } catch {
    return null
  }
}
