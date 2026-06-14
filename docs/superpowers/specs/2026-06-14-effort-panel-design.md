# Effort 交互面板（EffortPanel）设计

**日期**: 2026-06-14
**作者**: brainstorming session 产物
**状态**: 待实施
**关联**: `src/commands/effort/`、`src/utils/effort.ts`、`src/components/EffortPanel/`（新增）

---

## 1. 概述

把当前的 `/effort` slash 命令从纯文本式交互升级为终端内的可视化选择面板。

- 触发：`/effort`（无参）打开面板；`/effort <level>` 直跳路径保留
- 视觉：横向 slider，两端标 `Faster` / `Smarter`，刻度为 `low / medium / high / xhigh / max / ultracode`
- 交互：`←/→` 移动光标，`Enter` 确认，`Esc` 取消
- ultracode 仅作视觉占位，确认后提示用户走 `/ultracode <context>` 启动
- 第二阶段加波纹动画（详见 §6）

## 2. 用户故事

- 作为开发者，我希望按 `/effort` 就能可视化地选择努力等级，而不用记 5 个枚举值
- 作为高频用户，我希望 `/effort high` 这种直跳仍可用，避免脚本/习惯被打断
- 作为设置了 `CLAUDE_CODE_EFFORT_LEVEL` 的用户，我希望面板提示我"env 优先级更高"，而不是默默忽略我的选择
- 作为想试 ultracode 的用户，我希望面板让我知道这个"档位"存在，但落地要走它自己的命令

## 3. 不在本期范围

- 不修改 `EffortValue` / `EffortLevel` 类型
- 不修改 `src/utils/effort.ts` 的任何纯函数
- 不新增专用全局热键（仅通过 `/effort` 触发）
- 不在面板里包含 `auto` 选项（仍走 `/effort auto`）
- 不真正"启用 ultracode"——面板对 ultracode 仅作视觉提示与文案引导

## 4. 架构与文件结构

```
src/
├── commands/effort/
│   ├── effort.tsx              ← 改造：call() 在 args 为空时返回 <EffortPanel>，
│   │                              有参时维持原 executeEffort() 路径
│   └── index.ts                ← 不变
├── components/EffortPanel/
│   ├── EffortPanel.tsx         ← 新增：面板主体（渲染 + 键盘交互 + onDone 通道）
│   ├── effortPanelState.ts     ← 新增：纯函数 reducer（移动光标、确定选项），
│   │                              抽离便于单测
│   └── __tests__/
│       ├── EffortPanel.test.tsx        ← 渲染 / 键盘交互 / env 警告 / ultracode 提示
│       └── effortPanelState.test.ts    ← reducer 纯函数测试
```

### 复用清单（不重写）

- `executeEffort()` / `setEffortValue()` / `unsetEffortLevel()`：留在 `effort.tsx`，面板确认时调用
- `EFFORT_LEVELS` / `getDisplayedEffortLevel()` / `getEffortEnvOverride()` / `getEffortValueDescription()` / `modelSupportsEffort()`：从 `src/utils/effort.ts` 直接 import
- `useInput` 或 `useKeyboard`：从 `@anthropic/ink` 取
- `<ApplyEffortAndClose>` 组件：作为面板 Enter 后的"写入并退出"流程组件复用（或迁入 EffortPanel 内部）

### 类型层面

不动 `EffortValue` / `EffortLevel`。面板内部用一个新类型 `PanelPosition` 表示光标位置：

```ts
type PanelPosition = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultracode';
```

它仅在面板内部使用，不进入 AppState、不进入 settings.json、不参与 API 调用。

## 5. 交互流程

### 触发与初始光标

```
/effort<回车>（无参）
  → call() 检测 args === ''
  → 渲染 <EffortPanel onDone={onDone} appStateEffort={effortValue} model={model} />
  → 光标初始位置：
       env override 存在时 → env 设定的档位（让用户立刻看到生效值）
       否则 → getDisplayedEffortLevel(model, appStateEffort)
```

### 状态机

```
状态：{ cursor: PanelPosition }

事件：
  ← (ArrowLeft)    → cursor 左移一位（low 处不左移，保持 low）
  → (ArrowRight)   → cursor 右移一位（ultracode 处不右移，保持 ultracode）
  Home / h         → cursor = low
  End / l          → cursor = ultracode
  Enter            → 确认分支（见下）
  Esc / Ctrl+C / q → 取消，onDone("Effort unchanged.")
```

### 确认后的两条分支

**分支 A：cursor ∈ {low, medium, high, xhigh, max}**

```
调 executeEffort(cursor)
  → setEffortValue 写 settings + AppState
  → 拿到 result.message
onDone(result.message)
```

（与现有 `/effort high` 完全一致的消息体例，含 env override 警告）

**分支 B：cursor === 'ultracode'**

```
不调 executeEffort
onDone("ultracode 不是 effort 档位。请使用 /ultracode <context> 启动多 agent workflow。")
```

### 取消路径

不调 executeEffort、不写 AppState、不写 settings。`onDone("Effort unchanged.")`。

### 不变路径（仍走原 effort.tsx 逻辑）

- `/effort low|medium|high|xhigh|max`：直跳
- `/effort auto|unset`：unsetEffortLevel
- `/effort help|-h|--help`：help 文本
- `/effort current|status`：ShowCurrentEffort

### 焦点与键盘独占

面板挂载时通过 Ink `useInput` 抢占键盘；卸载时自动释放（与 `AskUserQuestionPermissionRequest` 一致）。

## 6. 视觉布局

### 基本形态（无 env override）

```
Effort

       Faster                                                          Smarter
       ─────────────────────────▲──────────────────────────────────────────────
       low        medium       high       xhigh        max        ultracode
                                                      xhigh + workflows

       ←/→ adjust · Enter confirm · Esc cancel
```

### 视觉规则

| 元素 | 规则 |
|---|---|
| `▲` 光标 | 跟随 cursor 状态移动，永远指向当前 cursor 位置 |
| 当前生效档位（active） | 当 cursor ≠ active 时，active 档渲染为加粗 + 旁标 `(active)`；当 cursor === active 时只显示 `▲`，避免双标记 |
| ultracode 副标签 | 固定字符串 `xhigh + workflows`，dim 色 |
| 两极文字 `Faster` / `Smarter` | 与面板等宽左右对齐；中间用一行 `─` 填充 |
| 底栏提示 | `←/→ adjust · Enter confirm · Esc cancel`，dim 色 |
| 标题 `Effort` | 加粗，居中或左对齐 |

### 双标记渲染（cursor ≠ active）

env override 时会出现，例如：

```
Effort
⚠ CLAUDE_CODE_EFFORT_LEVEL=high overrides this session

       Faster                                                          Smarter
       ────────────────────────▲────────────────────────▲──────────────────────
       low        medium      (high) active   xhigh        max        ultracode
                                                      xhigh + workflows

       ←/→ adjust · Enter confirm · Esc cancel
```

- `▲` 上方：cursor 位置（xhigh）
- `(high) active`：env 锁定的真实生效档位

两个标记视觉上必须区分：cursor 用三角符号，active 用括号文字 + 颜色。

### 模型不支持 effort 时（`modelSupportsEffort(model) === false`）

```
Effort

  当前模型 <model> 不支持 effort 参数。面板已禁用。

       Faster                                                          Smarter
       ────────────────────────────────────────────────────────────────────────
       low        medium       high       xhigh        max        ultracode

       Esc to close
```

光标不显示，左右键无效，Enter 无效，只能 Esc 退出。

### 终端窄屏（< 60 cols）适配

简化策略：宽度 < 60 时退化为垂直列表，每档一行；否则保持横向 slider。这一项**不阻塞首版**，先按横向渲染，必要时溢出，后续看实际效果再调。

## 7. 背景波纹动画（第二阶段，单独 commit）

### 触发条件

仅在 cursor 停在 `ultracode` 时启动波纹；移开时立即停止（不淡出，干脆）。常态零干扰。

### 视觉概念

ultracode 是面板的"能量溢出口"。波纹从 ultracode 字符位置（右下区域）为震源，向左/向上辐射同心圆波，铺满整个面板的留白区域（文字字符之间的空隙、`─` 分隔线的空白段）。文字层永远清晰可读。

### 字符集（强度 → 字符）

| 强度 | 字符 |
|---|---|
| 0.0 | ` ` (空格) |
| 0.1 | `·` |
| 0.3 | `∙` |
| 0.5 | `░` |
| 0.7 | `▒` |
| 0.9 | `▓` |
| 波峰 | `~` → `◌` → `○` → `◑` → `●` 循环 |

### 波纹数学

```
对每个字符格:
  dx = x - sourceX
  dy = (y - sourceY) * 1.5
  dist = sqrt(dx*dx + dy*dy)
  
  phase = dist * 0.4 - time * 0.012
  wave = sin(phase)
  falloff = max(0, 1 - dist / 40)
  intensity = max(0, wave) * falloff
  
  if (dist < 6):    // 震源附近高频涟漪
    intensity = max(intensity, 0.5 + 0.5 * sin(time * 0.02 - dist * 1.2))
  
  char = pick(intensity)
```

参数上线后调。

### 渲染策略（双层不冲突）

Ink 不支持真正的 z-index 层叠，用**字符替换**模拟：

1. 每帧生成 `height × width` 字符矩阵（背景层）
2. 渲染每个面板行时，先取该行对应的波纹字符序列，然后在文字字符应该出现的位置**覆盖**背景字符
3. 文字字符永远胜出，波纹只占空隙

### 实现位置

新增（第二阶段）：
- `src/components/EffortPanel/rippleAnimation.ts` — `pickChar` / `computeRippleLine` / `mergeLayers` 纯函数
- `src/components/EffortPanel/useRippleFrame.ts` — hook，内部调 `useAnimationFrame(60)` 返回当前帧矩阵
- 在 `EffortPanel.tsx` 的 render 中叠加（仅 cursor === 'ultracode' 时启用）

### 性能预算

- 面板 80×10 = 800 格，每帧 800 次 sin/sqrt ≈ 0.05ms
- Ink 重绘 10 行 `<Text>` 节点，与现有 Spinner 同量级
- 帧率 16fps，`useAnimationFrame` 自带 viewport 不可见暂停 + 失焦减速

### 风险与对策

| 风险 | 对策 |
|---|---|
| 波纹干扰文字可读性 | 文字字符覆盖背景字符，永远胜出；波纹颜色用 `theme.textDisabled` |
| 终端窄屏 < 60 cols | sourceX 跟随 ultracode 实际位置；窄屏时降级为单行波纹 |
| 性能（旧机器） | `useAnimationFrame` 已自带暂停/减速 |
| 测试稳定性 | 字符选择是纯函数，可固定 `time` 注入做帧快照测试 |

## 8. 数据流

### 状态来源

```
┌─────────────────────────────────────────────────┐
│ src/state/AppState.tsx                          │
│   effortValue: EffortValue | undefined          │
└─────────────────────────────────────────────────┘
              ▲
              │ useAppState(s => s.effortValue)
              │
┌─────────────────────────────────────────────────┐
│ EffortPanel.tsx                                 │
│   props: appStateEffort, model, onDone          │
│   local: cursor: PanelPosition                  │
└─────────────────────────────────────────────────┘
              │
              │ Enter 确认
              ▼
┌─────────────────────────────────────────────────┐
│ executeEffort(cursor)                           │
│   → updateSettingsForSource('userSettings', …)  │
│   → logEvent('tengu_effort_command', …)         │
│   → 返回 { message, effortUpdate? }             │
└─────────────────────────────────────────────────┘
              │
              │ <ApplyEffortAndClose> setAppState(...)
              ▼
┌─────────────────────────────────────────────────┐
│ onDone(result.message)                          │
│   → REPL 渲染 assistant 消息                    │
└─────────────────────────────────────────────────┘
```

### 优先级链（不修改）

```
env CLAUDE_CODE_EFFORT_LEVEL  >  AppState.effortValue  >  model default
```

面板只写 AppState + settings.json，不直接操作 env。env 存在时，面板可操作但顶部警告（详见 §6 双标记）。

## 9. 边界与错误处理

| 场景 | 行为 |
|---|---|
| 模型不支持 effort | 面板挂载但禁用，文字提示 + 仅允许 Esc（详见 §6） |
| env override 设定 | 顶部加黄色警告行 `⚠ CLAUDE_CODE_EFFORT_LEVEL=<value> overrides this session`；光标可移动；Enter 仍写 settings 但顶部警告解释生效值不变 |
| cursor === 'ultracode' 时 Enter | 走分支 B，输出引导文案，不调 executeEffort |
| settings 写入失败（磁盘满/权限） | `executeEffort` 现有错误路径会返回 `result.error`，面板沿用，onDone 输出错误消息 |
| 终端窄屏 < 60 cols | 退化为垂直列表，不阻塞首版 |
| 用户按 Ctrl+C 之外的中断信号 | 视同 Esc，`onDone("Effort unchanged.")` |
| 面板挂载后 AppState 被外部改变（如 `/model` 切换） | cursor **不订阅** active 变化，挂载时计算一次初始值后只跟随用户操作。若用户切了 model 想看新档位，关掉面板重开即可。简化实现，行为可预测 |

## 10. 测试计划

### 纯函数（`effortPanelState.test.ts`）

- `moveLeft(cursor)` 在 low 处保持 low
- `moveRight(cursor)` 在 ultracode 处保持 ultracode
- `home(cursor)` / `end(cursor)` 边界
- `getInitialCursor(appStateEffort, envOverride, model)` 优先级
- `isUltracode(cursor)` 守卫

### 组件（`EffortPanel.test.tsx`）

渲染：
- 无 env 时显示基本形态
- env override 时顶部警告 + 双标记
- 模型不支持时禁用面板
- ultracode 副标签 `xhigh + workflows` 出现

键盘：
- `←` 移动光标、`→` 移动光标、`Home/End` 跳转
- Enter 在普通档位 → 调用 executeEffort、onDone 收到正确 message
- Enter 在 ultracode → 不调 executeEffort、onDone 收到引导文案
- Esc → 不调 executeEffort、onDone 收到 `"Effort unchanged."`

集成（`effort.tsx` 的 call 函数）：
- 无参 → 返回 `<EffortPanel>` JSX
- 有参 → 不渲染面板，走 executeEffort

### 波纹相关（第二阶段）

- `pickChar(intensity)` 各强度边界
- `computeRippleLine` 固定 time 快照
- `mergeLayers` 文字覆盖背景、文字字符永远胜出
- `useRippleFrame` 仅在 cursor === 'ultracode' 时订阅时钟

## 11. 实现阶段划分（两个 commit）

### Commit 1：基础面板（先做）

- 新增 `src/components/EffortPanel/EffortPanel.tsx`
- 新增 `src/components/EffortPanel/effortPanelState.ts`
- 新增 `src/components/EffortPanel/__tests__/EffortPanel.test.tsx`
- 新增 `src/components/EffortPanel/__tests__/effortPanelState.test.ts`
- 改造 `src/commands/effort/effort.tsx`：无参时返回 `<EffortPanel>`，有参维持原状
- 运行 `bun run precheck`，必须零错误通过
- commit message: `feat(effort): /effort 无参时打开横向 slider 选择面板`

### Commit 2：波纹动画（基础稳定后再做）

- 新增 `src/components/EffortPanel/rippleAnimation.ts`
- 新增 `src/components/EffortPanel/useRippleFrame.ts`
- 新增对应测试
- 在 `EffortPanel.tsx` 中叠加渲染（仅 cursor === 'ultracode' 时）
- 运行 `bun run precheck`
- commit message: `feat(effort): ultracode 档位铺满波纹背景动画`

两阶段切开的好处：动画是创意工作，可能在调参上反复；基础功能稳定后即使动画翻车也能直接 revert 第二个 commit，不影响主功能。

## 12. 验收清单

- [ ] `/effort` 无参打开面板，光标停在当前生效档
- [ ] `←/→` 移动光标，到边界不再继续
- [ ] Enter 在 5 档之一时写 settings + AppState + 输出与 `/effort X` 同款消息
- [ ] Enter 在 ultracode 时输出引导文案，不写任何状态
- [ ] Esc 时不写任何状态，输出 `"Effort unchanged."`
- [ ] env override 时顶部警告 + 双标记
- [ ] 模型不支持时面板禁用，仅 Esc 可退出
- [ ] `/effort low|auto|help|current` 等原有路径行为不变
- [ ] `bun run precheck` 零错误
