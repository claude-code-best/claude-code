# @anthropic/ink Documentation

A terminal React rendering framework for building rich command-line interfaces.

## Architecture Overview

`@anthropic/ink` is a forked/internal Ink framework that renders React components directly to the terminal using ANSI escape sequences. It uses Yoga (via a custom layout engine) for Flexbox layout, a custom React reconciler for terminal DOM, and a screen-buffer differ for efficient updates.

### Three-Layer Architecture

```
┌─────────────────────────────────────────┐
│  Layer 3: Theme                         │
│  ThemeProvider, ThemedBox, ThemedText,  │
│  Dialog, FuzzyPicker, ProgressBar, etc. │
├─────────────────────────────────────────┤
│  Layer 2: Components                    │
│  Box, Text, ScrollBox, Button, Link,    │
│  Newline, Spacer, AlternateScreen       │
├─────────────────────────────────────────┤
│  Layer 1: Core                          │
│  Reconciler, Layout (Yoga), Terminal    │
│  I/O, Screen Buffer, Event System       │
└─────────────────────────────────────────┘
```

- **Core** (`src/core/`) -- Rendering engine: React reconciler, Yoga flexbox layout, terminal I/O, screen buffer with diff-based updates, event system (keyboard, mouse, focus, click).
- **Components** (`src/components/`) -- UI primitives: `Box`, `Text`, `ScrollBox`, `Button`, `Link`, `Newline`, `Spacer`, etc. Plus context providers (`App`, `StdinContext`).
- **Theme** (`src/theme/`) -- Theme system: `ThemeProvider`, theme-aware `Box`/`Text` wrappers, and design-system components (`Dialog`, `FuzzyPicker`, `ProgressBar`, `Tabs`, etc.).

### Documentation

| Chapter | File | Contents |
|---------|------|----------|
| 1 | [Getting Started](./01-getting-started.md) | Installation, rendering, basic concepts |
| 2 | [Layout System](./02-layout.md) | Box, Flexbox, Yoga, positioning, dimensions |
| 3 | [Text & Styling](./03-text-and-styling.md) | Text component, colors, text wrapping, ANSI styling |
| 4 | [Theme System](./04-theme-system.md) | ThemeProvider, themes, ThemedBox, ThemedText, color() |
| 5 | [Design System Components](./05-design-system.md) | Dialog, ProgressBar, FuzzyPicker, Tabs, Spinner, etc. |
| 6 | [Scrolling](./06-scrolling.md) | ScrollBox, sticky scroll, imperative scroll API |
| 7 | [User Input](./07-user-input.md) | useInput, Key types, raw mode, mouse events |
| 8 | [Keybinding System](./08-keybindings.md) | KeybindingProvider, useKeybinding, chord sequences, parser |
| 9 | [Hooks Reference](./09-hooks-reference.md) | All hooks with full API signatures |
| 10 | [Events & Focus](./10-events-and-focus.md) | Event system, FocusManager, click/hover, tab navigation |
| 11 | [Core Architecture](./11-core-architecture.md) | Reconciler, screen buffer, terminal I/O, rendering pipeline |
| 12 | [Terminal Integration](./12-terminal-integration.md) | Alternate screen, mouse tracking, clipboard, notifications |
