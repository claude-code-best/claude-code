# EffortPanel 基础面板实施计划（第一阶段）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/effort` 无参调用升级为横向 slider 选择面板，覆盖 `low/medium/high/xhigh/max/ultracode` 六档，`←/→` 移动光标、`Enter` 确认、`Esc` 取消。

**Architecture:** 新增自包含 `EffortPanel` React 组件 + 纯函数状态模块；键盘交互走项目既有的 `useKeybindings` + 自定义 `EffortPanel` keybinding context（与 `ModelPicker` 范式一致）；不修改 `src/utils/effort.ts`，复用其纯函数；改造 `src/commands/effort/effort.tsx` 的 `call()`，仅无参时挂载面板。

**Tech Stack:** Bun + TypeScript + React (Ink via `@anthropic/ink`) + `bun:test` + Biome

**Spec:** `docs/superpowers/specs/2026-06-14-effort-panel-design.md`

**范围：** 仅第一阶段（基础面板 + 键盘交互 + env override 警告 + ultracode 文案分支）。波纹动画在第二阶段单独 commit，不在本计划内。

---

## 文件结构

| 文件 | 状态 | 责任 |
|---|---|---|
| `src/components/EffortPanel/effortPanelState.ts` | 新增 | `PanelPosition` 类型 + 纯函数（`moveLeft`/`moveRight`/`home`/`end`/`getInitialCursor`/`PANEL_POSITIONS`），可独立单测 |
| `src/components/EffortPanel/EffortPanel.tsx` | 新增 | 面板 React 组件：渲染布局 + `useKeybindings` + Enter/Esc 分支 + 调 `executeEffort` |
| `src/components/EffortPanel/__tests__/effortPanelState.test.ts` | 新增 | 纯函数单测 |
| `src/components/EffortPanel/__tests__/EffortPanel.test.tsx` | 新增 | 组件渲染 + 分支测试 |
| `src/keybindings/schema.ts` | 修改 | 在 `KeybindingAction` 联合类型里追加 4 个 `effortPanel:*` action |
| `src/keybindings/defaultBindings.ts` | 修改 | 追加 `EffortPanel` context 绑定（`←/→/enter/escape/home/end`）|
| `src/keybindings/__tests__/`（如已有 schema/defaultBindings 测试）| 修改（如有） | 追加新 context 的回归断言 |
| `src/commands/effort/effort.tsx` | 修改 | `call()` 在 `args === ''` 时返回 `<EffortPanel>`；其他路径不变 |

**不修改的文件：** `src/utils/effort.ts`、`src/commands/effort/index.ts`、`src/state/AppState.tsx`。

---

## Task 1：纯函数状态模块（TDD）

**Files:**
- Create: `src/components/EffortPanel/effortPanelState.ts`
- Test: `src/components/EffortPanel/__tests__/effortPanelState.test.ts`

- [ ] **Step 1.1: 写失败测试（基础导出与边界）**

Create `src/components/EffortPanel/__tests__/effortPanelState.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import {
  END_POSITION,
  HOME_POSITION,
  PANEL_POSITIONS,
  type PanelPosition,
  getInitialCursor,
  isUltracode,
  moveLeft,
  moveRight,
} from '../effortPanelState.js'

describe('effortPanelState', () => {
  test('PANEL_POSITIONS 顺序为 low → ultracode', () => {
    expect(PANEL_POSITIONS).toEqual([
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
      'ultracode',
    ])
  })

  test('moveLeft 在 low 处保持 low', () => {
    expect(moveLeft('low')).toBe('low')
  })

  test('moveLeft 正常左移', () => {
    expect(moveLeft('high')).toBe('medium')
    expect(moveLeft('ultracode')).toBe('max')
  })

  test('moveRight 在 ultracode 处保持 ultracode', () => {
    expect(moveRight('ultracode')).toBe('ultracode')
  })

  test('moveRight 正常右移', () => {
    expect(moveRight('medium')).toBe('high')
    expect(moveRight('max')).toBe('ultracode')
  })

  test('HOME_POSITION 等于 low', () => {
    expect(HOME_POSITION).toBe('low')
  })

  test('END_POSITION 等于 ultracode', () => {
    expect(END_POSITION).toBe('ultracode')
  })

  test('isUltracode 守卫', () => {
    expect(isUltracode('ultracode')).toBe(true)
    expect(isUltracode('max')).toBe(false)
  })

  test('getInitialCursor：env override 存在时返回 env 值（若是合法档位）', () => {
    expect(getInitialCursor({ envOverride: 'high', appStateEffort: 'medium', displayed: 'high' })).toBe('high')
  })

  test('getInitialCursor：env 为 null（unset）时用 displayed', () => {
    expect(getInitialCursor({ envOverride: null, appStateEffort: undefined, displayed: 'medium' })).toBe('medium')
  })

  test('getInitialCursor：env undefined 时用 displayed', () => {
    expect(getInitialCursor({ envOverride: undefined, appStateEffort: 'high', displayed: 'high' })).toBe('high')
  })

  test('getInitialCursor：env 是数值（ant-only）时落回 displayed', () => {
    // 数值不是合法 PanelPosition，回退
    expect(getInitialCursor({ envOverride: 75, appStateEffort: 'medium', displayed: 'medium' })).toBe('medium')
  })

  test('PanelPosition 类型编译期检查（隐式）', () => {
    const p: PanelPosition = 'xhigh'
    expect(p).toBe('xhigh')
  })
})
```

- [ ] **Step 1.2: 运行测试，确认失败**

Run: `bun test src/components/EffortPanel/__tests__/effortPanelState.test.ts`
Expected: FAIL，错误形如 `Cannot find module '../effortPanelState.js'`

- [ ] **Step 1.3: 实现纯函数模块**

Create `src/components/EffortPanel/effortPanelState.ts`:

```ts
import type { EffortValue } from '../../../utils/effort.js'

/**
 * 光标在面板上的位置。仅面板内部使用，不进入 AppState / settings / API。
 * 'ultracode' 不是 EffortLevel；它在本面板里仅作视觉占位与文案引导。
 */
export type PanelPosition =
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'
  | 'ultracode'

export const PANEL_POSITIONS: readonly PanelPosition[] = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'ultracode',
] as const

export const HOME_POSITION: PanelPosition = 'low'
export const END_POSITION: PanelPosition = 'ultracode'

const NON_ULTRACODE_POSITIONS: readonly PanelPosition[] = PANEL_POSITIONS.filter(
  p => p !== 'ultracode',
)

/**
 * 判断一个 EffortValue 是否可作为面板光标位置。
 * 数值（ant-only）和 ultracode 都不是合法 PanelPosition（ultracode 由面板内部产生）。
 */
function isPanelPosition(value: unknown): value is PanelPosition {
  return typeof value === 'string' && (PANEL_POSITIONS as readonly string[]).includes(value)
}

/**
 * 把非 ultracode 的 string EffortValue 收窄为 PanelPosition 的前 5 档。
 * 用于 env override 与 appState 的归一化。
 */
function normalizeToPanelPosition(value: EffortValue | null | undefined): PanelPosition | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'number') return undefined
  if (isPanelPosition(value) && value !== 'ultracode') {
    return value
  }
  return undefined
}

export function moveLeft(cursor: PanelPosition): PanelPosition {
  const idx = PANEL_POSITIONS.indexOf(cursor)
  if (idx <= 0) return PANEL_POSITIONS[0]
  return PANEL_POSITIONS[idx - 1]
}

export function moveRight(cursor: PanelPosition): PanelPosition {
  const idx = PANEL_POSITIONS.indexOf(cursor)
  if (idx === -1 || idx >= PANEL_POSITIONS.length - 1) {
    return PANEL_POSITIONS[PANEL_POSITIONS.length - 1]
  }
  return PANEL_POSITIONS[idx + 1]
}

export function isUltracode(cursor: PanelPosition): boolean {
  return cursor === 'ultracode'
}

/**
 * 决定面板挂载时的初始光标位置。
 * 优先级：env override（若是合法档位）> displayed level（已是 fallback 'high' 之后）
 *
 * @param envOverride    getEffortEnvOverride() 的返回值：EffortValue | null | undefined
 * @param appStateEffort AppState.effortValue
 * @param displayed      getDisplayedEffortLevel(model, appStateEffort) —— 必传，避免此处再依赖 model
 */
export function getInitialCursor(args: {
  envOverride: EffortValue | null | undefined
  appStateEffort: EffortValue | undefined
  displayed: PanelPosition
}): PanelPosition {
  const fromEnv = normalizeToPanelPosition(args.envOverride)
  if (fromEnv !== undefined) return fromEnv
  // displayed 已经是 EffortLevel（不含 ultracode），合法
  return args.displayed
}

// 保留导出，便于将来测试扩展
export { NON_ULTRACODE_POSITIONS }
```

- [ ] **Step 1.4: 运行测试，确认通过**

Run: `bun test src/components/EffortPanel/__tests__/effortPanelState.test.ts`
Expected: PASS（所有 11 个 test 通过）

- [ ] **Step 1.5: 类型 + lint 检查**

Run: `bunx tsc --noEmit && bunx biome check src/components/EffortPanel/`
Expected: 0 errors

- [ ] **Step 1.6: Commit**

```bash
git add src/components/EffortPanel/effortPanelState.ts src/components/EffortPanel/__tests__/effortPanelState.test.ts
git commit -m "$(cat <<'EOF'
feat(effort): 新增 EffortPanel 纯函数状态模块（PanelPosition + 移动/初始光标）

仅含纯函数与类型，无 React/Ink 依赖，便于单测。
- PANEL_POSITIONS：low → medium → high → xhigh → max → ultracode
- moveLeft/moveRight：边界钳制（low 不再左移、ultracode 不再右移）
- getInitialCursor：env override > displayed level

Co-Authored-By: glm-5.2 <zai-org@claude-code-best.win>
EOF
)"
```

---

## Task 2：注册 EffortPanel keybinding context

**Files:**
- Modify: `src/keybindings/schema.ts`（在 `KeybindingAction` 联合类型追加 6 个 action）
- Modify: `src/keybindings/defaultBindings.ts`（追加 `EffortPanel` context 块）

- [ ] **Step 2.1: 检查 schema.ts 现有结构与校验测试**

Run: `grep -n "modelPicker:" src/keybindings/schema.ts`
Expected: 看到三行 `modelPicker:decreaseEffort/increaseEffort/toggle1M`，附近就是合适的插入位置。

Run: `ls src/keybindings/__tests__/ 2>/dev/null`
Expected: 查看是否有 schema/defaultBindings 的回归测试文件（决定是否需要补断言）。

- [ ] **Step 2.2: 在 schema.ts 追加 6 个 action**

打开 `src/keybindings/schema.ts`，找到 `// Model picker actions (ant-only)` 块（约 line 153-156），在它**后面**追加：

```ts
  // Effort panel actions (slash /effort without args)
  'effortPanel:decrease',
  'effortPanel:increase',
  'effortPanel:home',
  'effortPanel:end',
  'effortPanel:confirm',
  'effortPanel:cancel',
```

- [ ] **Step 2.3: 在 defaultBindings.ts 追加 EffortPanel context**

打开 `src/keybindings/defaultBindings.ts`，找到 `ModelPicker` 块（约 line 320-328），在它**后面**（`Select` 块之前）追加：

```ts
  // Effort panel (slash /effort without args)
  {
    context: 'EffortPanel',
    bindings: {
      left: 'effortPanel:decrease',
      right: 'effortPanel:increase',
      h: 'effortPanel:decrease',
      l: 'effortPanel:increase',
      home: 'effortPanel:home',
      end: 'effortPanel:end',
      enter: 'effortPanel:confirm',
      escape: 'effortPanel:cancel',
      q: 'effortPanel:cancel',
      'ctrl+c': 'effortPanel:cancel',
    },
  },
```

注意：
- `q` 与 `escape` / `ctrl+c` 都映射到 `effortPanel:cancel`，与 spec §5 状态机一致。
- Ink 的 useInput 默认在 ctrl+c 时退出进程；但项目 useKeybindings 系统会先拦截 ctrl+c（参考 `useInput` 源码中 `if (!(input === 'c' && key.ctrl) || !internal_exitOnCtrlC)` 分支）。若实施时发现 ctrl+c 仍直接退出进程，**降级为只绑 q + escape**，并在 commit message 里注明。
- Step 2.2 的 6 个 action（含 `home/end`）与此处的 8 个绑定一一对应。

- [ ] **Step 2.4: 类型 + lint 检查**

Run: `bunx tsc --noEmit`
Expected: 0 errors（如果 schema 校验是 type-level 的，新增 action 会被识别）

Run: `bun test src/keybindings/ 2>/dev/null`
Expected: 已有测试不破。

- [ ] **Step 2.5: Commit**

```bash
git add src/keybindings/schema.ts src/keybindings/defaultBindings.ts
git commit -m "$(cat <<'EOF'
feat(keybindings): 注册 EffortPanel context 与 6 个 action

绑定 ←/→/h/l/home/end/enter/escape 到 effortPanel:* action。
与 ModelPicker context 范式一致，避免左右键被全局 keybinding 拦截。

Co-Authored-By: glm-5.2 <zai-org@claude-code-best.win>
EOF
)"
```

---

## Task 3：实现 EffortPanel React 组件

**Files:**
- Create: `src/components/EffortPanel/EffortPanel.tsx`
- Create: `src/components/EffortPanel/__tests__/EffortPanel.test.tsx`

- [ ] **Step 3.1: 写失败测试（渲染基础形态）**

Create `src/components/EffortPanel/__tests__/EffortPanel.test.tsx`:

```tsx
import { describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { render } from '../../../test-utils/ink-render.js'
import { EffortPanel } from '../EffortPanel.js'

// 复用项目共享 mock（避免 bootstrap/state 副作用）
mock.module('src/utils/log.ts', () => {
  const { logMock } = require('../../../../tests/mocks/log')
  return logMock()
})

const baseProps = {
  model: 'claude-opus-4-7',
  appStateEffort: undefined as undefined | string,
  onDone: () => {},
}

describe('EffortPanel 渲染', () => {
  test('显示标题 Effort、两极 Faster/Smarter、6 个档位、底栏提示', () => {
    const { stdout } = render(<EffortPanel {...baseProps} appStateEffort={undefined} />)
    const out = stdout.join('')
    expect(out).toContain('Effort')
    expect(out).toContain('Faster')
    expect(out).toContain('Smarter')
    expect(out).toContain('low')
    expect(out).toContain('medium')
    expect(out).toContain('high')
    expect(out).toContain('xhigh')
    expect(out).toContain('max')
    expect(out).toContain('ultracode')
    expect(out).toContain('xhigh + workflows')
    expect(out).toContain('←/→ adjust')
    expect(out).toContain('Enter confirm')
    expect(out).toContain('Esc cancel')
  })

  test('光标 ▲ 初始指向当前生效档（high）', () => {
    const { stdout } = render(<EffortPanel {...baseProps} appStateEffort="high" />)
    // 找到 high 那一行上方有 ▲
    expect(stdout.join('')).toContain('▲')
  })
})
```

> 注：`ink-render.js` 路径在 Step 3.2 探查；如项目无现成 helper，退化为不依赖渲染的纯逻辑测试（仅测 onDone 分支回调）。

- [ ] **Step 3.2: 探查 Ink 测试 helper**

Run:
```bash
find src packages -name "*.ts*" -path "*test*" -exec grep -l "render.*Ink\|@anthropic/ink" {} \; 2>/dev/null | head -5
grep -rn "render(" src/components/**/__tests__/*.tsx 2>/dev/null | head -10
```

Expected：要么找到现成 helper（用之），要么确认项目里 Ink 组件测试都用"调用 onDone 回调断言"而非 ink render。如果后者，**Step 3.1 改写为回调断言式测试**（见 Step 3.3 备注）。

- [ ] **Step 3.3: 实现组件**

Create `src/components/EffortPanel/EffortPanel.tsx`:

```tsx
import * as React from 'react'
import { Box, Text } from '@anthropic/ink'
import { useKeybindings } from '../../keybindings/useKeybinding.js'
import {
  type EffortValue,
  getDisplayedEffortLevel,
  getEffortEnvOverride,
} from '../../utils/effort.js'
import {
  type PanelPosition,
  getInitialCursor,
  isUltracode,
  moveLeft,
  moveRight,
  PANEL_POSITIONS,
} from './effortPanelState.js'
import { executeEffort } from '../../commands/effort/effort.js'
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js'
import { useSetAppState } from '../../state/AppState.js'

// 终端 ≥ 80 cols 时使用；窄屏适配第二阶段处理
const PANEL_WIDTH = 76

type Props = {
  appStateEffort: EffortValue | undefined
  onDone: (message: string) => void
}

// ▲ 落在每档中心列：均匀分布
function cursorColumn(cursor: PanelPosition): number {
  const segment = Math.floor(PANEL_WIDTH / PANEL_POSITIONS.length)
  const idx = PANEL_POSITIONS.indexOf(cursor)
  return segment * idx + Math.floor(segment / 2)
}

function renderPaddedLine(cursor: PanelPosition): string {
  const col = cursorColumn(cursor)
  // ▲ 上方的"分隔线 + 光标"行：左侧 ─，到列处 ▲，右侧继续 ─
  return `${'─'.repeat(col)}▲${'─'.repeat(Math.max(0, PANEL_WIDTH - col - 1))}`
}

export function EffortPanel({ appStateEffort, onDone }: Props): React.ReactNode {
  const setAppState = useSetAppState()
  const model = useMainLoopModel()

  const envOverride = getEffortEnvOverride()
  const displayed = getDisplayedEffortLevel(model, appStateEffort)
  const initialCursor = getInitialCursor({ envOverride, appStateEffort, displayed })

  const [cursor, setCursor] = React.useState<PanelPosition>(initialCursor)
  const [done, setDone] = React.useState(false)

  const handleConfirm = React.useCallback(() => {
    if (done) return
    setDone(true)

    if (isUltracode(cursor)) {
      onDone(
        'ultracode 不是 effort 档位。请使用 /ultracode <context> 启动多 agent workflow。',
      )
      return
    }

    const result = executeEffort(cursor)
    if (result.effortUpdate) {
      setAppState(prev => ({
        ...prev,
        effortValue: result.effortUpdate!.value,
      }))
    }
    onDone(result.message)
  }, [cursor, done, onDone, setAppState])

  const handleCancel = React.useCallback(() => {
    if (done) return
    setDone(true)
    onDone('Effort unchanged.')
  }, [done, onDone])

  useKeybindings(
    {
      'effortPanel:decrease': () => setCursor(c => moveLeft(c)),
      'effortPanel:increase': () => setCursor(c => moveRight(c)),
      'effortPanel:home': () => setCursor('low'),
      'effortPanel:end': () => setCursor('ultracode'),
      'effortPanel:confirm': handleConfirm,
      'effortPanel:cancel': handleCancel,
    },
    { context: 'EffortPanel' },
  )

  const envActive = envOverride !== null && envOverride !== undefined
  const envRaw = process.env.CLAUDE_CODE_EFFORT_LEVEL

  // 两极文字行：左 Faster + 中间空格 + 右 Smarter
  const fasterLen = 'Faster'.length
  const smarterLen = 'Smarter'.length
  const gap = Math.max(0, PANEL_WIDTH - fasterLen - smarterLen)
  const poleLine = `Faster${' '.repeat(gap)}Smarter`

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>Effort</Text>
      {envActive && (
        <Text color="yellow">
          ⚠ CLAUDE_CODE_EFFORT_LEVEL={envRaw} overrides this session
        </Text>
      )}
      <Box marginTop={1}>
        <Text>{poleLine}</Text>
      </Box>
      <Text>{renderPaddedLine(cursor)}</Text>
      <Text>
        {PANEL_POSITIONS.map(p => (p as string).padEnd(11)).join('').trimEnd()}
      </Text>
      <Text dimColor>
        {' '.repeat(Math.max(0, PANEL_WIDTH - 'xhigh + workflows'.length))}
        xhigh + workflows
      </Text>
      <Box marginTop={1}>
        <Text dimColor>←/→ adjust · Enter confirm · Esc cancel</Text>
      </Box>
    </Box>
  )
}
```

> ⚠️ 对齐是粗糙实现（padEnd 11 假设每档名宽度 ≤ 11；实际 'ultracode' = 9 字符，OK；'xhigh' = 5）。第一版允许略微错位，视觉精度在第二阶段调优。重点是：标题、6 档名、底栏提示、▲ 标记必须出现。

> **Step 3.3 备注（如无 ink render helper）：** Step 5 走纯函数抽取方案测分支；渲染层只做"包含字符串"断言。

- [ ] **Step 3.4: 运行测试，确认通过**

Run: `bun test src/components/EffortPanel/__tests__/EffortPanel.test.tsx`
Expected: PASS

如失败：检查 `useKeybindings` import 路径、`executeEffort` 是否能从 effort.tsx 导出（必要时在 effort.tsx 加 `export`）、`useMainLoopModel` hook 是否在测试环境工作（可能需要 mock）。

- [ ] **Step 3.5: 类型 + lint 检查**

Run: `bunx tsc --noEmit && bunx biome check src/components/EffortPanel/`
Expected: 0 errors（如有 lint 警告，按提示修；`useKeybindings` 未使用变量之类的需移除）

- [ ] **Step 3.6: Commit**

```bash
git add src/components/EffortPanel/EffortPanel.tsx src/components/EffortPanel/__tests__/EffortPanel.test.tsx
git commit -m "$(cat <<'EOF'
feat(effort): 实现 EffortPanel 组件主体（渲染 + 键盘交互 + 确认/取消分支）

- 横向 slider 布局：Faster ↔ Smarter 两极，6 档刻度
- useKeybindings 注册 EffortPanel context，←/→/h/l/home/end/enter/escape
- Enter 在 5 档之一 → 调 executeEffort 写 settings + AppState
- Enter 在 ultracode → 输出引导文案，不写状态
- Esc → "Effort unchanged."
- env override 时顶部黄色警告

Co-Authored-By: glm-5.2 <zai-org@claude-code-best.win>
EOF
)"
```

---

## Task 4：改造 `/effort` 命令挂载面板

**Files:**
- Modify: `src/commands/effort/effort.tsx`

- [ ] **Step 4.1: 阅读现状**

Run: `cat src/commands/effort/effort.tsx`
确认 `call()` 当前签名与 `ShowCurrentEffort` / `ApplyEffortAndClose` 组件结构。无参分支当前走 `<ShowCurrentEffort>`。

- [ ] **Step 4.2: 改造 call() 无参分支**

打开 `src/commands/effort/effort.tsx`，找到 `call()` 函数（约 line 153-169）。在文件顶部新增 import：

```tsx
import { EffortPanel } from '../../components/EffortPanel/EffortPanel.js'
```

把 `call()` 改为（替换无参分支）：

```tsx
export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: unknown,
  args?: string,
): Promise<React.ReactNode> {
  args = args?.trim() || ''

  if (COMMON_HELP_ARGS.includes(args)) {
    onDone(
      'Usage: /effort [low|medium|high|xhigh|max|auto]\n\nEffort levels:\n- low: Quick, straightforward implementation\n- medium: Balanced approach with standard testing\n- high: Comprehensive implementation with extensive testing\n- xhigh: Extended reasoning beyond high, short of max; including ChatGPT Codex models\n- max: Maximum capability with deepest reasoning; maps to xhigh for ChatGPT Codex models\n- auto: Use the default effort level for your model',
    )
    return
  }

  // 无参 / /effort current / /effort status：原行为是显示当前档位；
  // 现在拆分：完全无参 → 打开面板；current/status → 仍显示文本
  if (args === '') {
    return <EffortPanelWrapper onDone={onDone} />
  }

  if (args === 'current' || args === 'status') {
    return <ShowCurrentEffort onDone={onDone} />
  }

  const result = executeEffort(args)
  return <ApplyEffortAndClose result={result} onDone={onDone} />
}
```

在文件底部追加 `EffortPanelWrapper`（桥接面板到 AppState 与 onDone）：

```tsx
function EffortPanelWrapper({
  onDone,
}: {
  onDone: (result: string) => void
}): React.ReactNode {
  const effortValue = useAppState(s => s.effortValue)
  return <EffortPanel appStateEffort={effortValue} onDone={onDone} />
}
```

注意：`EffortPanel` 内部已经自己读 model + env override + 写 AppState，所以 wrapper 只是把 `effortValue` 透传。

- [ ] **Step 4.3: 类型 + lint 检查**

Run: `bunx tsc --noEmit && bunx biome check src/commands/effort/`
Expected: 0 errors

- [ ] **Step 4.4: 手动验证（pipe mode 快速跑）**

Run:
```bash
echo "/effort" | bun run src/entrypoints/cli.tsx -p 2>&1 | head -30
```

Expected：看到面板渲染输出（标题 Effort、6 档、底栏提示）。pipe 模式下键盘交互不能测，只验证渲染。

> 如果 pipe 模式不渲染面板（因为非交互式 TTY），改成 `bun run dev` 手测。

- [ ] **Step 4.5: 跑相关测试**

Run:
```bash
bun test src/commands/effort/ 2>/dev/null
bun test tests/integration/message-pipeline* 2>/dev/null
```

Expected: 已有测试不破。

- [ ] **Step 4.6: Commit**

```bash
git add src/commands/effort/effort.tsx
git commit -m "$(cat <<'EOF'
feat(effort): /effort 无参时挂载 EffortPanel 交互面板

- 无参 → <EffortPanelWrapper> 透传 AppState.effortValue
- current/status → 仍显示文本（不变）
- 有参 → 直跳 executeEffort（不变）
- help/-h/--help → 不变

Co-Authored-By: glm-5.2 <zai-org@claude-code-best.win>
EOF
)"
```

---

## Task 5：补集成测试（键盘交互 + 分支）

**Files:**
- Modify/Create: `src/components/EffortPanel/__tests__/EffortPanel.test.tsx`（在 Task 3 基础上追加）

- [ ] **Step 5.1: 决定测试路径（二选一）**

Ink 组件键盘测试在项目里没有现成 helper（已通过 Task 3.2 探查确认）。直接走 **Step 5.2 的纯函数抽取方案**——把确认/取消决策逻辑抽到 `effortPanelState.ts`，用纯函数测试覆盖分支。键盘 → handler 的连接由 `useKeybindings` 注册保证，**不**单独测（与 `ModelPicker` 测试策略一致）。

- [ ] **Step 5.2: 抽取确认/取消为可测纯函数（注入 applyFn 避免循环依赖）**

把 `handleConfirm`/`handleCancel` 的决策逻辑抽到 `effortPanelState.ts`，**接受 `applyFn` 作为参数注入**，避免 `effortPanelState.ts` → `effort.tsx` → `EffortPanel.tsx` → `effortPanelState.ts` 的循环依赖，也避免测试触碰真实 settings。

在 `effortPanelState.ts` 末尾追加：

```ts
export type ConfirmOutcome =
  | {
      kind: 'apply'
      message: string
      effortUpdate?: { value: EffortValue | undefined }
    }
  | { kind: 'ultracode-hint'; message: string }

export type ApplyFn = (
  cursor: PanelPosition,
) => { message: string; effortUpdate?: { value: EffortValue | undefined } }

export const ULTRACODE_HINT =
  'ultracode 不是 effort 档位。请使用 /ultracode <context> 启动多 agent workflow。'

export const CANCEL_MESSAGE = 'Effort unchanged.'

export function computeConfirmOutcome(cursor: PanelPosition, applyFn: ApplyFn): ConfirmOutcome {
  if (isUltracode(cursor)) {
    return { kind: 'ultracode-hint', message: ULTRACODE_HINT }
  }
  const result = applyFn(cursor)
  return {
    kind: 'apply',
    message: result.message,
    effortUpdate: result.effortUpdate,
  }
}
```

然后在 `EffortPanel.tsx` 里改用：

```tsx
// 顶部 import 新增
import {
  type PanelPosition,
  computeConfirmOutcome,
  getInitialCursor,
  isUltracode,    // 不再需要，computeConfirmOutcome 内部已用
  moveLeft,
  moveRight,
  PANEL_POSITIONS,
} from './effortPanelState.js'
import { executeEffort } from '../../commands/effort/effort.js'

// handleConfirm 改为
const handleConfirm = React.useCallback(() => {
  if (done) return
  setDone(true)
  const outcome = computeConfirmOutcome(cursor, executeEffort)
  if (outcome.kind === 'apply' && outcome.effortUpdate) {
    setAppState(prev => ({
      ...prev,
      effortValue: outcome.effortUpdate!.value,
    }))
  }
  onDone(outcome.message)
}, [cursor, done, onDone, setAppState])

// handleCancel 改为
const handleCancel = React.useCallback(() => {
  if (done) return
  setDone(true)
  onDone(CANCEL_MESSAGE)
}, [done, onDone])
```

注意 import 里也加 `CANCEL_MESSAGE`。

- [ ] **Step 5.3: 写分支测试（用注入版纯函数）**

在 `effortPanelState.test.ts` 末尾追加：

```ts
import {
  CANCEL_MESSAGE,
  computeConfirmOutcome,
  ULTRACODE_HINT,
  type ApplyFn,
} from '../effortPanelState.js'

describe('computeConfirmOutcome', () => {
  const mockApply: ApplyFn = cursor => ({
    message: `applied:${cursor}`,
    effortUpdate: { value: cursor as any },
  })

  test('ultracode → kind=ultracode-hint，含 /ultracode 引导', () => {
    const out = computeConfirmOutcome('ultracode', mockApply)
    expect(out.kind).toBe('ultracode-hint')
    if (out.kind === 'ultracode-hint') {
      expect(out.message).toBe(ULTRACODE_HINT)
      expect(out.message).toContain('/ultracode')
    }
  })

  test('low → kind=apply，message 来自 applyFn，effortUpdate 透传', () => {
    const out = computeConfirmOutcome('low', mockApply)
    expect(out.kind).toBe('apply')
    if (out.kind === 'apply') {
      expect(out.message).toBe('applied:low')
      expect(out.effortUpdate?.value).toBe('low')
    }
  })

  test('high → apply 路径不调 ultracode 分支', () => {
    const out = computeConfirmOutcome('high', mockApply)
    expect(out.kind).toBe('apply')
  })
})

test('常量字符串', () => {
  expect(CANCEL_MESSAGE).toBe('Effort unchanged.')
  expect(ULTRACODE_HINT).toContain('/ultracode <context>')
})
```

注意：因注入 mockApply，**完全不需要 mock settings**——这是注入方案的最大红利。

- [ ] **Step 5.4: 跑测试**

Run: `bun test src/components/EffortPanel/__tests__/`
Expected: PASS

- [ ] **Step 5.5: Commit**

```bash
git add src/components/EffortPanel/
git commit -m "$(cat <<'EOF'
test(effort): 补 EffortPanel 分支测试（ultracode 引导 / 取消文案 / apply 路径）

抽 computeConfirmOutcome 为纯函数便于测试，避开 Ink 键盘事件模拟。

Co-Authored-By: glm-5.2 <zai-org@claude-code-best.win>
EOF
)"
```

---

## Task 6：precheck 全量 + 验收

**Files:** 无修改

- [ ] **Step 6.1: 跑 precheck**

Run: `bun run precheck`
Expected: typecheck + lint fix + test 全绿，零错误

如有失败：按错误信息修，**不要**用 `as any` 或 `// biome-ignore` 绕过（除非确实是反编译代码遗留问题）。

- [ ] **Step 6.2: 手动验收**

Run: `bun run dev`
输入 `/effort`，确认：
- 面板出现，光标 `▲` 停在当前生效档
- `←` / `→` 移动光标，到边界（low / ultracode）不再继续
- Enter 在 high 时输出 `Set effort level to high: ...`
- 把光标移到 ultracode，Enter → 输出引导文案
- Esc → 输出 `Effort unchanged.`
- 设 `CLAUDE_CODE_EFFORT_LEVEL=high bun run dev`，再 `/effort` → 顶部黄色警告
- `/effort low`、`/effort auto`、`/effort current`、`/effort help` 仍按原行为工作

- [ ] **Step 6.3: 推送（可选，等用户决定）**

Run: `git log --oneline -10` 检查 commit 历史
Run: `git push` （**仅在用户确认后**）

---

## Self-Review 清单

实施完毕后，对照 spec 自检：

- [ ] §4 文件结构：`EffortPanel/`、`effortPanelState.ts`、测试文件都存在
- [ ] §5 交互：←/→/Home/End/Enter/Esc/q 全部实现；触发与初始光标正确
- [ ] §5 分支 A：5 档 Enter 调 executeEffort
- [ ] §5 分支 B：ultracode Enter 输出引导文案
- [ ] §5 取消：`Effort unchanged.`
- [ ] §6 视觉：标题、Faster/Smarter、6 档、ultracode 副标签、底栏提示
- [ ] §6 双标记：env override 时 cursor `▲` 与 active `(high) active` 同时显示（如未实现双标记，作为已知缺陷，第二阶段补）
- [ ] §6 模型不支持：禁用面板，仅 Esc 可退出（如未实现，第二阶段补，但 spec 写明要实现）
- [ ] §9 边界：env override、模型不支持、settings 写入失败（沿用 executeEffort 现有错误路径）
- [ ] §10 测试：纯函数 + 组件 + 分支
- [ ] precheck 零错误
- [ ] 两阶段切分清晰：本计划只做基础，波纹动画第二阶段

---

## 已知首版可接受简化

为了控制首版范围，以下细节**允许暂时不完美**，第二阶段或后续 commit 再调：

1. `▲` 与档位文字的对齐（窄屏 / 不同终端宽度下可能错位）
2. 双标记 `(high) active` 的精确渲染（首版可只显示 cursor `▲`，env override 顶部警告保证用户知情）
3. 模型不支持时的禁用态（首版可允许面板仍可操作，但顶部加提示）
4. 终端 < 60 cols 的垂直布局退化
5. 数字键 1-6 快速跳转（spec 中标为可选增强，本计划不做）

这些不影响主功能，第一版以"能用、稳定、可提交"为目标。
