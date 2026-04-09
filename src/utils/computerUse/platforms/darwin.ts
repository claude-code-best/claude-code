/**
 * macOS platform backend for Computer Use.
 *
 * Delegates to @ant/computer-use-input (enigo keyboard/mouse) and
 * @ant/computer-use-swift (screenshots, display, apps).
 *
 * No window-bound input (sendChar/sendKey/sendClick/sendText) — macOS
 * uses global input via CoreGraphics events.
 */

import type { Platform } from './index.js'
import type {
  InputPlatform,
  ScreenshotPlatform,
  DisplayPlatform,
  AppsPlatform,
  WindowHandle,
  FrontmostAppInfo,
} from './types.js'
import { requireComputerUseInput } from '../inputLoader.js'
import { requireComputerUseSwift } from '../swiftLoader.js'

// ---------------------------------------------------------------------------
// Input — delegate to @ant/computer-use-input darwin backend
// ---------------------------------------------------------------------------

const input: InputPlatform = {
  async moveMouse(x, y) {
    const api = requireComputerUseInput()
    await api.moveMouse(x, y, false)
  },

  async click(x, y, button) {
    const api = requireComputerUseInput()
    await api.moveMouse(x, y, false)
    await api.mouseButton(button, 'click', 1)
  },

  async typeText(text) {
    const api = requireComputerUseInput()
    await api.typeText(text)
  },

  async key(name, action) {
    const api = requireComputerUseInput()
    await api.key(name, action)
  },

  async keys(combo) {
    const api = requireComputerUseInput()
    await api.keys(combo)
  },

  async scroll(amount, direction) {
    const api = requireComputerUseInput()
    await api.mouseScroll(amount, direction)
  },

  async mouseLocation() {
    const api = requireComputerUseInput()
    return api.mouseLocation()
  },

  // No window-bound methods on macOS
}

// ---------------------------------------------------------------------------
// Screenshot — delegate to @ant/computer-use-swift
// ---------------------------------------------------------------------------

const screenshot: ScreenshotPlatform = {
  async captureScreen(displayId) {
    const swift = requireComputerUseSwift()
    return swift.screenshot.captureExcluding([], undefined, undefined, undefined, displayId)
  },

  async captureRegion(x, y, w, h) {
    const swift = requireComputerUseSwift()
    return swift.screenshot.captureRegion([], x, y, w, h)
  },

  // macOS could use SCContentFilter for window capture but we don't expose
  // it through this interface yet — the swift module's captureExcluding
  // handles most use cases.
}

// ---------------------------------------------------------------------------
// Display — delegate to @ant/computer-use-swift
// ---------------------------------------------------------------------------

const display: DisplayPlatform = {
  listAll() {
    const swift = requireComputerUseSwift()
    return swift.display.listAll()
  },

  getSize(displayId) {
    const swift = requireComputerUseSwift()
    return swift.display.getSize(displayId)
  },
}

// ---------------------------------------------------------------------------
// Apps — delegate to @ant/computer-use-swift
// ---------------------------------------------------------------------------

const apps: AppsPlatform = {
  listRunning(): WindowHandle[] {
    const swift = requireComputerUseSwift()
    const running = swift.apps.listRunning()
    return running.map((app: any) => ({
      id: app.bundleId ?? '',
      pid: 0,  // macOS listRunning doesn't expose PID through this API
      title: app.displayName ?? '',
    }))
  },

  async listInstalled() {
    const swift = requireComputerUseSwift()
    const installed = await swift.apps.listInstalled()
    return installed.map((app: any) => ({
      id: app.bundleId ?? '',
      displayName: app.displayName ?? '',
      path: app.path ?? '',
    }))
  },

  async open(name) {
    const swift = requireComputerUseSwift()
    await swift.apps.open(name)
  },

  getFrontmostApp(): FrontmostAppInfo | null {
    const api = requireComputerUseInput()
    const info = api.getFrontmostAppInfo()
    if (!info) return null
    return { id: info.bundleId, appName: info.appName }
  },

  findWindowByTitle(_title): WindowHandle | null {
    // macOS: not directly supported through the current swift API.
    // Use apps.listRunning() and filter by title instead.
    const all = this.listRunning()
    return all.find(w => w.title.includes(_title)) ?? null
  },
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const platform: Platform = { input, screenshot, display, apps }
