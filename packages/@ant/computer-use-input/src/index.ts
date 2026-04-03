/**
 * @ant/computer-use-input — macOS keyboard/mouse simulation implementation
 *
 * Uses macOS native tools:
 * - AppleScript (osascript) — app info, keyboard input
 * - CGEvent via AppleScript-ObjC bridge — mouse operations, position queries
 *
 * macOS only. Other platforms return { isSupported: false }
 */

import { $ } from 'bun'

interface FrontmostAppInfo {
  bundleId: string
  appName: string
}

// AppleScript key code mapping
const KEY_MAP: Record<string, number> = {
  return: 36, enter: 36, tab: 48, space: 49, delete: 51, backspace: 51,
  escape: 53, esc: 53,
  left: 123, right: 124, down: 125, up: 126,
  f1: 122, f2: 120, f3: 99, f4: 118, f5: 96, f6: 97,
  f7: 98, f8: 100, f9: 101, f10: 109, f11: 103, f12: 111,
  home: 115, end: 119, pageup: 116, pagedown: 121,
}

const MODIFIER_MAP: Record<string, string> = {
  command: 'command down', cmd: 'command down', meta: 'command down', super: 'command down',
  shift: 'shift down',
  option: 'option down', alt: 'option down',
  control: 'control down', ctrl: 'control down',
}

async function osascript(script: string): Promise<string> {
  const result = await $`osascript -e ${script}`.quiet().nothrow().text()
  return result.trim()
}

async function jxa(script: string): Promise<string> {
  const result = await $`osascript -l JavaScript -e ${script}`.quiet().nothrow().text()
  return result.trim()
}

function jxaSync(script: string): string {
  const result = Bun.spawnSync({
    cmd: ['osascript', '-l', 'JavaScript', '-e', script],
    stdout: 'pipe', stderr: 'pipe',
  })
  return new TextDecoder().decode(result.stdout).trim()
}

function buildMouseJxa(eventType: string, x: number, y: number, btn: number, clickState?: number): string {
  let script = `ObjC.import("CoreGraphics"); var p = $.CGPointMake(${x},${y}); var e = $.CGEventCreateMouseEvent(null, $.${eventType}, p, ${btn});`
  if (clickState !== undefined) {
    script += ` $.CGEventSetIntegerValueField(e, $.kCGMouseEventClickState, ${clickState});`
  }
  script += ` $.CGEventPost($.kCGHIDEventTap, e);`
  return script
}

// ---- Implementation functions ----

async function moveMouse(x: number, y: number, _animated: boolean): Promise<void> {
  await jxa(buildMouseJxa('kCGEventMouseMoved', x, y, 0))
}

async function key(keyName: string, action: 'press' | 'release'): Promise<void> {
  if (action === 'release') return
  const lower = keyName.toLowerCase()
  const keyCode = KEY_MAP[lower]
  if (keyCode !== undefined) {
    await osascript(`tell application "System Events" to key code ${keyCode}`)
  } else {
    await osascript(`tell application "System Events" to keystroke "${keyName.length === 1 ? keyName : lower}"`)
  }
}

async function keys(parts: string[]): Promise<void> {
  const modifiers: string[] = []
  let finalKey: string | null = null
  for (const part of parts) {
    const mod = MODIFIER_MAP[part.toLowerCase()]
    if (mod) modifiers.push(mod)
    else finalKey = part
  }
  if (!finalKey) return
  const lower = finalKey.toLowerCase()
  const keyCode = KEY_MAP[lower]
  const modStr = modifiers.length > 0 ? ` using {${modifiers.join(', ')}}` : ''
  if (keyCode !== undefined) {
    await osascript(`tell application "System Events" to key code ${keyCode}${modStr}`)
  } else {
    await osascript(`tell application "System Events" to keystroke "${finalKey.length === 1 ? finalKey : lower}"${modStr}`)
  }
}

async function mouseLocation(): Promise<{ x: number; y: number }> {
  const result = await jxa('ObjC.import("CoreGraphics"); var e = $.CGEventCreate(null); var p = $.CGEventGetLocation(e); p.x + "," + p.y')
  const [xStr, yStr] = result.split(',')
  return { x: Math.round(Number(xStr)), y: Math.round(Number(yStr)) }
}

async function mouseButton(
  button: 'left' | 'right' | 'middle',
  action: 'click' | 'press' | 'release',
  count?: number,
): Promise<void> {
  const pos = await mouseLocation()
  const btn = button === 'left' ? 0 : button === 'right' ? 1 : 2
  const downType = btn === 0 ? 'kCGEventLeftMouseDown' : btn === 1 ? 'kCGEventRightMouseDown' : 'kCGEventOtherMouseDown'
  const upType = btn === 0 ? 'kCGEventLeftMouseUp' : btn === 1 ? 'kCGEventRightMouseUp' : 'kCGEventOtherMouseUp'

  if (action === 'click') {
    for (let i = 0; i < (count ?? 1); i++) {
      await jxa(buildMouseJxa(downType, pos.x, pos.y, btn, i + 1))
      await jxa(buildMouseJxa(upType, pos.x, pos.y, btn, i + 1))
    }
  } else if (action === 'press') {
    await jxa(buildMouseJxa(downType, pos.x, pos.y, btn))
  } else {
    await jxa(buildMouseJxa(upType, pos.x, pos.y, btn))
  }
}

async function mouseScroll(amount: number, direction: 'vertical' | 'horizontal'): Promise<void> {
  const script = direction === 'vertical'
    ? `ObjC.import("CoreGraphics"); var e = $.CGEventCreateScrollWheelEvent(null, 0, 1, ${amount}); $.CGEventPost($.kCGHIDEventTap, e);`
    : `ObjC.import("CoreGraphics"); var e = $.CGEventCreateScrollWheelEvent(null, 0, 2, 0, ${amount}); $.CGEventPost($.kCGHIDEventTap, e);`
  await jxa(script)
}

async function typeText(text: string): Promise<void> {
  const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  await osascript(`tell application "System Events" to keystroke "${escaped}"`)
}

function getFrontmostAppInfo(): FrontmostAppInfo | null {
  try {
    const result = Bun.spawnSync({
      cmd: ['osascript', '-e', `
        tell application "System Events"
          set frontApp to first application process whose frontmost is true
          set appName to name of frontApp
          set bundleId to bundle identifier of frontApp
          return bundleId & "|" & appName
        end tell
      `],
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const output = new TextDecoder().decode(result.stdout).trim()
    if (!output || !output.includes('|')) return null
    const [bundleId, appName] = output.split('|', 2)
    return { bundleId: bundleId!, appName: appName! }
  } catch {
    return null
  }
}

// ---- Exports ----

export class ComputerUseInputAPI {
  declare moveMouse: (x: number, y: number, animated: boolean) => Promise<void>
  declare key: (key: string, action: 'press' | 'release') => Promise<void>
  declare keys: (parts: string[]) => Promise<void>
  declare mouseLocation: () => Promise<{ x: number; y: number }>
  declare mouseButton: (button: 'left' | 'right' | 'middle', action: 'click' | 'press' | 'release', count?: number) => Promise<void>
  declare mouseScroll: (amount: number, direction: 'vertical' | 'horizontal') => Promise<void>
  declare typeText: (text: string) => Promise<void>
  declare getFrontmostAppInfo: () => FrontmostAppInfo | null
  declare isSupported: true
}

interface ComputerUseInputUnsupported {
  isSupported: false
}

export type ComputerUseInput = ComputerUseInputAPI | ComputerUseInputUnsupported

// Plain object with all methods as own properties — compatible with require()
export const isSupported = process.platform === 'darwin'
export { moveMouse, key, keys, mouseLocation, mouseButton, mouseScroll, typeText, getFrontmostAppInfo }
