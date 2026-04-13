# Chapter 6: Scrolling

## ScrollBox

A scrollable container with imperative scroll API, viewport culling, and sticky scroll support.

```tsx
import { ScrollBox } from '@anthropic/ink'
import type { ScrollBoxHandle } from '@anthropic/ink'

function MessageList({ messages }) {
  const scrollRef = useRef<ScrollBoxHandle>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollToBottom()
  }, [messages.length])

  return (
    <ScrollBox ref={scrollRef} stickyScroll flexDirection="column" height={20}>
      {messages.map(msg => (
        <Text key={msg.id}>{msg.text}</Text>
      ))}
    </ScrollBox>
  )
}
```

### Props

ScrollBox accepts all Box layout props except `textWrap`, `overflow`, `overflowX`, `overflowY` (these are managed internally):

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `ref` | `Ref<ScrollBoxHandle>` | - | Imperative handle |
| `stickyScroll` | `boolean` | `false` | Auto-follow new content |
| *(layout props)* | `Styles` | - | Width, height, padding, etc. |

### ScrollBoxHandle (Imperative API)

```ts
interface ScrollBoxHandle {
  // Absolute positioning
  scrollTo(y: number): void
  scrollToElement(el: DOMElement, offset?: number): void
  scrollToBottom(): void

  // Relative positioning
  scrollBy(dy: number): void

  // Query state
  getScrollTop(): number
  getPendingDelta(): number
  getScrollHeight(): number
  getFreshScrollHeight(): number
  getViewportHeight(): number
  getViewportTop(): number
  isSticky(): boolean

  // Events
  subscribe(listener: () => void): () => void

  // Virtual scroll support
  setClampBounds(min?: number, max?: number): void
}
```

### Method Details

#### `scrollTo(y)`

Jump to an absolute position. Breaks sticky scroll.

```tsx
scrollRef.current?.scrollTo(0)  // Scroll to top
```

#### `scrollBy(dy)`

Scroll by a relative amount. Accumulates deltas for smooth scrolling.

```tsx
scrollRef.current?.scrollBy(3)   // Scroll down 3 rows
scrollRef.current?.scrollBy(-5)  // Scroll up 5 rows
```

#### `scrollToElement(el, offset?)`

Scroll so a specific DOM element is at the viewport top. More reliable than `scrollTo` because it reads the element's position at render time (avoids stale layout values).

```tsx
const elementRef = useRef<DOMElement>(null)
scrollRef.current?.scrollToElement(elementRef.current!, 2)
```

#### `scrollToBottom()`

Pin scroll to bottom. Enables sticky mode.

```tsx
scrollRef.current?.scrollToBottom()
```

#### `isSticky()`

Returns `true` when scroll is pinned to the bottom.

```tsx
if (scrollRef.current?.isSticky()) {
  // User hasn't scrolled up
}
```

#### `subscribe(listener)`

Subscribe to imperative scroll changes. Returns unsubscribe function.

```tsx
useEffect(() => {
  return scrollRef.current?.subscribe(() => {
    console.log('Scroll position changed')
  })
}, [])
```

### Sticky Scroll

When `stickyScroll` is enabled:

1. Scroll automatically follows new content at the bottom
2. User scroll (via `scrollBy`/`scrollTo`) breaks stickiness
3. `scrollToBottom()` re-enables stickiness
4. Content growth at the bottom is detected and followed automatically

```tsx
<ScrollBox stickyScroll height={20}>
  {/* New items auto-scroll to bottom */}
  {items.map(renderItem)}
</ScrollBox>
```

### Viewport Culling

ScrollBox only renders children that intersect the visible viewport. Children outside the viewport are still mounted in React but skipped during terminal rendering. This makes large lists performant.

### Virtual Scrolling

For very large lists, use `setClampBounds` in combination with a virtual scrolling hook:

```tsx
const scrollRef = useRef<ScrollBoxHandle>(null)

// After computing visible range
scrollRef.current?.setClampBounds(firstVisibleRow, lastVisibleRow)
```

This prevents burst `scrollTo` calls from showing blank space beyond mounted content.

### Scroll Events

ScrollBox bypasses React state for scroll operations. Instead:
1. `scrollTo`/`scrollBy` mutate `scrollTop` directly on the DOM node
2. The node is marked dirty
3. A microtask-deferred render fires to coalesce multiple scroll events
4. The Ink renderer reads `scrollTop` during layout

This avoids React reconciler overhead per wheel event.

### Integration with Mouse Wheel

In alt-screen mode, mouse wheel events are captured by the `App` component and forwarded to the focused ScrollBox:

```
Wheel event → App.handleMouseEvent → ScrollBox.scrollBy(delta)
```

### Layout Structure

ScrollBox creates a two-level DOM structure:

```
ink-box (overflow: scroll, constrained height)
└── Box (flexGrow: 1, flexShrink: 0, width: 100%)
    ├── Child 1
    ├── Child 2
    └── ...
```

The outer `ink-box` is the viewport with constrained size. The inner `Box` grows to fit all content. The renderer computes `scrollHeight` from the inner box and translates content by `-scrollTop`.
