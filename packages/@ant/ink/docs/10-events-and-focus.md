# Chapter 10: Events & Focus

## Event System

Ink implements a DOM-like event system with capture/bubble phases, propagation control, and prioritized dispatch.

### Event Classes

All events extend the base `Event` class:

```ts
class Event {
  stopImmediatePropagation(): void
}
```

### InputEvent

Emitted for every keystroke or input action.

```ts
class InputEvent extends Event {
  readonly input: string     // Character(s) entered
  readonly key: Key          // Parsed key metadata
  readonly keypress: ParsedKey  // Raw keypress data
}
```

### KeyboardEvent

DOM-like keyboard event for focused elements.

```ts
class KeyboardEvent extends Event {
  readonly key: Key
}
```

Dispatched via `onKeyDown` / `onKeyDownCapture` on `Box`.

### ClickEvent

Mouse click event (alt-screen only).

```ts
class ClickEvent extends Event {
  readonly x: number  // Column (0-indexed)
  readonly y: number  // Row (0-indexed)
}
```

Clicks bubble from the deepest hit Box up through ancestors.

### FocusEvent

Focus change event.

```ts
class FocusEvent extends Event {
  readonly relatedTarget: DOMElement | null
}
```

### TerminalFocusEvent

Terminal window focus change.

```ts
class TerminalFocusEvent extends Event {
  readonly type: 'terminalfocus' | 'terminalblur'
}
```

### ResizeEvent

Terminal resize event (internal).

### PasteEvent

Pasted text event (bracketed paste mode).

## Event Dispatch Flow

```
stdin data → parse-keypress → InputEvent
                                    ↓
                    App.handleInput (useInput handlers)
                                    ↓
                    Box.onKeyDown (focused element, bubble)
```

### Capture and Bubble Phases

```tsx
<Box
  onKeyDownCapture={(e) => {
    // Capture phase: fires top-down
    console.log('Parent captures key')
  }}
  onKeyDown={(e) => {
    // Bubble phase: fires bottom-up
    console.log('Parent receives bubbled key')
  }}
>
  <Box
    onKeyDown={(e) => {
      // Target: fires first in bubble phase
      console.log('Child handles key')
      e.stopImmediatePropagation()  // Stop here
    }}
  >
    <Text>Focus here</Text>
  </Box>
</Box>
```

### Event Propagation Methods

| Method | Effect |
|--------|--------|
| `event.stopImmediatePropagation()` | Stop all subsequent handlers |
| `event.preventDefault()` | Not supported in terminal context |

## FocusManager

DOM-like focus management system.

### How Focus Works

1. Elements with `tabIndex >= 0` participate in Tab/Shift+Tab cycling
2. Elements with `tabIndex === -1` are programmatically focusable only
3. Elements with `autoFocus` receive focus on mount
4. Clicking a focusable element focuses it

### Focus API

```ts
class FocusManager {
  activeElement: DOMElement | null

  focus(node: DOMElement): void
  blur(): void
  focusNext(root: DOMElement): void     // Tab
  focusPrevious(root: DOMElement): void  // Shift+Tab

  handleNodeRemoved(node: DOMElement, root: DOMElement): void
  handleAutoFocus(node: DOMElement): void
  handleClickFocus(node: DOMElement): void

  enable(): void
  disable(): void
}
```

### Tab Navigation

```tsx
<Box flexDirection="column">
  <Button tabIndex={0} onAction={handleSave}>
    {(s) => <Text>{s.focused ? '> Save' : '  Save'}</Text>}
  </Button>
  <Button tabIndex={0} onAction={handleCancel}>
    {(s) => <Text>{s.focused ? '> Cancel' : '  Cancel'}</Text>}
  </Button>
  <Button tabIndex={-1} onAction={handleSecret}>
    {/* Not reachable via Tab */}
    {(s) => <Text>Secret</Text>}
  </Button>
</Box>
```

### Auto Focus

```tsx
<Box tabIndex={0} autoFocus onKeyDown={handleKey}>
  <Text>Receives focus immediately on mount</Text>
</Box>
```

### Focus Events

```tsx
<Box
  tabIndex={0}
  onFocus={(e) => console.log('Got focus')}
  onBlur={(e) => console.log('Lost focus')}
  onFocusCapture={(e) => console.log('Capture: focus in')}
  onBlurCapture={(e) => console.log('Capture: focus out')}
>
  <Text>Focusable element</Text>
</Box>
```

## Hit Testing

Mouse click/hover resolution:

1. Screen coordinates are mapped to DOM elements via Yoga layout
2. The deepest element at the click position is the target
3. Click events bubble upward through ancestors
4. Hover events use `mouseenter`/`mouseleave` semantics (no bubbling between children)

### Click Hit Testing

```ts
dispatchClick(rootNode, col, row): void
```

Walks the DOM tree, finds the deepest Box at (col, row), fires `onClick`, then bubbles to ancestors.

### Hover Hit Testing

```ts
dispatchHover(rootNode, col, row, hoveredNodes): void
```

Tracks which nodes are under the pointer. Fires `onMouseEnter`/`onMouseLeave` as the pointer moves between elements.

## EventEmitter

Custom event emitter for internal use:

```ts
class EventEmitter {
  on(event: string, handler: Function): void
  off(event: string, handler: Function): void
  emit(event: string, ...args: any[]): void
  removeListener(event: string, handler: Function): void
}
```

Used internally by the Ink instance for `input` events.
