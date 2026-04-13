# Chapter 8: Keybinding System

The keybinding system provides configurable, context-aware keyboard shortcuts with chord sequence support.

## Architecture

```
KeybindingSetup (loads config)
  └── KeybindingProvider (provides context)
        ├── useKeybinding(action, handler)
        ├── useKeybindings({ action: handler })
        ├── useKeybindingContext()
        └── useRegisterKeybindingContext(name, isActive)
```

## KeybindingSetup

Loads and validates keybinding configuration at app startup.

```tsx
import { KeybindingSetup } from '@anthropic/ink'

<KeybindingSetup
  loadBindings={() => parseUserKeybindings(configFile)}
  subscribeToChanges={(cb) => watchConfigFile(cb)}
  onWarnings={(warnings, isReload) => {
    warnings.forEach(w => console.warn(w.message))
  }}
>
  <App />
</KeybindingSetup>
```

### Props

| Prop | Type | Description |
|------|------|-------------|
| `children` | `ReactNode` | App tree |
| `loadBindings` | `() => KeybindingsLoadResult` | Load bindings from config |
| `subscribeToChanges` | `(cb) => unsubscribe` | Watch for config changes |
| `initWatcher` | `() => void \| Promise<void>` | One-time setup (optional) |
| `onWarnings` | `(warnings, isReload) => void` | Validation warnings (optional) |
| `onDebugLog` | `(message) => void` | Debug logging (optional) |

### KeybindingsLoadResult

```ts
type KeybindingsLoadResult = {
  bindings: ParsedBinding[]
  warnings: KeybindingWarning[]
}
```

### KeybindingWarning

```ts
type KeybindingWarning = {
  type: 'parse_error' | 'duplicate' | 'reserved' | 'invalid_context' | 'invalid_action'
  severity: 'error' | 'warning'
  message: string
  key?: string
  context?: string
  action?: string
  suggestion?: string
}
```

## KeybindingProvider

Context provider that holds binding state and resolution logic. Automatically provided by `KeybindingSetup`.

## useKeybinding

Register a handler for a keybinding action.

```tsx
import { useKeybinding } from '@anthropic/ink'

function MyComponent() {
  useKeybinding('app:toggleTodos', () => {
    setShowTodos(prev => !prev)
  }, { context: 'Global' })

  // Return false to NOT consume the event (allow propagation)
  useKeybinding('scroll:lineDown', () => {
    if (!hasContent) return false  // Don't consume
    scrollBy(1)
  })
}
```

### Signature

```ts
function useKeybinding(
  action: string,
  handler: () => void | false | Promise<void>,
  options?: { context?: string; isActive?: boolean }
): void
```

### Handler Return Values

| Return | Effect |
|--------|--------|
| `undefined` / `void` | Event consumed, stop propagation |
| `false` | Event NOT consumed, propagate to other handlers |
| `Promise<void>` | Async handler, treated as consumed |

## useKeybindings

Register multiple handlers in one hook (reduces `useInput` overhead).

```tsx
import { useKeybindings } from '@anthropic/ink'

useKeybindings({
  'chat:submit': () => handleSubmit(),
  'chat:cancel': () => handleCancel(),
  'scroll:pageDown': () => {
    scrollBy(viewportHeight)
  },
  'scroll:lineDown': () => {
    if (!hasContent) return false
    scrollBy(1)
  },
}, { context: 'Chat' })
```

## Keybinding Contexts

Contexts allow the same key to perform different actions depending on what's active.

```tsx
// Register a context as active
import { useRegisterKeybindingContext } from '@anthropic/ink'

function ThemePicker({ isOpen }) {
  useRegisterKeybindingContext('ThemePicker', isOpen)

  // While open, 'ThemePicker' context bindings take precedence
  useKeybinding('picker:select', handleSelect, { context: 'ThemePicker' })

  return isOpen ? <PickerUI /> : null
}
```

Context resolution order:
1. Registered active contexts (most recent first)
2. The hook's own `context` parameter
3. `'Global'` (always checked last)

## Chord Sequences

Keybindings support multi-key sequences (chords):

```
"ctrl+k ctrl+s"  →  Save (press Ctrl+K, then Ctrl+S)
"ctrl+k ctrl+c"  →  Close (press Ctrl+K, then Ctrl+C)
```

When a chord prefix is pressed:
- `result.type === 'chord_started'` -- Show "Ctrl+K ..." pending indicator
- Next key completes or cancels the chord
- `result.type === 'chord_cancelled'` -- Invalid key, reset

## KeybindingContext Hook

```tsx
import { useKeybindingContext, useOptionalKeybindingContext } from '@anthropic/ink'

const ctx = useKeybindingContext()
// ctx.resolve(input, key, contexts)  → ResolveResult
// ctx.bindings                       → ParsedBinding[]
// ctx.pendingChord                   → ParsedKeystroke[] | null
// ctx.activeContexts                  → Set<string>
// ctx.getDisplayText(action, context) → string | undefined
// ctx.invokeAction(action)           → boolean
// ctx.registerHandler(registration)   → () => void  (unsubscribe)

// Returns null outside provider (no throw)
const optionalCtx = useOptionalKeybindingContext()
```

## Parser Functions

Parse and format keybinding strings:

```tsx
import {
  parseKeystroke,
  parseChord,
  keystrokeToString,
  chordToString,
  keystrokeToDisplayString,
  chordToDisplayString,
  parseBindings,
} from '@anthropic/ink'
```

### `parseKeystroke(str)`

Parse a single keystroke string:

```ts
parseKeystroke('ctrl+shift+enter')
// → { key: 'enter', ctrl: true, alt: false, shift: true, meta: false, super: false }
```

### `parseChord(str)`

Parse a chord (space-separated keystrokes):

```ts
parseChord('ctrl+k ctrl+s')
// → [{ key: 'k', ctrl: true, ... }, { key: 's', ctrl: true, ... }]
```

### `keystrokeToString(ks)` / `chordToString(chord)`

Convert parsed keystroke/chord back to string.

### `keystrokeToDisplayString(ks)` / `chordToDisplayString(chord)`

Convert to human-readable display string (platform-aware).

### `parseBindings(blocks)`

Parse a keybinding configuration:

```ts
parseBindings([
  {
    context: 'Global',
    bindings: {
      'ctrl+s': 'app:save',
      'ctrl+k ctrl+s': 'app:saveAs',
    }
  }
])
// → ParsedBinding[]
```

## Match Functions

```tsx
import { getKeyName, matchesKeystroke, matchesBinding } from '@anthropic/ink'
```

### `getKeyName(input, key)`

Get the canonical key name from raw input:

```ts
getKeyName('\x1b[A', { upArrow: true })  // 'up'
```

### `matchesKeystroke(input, key, target)`

Check if raw input matches a parsed keystroke:

```ts
matchesKeystroke('s', { ctrl: true, shift: false }, { key: 's', ctrl: true })
```

### `matchesBinding(input, key, binding)`

Check if raw input matches any keystroke in a binding's chord.

## Resolver Functions

```tsx
import { resolveKey, resolveKeyWithChordState, getBindingDisplayText } from '@anthropic/ink'
```

### `resolveKey(input, key, contexts, bindings)`

Resolve input to a binding action:

```ts
const result = resolveKey('s', { ctrl: true, shift: false }, ['Global'], bindings)
// result.type: 'match' | 'none' | 'unbound'
// result.action: string (when type === 'match')
```

### `resolveKeyWithChordState(input, key, contexts, bindings, pendingChord)`

Resolve with chord state:

```ts
const result = resolveKeyWithChordState('k', key, ['Global'], bindings, null)
// result.type: 'match' | 'none' | 'unbound' | 'chord_started' | 'chord_cancelled'
// result.pending: ParsedKeystroke[] (when type === 'chord_started')
```

### `getBindingDisplayText(action, context, bindings)`

Get the display string for a binding:

```ts
getBindingDisplayText('app:save', 'Global', bindings)  // 'Ctrl+S'
```
