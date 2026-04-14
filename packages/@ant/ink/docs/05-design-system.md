# Chapter 5: Design System Components

Pre-built theme-aware UI components for common terminal interface patterns.

## Dialog

Modal dialog with border, title, and keyboard navigation.

```tsx
import { Dialog } from '@anthropic/ink'

<Dialog
  title="Confirm Action"
  subtitle="This cannot be undone"
  onCancel={() => setShowDialog(false)}
  color="warning"
>
  <Text>Are you sure you want to proceed?</Text>
</Dialog>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `ReactNode` | - | Dialog title (required) |
| `subtitle` | `ReactNode` | - | Optional subtitle |
| `children` | `ReactNode` | - | Dialog body content |
| `onCancel` | `() => void` | - | Called on Esc/n (required) |
| `color` | `keyof Theme` | `'permission'` | Title and border color |
| `hideInputGuide` | `boolean` | `false` | Hide the keyboard hint footer |
| `hideBorder` | `boolean` | `false` | Render without Pane border |
| `inputGuide` | `(exitState) => ReactNode` | - | Custom input guide footer |
| `isCancelActive` | `boolean` | `true` | Enable/disable cancel keybindings |

### Keyboard Shortcuts

- **Enter** -- Confirm (consumer handles this)
- **Esc / n** -- Cancel (calls `onCancel`)
- **Ctrl+C / Ctrl+D** -- Double-press to exit

### Custom Input Guide

```tsx
<Dialog
  title="Save file?"
  onCancel={handleCancel}
  inputGuide={(exitState) => (
    exitState.pending
      ? <Text>Press {exitState.keyName} again to exit</Text>
      : <Text>Press Enter to save, Esc to cancel</Text>
  )}
>
  ...
</Dialog>
```

## Pane

Bordered container with themed top border.

```tsx
import { Pane } from '@anthropic/ink'

<Pane color="permission">
  <Text>Content inside a bordered pane</Text>
</Pane>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `ReactNode` | - | Content |
| `color` | `keyof Theme` | `'permission'` | Top border color |

## ProgressBar

Visual progress indicator.

```tsx
import { ProgressBar } from '@anthropic/ink'

<ProgressBar
  ratio={0.65}
  width={40}
  fillColor="rate_limit_fill"
  emptyColor="rate_limit_empty"
/>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `ratio` | `number` | - | Progress 0..1 (required) |
| `width` | `number` | - | Character width (required) |
| `fillColor` | `keyof Theme` | - | Filled portion color |
| `emptyColor` | `keyof Theme` | - | Empty portion color |

## Spinner

Animated loading spinner. No props.

```tsx
import { Spinner } from '@anthropic/ink'

<Box gap={1}>
  <Spinner />
  <Text>Loading...</Text>
</Box>
```

## LoadingState

Loading message with spinner and optional subtitle.

```tsx
import { LoadingState } from '@anthropic/ink'

<LoadingState
  message="Installing dependencies"
  subtitle="This may take a moment"
  bold={true}
/>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `message` | `string` | - | Loading message (required) |
| `bold` | `boolean` | `false` | Bold message |
| `dimColor` | `boolean` | `false` | Dimmed message |
| `subtitle` | `string` | - | Secondary text below |

## StatusIcon

Semantic status indicator with icon and color.

```tsx
import { StatusIcon } from '@anthropic/ink'

<StatusIcon status="success" withSpace />
<Text>Build complete</Text>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `status` | `'success' \| 'error' \| 'warning' \| 'info' \| 'pending' \| 'loading'` | - | Status type (required) |
| `withSpace` | `boolean` | `false` | Add trailing space |

Status icons:
- `success` -- Green checkmark
- `error` -- Red cross
- `warning` -- Yellow warning
- `info` -- Blue info
- `pending` -- Dimmed circle
- `loading` -- Dimmed ellipsis

## FuzzyPicker

Full-featured fuzzy search selector with preview support.

```tsx
import { FuzzyPicker } from '@anthropic/ink'

<FuzzyPicker
  title="Select a file"
  items={files}
  getKey={(f) => f.path}
  renderItem={(f, focused) => <Text>{f.name}</Text>}
  onQueryChange={(q) => setFilteredFiles(filterFiles(q))}
  onSelect={(f) => openFile(f)}
  onCancel={() => setShowPicker(false)}
/>
```

### Props

| Prop | Type | Description |
|------|------|-------------|
| `title` | `string` | Picker title (required) |
| `items` | `readonly T[]` | Items to display (required) |
| `getKey` | `(item: T) => string` | Unique key extractor (required) |
| `renderItem` | `(item: T, isFocused: boolean) => ReactNode` | Item renderer (required) |
| `onQueryChange` | `(query: string) => void` | Filter callback (required) |
| `onSelect` | `(item: T) => void` | Enter key handler (required) |
| `onCancel` | `() => void` | Esc handler (required) |
| `renderPreview` | `(item: T) => ReactNode` | Preview panel renderer |
| `previewPosition` | `'bottom' \| 'right'` | Preview placement |
| `visibleCount` | `number` | Max visible items |
| `direction` | `'down' \| 'up'` | Item ordering |
| `onTab` | `PickerAction<T>` | Tab key handler |
| `onShiftTab` | `PickerAction<T>` | Shift+Tab handler |
| `onFocus` | `(item: T \| undefined) => void` | Focus change callback |
| `emptyMessage` | `string \| ((query: string) => string)` | Empty state message |
| `matchLabel` | `string` | Status line below list |
| `placeholder` | `string` | Input placeholder |
| `initialQuery` | `string` | Initial search query |
| `selectAction` | `string` | Action label for byline |
| `extraHints` | `ReactNode` | Additional keyboard hints |

## Tabs / Tab

Tabbed interface with keyboard navigation.

```tsx
import { Tabs, Tab } from '@anthropic/ink'

<Tabs title="Settings" color="claude">
  <Tab title="General" id="general">
    <GeneralSettings />
  </Tab>
  <Tab title="Advanced" id="advanced">
    <AdvancedSettings />
  </Tab>
</Tabs>
```

### Tabs Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `ReactElement<TabProps>[]` | - | Tab elements |
| `title` | `string` | - | Header title |
| `color` | `keyof Theme` | - | Active tab indicator color |
| `defaultTab` | `string` | - | Initial tab id |
| `selectedTab` | `string` | - | Controlled selected tab |
| `onTabChange` | `(tabId: string) => void` | - | Tab change callback |
| `hidden` | `boolean` | `false` | Hide tab headers |
| `useFullWidth` | `boolean` | `false` | Use full terminal width |
| `banner` | `ReactNode` | - | Banner below tab headers |
| `disableNavigation` | `boolean` | `false` | Disable keyboard nav |
| `initialHeaderFocused` | `boolean` | `true` | Start with header focused |
| `contentHeight` | `number` | - | Fixed content height |
| `navFromContent` | `boolean` | `false` | Allow Tab/Arrow from content |

### Tab Props

| Prop | Type | Description |
|------|------|-------------|
| `title` | `string` | Tab label (required) |
| `id` | `string` | Tab identifier |
| `children` | `ReactNode` | Tab content |

### Tab Hooks

```tsx
import { useTabsWidth, useTabHeaderFocus } from '@anthropic/ink'

const width = useTabsWidth()          // Available content width
const focused = useTabHeaderFocus()   // Whether tab header is focused
```

## ListItem

Selectable list item with focus/selection indicators.

```tsx
import { ListItem } from '@anthropic/ink'

<ListItem isFocused={index === focusedIndex} isSelected={item.checked}>
  <Text>{item.label}</Text>
</ListItem>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `isFocused` | `boolean` | - | Keyboard focus (required) |
| `isSelected` | `boolean` | `false` | Checked/active state |
| `children` | `ReactNode` | - | Content |
| `description` | `string` | - | Secondary text below |
| `styled` | `boolean` | `true` | Auto-style based on state |
| `disabled` | `boolean` | `false` | Dimmed, non-interactive |
| `showScrollDown` | `boolean` | `false` | Scroll-down hint arrow |
| `showScrollUp` | `boolean` | `false` | Scroll-up hint arrow |
| `declareCursor` | `boolean` | `true` | Declare terminal cursor |

## SearchBox

Search input with theme-aware styling.

```tsx
import { SearchBox } from '@anthropic/ink'

<SearchBox
  query={searchQuery}
  placeholder="Search..."
  isFocused={true}
  isTerminalFocused={true}
  width="100%"
/>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `query` | `string` | - | Current search text |
| `placeholder` | `string` | - | Placeholder text |
| `isFocused` | `boolean` | - | Focus state |
| `isTerminalFocused` | `boolean` | - | Terminal focus state |
| `prefix` | `string` | - | Input prefix label |
| `width` | `number \| string` | - | Input width |
| `cursorOffset` | `number` | - | Cursor position offset |
| `borderless` | `boolean` | `false` | Remove border |

## Divider

Horizontal/vertical divider line.

```tsx
import { Divider } from '@anthropic/ink'

<Divider width={60} color="subtle" />
<Divider title="Section Title" />
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `width` | `number` | Terminal width | Divider width |
| `color` | `keyof Theme` | Dimmed | Line color |
| `char` | `string` | `'─'` | Line character |
| `padding` | `number` | `0` | Width reduction |
| `title` | `string` | - | Centered title text |

## Byline

Footer with middot-separated items.

```tsx
import { Byline } from '@anthropic/ink'

<Byline>
  <KeyboardShortcutHint shortcut="Enter" action="confirm" />
  <KeyboardShortcutHint shortcut="Esc" action="cancel" />
</Byline>
```

## KeyboardShortcutHint

Display a keyboard shortcut with its action.

```tsx
import { KeyboardShortcutHint } from '@anthropic/ink'

<KeyboardShortcutHint shortcut="Enter" action="confirm" />
<KeyboardShortcutHint shortcut="↑/↓" action="navigate" parens />
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `shortcut` | `string` | - | Key or chord to display |
| `action` | `string` | - | Action description |
| `parens` | `boolean` | `false` | Wrap in parentheses |
| `bold` | `boolean` | `false` | Bold shortcut text |

## ConfigurableShortcutHint

Displays a shortcut hint that reads the actual keybinding from config.

```tsx
import { ConfigurableShortcutHint } from '@anthropic/ink'

<ConfigurableShortcutHint
  action="confirm:no"
  context="Confirmation"
  fallback="Esc"
  description="cancel"
/>
```

| Prop | Type | Description |
|------|------|-------------|
| `action` | `string` | Keybinding action name |
| `context` | `string` | Keybinding context |
| `fallback` | `string` | Default shortcut if unbound |
| `description` | `string` | Action description |
| `parens` | `boolean` | Wrap in parentheses |
| `bold` | `boolean` | Bold shortcut text |

## Ratchet

Animated counter component that prevents layout jumps.

```tsx
import { Ratchet } from '@anthropic/ink'

<Ratchet lock="always">
  <Text>{count}</Text>
</Ratchet>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `ReactNode` | - | Content |
| `lock` | `'always' \| 'offscreen'` | `'always'` | Width locking strategy. `'always'` locks always; `'offscreen'` only locks when the element is scrolled off-screen |
