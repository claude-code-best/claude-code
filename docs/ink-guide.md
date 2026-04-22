# @anthropic/ink 使用文档

> 本项目自定义的终端 React 渲染框架，基于 React 19 + react-reconciler + Yoga 布局引擎。
> **不是** npm 上的 `ink` 官方库，API 有大量扩展和差异。

---

## 目录

1. [架构概览](#1-架构概览)
2. [快速开始](#2-快速开始)
3. [渲染 API](#3-渲染-api)
4. [组件体系](#4-组件体系)
   - [双层组件设计](#双层组件设计)
   - [Box / ThemedBox](#box--themedbox)
   - [Text / ThemedText](#text--themedtext)
   - [ScrollBox](#scrollbox)
   - [Button](#button)
   - [其他基础组件](#其他基础组件)
   - [设计系统组件](#设计系统组件)
5. [布局系统 (Styles)](#5-布局系统-styles)
6. [Hooks](#6-hooks)
7. [快捷键系统](#7-快捷键系统)
8. [主题系统](#8-主题系统)
9. [事件系统](#9-事件系统)
10. [工具函数](#10-工具函数)
11. [与官方 Ink 的关键差异](#11-与官方-ink-的关键差异)
12. [最佳实践](#12-最佳实践)

---

## 1. 架构概览

```
packages/@ant/ink/src/
├── core/              # Layer 1: 渲染引擎
│   ├── events/        # 事件系统 (InputEvent, ClickEvent, FocusEvent...)
│   ├── layout/        # Yoga flexbox 布局
│   ├── termio/        # 终端 I/O (ANSI 解析/输出)
│   ├── renderer.ts    # 渲染器 (双缓冲 + diff)
│   ├── reconciler.ts  # React reconciler
│   └── styles.ts      # 样式类型定义
├── components/        # Layer 2: UI 基础组件 (无主题)
│   ├── Box.tsx        # BaseBox
│   ├── Text.tsx       # BaseText
│   ├── ScrollBox.tsx  # 滚动容器
│   ├── Button.tsx     # 按钮
│   └── ...
├── theme/             # Layer 3: 主题 + 设计系统
│   ├── ThemeProvider.tsx
│   ├── ThemedBox.tsx  # 主题感知的 Box
│   ├── ThemedText.tsx # 主题感知的 Text
│   ├── Dialog.tsx     # 对话框
│   ├── Tabs.tsx       # 标签页
│   └── ...
├── hooks/             # React hooks
├── keybindings/       # 快捷键系统
└── index.ts           # 统一导出
```

**三层架构**:
- **core** — React reconciler + Yoga 布局 + 双缓冲渲染 + 终端 I/O
- **components** — 原始 UI 组件 (无主题色，只接受 raw Color)
- **theme** — 主题感知组件 + 设计系统 (接受 Theme key 作为颜色)

---

## 2. 快速开始

```tsx
import {
  wrappedRender as render,
  Box,
  Text,
  useApp,
  useInput,
} from '@anthropic/ink'

function App() {
  const { exit } = useApp()

  useInput((input, key) => {
    if (input === 'q') exit()
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Text color="claude" bold>Hello Terminal!</Text>
      <Text dimColor>按 q 退出</Text>
    </Box>
  )
}

// 渲染
const { unmount, waitUntilExit } = render(<App />)
await waitUntilExit()
```

**注意**: 项目中统一使用 `wrappedRender`（导出时别名为 `render`），而非 `renderSync`。

---

## 3. 渲染 API

### `wrappedRender(node, options?)`

异步渲染，返回 `Promise<Instance>`：

```ts
type Instance = {
  rerender: (node: ReactNode) => void  // 重新渲染
  unmount: () => void                   // 卸载
  waitUntilExit: () => Promise<void>    // 等待退出
  cleanup: () => void                   // 清理
}

type RenderOptions = {
  stdout?: NodeJS.WriteStream    // 默认 process.stdout
  stdin?: NodeJS.ReadStream      // 默认 process.stdin
  stderr?: NodeJS.WriteStream    // 默认 process.stderr
  exitOnCtrlC?: boolean          // 默认 true
  patchConsole?: boolean         // 默认 true
  onFrame?: (event: FrameEvent) => void
}
```

### `createRoot(options?)`

创建可复用的渲染根（类似 react-dom 的 `createRoot`）：

```ts
type Root = {
  render: (node: ReactNode) => void
  unmount: () => void
  waitUntilExit: () => Promise<void>
}

const root = createRoot({ stdout: process.stdout })
root.render(<App />)
// 后续可多次调用 root.render() 切换界面
```

---

## 4. 组件体系

### 双层组件设计

本框架的组件分两层：

| 层级 | 导出名 | 颜色类型 | 用途 |
|------|--------|----------|------|
| Base | `BaseBox`, `BaseText` | `Color` (rgb/hex/ansi) | 底层组件，无主题依赖 |
| Themed | `Box`, `Text` | `keyof Theme \| Color` | **日常使用的组件**，自动解析主题色 |

**日常开发请始终使用 `Box` / `Text`（Themed 版本）**，它们是默认导出。

---

### Box / ThemedBox

终端里的 `<div style="display: flex">`，是最核心的布局容器。

```tsx
import { Box, Text } from '@anthropic/ink'

// 基础布局
<Box flexDirection="column" gap={1}>
  <Box flexDirection="row" justifyContent="space-between">
    <Text>左侧</Text>
    <Text>右侧</Text>
  </Box>
</Box>

// 主题色边框
<Box borderStyle="round" borderColor="permission" padding={1}>
  <Text color="claude">带主题色边框的盒子</Text>
</Box>

// 键盘交互
<Box
  tabIndex={0}
  autoFocus
  onKeyDown={(e) => {
    if (e.key === 'escape') e.preventDefault()
  }}
>
  <Text>可聚焦的盒子</Text>
</Box>
```

**Props**:

| 属性 | 类型 | 说明 |
|------|------|------|
| `ref` | `Ref<DOMElement>` | DOM 元素引用 |
| `tabIndex` | `number` | Tab 键序（≥0 参与循环，-1 仅程序聚焦） |
| `autoFocus` | `boolean` | 挂载时自动聚焦 |
| `onClick` | `(e: ClickEvent) => void` | 鼠标点击（仅 AlternateScreen 内生效） |
| `onFocus` / `onBlur` | `(e: FocusEvent) => void` | 焦点事件 |
| `onFocusCapture` / `onBlurCapture` | 同上 | 捕获阶段焦点事件 |
| `onKeyDown` / `onKeyDownCapture` | `(e: KeyboardEvent) => void` | 键盘事件 |
| `onMouseEnter` / `onMouseLeave` | `() => void` | 鼠标进出（仅 AlternateScreen） |
| 所有 `Styles` 属性 | 见 [布局系统](#5-布局系统-styles) | |

**ThemedBox 额外的颜色属性**:

| 属性 | 类型 | 说明 |
|------|------|------|
| `borderColor` | `keyof Theme \| Color` | 边框颜色（接受主题 key） |
| `borderTopColor` 等 | 同上 | 单边边框颜色 |
| `backgroundColor` | `keyof Theme \| Color` | 背景颜色（接受主题 key） |

---

### Text / ThemedText

文本渲染组件。

```tsx
import { Text } from '@anthropic/ink'

// 主题色文本
<Text color="claude" bold>Claude</Text>
<Text color="error">错误信息</Text>
<Text dimColor>次要信息（使用 inactive 色）</Text>

// 原始色值
<Text color="rgb(255,128,0)">橙色</Text>
<Text color="#ff8000">也是橙色</Text>
<Text color="ansi256(208)">256色橙色</Text>

// 文本截断
<Text wrap="truncate-end">很长的文本会被截断...</Text>

// bold 和 dim 互斥（终端限制）
<Text bold>加粗文本</Text>
<Text dim>暗淡文本</Text>
// ❌ <Text bold dim>不允许</Text>
```

**Props**:

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `color` | `keyof Theme \| Color` | — | 文字颜色 |
| `backgroundColor` | `keyof Theme` | — | 背景色（仅接受主题 key） |
| `bold` | `boolean` | — | 加粗（与 dim 互斥） |
| `dim` | `boolean` | — | 暗淡（与 bold 互斥） |
| `dimColor` | `boolean` | — | 使用主题 inactive 色着色（不与 bold 互斥） |
| `italic` | `boolean` | — | 斜体 |
| `underline` | `boolean` | — | 下划线 |
| `strikethrough` | `boolean` | — | 删除线 |
| `inverse` | `boolean` | — | 反转前景/背景 |
| `wrap` | 见下方 | `'wrap'` | 文本换行/截断模式 |

**wrap 模式**:

| 值 | 说明 |
|----|------|
| `'wrap'` | 自动换行（默认） |
| `'wrap-trim'` | 换行并去除行尾空格 |
| `'end'` | 不换行，末尾省略 |
| `'middle'` | 不换行，中间省略 |
| `'truncate-end'` | 末尾截断 |
| `'truncate'` | 同 truncate-end |
| `'truncate-middle'` | 中间截断 |
| `'truncate-start'` | 开头截断 |

**`TextHoverColorContext`**: 为子树中未设置 `color` 的 Text 提供级联颜色。

```tsx
import { Text, TextHoverColorContext } from '@anthropic/ink'

<TextHoverColorContext.Provider value="suggestion">
  <Text>这段文字会继承 suggestion 色</Text>
  <Text color="error">这段保持 error 色</Text>
</TextHoverColorContext.Provider>
```

---

### ScrollBox

支持虚拟滚动的容器，用于显示超出视口的内容。

```tsx
import { ScrollBox, Box, Text } from '@anthropic/ink'
import { useRef } from 'react'

function LogViewer({ lines }: { lines: string[] }) {
  const scrollRef = useRef<ScrollBoxHandle>(null)

  // 编程式滚动
  useKeybinding('app:scrollUp', () => scrollRef.current?.scrollBy(-5))
  useKeybinding('app:scrollDown', () => scrollRef.current?.scrollBy(5))

  return (
    <ScrollBox ref={scrollRef} flexDirection="column" flexGrow={1} stickyScroll>
      {lines.map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
    </ScrollBox>
  )
}
```

**ScrollBoxHandle 方法**:

| 方法 | 返回 | 说明 |
|------|------|------|
| `scrollTo(y)` | `void` | 滚动到指定行 |
| `scrollBy(dy)` | `void` | 相对滚动 |
| `scrollToElement(el, offset?)` | `void` | 滚动到指定元素 |
| `scrollToBottom()` | `void` | 滚到底部 |
| `getScrollTop()` | `number` | 当前滚动位置 |
| `getScrollHeight()` | `number` | 内容总高度 |
| `getViewportHeight()` | `number` | 视口高度 |
| `isSticky()` | `boolean` | 是否粘在底部 |
| `setClampBounds(min, max)` | `void` | 限制滚动范围 |
| `subscribe(listener)` | `() => void` | 订阅滚动变化 |

**关键 Props**:
- `stickyScroll` — 自动跟踪最新内容（适合日志/聊天）
- 继承所有 `Styles` 属性（需设置 `flexGrow={1}` 或固定 `height`）

---

### Button

可交互按钮，支持键盘（Enter/Space）和鼠标点击。

```tsx
import { Button, Text } from '@anthropic/ink'

function ConfirmButton({ onConfirm }: { onConfirm: () => void }) {
  return (
    <Button onAction={onConfirm} tabIndex={0}>
      {({ focused, hovered }) => (
        <Box paddingX={2} borderStyle="round"
             borderColor={focused ? 'claude' : 'inactive'}>
          <Text bold={focused}>
            {hovered ? '[ 确认 ]' : '确认'}
          </Text>
        </Box>
      )}
    </Button>
  )
}
```

**Props**:

| 属性 | 类型 | 说明 |
|------|------|------|
| `onAction` | `() => void` | 按下 Enter/Space/点击时触发 |
| `tabIndex` | `number` | Tab 序号 |
| `autoFocus` | `boolean` | 自动聚焦 |
| `children` | `(state: ButtonState) => ReactNode \| ReactNode` | render prop 或静态内容 |

**ButtonState**: `{ focused: boolean, hovered: boolean, active: boolean }`

---

### 其他基础组件

#### `Newline`

```tsx
<Newline />       // 插入一个空行
<Newline count={3} />  // 插入三个空行
```

#### `Spacer`

```tsx
<Box flexDirection="row">
  <Text>左</Text>
  <Spacer />    // 占据剩余空间
  <Text>右</Text>
</Box>
```

#### `Link` — OSC 8 超链接

```tsx
<Link url="https://example.com">点击打开</Link>
```

#### `NoSelect` — 禁止文本选择

```tsx
<NoSelect fromLeftEdge>
  <Text>这段文字无法被鼠标选中复制</Text>
</NoSelect>
```

#### `RawAnsi` — 预渲染 ANSI 内容

```tsx
<RawAnsi content={ansiString} height={10} width={80} />
```

#### `AlternateScreen` — 全屏 TUI 模式

```tsx
<AlternateScreen>
  {/* 启用鼠标追踪、文本选择等高级功能 */}
  <App />
</AlternateScreen>
```

---

### 设计系统组件

这些是 theme 层提供的高级 UI 组件。

#### `Dialog` — 对话框

```tsx
import { Dialog, Box, Text } from '@anthropic/ink'

<Dialog title="确认操作" color="warning" onCancel={handleCancel}>
  <Box flexDirection="column" gap={1}>
    <Text>确定要继续吗？</Text>
  </Box>
  <Select options={options} onChange={onChange} onCancel={handleCancel} />
</Dialog>
```

**Props**: `title`, `subtitle?`, `color?` (Theme key), `onCancel`, `hideInputGuide?`, `hideBorder?`

#### `Tabs` / `Tab` — 标签页

```tsx
import { Tabs, Tab, Box, Text } from '@anthropic/ink'

<Tabs title="设置" color="claude" defaultTab="general">
  <Tab id="general" label="通用">
    <Text>通用设置内容</Text>
  </Tab>
  <Tab id="advanced" label="高级">
    <Text>高级设置内容</Text>
  </Tab>
</Tabs>
```

**Tabs Props**: `title?`, `color?`, `defaultTab?`, `selectedTab?`, `onTabChange?`, `banner?`, `contentHeight?`, `navFromContent?`

#### `Pane` — 带边框的容器

```tsx
<Pane title="日志" borderColor="bashBorder">
  <Text>内容</Text>
</Pane>
```

#### `Divider` — 分隔线

```tsx
<Divider />
<Divider title="分隔区域" />
```

#### `ProgressBar` — 进度条

```tsx
<ProgressBar value={75} maxValue={100} />
```

#### `StatusIcon` — 状态图标

```tsx
<StatusIcon kind="success" />  // ✓
<StatusIcon kind="error" />    // ✗
<StatusIcon kind="warning" />
<StatusIcon kind="info" />
```

#### `FuzzyPicker` — 模糊搜索选择器

```tsx
<FuzzyPicker
  items={[{ label: 'Item 1', value: '1' }, ...]}
  onSelect={(item) => handleSelect(item)}
  onCancel={() => {}}
/>
```

#### `SearchBox` — 搜索框

```tsx
<SearchBox value={query} onChange={setQuery} placeholder="搜索..." />
```

#### `ListItem` — 列表项

```tsx
<ListItem isFocused={focusedIndex === i} isSelected={selected === i}>
  <Text>{item.label}</Text>
</ListItem>
```

#### `Spinner` — 加载动画

```tsx
<Spinner label="加载中..." />
```

#### `LoadingState` — 加载状态

```tsx
<LoadingState message="处理中，请稍候..." />
```

#### `Byline` — 提示信息行

```tsx
<Byline>
  <Text>按 Tab 切换</Text>
  <Text>按 Enter 确认</Text>
</Byline>
```

#### `KeyboardShortcutHint` / `ConfigurableShortcutHint` — 快捷键提示

```tsx
<KeyboardShortcutHint shortcut="ctrl+k" description="清除" />
```

---

## 5. 布局系统 (Styles)

所有布局属性都通过 `Box` 的 props 传入，底层使用 Yoga 引擎计算 flexbox 布局。

### Flexbox

```tsx
<Box
  flexDirection="column"    // 'row' | 'column' | 'row-reverse' | 'column-reverse'
  flexWrap="wrap"           // 'nowrap' | 'wrap' | 'wrap-reverse'
  flexGrow={1}              // 弹性增长
  flexShrink={0}            // 弹性收缩（默认 1）
  flexBasis={100}           // 初始尺寸
  alignItems="center"       // 'flex-start' | 'center' | 'flex-end' | 'stretch'
  alignSelf="flex-start"    // 'flex-start' | 'center' | 'flex-end' | 'auto'
  justifyContent="space-between"  // 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly'
  gap={1}                   // 行列间距
  columnGap={2}             // 列间距
  rowGap={1}                // 行间距
>
```

### 尺寸

```tsx
<Box
  width={50}          // 固定宽度（字符数）
  width="50%"         // 百分比宽度
  height={20}         // 固定高度（行数）
  minWidth={10}
  maxWidth={100}
  minHeight={5}
  maxHeight={50}
>
```

### 间距

```tsx
<Box
  margin={1}          // 四周外边距
  marginX={2}         // 水平外边距
  marginY={1}         // 垂直外边距
  marginTop={1}       // 上外边距
  padding={1}         // 四周内边距
  paddingX={2}        // 水平内边距
  paddingY={1}        // 垂直内边距
  paddingLeft={2}     // 左内边距
>
```

**重要**: spacing 值必须是整数，否则会触发警告。

### 定位

```tsx
<Box position="absolute" top={0} right={0}>
  <Text>绝对定位在右上角</Text>
</Box>

<Box position="relative" top={1} left={2}>
  <Text>相对偏移</Text>
</Box>
```

### 边框

```tsx
<Box
  borderStyle="round"     // 'round' | 'single' | 'double' | 'bold' | 'dashed' | ...
  borderColor="claude"    // ThemedBox 可用主题 key
  borderTop={false}       // 隐藏上边框
  borderDimColor          // 暗淡边框
  borderText={{ text: '标题', side: 'top', alignment: 'center' }}
>
```

**borderStyle 可选值**: `round`, `single`, `double`, `bold`, `dashed`, 以及 `cli-boxes` 支持的所有样式。

### 溢出与滚动

```tsx
<Box
  overflow="hidden"       // 'visible' | 'hidden' | 'scroll'
  overflowY="scroll"      // 垂直方向滚动
  overflowX="hidden"      // 水平方向隐藏
>
```

### 其他

```tsx
<Box
  display="none"          // 隐藏元素（'flex' | 'none'）
  opaque                  // 用空格填充内部（遮挡背后内容）
  noSelect                // 禁止文本选择
  noSelect="from-left-edge"  // 从行首到右边缘全部禁止选择
>
```

---

## 6. Hooks

### `useApp()` — 应用控制

```tsx
const { exit } = useApp()
// 调用 exit() 卸载应用
```

### `useInput(handler, options?)` — 键盘输入

```tsx
useInput((input, key, event) => {
  if (input === 'q') exit()
  if (key.ctrl && input === 'c') handleInterrupt()
  if (key.upArrow) moveUp()
  if (key.return) submit()
}, { isActive: isFocused })  // isActive 控制是否启用
```

**Key 对象**:

```ts
type Key = {
  upArrow: boolean
  downArrow: boolean
  leftArrow: boolean
  rightArrow: boolean
  return: boolean
  escape: boolean
  ctrl: boolean
  shift: boolean
  meta: boolean      // Alt/Option
  super_: boolean    // Cmd/Win (仅 kitty 协议)
  tab: boolean
  backspace: boolean
  delete: boolean
  pageDown: boolean
  pageUp: boolean
  home: boolean
  end: boolean
}
```

**重要**: `useInput` 注册顺序影响事件传播。先注册的 handler 可以调用 `event.stopImmediatePropagation()` 阻止后续 handler。

### `useStdin()` — 访问输入流

```tsx
const { stdin, setRawMode, isRawModeSupported, internal_eventEmitter } = useStdin()
```

### `useTerminalSize()` — 终端尺寸

```tsx
const { columns, rows } = useTerminalSize()
```

### `useTheme()` — 主题

```tsx
const [themeName, setTheme] = useTheme()
// themeName: 'dark' | 'light' | ...
// setTheme('light') 或 setTheme('auto')
```

### `useThemeSetting()` — 原始主题设置

```tsx
const setting = useThemeSetting()
// 可能返回 'auto'（而 useTheme 返回解析后的实际值）
```

### `useKeybinding(action, handler, options?)` — 单个快捷键

```tsx
useKeybinding('chat:submit', () => {
  handleSubmit()
}, { context: 'Chat', isActive: !isDisabled })
```

### `useKeybindings(handlers, options?)` — 多个快捷键

```tsx
useKeybindings({
  'chat:submit': () => handleSubmit(),
  'chat:cancel': () => handleCancel(),
  'chat:undo': () => handleUndo(),
}, { context: 'Chat' })
```

### `useRegisterKeybindingContext(name)` — 注册快捷键上下文

```tsx
// 组件挂载时激活此上下文，使对应上下文的快捷键优先于 Global
useRegisterKeybindingContext('ThemePicker')
```

### `useTerminalFocus()` — 终端窗口焦点

```tsx
const isFocused = useTerminalFocus()
// 需要 DECSET 1004 支持
```

### `useTerminalTitle(title)` — 设置终端标题

```tsx
useTerminalTitle('Claude Code')
```

### `useSearchHighlight()` — 搜索高亮

```tsx
const { setQuery, scanElement, setPositions } = useSearchHighlight()
```

### `useSelection()` / `useHasSelection()` — 文本选择

```tsx
const { hasSelection, selectedText, copy, clear } = useSelection()
// 仅 AlternateScreen 内有效
```

### `useTerminalViewport()` — 视口可见性

```tsx
const [ref, entry] = useTerminalViewport()
// entry.isVisible: 元素是否在视口内
```

### `useDeclaredCursor()` — IME 光标定位

```tsx
const declaredRef = useDeclaredCursor()
// 用于 CJK 输入法的原生光标定位
```

### `useTerminalNotification()` — 终端通知

```tsx
const notify = useTerminalNotification()
notify({ title: '完成', body: '任务已完成' })
```

### `useExitOnCtrlCD()` — 双击退出

```tsx
const exitState = useExitOnCtrlCD()
// exitState.pending: boolean — 第一次按下后等待确认
// exitState.keyName: 'Ctrl+C' | 'Ctrl+D'
```

### `useAnimationFrame(callback)` — 动画帧

```tsx
useAnimationFrame((deltaTime) => {
  // 每帧调用
  setFrame(f => f + deltaTime)
})
```

### `useInterval(callback, delay)` — 定时器

```tsx
useInterval(() => {
  setCount(c => c + 1)
}, 1000)
```

### `useTimeout(callback, delay)` — 延迟执行

```tsx
useTimeout(() => {
  setLoading(false)
}, 3000)
```

### `useMinDisplayTime(ms, onComplete)` — 最小显示时间

```tsx
useMinDisplayTime(1000, () => {
  // 确保内容至少显示 1 秒
  goToNextStep()
})
```

### `useDoublePress()` — 双击检测

```tsx
const doublePress = useDoublePress()
doublePress('q', () => {
  // 快速按两次 q 触发
  exit()
})
```

### `useTabStatus(kind, title?)` — iTerm2 标签状态

```tsx
useTabStatus({ kind: 'success', title: 'Build Done' })
// kind: 'success' | 'error' | 'running'
```

---

## 7. 快捷键系统

### 架构

```
用户按键 → useInput → EventEmitter → ChordInterceptor (全局拦截)
                                            ↓
                                     KeybindingResolver (上下文匹配)
                                            ↓
                                     Handler 注册表 → 组件 Handler
```

### 定义格式

快捷键配置在 `~/.claude/keybindings.json`：

```json
{
  "bindings": [
    {
      "context": "Global",
      "bindings": {
        "ctrl+t": "app:toggleTodos",
        "ctrl+o": "app:toggleTranscript"
      }
    },
    {
      "context": "Chat",
      "bindings": {
        "enter": "chat:submit",
        "escape": "chat:cancel",
        "ctrl+x ctrl+k": "chat:killAgents"
      }
    }
  ]
}
```

### 按键语法

**单键**:
- `ctrl+k`, `shift+tab`, `alt+v`, `cmd+c`
- `escape`, `enter`, `return`, `space`, `tab`, `backspace`, `delete`
- `up`, `down`, `left`, `right`（也支持 `↑` `↓` `←` `→`）
- `pageup`, `pagedown`, `home`, `end`

**修饰符别名**: `ctrl`/`control`, `alt`/`opt`/`option`, `cmd`/`command`/`super`/`win`

**Chord（组合序列）**: `ctrl+x ctrl+k` — 先按 `ctrl+x`，再按 `ctrl+k`

### 上下文系统

| 上下文 | 说明 |
|--------|------|
| `Global` | 全局生效 |
| `Chat` | 聊天输入聚焦时 |
| `Autocomplete` | 自动补全菜单显示时 |
| `Confirmation` | 确认对话框 |
| `Settings` | 设置菜单 |
| `Transcript` | 查看转录 |
| `ThemePicker` | 主题选择器 |
| `Select` | 选择组件 |

**优先级**: 注册的活动上下文 > 组件上下文 > `Global`

### Action 类型

- **内置 Action**: `app:toggleTodos`, `chat:submit` 等
- **命令 Action**: `command:help`, `command:commit` — 执行 slash 命令
- **解绑**: 设为 `null` — 取消默认绑定

### 注册 Handler

```tsx
function ChatInput() {
  // 注册上下文（覆盖 Global 中相同的按键）
  useRegisterKeybindingContext('Chat')

  // 注册多个 handler
  useKeybindings({
    'chat:submit': () => handleSubmit(),
    'chat:cancel': () => handleCancel(),
  }, { context: 'Chat' })
}
```

### 显示快捷键

```tsx
import { useShortcutDisplay } from '@/keybindings/useShortcutDisplay'

const shortcut = useShortcutDisplay('app:toggleTranscript', 'Global', 'ctrl+o')
// 返回用户自定义的按键或 fallback
```

---

## 8. 主题系统

### 可用主题

| 名称 | 说明 |
|------|------|
| `dark` | 默认暗色 |
| `light` | 亮色 |
| `dark-daltonized` | 色盲友好暗色 |
| `light-daltonized` | 色盲友好亮色 |
| `dark-ansi` | 16色 ANSI 暗色 |
| `light-ansi` | 16色 ANSI 亮色 |
| `auto` | 跟随终端主题 |

### 常用 Theme 色值 key

| Key | 用途 |
|-----|------|
| `text` | 默认文字色 |
| `background` | 背景色 |
| `claude` | Claude 品牌色 |
| `claudeShimmer` | Claude 动画色 |
| `permission` | 权限相关 |
| `suggestion` | 建议/提示 |
| `success` | 成功 |
| `error` | 错误 |
| `warning` | 警告 |
| `inactive` | 非活跃/暗淡 |
| `bashBorder` | Bash 边框 |
| `diffAdded` / `diffRemoved` | Diff 增/删 |

### 使用主题色

```tsx
// 组件上直接使用主题 key
<Text color="claude" bold>Claude</Text>
<Box borderColor="permission" backgroundColor="background">

// 混合使用：主题 key + 原始色值
<Text color="claude">主题色</Text>
<Text color="rgb(255,0,0)">原始色</Text>

// color() 函数用于非组件场景
import { color } from '@anthropic/ink'
const [theme] = useTheme()
const text = color('error', theme)('出错了')
```

### ThemeProvider

```tsx
<ThemeProvider initialState="auto">
  <App />
</ThemeProvider>
```

**Hooks**:
- `useTheme()` — `[ThemeName, (setting: ThemeSetting) => void]`
- `useThemeSetting()` — 原始设置（含 `'auto'`）
- `usePreviewTheme()` — `{ setPreviewTheme, savePreview, cancelPreview }`

---

## 9. 事件系统

### 事件类型

| 事件类 | 说明 |
|--------|------|
| `InputEvent` | 键盘输入 |
| `ClickEvent` | 鼠标点击 |
| `KeyboardEvent` | 键盘事件（DOM 风格） |
| `FocusEvent` | 焦点变化 |
| `TerminalFocusEvent` | 终端窗口焦点 |
| `PasteEvent` | 粘贴 |

### 事件传播

事件支持冒泡和 `stopImmediatePropagation()`:

```tsx
// Box 事件冒泡
<Box onClick={(e) => {
  // 从最深层 Box 冒泡上来
  e.stopImmediatePropagation()  // 阻止继续冒泡
}}>
```

### EventEmitter

```tsx
const emitter = new EventEmitter()
emitter.on('input', handler)
emitter.emit('input', event)
```

**注册顺序**很重要：先注册的 handler 先收到事件，可以调用 `stopImmediatePropagation()` 阻止后续 handler。

---

## 10. 工具函数

### `stringWidth(text)` — 计算文本显示宽度

```tsx
import { stringWidth } from '@anthropic/ink'

stringWidth('你好')    // 4（中文字符占 2 列）
stringWidth('abc')     // 3
stringWidth('\x1b[31mred\x1b[0m')  // 3（忽略 ANSI 转义）
```

### `measureElement(domElement)` — 测量元素尺寸

```tsx
import { measureElement } from '@anthropic/ink'

const { width, height } = measureElement(ref.current)
```

### `color(themeKey, theme)` — 创建主题色着色函数

```tsx
import { color } from '@anthropic/ink'
const [theme] = useTheme()

const red = color('error', theme)('错误文本')
const green = color('success', theme)(figures.tick)
```

### `colorize(text, color, backgroundColor?)` — 原始色着色

```tsx
import { colorize } from '@anthropic/ink'

colorize('Hello', 'rgb(255,0,0)')
colorize('Hello', '#ff0000')
colorize('Hello', 'ansi256(196)')
```

### `setClipboard(text)` — 复制到剪贴板

```tsx
import { setClipboard } from '@anthropic/ink'
setClipboard('复制的文本')  // 通过 OSC 52
```

### `Ansi` 组件 — 渲染 ANSI 字符串

```tsx
import { Ansi } from '@anthropic/ink'

<Ansi dimColor>{ansiColoredText}</Ansi>
```

### `wrapText(text, width, options?)` — 文本换行

```tsx
import wrapText from '@anthropic/ink'
const wrapped = wrapText('很长的文本...', 80)
```

---

## 11. 与官方 Ink 的关键差异

| 特性 | 官方 Ink | @anthropic/ink |
|------|----------|----------------|
| React 版本 | 18 | **19** |
| 渲染方式 | 单缓冲 | **双缓冲 + diff 优化** |
| 布局引擎 | Yoga 基础 | **Yoga + 定位 + overflow + 虚拟滚动** |
| 全屏模式 | 无 | **AlternateScreen + 鼠标追踪** |
| 文本选择 | 无 | **鼠标选择 + OSC 52 剪贴板** |
| 主题系统 | 无 | **多主题 + 自动检测 + 色盲友好** |
| 快捷键 | `useInput` only | **Chord + 上下文 + 热重载** |
| 设计系统 | 无 | **Dialog/Tabs/Pane/ProgressBar 等** |
| 事件系统 | 简单 | **DOM 风格冒泡 + capture 阶段** |
| CJK 输入 | 无支持 | **IME 光标定位** |
| 性能优化 | 无 | **Blit 优化 + damage tracking + pool** |
| 组件层级 | 单层 | **双层 (Base + Themed)** |
| 边框系统 | 基础 | **per-side 控制 + dimColor + borderText** |
| 文本换行 | `wrap` | **wrap/wrap-trim/end/middle/truncate-\*** |

---

## 12. 最佳实践

### 1. 始终使用 Themed 组件

```tsx
// ✅ 推荐 — 使用主题色
import { Box, Text } from '@anthropic/ink'
<Text color="claude">主题色</Text>

// ❌ 避免 — 只有在明确不需要主题时使用
import { BaseBox, BaseText } from '@anthropic/ink'
<BaseText color="rgb(215,119,87)">原始色</BaseText>
```

### 2. 用 `useKeybindings` 代替直接 `useInput`

```tsx
// ✅ 推荐 — 声明式，支持上下文切换
useKeybindings({
  'chat:submit': handleSubmit,
  'chat:cancel': handleCancel,
}, { context: 'Chat' })

// ❌ 避免 — 手动解析按键
useInput((input, key) => {
  if (key.return) handleSubmit()
  if (key.escape) handleCancel()
})
```

### 3. spacing 值必须是整数

```tsx
// ✅
<Box margin={1} padding={2}>

// ❌ 触发运行时警告
<Box margin={1.5}>
```

### 4. `bold` 和 `dim` 互斥

```tsx
// ✅ 二选一
<Text bold>加粗</Text>
<Text dim>暗淡</Text>

// ❌ TypeScript 编译错误
<Text bold dim>...</Text>
```

### 5. 需要暗淡但不互斥时用 `dimColor`

```tsx
// ✅ dimColor 与 bold 兼容（使用 inactive 色，不是 ANSI dim）
<Text bold dimColor>加粗但暗淡</Text>
```

### 6. 鼠标事件只在 AlternateScreen 内生效

```tsx
// onClick、onMouseEnter、onMouseLeave 需要在 AlternateScreen 内
<AlternateScreen>
  <Box onClick={handleClick}>可点击</Box>
</AlternateScreen>
```

### 7. ScrollBox 需要明确高度

```tsx
// ✅ 设置 flexGrow 或固定 height
<ScrollBox flexGrow={1} stickyScroll>
  {content}
</ScrollBox>

// ❌ 没有高度约束，ScrollBox 不知道视口大小
<ScrollBox>
  {content}
</ScrollBox>
```

### 8. 渲染入口模式

```tsx
// 推荐：wrappedRender（异步，用于独立界面）
import { wrappedRender as render } from '@anthropic/ink'
const { unmount } = await render(<App />)

// 复用根：createRoot
import { createRoot } from '@anthropic/ink'
const root = createRoot()
root.render(<Screen1 />)
// 后续切换
root.render(<Screen2 />)
```
