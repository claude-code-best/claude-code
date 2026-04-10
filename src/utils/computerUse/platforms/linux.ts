/**
 * Linux platform backend for Computer Use.
 *
 * Uses:
 * - xdotool for mouse/keyboard input
 * - scrot for screenshots (converted to JPEG)
 * - xrandr for display enumeration
 * - wmctrl for window management
 *
 * CRITICAL: All screenshots output JPEG. scrot outputs PNG by default,
 * so we pipe through ImageMagick `convert` to produce JPEG.
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

// ---------------------------------------------------------------------------
// Shell helpers
// ---------------------------------------------------------------------------

function run(cmd: string[]): string {
  const result = Bun.spawnSync({ cmd, stdout: 'pipe', stderr: 'pipe' })
  return new TextDecoder().decode(result.stdout).trim()
}

async function runAsync(cmd: string[]): Promise<string> {
  const proc = Bun.spawn(cmd, { stdout: 'pipe', stderr: 'pipe' })
  const out = await new Response(proc.stdout).text()
  await proc.exited
  return out.trim()
}

function commandExists(name: string): boolean {
  const result = Bun.spawnSync({
    cmd: ['which', name],
    stdout: 'pipe',
    stderr: 'pipe',
  })
  return result.exitCode === 0
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

function mouseButtonNum(button: 'left' | 'right' | 'middle'): string {
  return button === 'left' ? '1' : button === 'right' ? '3' : '2'
}

// ---------------------------------------------------------------------------
// Input — xdotool
// ---------------------------------------------------------------------------

const input: InputPlatform = {
  async moveMouse(x, y) {
    run([
      'xdotool',
      'mousemove',
      '--sync',
      String(Math.round(x)),
      String(Math.round(y)),
    ])
  },

  async click(x, y, button) {
    run([
      'xdotool',
      'mousemove',
      '--sync',
      String(Math.round(x)),
      String(Math.round(y)),
    ])
    run(['xdotool', 'click', mouseButtonNum(button)])
  },

  async typeText(text) {
    run(['xdotool', 'type', '--delay', '12', text])
  },

  async key(name, action) {
    const mapped = mapKey(name)
    if (action === 'press') {
      run(['xdotool', 'keydown', mapped])
    } else {
      run(['xdotool', 'keyup', mapped])
    }
  },

  async keys(parts) {
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
  },

  async scroll(amount, direction) {
    if (direction === 'vertical') {
      const btn = amount >= 0 ? '5' : '4'
      const repeats = Math.abs(Math.round(amount))
      if (repeats > 0)
        run(['xdotool', 'click', '--repeat', String(repeats), btn])
    } else {
      const btn = amount >= 0 ? '7' : '6'
      const repeats = Math.abs(Math.round(amount))
      if (repeats > 0)
        run(['xdotool', 'click', '--repeat', String(repeats), btn])
    }
  },

  async mouseLocation() {
    const out = run(['xdotool', 'getmouselocation'])
    const xMatch = out.match(/x:(\d+)/)
    const yMatch = out.match(/y:(\d+)/)
    return {
      x: xMatch ? Number(xMatch[1]) : 0,
      y: yMatch ? Number(yMatch[1]) : 0,
    }
  },

  // No window-bound input on Linux
}

// ---------------------------------------------------------------------------
// Screenshot — scrot → JPEG conversion
// ---------------------------------------------------------------------------

const SCREENSHOT_TMP = '/tmp/cu-screenshot-tmp.png'
const SCREENSHOT_JPG = '/tmp/cu-screenshot.jpg'

async function pngToJpegBase64(
  pngPath: string,
  width: number,
  height: number,
): Promise<ScreenshotResult> {
  // Try ImageMagick convert first
  if (commandExists('convert')) {
    await runAsync(['convert', pngPath, '-quality', '75', SCREENSHOT_JPG])
    const file = Bun.file(SCREENSHOT_JPG)
    const buffer = await file.arrayBuffer()
    return { base64: Buffer.from(buffer).toString('base64'), width, height }
  }

  // Fallback: ffmpeg
  if (commandExists('ffmpeg')) {
    await runAsync(['ffmpeg', '-y', '-i', pngPath, '-q:v', '5', SCREENSHOT_JPG])
    const file = Bun.file(SCREENSHOT_JPG)
    const buffer = await file.arrayBuffer()
    return { base64: Buffer.from(buffer).toString('base64'), width, height }
  }

  // Last resort: return PNG base64 (caller should be aware)
  const file = Bun.file(pngPath)
  const buffer = await file.arrayBuffer()
  return { base64: Buffer.from(buffer).toString('base64'), width, height }
}

const screenshot: ScreenshotPlatform = {
  async captureScreen(displayId) {
    try {
      await runAsync(['scrot', '-o', SCREENSHOT_TMP])
      const size = display.getSize(displayId)
      return pngToJpegBase64(SCREENSHOT_TMP, size.width, size.height)
    } catch {
      return { base64: '', width: 0, height: 0 }
    }
  },

  async captureRegion(x, y, w, h) {
    try {
      await runAsync([
        'scrot',
        '-a',
        `${x},${y},${w},${h}`,
        '-o',
        SCREENSHOT_TMP,
      ])
      return pngToJpegBase64(SCREENSHOT_TMP, w, h)
    } catch {
      return { base64: '', width: w, height: h }
    }
  },

  async captureWindow(hwnd) {
    try {
      // Use xdotool to get window geometry, then import (ImageMagick) to capture
      if (commandExists('import')) {
        const jpgPath = '/tmp/cu-window-capture.jpg'
        await runAsync(['import', '-window', hwnd, '-quality', '75', jpgPath])

        // Get dimensions from xdotool
        const geom = run(['xdotool', 'getwindowgeometry', '--shell', hwnd])
        const wMatch = geom.match(/WIDTH=(\d+)/)
        const hMatch = geom.match(/HEIGHT=(\d+)/)
        const width = wMatch ? Number(wMatch[1]) : 0
        const height = hMatch ? Number(hMatch[1]) : 0

        const file = Bun.file(jpgPath)
        const buffer = await file.arrayBuffer()
        return { base64: Buffer.from(buffer).toString('base64'), width, height }
      }
      return null
    } catch {
      return null
    }
  },
}

// ---------------------------------------------------------------------------
// Display — xrandr
// ---------------------------------------------------------------------------

const display: DisplayPlatform = {
  listAll(): DisplayInfo[] {
    try {
      const raw = run(['xrandr', '--query'])
      const displays: DisplayInfo[] = []
      let idx = 0

      const regex = /^\S+\s+connected\s+(?:primary\s+)?(\d+)x(\d+)\+\d+\+\d+/gm
      let match: RegExpExecArray | null
      while ((match = regex.exec(raw)) !== null) {
        displays.push({
          width: Number(match[1]),
          height: Number(match[2]),
          scaleFactor: 1,
          displayId: idx++,
        })
      }

      if (displays.length === 0) {
        return [{ width: 1920, height: 1080, scaleFactor: 1, displayId: 0 }]
      }
      return displays
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
// Apps — wmctrl + ps + .desktop files
// ---------------------------------------------------------------------------

const apps: AppsPlatform = {
  listRunning(): WindowHandle[] {
    try {
      if (commandExists('wmctrl')) {
        const raw = run(['wmctrl', '-l', '-p'])
        const handles: WindowHandle[] = []
        for (const line of raw.split('\n').filter(Boolean)) {
          const parts = line.split(/\s+/)
          const windowId = parts[0]
          const pid = Number(parts[2])
          if (!pid) continue

          // Title is everything after the 4th field (hostname)
          const title = parts.slice(4).join(' ')

          let exePath = ''
          try {
            exePath = run(['readlink', '-f', `/proc/${pid}/exe`])
          } catch {}

          handles.push({
            id: windowId ?? '',
            pid,
            title,
            exePath: exePath || undefined,
          })
        }

        // Deduplicate by id
        const seen = new Set<string>()
        return handles
          .filter(h => {
            if (seen.has(h.id)) return false
            seen.add(h.id)
            return true
          })
          .slice(0, 50)
      }

      // Fallback: xdotool search
      const raw = run(['xdotool', 'search', '--name', ''])
      const handles: WindowHandle[] = []
      for (const windowId of raw.split('\n').filter(Boolean).slice(0, 50)) {
        const title = run(['xdotool', 'getwindowname', windowId])
        let pid = 0
        try {
          pid = Number(run(['xdotool', 'getwindowpid', windowId]))
        } catch {}
        if (title) {
          handles.push({ id: windowId, pid, title })
        }
      }
      return handles
    } catch {
      return []
    }
  },

  async listInstalled(): Promise<InstalledApp[]> {
    try {
      const dirs = [
        '/usr/share/applications',
        '/usr/local/share/applications',
        `${process.env.HOME}/.local/share/applications`,
      ]
      const result: InstalledApp[] = []

      for (const dir of dirs) {
        let files: string
        try {
          files = run(['find', dir, '-name', '*.desktop', '-maxdepth', '1'])
        } catch {
          continue
        }

        for (const filepath of files.split('\n').filter(Boolean)) {
          try {
            const content = run(['cat', filepath])
            const nameMatch = content.match(/^Name=(.+)$/m)
            const execMatch = content.match(/^Exec=(.+)$/m)
            const noDisplay = content.match(/^NoDisplay=true$/m)
            if (noDisplay) continue

            const name = nameMatch?.[1] ?? ''
            const exec = execMatch?.[1] ?? ''
            if (!name) continue

            result.push({
              id: filepath.split('/').pop()?.replace('.desktop', '') ?? '',
              displayName: name,
              path: exec.split(/\s+/)[0] ?? '',
            })
          } catch {
            /* skip unreadable */
          }
        }
      }

      return result.slice(0, 200)
    } catch {
      return []
    }
  },

  async open(name) {
    try {
      const desktopName = name.endsWith('.desktop') ? name : `${name}.desktop`
      if (commandExists('gtk-launch')) {
        await runAsync(['gtk-launch', desktopName])
        return
      }
    } catch {
      /* fall through */
    }
    await runAsync(['xdg-open', name])
  },

  getFrontmostApp(): FrontmostAppInfo | null {
    try {
      const windowId = run(['xdotool', 'getactivewindow'])
      if (!windowId) return null

      const pidStr = run(['xdotool', 'getwindowpid', windowId])
      if (!pidStr) return null

      let exePath = ''
      try {
        exePath = run(['readlink', '-f', `/proc/${pidStr}/exe`])
      } catch {}
      let appName = ''
      try {
        appName = run(['cat', `/proc/${pidStr}/comm`])
      } catch {}

      if (!exePath && !appName) return null
      return {
        id: exePath || `/proc/${pidStr}/exe`,
        appName: appName || 'unknown',
      }
    } catch {
      return null
    }
  },

  findWindowByTitle(title): WindowHandle | null {
    try {
      // xdotool search by name
      const raw = run(['xdotool', 'search', '--name', title])
      const windowId = raw.split('\n')[0]
      if (!windowId) return null

      const windowTitle = run(['xdotool', 'getwindowname', windowId])
      let pid = 0
      try {
        pid = Number(run(['xdotool', 'getwindowpid', windowId]))
      } catch {}

      return { id: windowId, pid, title: windowTitle }
    } catch {
      return null
    }
  },
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const platform: Platform = { input, screenshot, display, apps }
