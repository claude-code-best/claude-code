# Chapter 4: Theme System

The theme system provides consistent, accessible color palettes across the application. It supports dark mode, light mode, ANSI-only terminals, and colorblind-accessible variants.

## ThemeProvider

Wraps the application to provide theme context.

```tsx
import { ThemeProvider } from '@anthropic/ink'

function App() {
  return (
    <ThemeProvider initialState="dark" onThemeSave={(setting) => saveConfig(setting)}>
      <MyComponent />
    </ThemeProvider>
  )
}
```

### Props

| Prop | Type | Description |
|------|------|-------------|
| `children` | `ReactNode` | Child components |
| `initialState` | `ThemeSetting` | Initial theme (default: loads from config) |
| `onThemeSave` | `(setting: ThemeSetting) => void` | Called when theme is saved |

### Theme Configuration Injection

Before mounting, inject config persistence callbacks:

```tsx
import { setThemeConfigCallbacks } from '@anthropic/ink'

setThemeConfigCallbacks({
  loadTheme: () => configStore.get('theme', 'dark'),
  saveTheme: (setting) => configStore.set('theme', setting),
})
```

## Theme Settings

```ts
type ThemeSetting = 'auto' | 'dark' | 'light' | 'light-daltonized' | 'dark-daltonized' | 'light-ansi' | 'dark-ansi'
type ThemeName = 'dark' | 'light' | 'light-daltonized' | 'dark-daltonized' | 'light-ansi' | 'dark-ansi'
```

| Theme | Description |
|-------|-------------|
| `dark` | Dark theme with RGB colors (default) |
| `light` | Light theme with RGB colors |
| `dark-daltonized` | Colorblind-accessible dark theme |
| `light-daltonized` | Colorblind-accessible light theme |
| `dark-ansi` | Dark theme using only 16 ANSI colors |
| `light-ansi` | Light theme using only 16 ANSI colors |
| `auto` | Follows terminal's dark/light mode (resolved at runtime) |

## Theme Hooks

### `useTheme()`

Returns the resolved theme name and setter.

```tsx
const [currentTheme, setTheme] = useTheme()
// currentTheme: ThemeName (never 'auto')
// setTheme: (setting: ThemeSetting) => void
```

### `useThemeSetting()`

Returns the raw setting (may be `'auto'`).

```tsx
const setting = useThemeSetting()  // 'auto' | 'dark' | ...
```

### `usePreviewTheme()`

Returns preview controls for a theme picker UI.

```tsx
const { setPreviewTheme, savePreview, cancelPreview } = usePreviewTheme()

// Show preview
setPreviewTheme('light')

// User confirms
savePreview()

// User cancels
cancelPreview()
```

## Theme Color Palette

Every theme defines these semantic color keys:

### Brand & Identity

| Key | Purpose |
|-----|---------|
| `claude` | Brand orange |
| `claudeShimmer` | Lighter brand orange (animated) |
| `permission` | Permission/blue |
| `permissionShimmer` | Lighter permission blue |
| `autoAccept` | Electric violet |
| `planMode` | Teal/sage |
| `ide` | Muted blue |

### Semantic Colors

| Key | Purpose |
|-----|---------|
| `text` | Primary text color |
| `inverseText` | Text on inverse backgrounds |
| `inactive` | Dimmed/disabled elements |
| `inactiveShimmer` | Lighter inactive |
| `subtle` | Very subtle text |
| `suggestion` | Interactive/accent |
| `background` | General background accent |
| `success` | Positive/success |
| `error` | Negative/error |
| `warning` | Caution/warning |
| `warningShimmer` | Lighter warning |
| `merged` | Merged state |

### Diff Colors

| Key | Purpose |
|-----|---------|
| `diffAdded` | Added lines background |
| `diffRemoved` | Removed lines background |
| `diffAddedDimmed` | Dimmed added |
| `diffRemovedDimmed` | Dimmed removed |
| `diffAddedWord` | Word-level added |
| `diffRemovedWord` | Word-level removed |

### UI Colors

| Key | Purpose |
|-----|---------|
| `promptBorder` | Input prompt border |
| `promptBorderShimmer` | Lighter prompt border |
| `bashBorder` | Shell block border |
| `selectionBg` | Text selection highlight background |
| `userMessageBackground` | User message background |
| `userMessageBackgroundHover` | User message hover |
| `messageActionsBackground` | Action buttons background |

### Agent Colors

| Key | Purpose |
|-----|---------|
| `red_FOR_SUBAGENTS_ONLY` | Agent color assignment |
| `blue_FOR_SUBAGENTS_ONLY` | Agent color assignment |
| `green_FOR_SUBAGENTS_ONLY` | Agent color assignment |
| `yellow_FOR_SUBAGENTS_ONLY` | Agent color assignment |
| `purple_FOR_SUBAGENTS_ONLY` | Agent color assignment |
| `orange_FOR_SUBAGENTS_ONLY` | Agent color assignment |
| `pink_FOR_SUBAGENTS_ONLY` | Agent color assignment |
| `cyan_FOR_SUBAGENTS_ONLY` | Agent color assignment |

## Using Theme Colors in Components

### ThemedText

```tsx
<Text color="success">Operation complete</Text>
<Text color="error" bold>Failed!</Text>
<Text color="claude">Claude says...</Text>
<Text dimColor>Secondary info</Text>
<Text backgroundColor="userMessageBackground">Highlighted</Text>
```

### ThemedBox

```tsx
<Box borderStyle="single" borderColor="permission" backgroundColor="userMessageBackground">
  <Text>Themed content</Text>
</Box>
```

### color() Utility

```tsx
import { color, useTheme } from '@anthropic/ink'

function MyComponent() {
  const [themeName] = useTheme()
  const paint = color('success', themeName)
  // paint('text') returns ANSI-colored string
}
```

## Daltonized Themes

The daltonized themes (`light-daltonized`, `dark-daltonized`) are designed for users with protanopia/deuteranopia:

- Green/red diffs replaced with blue/red
- Status colors use blue instead of green
- Warning colors adjusted for better distinction
- All color pairs verified for sufficient contrast

## System Theme Detection

When `ThemeSetting` is `'auto'`:

1. Seeds from `$COLORFGBG` environment variable
2. Queries terminal via OSC 11 for live background color
3. Watches for changes (terminal theme switch) in real-time
4. Resolves to `'dark'` or `'light'` based on detected brightness
