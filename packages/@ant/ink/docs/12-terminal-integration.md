# Chapter 12: Terminal Integration

This chapter covers terminal-specific features: alternate screen, mouse tracking, clipboard, notifications, and terminal querying.

## Alternate Screen

Enter a fullscreen alternate screen buffer (like vim, less, htop).

```tsx
import { AlternateScreen } from '@anthropic/ink'

<AlternateScreen mouseTracking={true}>
  <Box flexDirection="column" height="100%">
    <Text>Fullscreen content</Text>
  </Box>
</AlternateScreen>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `ReactNode` | - | Content |
| `mouseTracking` | `boolean` | `true` | Enable SGR mouse tracking |

### Behavior

On mount:
1. Enters DEC 1049 alternate screen buffer
2. Hides cursor
3. Enables mouse tracking (if `mouseTracking=true`)
4. Constrains rendering height to terminal rows

On unmount:
1. Exits alternate screen buffer
2. Shows cursor
3. Disables mouse tracking
4. Restores original terminal content

### Mouse Tracking Modes

When enabled:
- **Mode 1003** -- Button press/release + motion (hover)
- **Mode 1006** -- SGR extended mouse format (coordinates > 223)
- **Wheel events** -- Scroll up/down

### External Editor Handoff

The Ink instance supports pausing for an external editor:

```ts
// Pause Ink, run external command, resume
ink.enterAlternateScreen()  // Save state
// ... external editor runs ...
ink.reassertTerminalModes()  // Restore on resume
```

This is triggered by Ctrl+Z (SIGTSTP) and SIGCONT.

## Mouse Events

### Click Events

```tsx
<Box onClick={(event) => {
  console.log(`Clicked at col=${event.x}, row=${event.y}`)
  event.stopImmediatePropagation()
}}>
  <Text>Clickable area</Text>
</Box>
```

### Multi-Click

Double-click selects a word, triple-click selects a line. Handled by the App component:

```ts
// App prop
onMultiClick: (col: number, row: number, count: 2 | 3) => void
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

Hover uses `mouseenter`/`mouseleave` semantics (no bubbling between children).

### Drag-to-Select

In alt-screen mode, click-drag creates a text selection:

```ts
// App prop
onSelectionDrag: (col: number, row: number) => void
```

## Clipboard

### OSC 52 Clipboard

```tsx
import { setClipboard } from '@anthropic/ink'

await setClipboard('Copied text')
```

### Copy Selection

```tsx
const { copySelection } = useSelection()
const text = copySelection()  // Copies to clipboard and clears highlight
```

### Copy Without Clear

```tsx
const { copySelectionNoClear } = useSelection()
const text = copySelectionNoClear()  // Copies but keeps highlight
```

## Terminal Notifications

Send desktop notifications from the terminal.

```tsx
import { useTerminalNotification } from '@anthropic/ink'

function MyComponent() {
  const { notifyBell, progress } = useTerminalNotification()

  // Terminal bell (audible/system notification)
  notifyBell()

  // Progress bar in terminal title/tab
  progress('running', 65)    // 65% complete
  progress('completed')       // Done
  progress('error')           // Error state
  progress('indeterminate')   // Unknown progress
  progress(null)              // Clear
}
```

### Terminal-Specific Notifications

```tsx
const { notifyITerm2, notifyKitty, notifyGhostty } = useTerminalNotification()

// iTerm2
notifyITerm2({ message: 'Build complete', title: 'My App' })

// Kitty
notifyKitty({ message: 'Build complete', title: 'My App', id: 1 })

// Ghostty
notifyGhostty({ message: 'Build complete', title: 'My App' })
```

## Terminal Queries

### Background Color (OSC 11)

Used for auto-theme detection:

```ts
import { getTerminalBackground } from '@anthropic/ink'
const bg = await getTerminalBackground()
// e.g., 'rgb:0000/0000/0000' (dark) or 'rgb:ffff/ffff/ffff' (light)
```

### Terminal Version (XTVERSION)

```ts
import { isXtermJs, setXtversionName, getXtversionName } from '@anthropic/ink'
```

### Feature Detection

```ts
import { supportsHyperlinks } from '@anthropic/ink'

if (supportsHyperlinks()) {
  // OSC 8 hyperlinks supported
}

import { supportsExtendedKeys } from '@anthropic/ink'

if (supportsExtendedKeys()) {
  // Kitty keyboard protocol / modifyOtherKeys available
}
```

## Terminal Focus

Track terminal window focus/unfocus:

```tsx
import { useTerminalFocus } from '@anthropic/ink'

const isFocused = useTerminalFocus()
```

Low-level API:

```ts
import { getTerminalFocused, subscribeTerminalFocus } from '@anthropic/ink'

getTerminalFocused()  // boolean
subscribeTerminalFocus((focused: boolean) => {
  // Called on focus change
})
```

Uses DECSET 1004 focus reporting.

## Terminal Title

Set the terminal window title:

```tsx
import { useTerminalTitle } from '@anthropic/ink'

useTerminalTitle('My App - Dashboard')
```

Clear:

```tsx
useTerminalTitle(null)
```

## Terminal I/O Sequences

Low-level ANSI sequence constants for advanced use.

### Cursor Control

```ts
import {
  SHOW_CURSOR,
  HIDE_CURSOR,
  CURSOR_HOME,
} from '@anthropic/ink'

// cursorPosition(row, col) -- Move cursor to absolute position
// cursorMove(dx, dy) -- Move cursor relative
```

### Screen Control

```ts
import {
  ENTER_ALT_SCREEN,
  EXIT_ALT_SCREEN,
  ERASE_SCREEN,
} from '@anthropic/ink'
```

### Mouse Control

```ts
import {
  ENABLE_MOUSE_TRACKING,
  DISABLE_MOUSE_TRACKING,
} from '@anthropic/ink'
```

### Keyboard Protocols

```ts
import {
  ENABLE_KITTY_KEYBOARD,
  DISABLE_KITTY_KEYBOARD,
  ENABLE_MODIFY_OTHER_KEYS,
  DISABLE_MODIFY_OTHER_KEYS,
} from '@anthropic/ink'
```

### Clipboard & Tab Status

```ts
import {
  CLEAR_ITERM2_PROGRESS,
  CLEAR_TAB_STATUS,
  CLEAR_TERMINAL_TITLE,
  wrapForMultiplexer,
} from '@anthropic/ink'
```

`wrapForMultiplexer` wraps OSC sequences for tmux compatibility.

## Terminal Compatibility

### Supported Terminals

| Terminal | Features |
|----------|----------|
| iTerm2 | Full support (hyperlinks, notifications, progress) |
| Kitty | Full support (keyboard protocol, notifications) |
| Ghostty | Full support |
| WezTerm | Full support |
| Alacritty | Most features |
| Windows Terminal | Most features |
| Apple Terminal | 256-color fallback |
| xterm.js (VS Code) | Detected and special-cased |
| tmux | Wrapped sequences via `wrapForMultiplexer` |
| Screen | Basic support |

### Feature Degradation

The framework gracefully degrades:
- No true color → Falls back to ANSI 16-color themes
- No OSC 52 → Clipboard operations silently fail
- No mouse tracking → Click/hover events are no-ops
- No extended keys → Standard escape sequences used
- No bracketed paste → Paste detected by timing heuristic

### Synchronized Output

```ts
import { isSynchronizedOutputSupported } from '@anthropic/ink'

if (isSynchronizedOutputSupported()) {
  // BSU/ESU for tear-free rendering
}
```

Uses DECSET 2026 synchronized output to prevent partial frame display.

### Bracketed Paste

Uses DECSET 2004 to distinguish paste events from rapid typing. Automatically enabled by the App component.

## Text Selection (Alt-Screen)

### Selection State

```ts
type SelectionState = {
  anchor: Point | null        // Drag start
  focus: Point | null         // Current position
  isDragging: boolean
  anchorSpan: { lo: Point; hi: Point; kind: 'word' | 'line' } | null
  scrolledOffAbove: string[]  // Text scrolled out above
  scrolledOffBelow: string[]  // Text scrolled out below
}
```

### Selection Operations

- **Click-drag** -- Free-form selection
- **Double-click** -- Word selection
- **Triple-click** -- Line selection
- **Shift+Arrow** -- Extend selection from keyboard
- **Drag-to-scroll** -- Auto-scroll when dragging near edges

### noSelect Regions

Exclude areas from selection (gutters, line numbers):

```tsx
<Box noSelect={true}>
  <Text>1 │</Text>
</Box>
<Box>
  <Text>code here</Text>  {/* Only this is selectable */}
</Box>
```

### Soft-Wrap Awareness

Selection correctly handles text that was wrapped across multiple rows:
- Wrapped lines are joined when copied
- Trailing whitespace is trimmed
- The `softWrap` bitmap tracks which rows are continuations
