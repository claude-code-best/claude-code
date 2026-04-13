# Chapter 1: Getting Started

## Installation

`@anthropic/ink` is a workspace package. It is consumed internally and not published to npm.

```json
{
  "dependencies": {
    "@anthropic/ink": "workspace:*"
  }
}
```

### Peer Dependencies

- `react` ^19.2.4
- `react-reconciler` ^0.33.0

### Key Dependencies

| Package | Purpose |
|---------|---------|
| `chalk` | ANSI color generation |
| `cli-boxes` | Border style definitions |
| `get-east-asian-width` | CJK character width measurement |
| `wrap-ansi` | ANSI-aware word wrapping |
| `bidi-js` | Bidirectional text support |
| `lodash-es` | Utility functions (throttle, noop) |
| `signal-exit` | Process exit handler cleanup |
| `emoji-regex` | Emoji width handling |

## Basic Rendering

### `render(node, options?)`

The primary entry point. Renders a React element tree to the terminal.

```tsx
import { render } from '@anthropic/ink'
import { Box, Text } from '@anthropic/ink'

const { unmount, rerender, waitUntilExit } = await render(
  <Box>
    <Text>Hello, World!</Text>
  </Box>
)
```

**Parameters:**
- `node` -- `ReactNode` to render
- `options` -- `RenderOptions | NodeJS.WriteStream` (optional)

**Returns:** `Promise<Instance>` with:
- `rerender(node)` -- Replace the root node
- `unmount()` -- Unmount and clean up
- `waitUntilExit()` -- `Promise<void>` that resolves on unmount
- `cleanup()` -- Remove from instance registry

### `renderSync(node, options?)`

Synchronous version of render. Same API, returns `Instance` directly (no Promise).

```tsx
import { renderSync } from '@anthropic/ink'

const instance = renderSync(<App />)
// instance.rerender, instance.unmount, etc.
```

### `createRoot(options?)`

Creates a managed Ink root without immediately rendering. Similar to `react-dom`'s `createRoot`.

```tsx
import { createRoot } from '@anthropic/ink'

const root = await createRoot({ exitOnCtrlC: false })

// Later, render into it
root.render(<App />)

// You can re-render into the same root
root.render(<DifferentApp />)

// Clean up
root.unmount()
```

**Returns:** `Promise<Root>` with:
- `render(node)` -- Mount or update the tree
- `unmount()` -- Unmount
- `waitUntilExit()` -- `Promise<void>`

## RenderOptions

```ts
type RenderOptions = {
  /** Output stream. Default: process.stdout */
  stdout?: NodeJS.WriteStream

  /** Input stream. Default: process.stdin */
  stdin?: NodeJS.ReadStream

  /** Error stream. Default: process.stderr */
  stderr?: NodeJS.WriteStream

  /** Handle Ctrl+C to exit. Default: true */
  exitOnCtrlC?: boolean

  /** Patch console methods to prevent Ink output mixing. Default: true */
  patchConsole?: boolean

  /** Called after each frame render with timing info. */
  onFrame?: (event: FrameEvent) => void
}
```

## Basic Concepts

### Component Tree

Ink renders React components to a terminal using a custom reconciler. The tree structure maps to terminal output:

```tsx
<Box flexDirection="column">
  <Text bold color="green">Header</Text>
  <Box flexDirection="row" gap={1}>
    <Text>Left</Text>
    <Text>Right</Text>
  </Box>
</Box>
```

This produces terminal output with Flexbox layout (via Yoga).

### Rendering Pipeline

1. **React Reconciler** -- Standard React reconciliation; diffs virtual tree
2. **Yoga Layout** -- Computes Flexbox positions/ sizes for every node
3. **Render to Output** -- Walks the DOM tree, emits styled text into an `Output` buffer
4. **Screen Diff** -- Compares new frame against previous frame in a screen buffer
5. **Terminal Write** -- Emits minimal ANSI escape sequences to update only changed cells

### Module System

Import everything from the package root:

```tsx
// Core rendering
import { render, createRoot, renderSync } from '@anthropic/ink'

// Components (base, no theme)
import { BaseBox, BaseText, ScrollBox, Button, Link, Newline, Spacer } from '@anthropic/ink'

// Theme-aware components (recommended)
import { Box, Text } from '@anthropic/ink'

// Hooks
import { useApp, useInput, useTerminalSize, useInterval } from '@anthropic/ink'

// Theme
import { ThemeProvider, useTheme, color } from '@anthropic/ink'

// Keybindings
import { useKeybinding, KeybindingProvider } from '@anthropic/ink'
```

### Naming Convention: Base vs Theme-aware

The package exports both raw and theme-aware versions of core components:

- **`BaseBox`** / **`BaseText`** -- Raw components that only accept raw color values (`rgb(...)`, `#hex`, `ansi:...`, `ansi256(...)`)
- **`Box`** / **`Text`** -- Theme-aware wrappers that accept both theme keys (`'claude'`, `'success'`, `'error'`) and raw color values

Always prefer the theme-aware versions unless you have a specific reason to use raw components.
