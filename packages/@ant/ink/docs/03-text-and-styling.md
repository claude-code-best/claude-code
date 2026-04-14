# Chapter 3: Text & Styling

## Text Component

`Text` renders styled text content. It supports colors, emphasis, and text wrapping.

```tsx
import { Text } from '@anthropic/ink'

<Text bold color="success">Operation complete</Text>
```

### Text Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `color` | `keyof Theme \| Color` | - | Foreground color |
| `backgroundColor` | `keyof Theme` | - | Background color (theme-aware) |
| `bold` | `boolean` | `false` | Bold text |
| `dimColor` | `boolean` | `false` | Dim text (uses theme's `inactive` color) |
| `italic` | `boolean` | `false` | Italic text |
| `underline` | `boolean` | `false` | Underlined text |
| `strikethrough` | `boolean` | `false` | Strikethrough text |
| `inverse` | `boolean` | `false` | Swap foreground/background |
| `wrap` | `TextWrap` | `'wrap'` | Wrapping/truncation mode |
| `children` | `ReactNode` | - | Text content |

> **Note:** `bold` and `dimColor` are mutually exclusive (ANSI terminals cannot render both simultaneously).

### BaseText vs ThemedText

- **`BaseText`** -- Accepts raw `Color` values only
- **`Text`** (default export) -- Theme-aware, accepts `keyof Theme | Color` for `color`, and `keyof Theme` for `backgroundColor`

```tsx
// Raw color
<BaseText color="rgb(255,0,0)">Red text</BaseText>

// Theme key (resolved to current theme palette)
<Text color="error">Error message</Text>

// Mixed
<Text color="#FF0000">Custom red</Text>
```

### Text Wrap Modes

```tsx
<Text wrap="wrap">...</Text>                // Word-wrap at container width (default)
<Text wrap="wrap-trim">...</Text>           // Wrap + trim trailing whitespace
<Text wrap="end">...</Text>                 // Truncate with "..." at end
<Text wrap="truncate-end">...</Text>        // Same as "end"
<Text wrap="truncate">...</Text>            // Truncate (no ellipsis)
<Text wrap="middle">...</Text>              // "start...end"
<Text wrap="truncate-middle">...</Text>     // Same as "middle"
<Text wrap="truncate-start">...</Text>      // "...text"
```

### TextHoverColorContext

Uncolored `Text` children inherit a hover color from context:

```tsx
import { TextHoverColorContext } from '@anthropic/ink'

<TextHoverColorContext.Provider value="suggestion">
  <Text>Uncolored text gets the suggestion color</Text>
  <Text color="error">This stays red</Text>
</TextHoverColorContext.Provider>
```

Precedence: explicit `color` > `TextHoverColorContext` > `dimColor`.

## Color System

### Raw Color Formats

Four formats are supported for raw color values:

```tsx
// RGB
<Text color="rgb(255,107,128)">Bright red</Text>

// Hex
<Text color="#FF6B80">Bright red</Text>

// ANSI 256-color
<Text color="ansi256(196)">Red from 256-color palette</Text>

// Named ANSI 16-color
<Text color="ansi:red">Red</Text>
<Text color="ansi:greenBright">Bright green</Text>
```

### ANSI Named Colors

Full list of `ansi:` prefixed names:

| Name | Color |
|------|-------|
| `ansi:black` | Black |
| `ansi:red` | Red |
| `ansi:green` | Green |
| `ansi:yellow` | Yellow |
| `ansi:blue` | Blue |
| `ansi:magenta` | Magenta |
| `ansi:cyan` | Cyan |
| `ansi:white` | White |
| `ansi:blackBright` | Dark gray |
| `ansi:redBright` | Bright red |
| `ansi:greenBright` | Bright green |
| `ansi:yellowBright` | Bright yellow |
| `ansi:blueBright` | Bright blue |
| `ansi:magentaBright` | Bright magenta |
| `ansi:cyanBright` | Bright cyan |
| `ansi:whiteBright` | Bright white |

## Utility Functions

### `color(colorValue, themeName, type?)`

Curried theme-aware color function. Resolves theme keys to raw color values.

```tsx
import { color } from '@anthropic/ink'

const paint = color('error', 'dark')  // Returns (text: string) => string
console.log(paint('failed'))          // 'failed' wrapped in ANSI red codes

const paintFg = color('rgb(255,0,0)', 'dark', 'foreground')
const paintBg = color('success', 'dark', 'background')
```

Parameters:
- `c` -- `keyof Theme | Color | undefined` -- Theme key or raw color
- `theme` -- `ThemeName` -- Current theme
- `type` -- `'foreground' | 'background'` (default `'foreground'`)

### `stringWidth(text)`

Measures the visual width of a string in terminal columns, accounting for:
- CJK characters (2 columns each)
- Emoji (2 columns each)
- ANSI escape sequences (0 columns)

```tsx
import { stringWidth } from '@anthropic/ink'

stringWidth('hello')      // 5
stringWidth('你好')        // 4
stringWidth('\x1b[31mhi')  // 2 (ANSI codes ignored)
```

### `wrapText(text, width, textWrap)`

Wraps text to a given width with the specified wrapping mode.

```tsx
import { wrapText } from '@anthropic/ink'

wrapText('Hello World', 5, 'wrap')    // 'Hello\nWorld'
wrapText('Hello World', 8, 'end')     // 'Hello...'
```

### `wrapAnsi(text, width)`

Wraps text containing ANSI escape codes while preserving styling.

```tsx
import { wrapAnsi } from '@anthropic/ink'

wrapAnsi('\x1b[31mHello World\x1b[0m', 5)
// Wraps at word boundaries, keeps color codes intact
```

### `measureElement(node)`

Measures a rendered DOM element's dimensions.

```tsx
import { measureElement } from '@anthropic/ink'

const { width, height } = measureElement(domElement)
```

## Link Component

Renders an OSC 8 terminal hyperlink (clickable URL in supported terminals).

```tsx
import { Link } from '@anthropic/ink'

<Link url="https://example.com">
  <Text underline color="suggestion">example.com</Text>
</Link>
```

Props:
- `url` -- `string` (required) -- Target URL
- `children` -- `ReactNode` -- Display content
- `fallback` -- `ReactNode` -- Shown when hyperlinks are unsupported

## RawAnsi Component

Renders pre-formatted ANSI strings directly into the layout.

```tsx
import { RawAnsi } from '@anthropic/ink'

<RawAnsi
  lines={['\x1b[31mRed line 1\x1b[0m', '\x1b[32mGreen line 2\x1b[0m']}
  width={40}
/>
```

Props:
- `lines` -- `string[]` -- Pre-rendered ANSI lines (one terminal row each)
- `width` -- `number` -- Column width the producer wrapped to

## Border Rendering

### `renderBorder(box, output, options?)`

Low-level border rendering function used internally by Box.

```tsx
import { renderBorder } from '@anthropic/ink'
import type { BorderTextOptions } from '@anthropic/ink'
```

Border styles available (from `cli-boxes`):
- `single` -- Thin lines `─│┌┐└┘`
- `double` -- Double lines `═║╔╗╚╝`
- `round` -- Rounded corners `─│╭╮╰╯`
- `bold` -- Bold lines `━┃┏┓┗┛`
- `singleDouble` -- Single horizontal, double vertical
- `doubleSingle` -- Double horizontal, single vertical
- `classic` -- ASCII `─|++++`
