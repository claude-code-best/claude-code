# Chapter 7: User Input

## useInput

The primary hook for handling keyboard input.

```tsx
import { useInput } from '@anthropic/ink'

function MyComponent() {
  useInput((input, key, event) => {
    if (input === 'q') {
      // 'q' key pressed
    }
    if (key.leftArrow) {
      // Left arrow
    }
    if (key.ctrl && input === 'c') {
      // Ctrl+C (only if exitOnCtrlC is false)
    }
    if (key.meta && input === 'b') {
      // Alt+B (Option+B on Mac)
    }
    if (key.shift && input === 'Tab') {
      // Shift+Tab
    }
  })

  return <Text>Press keys...</Text>
}
```

### Signature

```ts
function useInput(
  handler: (input: string, key: Key, event: InputEvent) => void,
  options?: { isActive?: boolean }
): void
```

### Parameters

- **`input`** (`string`) -- The character entered. Empty string for non-printable keys (arrows, function keys). For paste events, the entire pasted text.
- **`key`** (`Key`) -- Parsed key metadata (see below)
- **`event`** (`InputEvent`) -- Raw event with `stopImmediatePropagation()`

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `isActive` | `boolean` | `true` | Enable/disable input handling |

### Key Object

```ts
type Key = {
  upArrow: boolean
  downArrow: boolean
  leftArrow: boolean
  rightArrow: boolean
  pageDown: boolean
  pageUp: boolean
  wheelUp: boolean       // Mouse wheel in alt-screen
  wheelDown: boolean      // Mouse wheel in alt-screen
  home: boolean
  end: boolean
  return: boolean
  escape: boolean
  ctrl: boolean
  shift: boolean
  fn: boolean
  tab: boolean
  backspace: boolean
  delete: boolean
  meta: boolean           // Alt / Option
  super: boolean          // Cmd (macOS) / Win key
}
```

### Event Propagation

Multiple `useInput` handlers form a chain. Call `event.stopImmediatePropagation()` to prevent downstream handlers from receiving the event:

```tsx
useInput((input, key, event) => {
  if (input === 'j') {
    // Consumed by this handler
    event.stopImmediatePropagation()
  }
  // Other handlers won't see 'j'
})

useInput((input, key) => {
  // This won't fire for 'j'
})
```

### Raw Mode

`useInput` automatically enables raw mode on stdin when active. Raw mode is reference-counted -- it stays enabled as long as any hook has `isActive: true`.

In raw mode:
- Keystrokes don't echo
- Ctrl+C is not sent as signal (app must handle it)
- Line buffering is disabled

## InputEvent

```ts
class InputEvent extends Event {
  readonly input: string
  readonly key: Key
  readonly keypress: ParsedKey  // Raw parsed keypress data
}
```

## KeyboardEvent

DOM-like keyboard event dispatched to focused elements:

```ts
class KeyboardEvent extends Event {
  readonly key: Key
}
```

Used with `Box`'s `onKeyDown` and `onKeyDownCapture` props:

```tsx
<Box
  tabIndex={0}
  autoFocus
  onKeyDown={(event) => {
    if (event.key.return) {
      handleSubmit()
    }
  }}
>
  <Text>Press Enter to submit</Text>
</Box>
```

## Key Parsing

Ink supports multiple keyboard protocols:

### Standard Escape Sequences
- Arrow keys, function keys, Home/End, Page Up/Down
- Ctrl+letter combinations
- Shift, Alt, Meta modifiers

### Kitty Keyboard Protocol (CSI u)
Extended key reporting with full modifier support:
- Distinguishes Ctrl+Shift+A from Ctrl+A
- Reports Super (Cmd/Win) key
- Sends key release events

### xterm modifyOtherKeys
Alternative extended key reporting for xterm-compatible terminals.

### Application Keypad Mode
Numpad keys mapped to their digit characters.

## Paste Detection

When `Bracketed Paste` mode is enabled (DECSET 2004), pasted text is delivered as a single `InputEvent` with the full text in `input`. This distinguishes paste from rapid typing:

```tsx
useInput((input, key, event) => {
  if (event.keypress.paste) {
    // User pasted text -- handle as a batch
    handlePaste(input)
  } else {
    // Regular keypress
    handleKey(input, key)
  }
})
```

## Mouse Events (Alt-Screen Only)

In alternate screen mode, mouse events are parsed and dispatched:

### Click Events

```tsx
<Box
  onClick={(event) => {
    console.log(`Clicked at (${event.x}, ${event.y})`)
    event.stopImmediatePropagation()
  }}
>
  <Text>Click me</Text>
</Box>
```

### Hover Events

```tsx
<Box
  onMouseEnter={() => setHovered(true)}
  onMouseLeave={() => setHovered(false)}
>
  <Text>{hovered ? 'Hovered!' : 'Hover me'}</Text>
</Box>
```

Hover events use `mouseenter`/`mouseleave` semantics (no bubbling between children).

### Wheel Events

Mouse wheel events arrive as `Key.wheelUp`/`Key.wheelDown`:

```tsx
useInput((input, key) => {
  if (key.wheelUp) scrollUp()
  if (key.wheelDown) scrollDown()
})
```

## useStdin

Lower-level access to the stdin stream.

```tsx
import { useStdin } from '@anthropic/ink'

const {
  stdin,                    // Raw stdin stream
  setRawMode,               // (enabled: boolean) => void
  isRawModeSupported,       // boolean
  internal_exitOnCtrlC,     // boolean
  internal_eventEmitter,    // EventEmitter | undefined
  internal_querier,         // Terminal querier
} = useStdin()
```

> **Prefer `useInput` for keyboard handling.** `useStdin` is for advanced use cases like terminal querying or custom event handling.

## Button Component

Interactive button that responds to keyboard and mouse:

```tsx
import { Button } from '@anthropic/ink'

<Button onAction={() => handleClick()} tabIndex={0} autoFocus>
  {(state) => (
    <Text bold={state.focused} color={state.focused ? 'claude' : 'text'}>
      {state.focused ? '> Click Me' : '  Click Me'}
    </Text>
  )}
</Button>
```

Button receives a render prop with state:

```ts
type ButtonState = {
  focused: boolean    // Has keyboard focus
  hovered: boolean    // Mouse is over it (alt-screen)
  active: boolean     // True for 100ms after activation (flash effect)
}
```

Activation triggers: Enter key, Space key, or mouse click.
