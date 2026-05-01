/**
 * @ant/computer-use-input — macOS keyboard & mouse simulation (enigo)
 *
 * This package wraps the macOS-only native enigo .node module.
 * For Windows/Linux, use src/utils/computerUse/platforms/ instead.
 */

export interface FrontmostAppInfo {
  bundleId: string
  appName: string
}

export interface InputBackend {
  moveMouse(x: number, y: number, animated: boolean): Promise<void>
  key(key: string, action: 'press' | 'release'): Promise<void>
  keys(parts: string[]): Promise<void>
  mouseLocation(): Promise<{ x: number; y: number }>
  mouseButton(
    button: 'left' | 'right' | 'middle',
    action: 'click' | 'press' | 'release',
    count?: number,
  ): Promise<void>
  mouseScroll(
    amount: number,
    direction: 'vertical' | 'horizontal',
  ): Promise<void>
  typeText(text: string): Promise<void>
  getFrontmostAppInfo(): FrontmostAppInfo | null
}

function loadBackend(): InputBackend | null {
  try {
    if (process.platform === 'darwin') {
      return require('./backends/darwin.js') as InputBackend
    } else if (process.platform === 'win32') {
      return require('./backends/win32.js') as InputBackend
    } else if (process.platform === 'linux') {
      return require('./backends/linux.js') as InputBackend
    }
  } catch {
    return null
  }
  return null
}

const backend = loadBackend()

export const isSupported = backend !== null
export const moveMouse = backend?.moveMouse
export const key = backend?.key
export const keys = backend?.keys
export const mouseLocation = backend?.mouseLocation
export const mouseButton = backend?.mouseButton
export const mouseScroll = backend?.mouseScroll
export const typeText = backend?.typeText
export const getFrontmostAppInfo = backend?.getFrontmostAppInfo ?? (() => null)

export class ComputerUseInputAPI {
  declare moveMouse: InputBackend['moveMouse']
  declare key: InputBackend['key']
  declare keys: InputBackend['keys']
  declare mouseLocation: InputBackend['mouseLocation']
  declare mouseButton: InputBackend['mouseButton']
  declare mouseScroll: InputBackend['mouseScroll']
  declare typeText: InputBackend['typeText']
  declare getFrontmostAppInfo: InputBackend['getFrontmostAppInfo']
  declare isSupported: true
}

interface ComputerUseInputUnsupported {
  isSupported: false
}
export type ComputerUseInput = ComputerUseInputAPI | ComputerUseInputUnsupported
