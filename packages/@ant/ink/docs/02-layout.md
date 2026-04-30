# Chapter 2: Layout System

Ink uses [Yoga](https://yogalayout.com/) (Facebook's cross-platform layout engine) to implement CSS Flexbox in the terminal. Every layout is flexbox-based -- there is no CSS Grid or flow layout.

## Box Component

`Box` is the fundamental layout primitive. It is the terminal equivalent of `<div style="display: flex">`.

```tsx
import { Box, Text } from '@anthropic/ink'

<Box flexDirection="row" gap={1}>
  <Text>Left</Text>
  <Text>Right</Text>
</Box>
```

### Box Props (Styles)

All layout props are passed directly as JSX props (no `style={}` wrapper needed):

#### Flex Direction

Controls the main axis direction.

```tsx
<Box flexDirection="row">...</Box>            // Left to right (default)
<Box flexDirection="column">...</Box>         // Top to bottom
<Box flexDirection="row-reverse">...</Box>    // Right to left
<Box flexDirection="column-reverse">...</Box> // Bottom to top
```

#### Flex Grow / Shrink / Basis

```tsx
<Box flexGrow={1}>...</Box>      // Grow to fill available space
<Box flexShrink={0}>...</Box>    // Don't shrink below intrinsic size
<Box flexBasis={20}>...</Box>    // Initial size before flex distribution
<Box flexBasis="50%">...</Box>   // Percentage basis
```

Default values: `flexGrow={0}`, `flexShrink={1}`, `flexBasis=auto`.

#### Flex Wrap

```tsx
<Box flexWrap="nowrap">...</Box>       // Single line (default)
<Box flexWrap="wrap">...</Box>         // Multiple lines
<Box flexWrap="wrap-reverse">...</Box> // Reverse cross-axis stacking
```

#### Alignment

```tsx
<Box alignItems="flex-start">...</Box>  // Cross-axis start
<Box alignItems="center">...</Box>      // Cross-axis center
<Box alignItems="flex-end">...</Box>    // Cross-axis end
<Box alignItems="stretch">...</Box>     // Stretch to fill (default)

<Box alignSelf="flex-start">...</Box>   // Override parent's alignItems
<Box alignSelf="center">...</Box>
<Box alignSelf="flex-end">...</Box>
<Box alignSelf="auto">...</Box>         // Inherit from parent
```

#### Justify Content

```tsx
<Box justifyContent="flex-start">...</Box>   // Main-axis start (default)
<Box justifyContent="flex-end">...</Box>      // Main-axis end
<Box justifyContent="center">...</Box>        // Center
<Box justifyContent="space-between">...</Box> // Equal gaps, no edges
<Box justifyContent="space-around">...</Box>  // Equal gaps with edges
<Box justifyContent="space-evenly">...</Box>  // Evenly distributed
```

#### Gap

Spacing between children (only accepts integers):

```tsx
<Box gap={1}>...</Box>              // Both row and column gap
<Box columnGap={2}>...</Box>        // Gap between columns only
<Box rowGap={1}>...</Box>           // Gap between rows only
```

#### Padding

Inner spacing (only accepts integers):

```tsx
<Box padding={1}>...</Box>           // All sides
<Box paddingX={2}>...</Box>          // Left and right
<Box paddingY={1}>...</Box>          // Top and bottom
<Box paddingLeft={2}>...</Box>       // Left only
<Box paddingRight={2}>...</Box>      // Right only
<Box paddingTop={1}>...</Box>        // Top only
<Box paddingBottom={1}>...</Box>     // Bottom only
```

#### Margin

Outer spacing (only accepts integers):

```tsx
<Box margin={1}>...</Box>            // All sides
<Box marginX={2}>...</Box>           // Left and right
<Box marginY={1}>...</Box>           // Top and bottom
<Box marginLeft={2}>...</Box>        // Left only
<Box marginRight={2}>...</Box>       // Right only
<Box marginTop={1}>...</Box>         // Top only
<Box marginBottom={1}>...</Box>      // Bottom only
```

> **Note:** Fractional values for padding, margin, and gap are not supported. Ink will emit warnings if non-integer values are used.

#### Width & Height

```tsx
<Box width={40}>...</Box>           // Fixed 40 characters wide
<Box height={10}>...</Box>          // Fixed 10 rows tall
<Box width="50%">...</Box>          // 50% of parent's width
<Box width="100%">...</Box>         // Full parent width
```

#### Min/Max Dimensions

```tsx
<Box minWidth={20}>...</Box>
<Box maxWidth={80}>...</Box>
<Box minHeight={5}>...</Box>
<Box maxHeight={20}>...</Box>
```

Percentage values are supported: `minWidth="30%"`.

#### Position

```tsx
<Box position="absolute" top={0} right={0}>...</Box>
<Box position="absolute" top="10%" left="20%">...</Box>
<Box position="relative">...</Box>  // Default
```

Position `absolute` removes the element from normal flow and positions it relative to its nearest positioned ancestor. Useful for overlays.

#### Display

```tsx
<Box display="flex">...</Box>    // Visible (default)
<Box display="none">...</Box>    // Hidden (removed from layout)
```

#### Border

```tsx
<Box borderStyle="single">...</Box>    // Thin border
<Box borderStyle="double">...</Box>    // Double-line border
<Box borderStyle="round">...</Box>     // Rounded corners
<Box borderStyle="bold">...</Box>      // Bold border
<Box borderStyle="singleDouble">...</Box>  // Mixed
<Box borderStyle="doubleSingle">...</Box>  // Mixed
<Box borderStyle="classic">...</Box>   // ASCII art border
```

Control individual sides and colors:

```tsx
<Box
  borderStyle="single"
  borderTop={false}           // Hide top border
  borderBottom={true}         // Show bottom border
  borderColor="rgb(255,0,0)"  // Red border
  borderDimColor={true}       // Dim the border
>
  ...
</Box>
```

Per-side colors:

```tsx
<Box
  borderStyle="single"
  borderTopColor="rgb(255,0,0)"
  borderBottomColor="ansi:green"
  borderLeftColor="#0000FF"
  borderRightColor="ansi256(200)"
/>
```

Border text (labels in the border):

```tsx
<Box
  borderStyle="round"
  borderText={{ title: "My Panel", align: "left" }}
/>
```

#### Background

```tsx
<Box backgroundColor="rgb(40,40,40)">...</Box>
```

#### Overflow

```tsx
<Box overflow="visible">...</Box>   // Content expands container (default)
<Box overflow="hidden">...</Box>    // Clip without scrolling
<Box overflow="scroll">...</Box>    // Enable scrolling (use ScrollBox)
```

`overflowX` and `overflowY` control each axis independently.

#### Opaque

```tsx
<Box opaque={true}>...</Box>
```

Fills the box interior with spaces (using terminal's default background) before rendering children. Useful for absolute-positioned overlays where gaps would otherwise be transparent.

#### NoSelect

```tsx
<Box noSelect={true}>...</Box>              // Exclude from text selection
<Box noSelect="from-left-edge">...</Box>    // Exclude from column 0 to box edge
```

Only affects alt-screen text selection. Useful for gutters (line numbers, diff markers).

## Spacer

`Spacer` fills all available space along the main axis (equivalent to `flexGrow: 1`).

```tsx
<Box flexDirection="row">
  <Text>Left</Text>
  <Spacer />
  <Text>Right</Text>
</Box>
```

## Newline

Inserts line breaks.

```tsx
<Text>
  Line 1
  <Newline />
  Line 2
  <Newline count={2} />
  Line 4 (after double break)
</Text>
```

## Layout Examples

### Two-column layout

```tsx
<Box flexDirection="row" width={80}>
  <Box width="50%" padding={1}>
    <Text>Left column</Text>
  </Box>
  <Box width="50%" padding={1}>
    <Text>Right column</Text>
  </Box>
</Box>
```

### Centered content

```tsx
<Box justifyContent="center" alignItems="center" height={20}>
  <Text>Centered!</Text>
</Box>
```

### Sticky footer

```tsx
<Box flexDirection="column" height={24}>
  <Box flexGrow={1}>
    <Text>Scrollable content area</Text>
  </Box>
  <Box>
    <Text>Status bar at bottom</Text>
  </Box>
</Box>
```

### Bordered panel with title

```tsx
<Box
  flexDirection="column"
  borderStyle="round"
  borderColor="rgb(87,105,247)"
  padding={1}
  width={60}
>
  <Text bold>Panel Title</Text>
  <Text>Panel content goes here.</Text>
</Box>
```

## NoSelect

Wraps a region to exclude it from text selection in alt-screen mode. A convenience wrapper around `Box` with `noSelect` set.

```tsx
import { NoSelect } from '@anthropic/ink'

<Box flexDirection="row">
  <NoSelect>
    <Text dimColor>1 │ </Text>
  </NoSelect>
  <Text>selectable code here</Text>
</Box>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `ReactNode` | - | Content |
| `fromLeftEdge` | `boolean` | `false` | Extend exclusion from column 0 to box's right edge |

Accepts all `BoxProps` except `noSelect`.

## BaseBox vs ThemedBox

Two versions of Box are exported:

- **`BaseBox`** (imported as `BaseBox`) -- Raw box, color props accept only raw `Color` values
- **`Box`** (themed, imported as `Box`) -- Theme-aware, color props accept `keyof Theme | Color`

```tsx
// Raw
<BaseBox borderStyle="single" borderColor="rgb(255,0,0)" />

// Theme-aware (resolves 'permission' to the current theme's blue)
<Box borderStyle="single" borderColor="permission" />
```
