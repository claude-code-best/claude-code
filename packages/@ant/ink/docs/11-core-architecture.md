# Chapter 11: Core Architecture

This chapter covers the internal rendering pipeline, DOM model, and screen buffer system. This is advanced material -- most users only need the component and hooks APIs.

## Rendering Pipeline

```
React Component Tree
        ↓ (React reconciler)
Ink DOM Tree (virtual terminal DOM)
        ↓ (Yoga layout)
Positioned DOM Tree (computed x, y, width, height)
        ↓ (renderNodeToOutput)
Output Buffer (styled characters)
        ↓ (renderer → Screen)
Screen Buffer (Int32Array of cells)
        ↓ (diffEach)
ANSI Diff Patches (minimal escape sequences)
        ↓ (writeDiffToTerminal)
Terminal stdout
```

### Frame Lifecycle

Each render cycle (`onRender`) follows these phases:

1. **React Commit** -- React reconciles the virtual tree; host config updates Ink DOM
2. **Yoga Layout** -- All dirty nodes have their styles applied and layout computed
3. **Renderer** -- Creates Output buffer, calls `renderNodeToOutput` for the full tree
4. **Screen Diff** -- New frame is compared against previous frame cell-by-cell
5. **Optimize** -- Patches are merged and ordered for minimal cursor movement
6. **Write** -- ANSI escape sequences are written to stdout

### Frame Timing

```ts
const FRAME_INTERVAL_MS = 16  // ~60fps cap
```

Renders are throttled. Multiple state updates in one frame are batched.

### Double Buffering

Two frames are maintained:

- **`frontFrame`** -- The currently displayed frame
- **`backFrame`** -- The frame being rendered

After rendering, they are swapped. This prevents partial updates from being visible.

## Ink DOM

### Node Types

```ts
type ElementNames =
  | 'ink-root'        // Root container
  | 'ink-box'         // Box component
  | 'ink-text'        // Text component
  | 'ink-virtual-text' // Intermediate text wrapper
  | 'ink-link'        // Link component
  | 'ink-raw-ansi'    // Raw ANSI content
```

### DOMElement

```ts
type DOMElement = {
  nodeName: ElementNames
  attributes: Record<string, unknown>
  childNodes: DOMNode[]      // DOMElement | TextNode
  yogaNode?: LayoutNode      // Yoga layout node
  textStyles?: TextStyles    // Inherited text styles

  // Scroll state
  scrollTop?: number
  scrollHeight?: number
  scrollViewportHeight?: number
  scrollViewportTop?: number
  stickyScroll?: boolean
  pendingScrollDelta?: number
  scrollAnchor?: { el: DOMElement; offset: number }

  // Dirty tracking
  dirty: boolean

  // Event handlers (stored separately)
  onClick?: (event: ClickEvent) => void
  onFocus?: (event: FocusEvent) => void
  onBlur?: (event: FocusEvent) => void
  onKeyDown?: (event: KeyboardEvent) => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}
```

### TextNode

```ts
type TextNode = {
  nodeName: '#text'
  nodeValue: string
  yogaNode?: LayoutNode
}
```

### DOM Operations

```ts
// Node creation
createNode(nodeName: string): DOMElement
createTextNode(text: string): TextNode

// Tree manipulation
appendChildNode(parent: DOMElement, child: DOMNode): void
insertBeforeNode(parent: DOMElement, child: DOMNode, before: DOMNode): void
removeChildNode(parent: DOMElement, child: DOMNode): void

// Attribute manipulation
setAttribute(node: DOMElement, key: string, value: unknown): void
setStyle(node: DOMElement, style: Styles): void
setTextStyles(node: DOMElement, styles: TextStyles): void

// Dirty tracking
markDirty(node: DOMElement): void
scheduleRenderFrom(node: DOMElement): void
```

## Screen Buffer

### Cell Storage

The screen buffer uses packed `Int32Array` storage for memory efficiency:

```ts
type Screen = {
  width: number
  height: number
  cells: Int32Array        // 2 Int32s per cell: [charId, packed_style_hyperlink_width]
  cells64: BigInt64Array   // For bulk fill operations
  charPool: CharPool       // String interning
  stylePool: StylePool     // ANSI code interning
  hyperlinkPool: HyperlinkPool
  emptyStyleId: number
  damage: Rectangle | undefined  // Bounding box of changed cells
  noSelect: Uint8Array     // Per-cell no-select bitmap
  softWrap: Int32Array     // Per-row soft-wrap markers
}
```

### Cell Width

```ts
enum CellWidth {
  Narrow = 0,       // Regular character (1 column)
  Wide = 1,         // CJK/emoji (2 columns)
  SpacerTail = 2,   // Right half of wide character
  SpacerHead = 3,   // Soft-wrapped wide character
}
```

### Style Pool

ANSI style codes are interned for efficiency:

```ts
class StylePool {
  intern(codes: AnsiCode[]): number    // Returns compact ID
  get(id: number): AnsiCode[]
  transition(from: number, to: number): string  // Cached ANSI transition
  withInverse(id: number): number     // Selection overlay
  setSelectionBg(bg: AnsiCode): void  // Theme-aware selection bg
}
```

### Diff Algorithm

```ts
diffEach(prev: Screen, next: Screen, callback: (x, y, oldCell, newCell) => void): void
```

Only iterates cells within the damage bounding box. Unchanged regions are skipped entirely.

### Screen Operations

```ts
createScreen(width, height, stylePool, charPool, hyperlinkPool): Screen
setCellAt(screen, x, y, cell): void
cellAt(screen, x, y): Cell
clearRegion(screen, x, y, width, height): void
blitRegion(dst, src, x, y, maxX, maxY): void
shiftRows(screen, top, bottom, n): void
```

## Layout Engine

### Yoga Integration

Ink wraps Facebook's Yoga layout engine for Flexbox computation:

```ts
// Layout node types
enum LayoutDisplay { Flex, None }
enum LayoutPositionType { Absolute, Relative }
enum LayoutOverflow { Visible, Hidden, Scroll }
enum LayoutFlexDirection { Row, Column, RowReverse, ColumnReverse }
enum LayoutWrap { NoWrap, Wrap, WrapReverse }
enum LayoutAlign { FlexStart, Center, FlexEnd, Stretch }
enum LayoutJustify { FlexStart, Center, FlexEnd, SpaceBetween, SpaceAround, SpaceEvenly }
enum LayoutEdge { Top, Bottom, Left, Right, Start, End, Horizontal, Vertical, All }
enum LayoutGutter { Column, Row, All }
```

### Style Application

Styles from React props are applied to Yoga nodes during the commit phase:

```ts
function styles(node: LayoutNode, style: Styles, resolvedStyle?: Styles): void
```

This function maps each CSS-like prop to the corresponding Yoga setter.

## Output Buffer

Intermediate rendering target before screen diff:

```ts
class Output {
  write(text: string, x: number, y: number, styles: TextStyles): void
  wrap(width: number, textWrap: TextWrap): void
}
```

`renderNodeToOutput` walks the DOM tree and writes styled characters into this buffer.

## Reconciler

Custom React reconciler that bridges React and the Ink DOM:

- **Host config** -- Defines how React operations map to Ink DOM mutations
- **Concurrent mode** -- Supports `ConcurrentRoot` for React 19 features
- **Yoga integration** -- Applies styles during commit phase
- **DevTools** -- Connected in development mode

### Host Config Methods

| Method | Purpose |
|--------|---------|
| `createInstance` | Create `ink-box`, `ink-text`, etc. |
| `createTextInstance` | Create `#text` node |
| `appendChildNode` | Add child to parent |
| `removeChildNode` | Remove child from parent |
| `insertBefore` | Insert child before sibling |
| `commitUpdate` | Update element attributes/styles |
| `commitTextUpdate` | Update text content |
| `getPublicInstance` | Return DOMElement for refs |

## Performance Optimizations

1. **String Interning** -- CharPool deduplicates character strings across frames
2. **Style Caching** -- StylePool caches ANSI transition strings
3. **Damage Tracking** -- Only diff cells within the changed bounding box
4. **Bulk Operations** -- `Int32Array.set()` for fast region blit
5. **Throttled Rendering** -- Frame rate capped at ~60fps
6. **Viewport Culling** -- ScrollBox only renders visible children
7. **Microtask Coalescing** -- Multiple scroll deltas merged into one render

## Frame Events

Debug instrumentation for render performance:

```ts
type FrameEvent = {
  durationMs: number
  phases: {
    renderer: number    // Yoga + renderNodeToOutput
    diff: number        // Screen diff
    optimize: number    // Patch optimization
    write: number       // Terminal write
    patches: number     // Number of ANSI patches
    yoga: number        // Yoga layout time
    commit: number      // React commit time
    yogaVisited: number // Yoga nodes visited
    yogaMeasured: number // Yoga nodes measured
    yogaCacheHits: number // Cached measurements
    yogaLive: number    // Active Yoga nodes
  }
  flickers: FlickerReason[]
}
```

Enable with `onFrame` in RenderOptions:

```tsx
render(<App />, {
  onFrame: (event) => {
    console.log(`Frame: ${event.durationMs}ms`)
  }
})
```
