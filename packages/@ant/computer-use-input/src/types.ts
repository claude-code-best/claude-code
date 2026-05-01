export interface FrontmostAppInfo {
  bundleId: string // macOS: bundle ID, Windows: exe path
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
