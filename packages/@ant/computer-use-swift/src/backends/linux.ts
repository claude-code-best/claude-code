/**
 * Linux backend for computer-use-swift
 *
 * Uses xrandr for display info, scrot for screenshots,
 * wmctrl/xdotool for window management, and xdg-open for launching apps.
 *
 * Requires: xrandr, scrot, xdotool, wmctrl (optional)
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

// ---------------------------------------------------------------------------
// Shell helpers
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

function commandExists(name: string): boolean {
  const result = Bun.spawnSync({
    cmd: ['which', name],
    stdout: 'pipe',
    stderr: 'pipe',
  })
  return result.exitCode === 0
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
      const raw = run(['xrandr', '--query'])
      const displays: DisplayGeometry[] = []
      let idx = 0

      // Match lines like: "HDMI-1 connected 1920x1080+0+0" or "eDP-1 connected primary 2560x1440+0+0"
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
}

// ---------------------------------------------------------------------------
// AppsAPI
// ---------------------------------------------------------------------------

export const apps: AppsAPI = {
  async prepareDisplay(
    _allowlistBundleIds,
    _surrogateHost,
    _displayId,
  ): Promise<PrepareDisplayResult> {
    return { activated: '', hidden: [] }
  },

  async previewHideSet(_bundleIds, _displayId): Promise<AppInfo[]> {
    return []
  },

  async findWindowDisplays(bundleIds): Promise<WindowDisplayInfo[]> {
    return bundleIds.map(bundleId => ({ bundleId, displayIds: [0] }))
  },

  async appUnderPoint(x, y): Promise<AppInfo | null> {
    try {
      // Move mouse to point, get window under cursor
      const out = run([
        'xdotool',
        'mousemove',
        '--sync',
        String(x),
        String(y),
        'getmouselocation',
        '--shell',
      ])
      const windowMatch = out.match(/WINDOW=(\d+)/)
      if (!windowMatch) return null

      const windowId = windowMatch[1]
      const pidStr = run(['xdotool', 'getwindowpid', windowId!])
      if (!pidStr) return null

      let exePath = ''
      try {
        exePath = run(['readlink', '-f', `/proc/${pidStr}/exe`])
      } catch {
        /* ignore */
      }

      let appName = ''
      try {
        appName = run(['cat', `/proc/${pidStr}/comm`])
      } catch {
        /* ignore */
      }

      if (!exePath && !appName) return null
      return { bundleId: exePath || pidStr!, displayName: appName || 'unknown' }
    } catch {
      return null
    }
  },

  async listInstalled(): Promise<InstalledApp[]> {
    try {
      // Read .desktop files from standard locations
      const dirs = [
        '/usr/share/applications',
        '/usr/local/share/applications',
        `${process.env.HOME}/.local/share/applications`,
      ]
      const apps: InstalledApp[] = []

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

            apps.push({
              bundleId:
                filepath.split('/').pop()?.replace('.desktop', '') ?? '',
              displayName: name,
              path: exec.split(/\s+/)[0] ?? '',
            })
          } catch {
            /* skip unreadable files */
          }
        }
      }

      return apps.slice(0, 200)
    } catch {
      return []
    }
  },

  iconDataUrl(_path): string | null {
    return null
  },

  listRunning(): RunningApp[] {
    try {
      // Try wmctrl first
      if (commandExists('wmctrl')) {
        const raw = run(['wmctrl', '-l', '-p'])
        const apps: RunningApp[] = []
        for (const line of raw.split('\n').filter(Boolean)) {
          // wmctrl format: "0x04000003  0 12345 hostname Window Title"
          const parts = line.split(/\s+/)
          const pid = parts[2]
          if (!pid || pid === '0') continue

          let exePath = ''
          try {
            exePath = run(['readlink', '-f', `/proc/${pid}/exe`])
          } catch {
            /* ignore */
          }
          let appName = ''
          try {
            appName = run(['cat', `/proc/${pid}/comm`])
          } catch {
            /* ignore */
          }

          if (appName) {
            apps.push({ bundleId: exePath || pid, displayName: appName })
          }
        }
        // Deduplicate by bundleId
        const seen = new Set<string>()
        return apps
          .filter(a => {
            if (seen.has(a.bundleId)) return false
            seen.add(a.bundleId)
            return true
          })
          .slice(0, 50)
      }

      // Fallback: ps with visible processes
      const raw = run(['ps', '-eo', 'pid,comm', '--no-headers'])
      const apps: RunningApp[] = []
      for (const line of raw.split('\n').filter(Boolean).slice(0, 50)) {
        const match = line.trim().match(/^(\d+)\s+(.+)$/)
        if (match) {
          apps.push({ bundleId: match[1]!, displayName: match[2]! })
        }
      }
      return apps
    } catch {
      return []
    }
  },

  async open(name): Promise<void> {
    // Try gtk-launch first (for .desktop file names), fall back to xdg-open
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

  async unhide(bundleIds): Promise<void> {
    for (const id of bundleIds) {
      try {
        if (commandExists('wmctrl') && id.startsWith('0x')) {
          // Window ID — use wmctrl
          await runAsync(['wmctrl', '-i', '-R', id])
        } else {
          // Try xdotool windowactivate with search by name
          await runAsync(['xdotool', 'search', '--name', id, 'windowactivate'])
        }
      } catch {
        /* ignore failures for individual windows */
      }
    }
  },
}

// ---------------------------------------------------------------------------
// ScreenshotAPI
// ---------------------------------------------------------------------------

const SCREENSHOT_PATH = '/tmp/cu-screenshot.png'

export const screenshot: ScreenshotAPI = {
  async captureExcluding(
    _allowedBundleIds,
    _quality,
    _targetW,
    _targetH,
    _displayId,
  ): Promise<ScreenshotResult> {
    try {
      await runAsync(['scrot', '-o', SCREENSHOT_PATH])

      // Read the file as base64
      const file = Bun.file(SCREENSHOT_PATH)
      const buffer = await file.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')

      // Get dimensions from display info
      const size = display.getSize(_displayId)
      return { base64, width: size.width, height: size.height }
    } catch {
      return { base64: '', width: 0, height: 0 }
    }
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
  ): Promise<ScreenshotResult> {
    try {
      // scrot -a x,y,w,h captures a specific region
      await runAsync([
        'scrot',
        '-a',
        `${x},${y},${w},${h}`,
        '-o',
        SCREENSHOT_PATH,
      ])

      const file = Bun.file(SCREENSHOT_PATH)
      const buffer = await file.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')

      return { base64, width: w, height: h }
    } catch {
      return { base64: '', width: 0, height: 0 }
    }
  },

  captureWindowTarget(_titleOrHwnd: string | number): ScreenshotResult | null {
    // Window capture not supported on Linux via this backend
    return null
  },
}
