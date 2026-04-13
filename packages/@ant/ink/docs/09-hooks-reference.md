# Chapter 9: Hooks Reference

Complete API reference for all hooks exported by `@anthropic/ink`.

---

## Application Hooks

### `useApp()`

Access app-level operations.

```ts
function useApp(): {
  exit: (error?: Error) => void
}
```

Example:
```tsx
const { exit } = useApp()
// Gracefully unmount and exit
exit()
```

### `useStdin()`

Access the stdin stream and raw mode control.

```ts
function useStdin(): {
  stdin: NodeJS.ReadStream
  isRawModeSupported: boolean
  setRawMode: (enabled: boolean) => void
  internal_exitOnCtrlC: boolean
  internal_eventEmitter: EventEmitter | undefined
  internal_querier: TerminalQuerier | null
}
```

> Prefer `useInput` for keyboard handling.

---

## Input Hooks

### `useInput(handler, options?)`

Handle keyboard input. See [Chapter 7](./07-user-input.md) for full details.

```ts
function useInput(
  handler: (input: string, key: Key, event: InputEvent) => void,
  options?: { isActive?: boolean }
): void
```

---

## Terminal Hooks

### `useTerminalSize()`

Get current terminal dimensions.

```ts
function useTerminalSize(): {
  columns: number
  rows: number
}
```

Throws if used outside `<App>`.

### `useTerminalFocus()`

Track whether the terminal window is focused.

```ts
function useTerminalFocus(): boolean
```

Uses DECSET 1004 focus reporting. Returns `true` when focused.

### `useTerminalTitle(title)`

Set the terminal window title.

```ts
function useTerminalTitle(title: string | null): void
```

Pass `null` to clear the title.

### `useTerminalViewport()`

Track element visibility in the terminal viewport.

```ts
function useTerminalViewport(): [
  ref: (element: DOMElement | null) => void,
  entry: { isVisible: boolean }
]
```

Example:
```tsx
const [viewportRef, { isVisible }] = useTerminalViewport()

<Box ref={viewportRef}>
  <Text>{isVisible ? 'Visible' : 'Scrolled off'}</Text>
</Box>
```

### `useTabStatus(kind)`

Set tab status indicator in terminal tab bar (OSC 21337).

```ts
type TabStatusKind = 'idle' | 'busy' | 'waiting'
function useTabStatus(kind: TabStatusKind | null): void
```

### `useTerminalNotification()`

Send terminal notifications (iTerm2, Kitty, Ghostty, bell).

```ts
function useTerminalNotification(): {
  notifyITerm2: (opts: { message: string; title?: string }) => void
  notifyKitty: (opts: { message: string; title: string; id: number }) => void
  notifyGhostty: (opts: { message: string; title: string }) => void
  notifyBell: () => void
  progress: (state: Progress['state'] | null, percentage?: number) => void
}
```

Requires `TerminalWriteProvider` in the tree.

Progress states: `'running'`, `'completed'`, `'error'`, `'indeterminate'`, `null` (clear).

---

## Animation & Timing Hooks

### `useInterval(callback, intervalMs)`

Clock-backed interval timer.

```ts
function useInterval(callback: () => void, intervalMs: number | null): void
```

Pass `null` to pause. Shares the application clock for efficient batching.

### `useAnimationTimer(intervalMs)`

Returns the current clock time, updating at the given interval.

```ts
function useAnimationTimer(intervalMs: number): number
```

Subscribes as non-keepAlive -- won't keep the clock running on its own.

### `useAnimationFrame(intervalMs?)`

Synchronized animation hook that pauses when offscreen.

```ts
function useAnimationFrame(
  intervalMs?: number | null,  // default 16
): [ref: (element: DOMElement | null) => void, time: number]
```

Returns a ref callback (attach to animated element) and the current animation time. All instances share the same clock. Pass `null` to pause.

```tsx
const [ref, time] = useAnimationFrame(120)
const frame = Math.floor(time / 120) % FRAMES.length
return <Box ref={ref}>{FRAMES[frame]}</Box>
```

### `useTimeout(delayMs, resetTrigger?)`

One-shot timer.

```ts
function useTimeout(delay: number, resetTrigger?: number): boolean
```

Returns `true` when the timeout has elapsed. Change `resetTrigger` to restart.

### `useMinDisplayTime(value, minMs)`

Ensure a value is displayed for at least `minMs` milliseconds.

```ts
function useMinDisplayTime<T>(value: T, minMs: number): T
```

Holds the previous value until `minMs` has elapsed, then switches to the new value.

Example:
```tsx
// Keep showing "Loading" for at least 300ms to prevent flash
const displayValue = useMinDisplayTime(isLoading ? 'loading' : 'done', 300)
```

---

## Interaction Hooks

### `useDoublePress(setPending, onDoublePress, onFirstPress?)`

Detect double-press (double-click equivalent for keyboard).

```ts
export const DOUBLE_PRESS_TIMEOUT_MS = 800

function useDoublePress(
  setPending: (pending: boolean) => void,
  onDoublePress: () => void,
  onFirstPress?: () => void
): () => void  // Returns the press handler
```

Example:
```tsx
const [pendingExit, setPendingExit] = useState(false)
const handlePress = useDoublePress(
  setPendingExit,
  () => exit(),       // Double press
  () => {},           // First press
)

useInput((input, key) => {
  if (key.escape) handlePress()
})
```

### `useExitOnCtrlCD(options?)`

Handle Ctrl+C / Ctrl+D with double-press confirmation.

```ts
type ExitState = {
  pending: boolean
  keyName: 'Ctrl-C' | 'Ctrl-D' | null
}

function useExitOnCtrlCDWithKeybindings(
  onExit?: () => void,
  onInterrupt?: () => boolean,
  isActive?: boolean
): ExitState
```

Example:
```tsx
const exitState = useExitOnCtrlCDWithKeybindings(
  () => exit(),
  () => { /* return true to prevent exit */ }
)

if (exitState.pending) {
  return <Text>Press {exitState.keyName} again to exit</Text>
}
```

---

## Selection Hooks (Alt-Screen Only)

### `useSelection()`

Text selection operations.

```ts
function useSelection(): {
  copySelection: () => string
  copySelectionNoClear: () => string
  clearSelection: () => void
  hasSelection: () => boolean
  getState: () => SelectionState | null
  subscribe: (cb: () => void) => () => void
  shiftAnchor: (dRow: number, minRow: number, maxRow: number) => void
  shiftSelection: (dRow: number, minRow: number, maxRow: number) => void
  moveFocus: (move: FocusMove) => void
  captureScrolledRows: (firstRow: number, lastRow: number, side: 'above' | 'below') => void
  setSelectionBgColor: (color: string) => void
}
```

### `useHasSelection()`

Reactive boolean for selection state.

```ts
function useHasSelection(): boolean
```

Re-renders when selection is created or cleared.

---

## Search Hooks

### `useSearchHighlight()`

Set and manage search highlighting.

```ts
function useSearchHighlight(): {
  setQuery: (query: string) => void
  scanElement: (el: DOMElement) => MatchPosition[]
  setPositions: (state: { positions: MatchPosition[]; rowOffset: number; currentIdx: number } | null) => void
}
```

### `useSearchInput(options)`

Search input handler with cursor management.

```ts
type UseSearchInputOptions = {
  isActive: boolean
  onExit: () => void
  onCancel?: () => void
  onExitUp?: () => void
  columns?: number
  passthroughCtrlKeys?: string[]
  initialQuery?: string
  backspaceExitsOnEmpty?: boolean
}

type UseSearchInputReturn = {
  query: string
  setQuery: (q: string) => void
  cursorOffset: number
  handleKeyDown: (e: KeyboardEvent) => void
}

function useSearchInput(options: UseSearchInputOptions): UseSearchInputReturn
```

---

## Cursor Hooks

### `useDeclaredCursor(options)`

Park the terminal cursor at a specific position for IME and accessibility.

```ts
function useDeclaredCursor({
  line: number,
  column: number,
  active: boolean
}): (element: DOMElement | null) => void
```

Returns a ref callback. Position is relative to the ref'd element.

Example:
```tsx
const cursorRef = useDeclaredCursor({
  line: 0,
  column: cursorPosition,
  active: isFocused,
})

return <Box ref={cursorRef}>...</Box>
```

---

## Tab Status Hooks

### `useTabStatus(kind)`

Set tab status indicator (OSC 21337) for terminal tab bars.

```ts
type TabStatusKind = 'idle' | 'busy' | 'waiting'

function useTabStatus(kind: TabStatusKind | null): void
```

Pass `null` to clear.

---

## Viewport Hooks

### `useTerminalViewport()`

Track element visibility within the terminal viewport.

```ts
function useTerminalViewport(): [
  ref: (element: DOMElement | null) => void,
  entry: { isVisible: boolean }
]
```

Returns a ref callback and visibility state.
