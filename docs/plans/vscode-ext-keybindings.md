# Claude Code CLI 快捷键体系研究

> 读取型研究报告。目标：让 VSCode 扩展完整复刻 CLI 的快捷键与 REPL 行为。
> 所有 `file:line` 均为 2026-04-24 `feat/vscode-extension` 分支上的位置。

---

## 1. 架构速览

按键流水线分三层：

1. **捕获层（Ink framework）**
   - `packages/@ant/ink/src/keybindings/*`：通用的 Keybinding DSL、chord 机、Context priority。
   - `KeybindingSetup.tsx`（`KeybindingSetup.tsx:52`）：挂载 `ChordInterceptor`，维护 `pendingChord` ref 并提供 1000ms 超时取消（`CHORD_TIMEOUT_MS` at line 29）。
   - `ChordInterceptor`（`KeybindingSetup.tsx:211`）在所有 `useInput` 之前捕获按键，识别 chord 前缀时 `stopImmediatePropagation`。

2. **路由层（CLI 默认表）**
   - `src/keybindings/defaultBindings.ts` — 所有默认 context + binding 定义（349 行）。
   - `src/keybindings/schema.ts` — 所有合法 action 名 + context 名（Zod schema）。
   - 用户覆盖：`~/.claude/keybindings.json` → `src/keybindings/loadUserBindings.ts`。
   - 用户绑定采用“后者胜出”，可用 `null` 值解绑默认绑定。

3. **处理层（具体组件）**
   - `useKeybinding(action, handler, { context, isActive })`：单 action 注册。
   - `useKeybindings({ action: handler }, { context, isActive })`：批量。
   - 两个 hook 均定义于 `packages/@ant/ink/src/keybindings/useKeybinding.ts:34`/`:114`。
   - 组件通过 `useRegisterKeybindingContext('Chat')` 把当前 context 注入 activeContexts；Global 永远 fallback。

### Context 优先级（高 → 低）

Resolver 使用 `activeContexts` 数组的出现顺序 —— 组件注册的 context 先于 Global，“最后定义的 binding 胜出”（`resolver.ts:42-50`）。VSCode 扩展里若要复刻，必须维护一个等价的 context 栈。

### Chord 行为

- 单 chord 如 `ctrl+x ctrl+k`（`chat:killAgents`）、`ctrl+x ctrl+e`（`chat:externalEditor`）。
- 超时：1000ms 未补全则 chord 取消。
- 当某个 key 可能成为更长 chord 的前缀时，resolver 返回 `chord_started`，按键被 `stopImmediatePropagation` 吃掉（不会进文本输入）。
- Escape 在 chord 挂起时 → `chord_cancelled`，按键被吞。

### 双击机制（不走 keybinding 系统）

- `useDoublePress`（`packages/@ant/ink/src/hooks/useDoublePress.ts`，re-exported at `src/hooks/useDoublePress.ts`）。
- 专用于 **Ctrl+C**、**Ctrl+D** 和 **Esc**，因为需要“第一次 press 也有行为”（interrupt），chord 机阻止首键触发，故走独立 time-window。

---

## 2. 完整快捷键表

### 2.1 Global（全局生效）

| 触发键 | 上下文 | 作用 | 代码位置 | VSCode 实现策略 |
|-------|---------|-----|---------|---------------|
| `Ctrl+C` | Global | `app:interrupt`（双击退出 / 单击中断任务 / 中断 speculation） | defaultBindings.ts:40; useExitOnCtrlCD.ts:45; useCancelRequest.ts:217 | 必须 forward — 任务中断语义由 CLI 侧的 AbortSignal 决定 |
| `Ctrl+D` | Global | `app:exit`（空输入时双击退出） | defaultBindings.ts:41; useTextInput.ts:171; useExitOnCtrlCD.ts:45 | forward 或本地模拟双击逻辑 |
| `Ctrl+L` | Global | `app:redraw`（Ink forceRedraw — 清屏/恢复） | defaultBindings.ts:42; useGlobalKeybindings.tsx:242 | webview 本地：清屏视图并 refresh |
| `Ctrl+T` | Global | `app:toggleTodos`（切换 todo/task/teammate 列表视图） | defaultBindings.ts:43; useGlobalKeybindings.tsx:55-89 | forward — 改变 AppState.expandedView |
| `Ctrl+O` | Global | `app:toggleTranscript`（进入/退出全屏 transcript） | defaultBindings.ts:44; useGlobalKeybindings.tsx:98 | forward — REPL 状态切换 |
| `Ctrl+Shift+B` | Global | `app:toggleBrief`（KAIROS feature flag 下） | defaultBindings.ts:46; useGlobalKeybindings.tsx:176 | forward（仅 flag 启用时） |
| `Ctrl+Shift+O` | Global | `app:toggleTeammatePreview` | defaultBindings.ts:48; useGlobalKeybindings.tsx:212 | forward |
| `Ctrl+R` | Global | `history:search`（进入 history 搜索模式） | defaultBindings.ts:49; useHistorySearch.ts:237 | webview 本地：打开 history picker UI |
| `Ctrl+Shift+F` / `Cmd+Shift+F` | Global | `app:globalSearch`（QUICK_SEARCH feature） | defaultBindings.ts:54 | webview 本地 |
| `Ctrl+Shift+P` / `Cmd+Shift+P` | Global | `app:quickOpen`（QUICK_SEARCH feature） | defaultBindings.ts:56 | webview 本地 |
| `Meta+J` | Global | `app:toggleTerminal`（TERMINAL_PANEL feature） | defaultBindings.ts:60; useGlobalKeybindings.tsx:227 | forward |

### 2.2 Chat（Prompt 输入聚焦时）

| 触发键 | 上下文 | 作用 | 代码位置 | VSCode 实现策略 |
|-------|---------|-----|---------|---------------|
| `Esc` | Chat | `chat:cancel`（取消任务、出队 / 空输入双击清空 / 双击打开 MessageSelector） | defaultBindings.ts:66; useCancelRequest.ts:164; useTextInput.ts:127 (handleEscape); PromptInput.tsx:1655 (doublePressEscFromEmpty) | webview 本地（清空/退 mode）+ forward（取消任务）— 双击 fork 通过 forward |
| `Esc Esc` | Chat（空输入时） | 打开 MessageSelector（Fork from previous message） | PromptInput.tsx:1655-1658, 2344-2348 | forward — 触发后端 `openMessageSelector` 状态 |
| `Ctrl+X Ctrl+K` | Chat | `chat:killAgents`（chord：两次触发停止所有后台 agent） | defaultBindings.ts:68; useCancelRequest.ts:271 | forward（需 chord 状态管理） |
| `Shift+Tab` / `Meta+M`（Windows 无 VT 时） | Chat | `chat:cycleMode`（循环 permission modes: default/acceptEdits/plan/bypassPermissions） | defaultBindings.ts:30, 69; PromptInput.tsx:1837 | forward — 改变 toolPermissionContext.mode |
| `Meta+P` | Chat | `chat:modelPicker`（打开模型选择） | defaultBindings.ts:70; PromptInput.tsx:1813 | forward — 后端维护 UI 状态 |
| `Meta+O` | Chat | `chat:fastMode`（fast mode picker） | defaultBindings.ts:71; PromptInput.tsx:2018 | forward |
| `Meta+T` | Chat | `chat:thinkingToggle`（切换 thinking 模式） | defaultBindings.ts:72; PromptInput.tsx:1829 | forward |
| `Enter` | Chat | `chat:submit`（默认提交） | defaultBindings.ts:73; PromptInput.tsx:1968 (registerHandler) | webview 本地 — 提交走 send |
| `Shift+Enter` / `Meta+Enter` / `Opt+Enter` | Chat | 插入换行 | useTextInput.ts:258-261 | webview 本地（文本域 native 行为） |
| `\` + `Enter`（反斜杠后按回车） | Chat | 吞掉反斜杠并插入 `\n` | useTextInput.ts:252-257 | webview 本地（输入框前处理） |
| `↑` | Chat | `history:previous`（光标首行时翻历史，否则移动光标） | defaultBindings.ts:74; useTextInput.ts:270 (upOrHistoryUp) | webview 本地 + fallback forward 历史请求 |
| `↓` | Chat | `history:next`（类似上面） | defaultBindings.ts:75; useTextInput.ts:294 | webview 本地 + fallback forward |
| `Ctrl+_` | Chat | `chat:undo`（传统终端） | defaultBindings.ts:80; PromptInput.tsx:1708 | webview 本地（undo 栈） |
| `Ctrl+Shift+-` | Chat | `chat:undo`（Kitty protocol） | defaultBindings.ts:81 | webview 本地 |
| `Ctrl+X Ctrl+E` | Chat | `chat:externalEditor`（chord：打开 $EDITOR 编辑 prompt） | defaultBindings.ts:83; PromptInput.tsx:1736 | forward — 只有 CLI 能启动外部编辑器 |
| `Ctrl+G` | Chat | `chat:externalEditor`（单键备选） | defaultBindings.ts:84 | forward |
| `Ctrl+S` | Chat | `chat:stash`（存入/弹出暂存） | defaultBindings.ts:85; PromptInput.tsx:1783 | webview 本地或 forward |
| `Ctrl+V`（非 Windows） / `Alt+V`（Windows） | Chat | `chat:imagePaste`（从剪贴板贴图） | defaultBindings.ts:15, 87; PromptInput.tsx:1936 | forward — 需要读系统剪贴板 |
| `Shift+↑` | Chat | `chat:messageActions`（MESSAGE_ACTIONS feature — 进入消息操作光标） | defaultBindings.ts:89; PromptInput.tsx:2012 | forward |
| `Space`（按住） | Chat | `voice:pushToTalk`（VOICE_MODE feature） | defaultBindings.ts:96; useVoiceIntegration.tsx:383 | forward（需音频权限） |

### 2.3 Autocomplete（补全菜单可见时）

| 触发键 | 作用 | 代码位置 |
|-------|-----|---------|
| `Tab` | `autocomplete:accept` | defaultBindings.ts:102; useTypeahead.tsx:1418 |
| `Esc` | `autocomplete:dismiss` | defaultBindings.ts:103; useTypeahead.tsx:1423 |
| `↑` | `autocomplete:previous` | defaultBindings.ts:104 |
| `↓` | `autocomplete:next` | defaultBindings.ts:105 |
| `Ctrl+P` | autocomplete previous（`handleKeyDown` 直接处理，绕过 keybinding 系统） | useTypeahead.tsx:1542 |
| `Ctrl+N` | autocomplete next | useTypeahead.tsx:1536 |

VSCode 实现：**webview 本地**完全托管，最低延迟。只在接受补全时向 CLI 同步输入值。

### 2.4 Transcript（全屏历史视图）

| 触发键 | 作用 | 代码位置 |
|-------|-----|---------|
| `Ctrl+E` | `transcript:toggleShowAll`（展开/折叠全部消息） | defaultBindings.ts:171; useGlobalKeybindings.tsx:145 |
| `Ctrl+C` / `Esc` / `q` | `transcript:exit` | defaultBindings.ts:172-176; useGlobalKeybindings.tsx:154 |
| `/` | 进入 transcript 搜索模式（类 less） | REPL.tsx:5127 |
| `n` / `N` | 下一个/上一个搜索结果（less-style） | REPL.tsx:5140 |
| `[` | 强制 dump-to-scrollback | REPL.tsx:5186 |
| `v` | 用 $VISUAL/$EDITOR 打开完整 transcript | REPL.tsx:5194 |
| `g` / `G` | 顶部/底部（modal pager） | ScrollKeybindingHandler.tsx:1009-1013 |
| `j` / `k` | line down/up（less-style） | ScrollKeybindingHandler.tsx:1017-1019 |
| `Space` | full page down | ScrollKeybindingHandler.tsx:1023 |
| `b` | full page up | ScrollKeybindingHandler.tsx:1025 |
| `Ctrl+U` | half page up | ScrollKeybindingHandler.tsx:985 |
| `Ctrl+D` | half page down | ScrollKeybindingHandler.tsx:987 |
| `Ctrl+B` | full page up | ScrollKeybindingHandler.tsx:989 |
| `Ctrl+F` | full page down | ScrollKeybindingHandler.tsx:991 |

### 2.5 Scroll（通用滚动，全屏或 transcript）

| 触发键 | 作用 | 代码位置 |
|-------|-----|---------|
| `PageUp` | `scroll:pageUp` | defaultBindings.ts:206 |
| `PageDown` | `scroll:pageDown` | defaultBindings.ts:207 |
| 滚轮向上 | `scroll:lineUp` | defaultBindings.ts:208 |
| 滚轮向下 | `scroll:lineDown` | defaultBindings.ts:209 |
| `Ctrl+Home` | `scroll:top` | defaultBindings.ts:210 |
| `Ctrl+End` | `scroll:bottom` | defaultBindings.ts:211 |
| `Ctrl+Shift+C` | `selection:copy`（文本选区复制） | defaultBindings.ts:218 |
| `Cmd+C` | `selection:copy`（Kitty protocol） | defaultBindings.ts:219 |

### 2.6 HistorySearch（Ctrl+R 激活）

| 触发键 | 作用 | 代码位置 |
|-------|-----|---------|
| `Ctrl+R` | `historySearch:next` | defaultBindings.ts:182 |
| `Esc` / `Tab` | `historySearch:accept` | defaultBindings.ts:183-184 |
| `Ctrl+C` | `historySearch:cancel` | defaultBindings.ts:185 |
| `Enter` | `historySearch:execute` | defaultBindings.ts:186 |

### 2.7 Settings / Confirmation / FormField / Tabs / Task 等

这些 context 内部绑定详见 `defaultBindings.ts:108-348`。典型：

- **Confirmation**（权限弹窗）：`Enter`=`confirm:yes`, `Esc`=`confirm:no`, `↑/↓`=prev/next, `Tab`=nextField, `Space`=toggle, `Shift+Tab`=cycleMode, `Ctrl+E`=toggleExplanation, `Ctrl+D`=permission:toggleDebug。
- **Settings**：`/`=search, `r`=retry, `Enter`=close (save), `Space`=toggle, `j/k`=nav, `Ctrl+P/N`=nav。
- **Task**（前台 bash/agent 运行时）：`Ctrl+B`=`task:background`（tmux 用户需按两次）。
- **ThemePicker**：`Ctrl+T`=`theme:toggleSyntaxHighlighting`（覆盖 Global 的 toggleTodos）。
- **MessageSelector**（rewind dialog）：`↑/↓/j/k/Ctrl+P/N`=导航, `Shift+K/J`/`Ctrl+Up/Down`/`Meta+Up/Down`=jump to top/bottom, `Shift+↑/↓`=同。
- **DiffDialog**：`←/→` prev/next source；`↑/↓` prev/next file；`Enter`=viewDetails；`Esc`=dismiss。
- **ModelPicker**：`←/→` effort 加减；`Space`=toggle1M。
- **Attachments**（图片附件导航）：`←/→` prev/next；`Backspace`/`Delete`=remove；`↓`/`Esc`=exit。
- **Footer**（底栏 task/team/diff/loop 指示器）：`↑/↓` + `Ctrl+P/N`, `←/→` prev/next, `Enter`=openSelected, `Esc`=clearSelection。

### 2.8 Readline-style 文本编辑（Chat 输入框内，不走 keybinding 系统）

`src/hooks/useTextInput.ts:225-246`：

| 键 | 作用 |
|----|-----|
| `Ctrl+A` | startOfLine |
| `Ctrl+B` | 左移一格 |
| `Ctrl+E` | endOfLine |
| `Ctrl+F` | 右移一格 |
| `Ctrl+H` | deleteTokenBefore / backspace |
| `Ctrl+K` | kill to line end |
| `Ctrl+N` | 下行/历史下 |
| `Ctrl+P` | 上行/历史上 |
| `Ctrl+U` | kill to line start |
| `Ctrl+W` | killWordBefore |
| `Ctrl+Y` | yank（粘贴 kill ring） |
| `Meta+B` | 前一个词 |
| `Meta+F` | 下一个词 |
| `Meta+D` | deleteWordAfter |
| `Meta+Y` | yankPop |
| `Meta+Backspace`/`Ctrl+Backspace` | killWordBefore |
| `Home`/`End` | 行首/行尾 |
| `Ctrl+←` / `Meta+←` / `Fn+←` | prevWord |
| `Ctrl+→` / `Meta+→` / `Fn+→` | nextWord |

**注意**：这些绑定在 `useTextInput` 内部通过 `mapKey()` 直接派发，不经过 keybinding 系统，因此 **用户无法通过 `keybindings.json` 改这些**。

---

## 3. 输入触发器（非按键型）

输入内容首字符或内联字符触发的行为，定义在 `src/components/PromptInput/inputModes.ts` 以及 `src/hooks/useTypeahead.tsx`：

### 3.1 `/` — Slash command

- 触发：输入以 `/` 开头时触发 slash-command 补全（`src/utils/suggestions/commandSuggestions.ts:561`，`findSlashCommandPositions`）。
- 提交：REPL.tsx:3848 直接识别 `input.trim().startsWith('/')`，命中命令走 `processSlashCommand`。
- Transcript 内 `/` 激活搜索（REPL.tsx:5127）。

### 3.2 `!` — Bash mode

- 触发：在空输入光标位置敲 `!`，`isInputModeCharacter(input)` 返回 true（inputModes.ts:31），切换到 `bash` mode。
- 提交：`mode === 'bash'` 时走 `processBashCommand`（processUserInput.ts:520）。
- 显示：左下角 `PromptInputModeIndicator.tsx` 显示红色 `!`。

### 3.3 `@` — File/agent mention

- 触发：输入 `@` 后跟路径字符，正则 `HAS_AT_SYMBOL_RE`（useTypeahead.tsx:55）匹配后触发文件补全。
- 特殊：支持 CJK/fullwidth 字符（`\p{L}\p{N}\p{M}`）。
- 支持 `@file#L10-L20` 行范围（PromptInput.tsx:1691）。
- IDE 发来的 at-mention 走 `useIdeAtMentioned`（src/hooks/useIdeAtMentioned.ts）。

### 3.4 `#` — **不是** 输入模式触发器

搜索代码后确认 `#` 不在 `isInputModeCharacter` 中。`#` 仅：
- 在 Slack channel 补全正则 `HASH_CHANNEL_RE`（useTypeahead.tsx:56）中作为 slack 频道前缀。
- 内存命令通过 `/memory` slash command 调用（`src/commands/memory/memory.tsx` 和 `src/components/memory/MemoryFileSelector.tsx`）。
- 没有“以 `#` 开头提交 = 记入 CLAUDE.md” 的直接行为（和早期版本不同，已改为走 `/memory` 命令）。

### 3.5 `?` — Help toggle

- onChange 入口 PromptInput.tsx:1142：`if (value === '?')` 切换 helpOpen 状态。
- 必须是整个输入都是 `?`（即单独打一个问号）才触发。

---

## 4. 特殊模式

### 4.1 Esc+Esc Fork（重点）

在 **Chat 空输入**状态下连续两次 Esc：

1. 第一次 Esc：`handleEscape`（useTextInput.ts:127）双击器触发 "show=true" 阶段 → 显示 "Esc again to clear" 通知（原值非空时）；若原值为空，showMessage 阶段 no-op。
2. 第二次 Esc 在 1 秒内：
   - 若原输入非空 → 清空 input + 入历史记录。
   - 若原输入为空 **且** `messages.length > 0` **且** 不 isLoading → `doublePressEscFromEmpty()`（PromptInput.tsx:1655, 2344-2348）→ 调用 `onShowMessageSelector()` → 打开 fork-from-previous-message 对话框。

代码路径：
```
PromptInput.tsx:2344-2348 → doublePressEscFromEmpty → onShowMessageSelector
REPL.tsx:4393 handleShowMessageSelector → setIsMessageSelectorVisible(true)
REPL.tsx:6249 <MessageSelector />
```

### 4.2 Ctrl+C 双击退出

`useExitOnCtrlCD`（src/hooks/useExitOnCtrlCD.ts:45）：
- 第一次 Ctrl+C：显示 "Press Ctrl-C again to exit"。
- 第二次在 `DOUBLE_PRESS_TIMEOUT_MS` 内：调用 `useApp().exit()`。
- **但如果有正在运行的任务**（`abortSignal` active）：第一次 Ctrl+C 先中断任务（`useCancelRequest.ts:217`），不进入双击流程。
- **且 speculation 运行中**：抢先调用 `abortSpeculation`（PromptInput.tsx:2078）。

### 4.3 Ctrl+D 双击退出

- `useTextInput.ts:171 handleCtrlD`：
  - 输入非空 → 向前删（iPython-style）。
  - 输入为空 → `handleEmptyCtrlD` 双击 → 退出。

### 4.4 Ctrl+X chord 家族

通过 `ctrl+x` 作为 chord prefix 避开 readline 编辑键：
- `Ctrl+X Ctrl+K` → kill agents（两次确认）
- `Ctrl+X Ctrl+E` → 外部编辑器（readline-native 绑定）

Chord 超时 1000ms；Esc 取消。

### 4.5 Bash/Memory/Orphaned-permission/Task-notification mode

`PromptInputMode` 联合类型（`src/types/textInputTypes.ts:265`）：
- `'prompt'` | `'bash'` | `'orphaned-permission'` | `'task-notification'`
- `bash` 通过输入 `!` 进入；`Backspace` 退出（`onChange` 中 `mode !== 'prompt' && input === ''` 的分支）。
- 其余两个由系统事件触发，不是用户按键。

### 4.6 Transcript 搜索（类 less）

- `/` 进搜索输入条 → 输入 → Enter 关闭条但保留高亮。
- `n`/`N` 跳转下一个/上一个匹配。
- `Esc`/`q`/`Ctrl+C` 退 transcript。

---

## 5. VSCode 扩展实现指南

### 5.1 必须在 webview 本地处理的（响应速度要求）

**原则**：所有与"正在输入文本"直接相关的按键必须在 webview 中同步处理，延迟 <16ms。

1. **Readline 编辑类**（Ctrl+A/B/E/F/H/K/N/P/U/W/Y + Meta 族）
   - 直接在输入框组件的 `keydown` handler 里实现。
   - 参考 `src/hooks/useTextInput.ts` 中 `handleCtrl` / `handleMeta` / `mapKey` 的派发表。
   - 需维护 kill ring（状态：`killRing: string[]`）。

2. **Autocomplete 导航**（Tab/Esc/↑/↓/Ctrl+P/N）
   - 建议本地维护建议列表并在 webview 内循环，通过 `@mention` / `/command` 补全 API 向后端请求候选。

3. **Enter / Shift+Enter / Meta+Enter 分歧**
   - 单 Enter = submit；Shift/Meta/Opt+Enter = 换行。
   - `\` + Enter = 删反斜杠插换行（可选实现）。

4. **↑/↓ 历史导航 fallback**
   - 多行输入时先尝试光标移动，到尽头再走历史 — 本地光标逻辑决定。
   - 历史数据需从 CLI 侧同步（startup 时拉一次 + 新提交时 append）。

5. **Esc 清空 / Esc Esc clear**（单键第一次不清空，仅显示提示，1000ms 窗口内第二次才清空）
   - 本地维护 DoublePress 状态机。

6. **输入触发器匹配**（`/`, `!`, `@` 首字符检测 + 正则 `HAS_AT_SYMBOL_RE` / `AT_TOKEN_HEAD_RE`）
   - 正则照抄 useTypeahead.tsx:51-56。

7. **Modal pager 键**（transcript 视图下的 g/G/j/k/Space/b/Ctrl+U/D/B/F）
   - 通常 VSCode 扩展会把 transcript 作为 webview 内的滚动视图，这些键直接映射到 scrollBy。

### 5.2 通过 package.json `contributes.keybindings` 注册的

**原则**：需要在 VSCode 窗口级触发（而非只在 webview 聚焦时）或要求用户可自定义的全局快捷键。

```json
{
  "contributes": {
    "keybindings": [
      { "command": "claudeCode.toggleTranscript",    "key": "ctrl+o",        "when": "claudeCode.active" },
      { "command": "claudeCode.toggleTodos",         "key": "ctrl+t",        "when": "claudeCode.active" },
      { "command": "claudeCode.interrupt",           "key": "ctrl+c",        "when": "claudeCode.focused && claudeCode.running" },
      { "command": "claudeCode.exit",                "key": "ctrl+d",        "when": "claudeCode.focused && !claudeCode.hasInput" },
      { "command": "claudeCode.redraw",              "key": "ctrl+l",        "when": "claudeCode.focused" },
      { "command": "claudeCode.historySearch",       "key": "ctrl+r",        "when": "claudeCode.inputFocused" },
      { "command": "claudeCode.cycleMode",           "key": "shift+tab",     "when": "claudeCode.inputFocused" },
      { "command": "claudeCode.modelPicker",         "key": "alt+p",         "when": "claudeCode.inputFocused" },
      { "command": "claudeCode.thinkingToggle",      "key": "alt+t",         "when": "claudeCode.inputFocused" },
      { "command": "claudeCode.fastMode",            "key": "alt+o",         "when": "claudeCode.inputFocused" },
      { "command": "claudeCode.imagePaste",          "key": "ctrl+v",        "mac": "cmd+v",  "when": "claudeCode.inputFocused" },
      { "command": "claudeCode.imagePaste",          "key": "alt+v",         "win": "alt+v",  "when": "claudeCode.inputFocused && isWindows" },
      { "command": "claudeCode.externalEditor",      "key": "ctrl+g",        "when": "claudeCode.inputFocused" },
      { "command": "claudeCode.stash",               "key": "ctrl+s",        "when": "claudeCode.inputFocused" }
    ]
  }
}
```

**chord 注意**：VSCode 支持 chord 语法 `"ctrl+x ctrl+k"`。

### 5.3 通过 control_request 转发给 CLI 的

**原则**：行为依赖 CLI 的运行时状态（tasks、modes、permissions）或副作用只能在 CLI 侧发生。

| 快捷键 / 动作 | 原因 | 建议 control_request action |
|--------------|-----|---------------------------|
| `app:interrupt` (Ctrl+C in task) | 需要 abort AbortSignal + 清 toolUseConfirmQueue | `interrupt` |
| `app:exit` (Ctrl+D 双击) | 整个进程退出 | `exit` |
| `chat:cancel` (Esc) | 相同 | `cancel` |
| `chat:killAgents` (Ctrl+X Ctrl+K) | 停止后台 agents | `kill_agents` |
| `chat:cycleMode` (Shift+Tab) | 改 toolPermissionContext.mode | `cycle_permission_mode` |
| `chat:modelPicker` / `fastMode` / `thinkingToggle` | 后端管理 overlay 状态 | `toggle_model_picker`/`toggle_fast_mode`/`toggle_thinking` |
| `chat:externalEditor` | 需要 spawn $EDITOR | `open_external_editor` |
| `chat:imagePaste` | 读系统剪贴板 + image resize | `paste_image` |
| `chat:stash` | 配置持久化 hasUsedStash | `stash_prompt` |
| `app:toggleTranscript` / `toggleTodos` / `toggleTeammatePreview` / `toggleBrief` | AppState 切换 | `toggle_view` with payload |
| `history:search` (Ctrl+R) | 历史列表来自 CLI | `start_history_search` |
| `history:previous/next` (↑/↓ at edge) | 从历史缓冲取值 | `history_nav` |
| `Esc Esc` → MessageSelector | 后端 fork 消息树 | `open_message_selector` |
| `voice:pushToTalk` (Space hold) | 音频捕获 | `voice_ptt_down/up` |
| Tool permission `confirm:*` | 权限提示由后端发出 | `permission_response` |
| `task:background` (Ctrl+B) | 后台化运行中任务 | `background_task` |
| `footer:*` / `messageSelector:*` / `diff:*` 等 dialog 内动作 | 纯 UI，但 dialog 由 CLI 创建 | 复用 dialog protocol |

### 5.4 协议建议

- 给 webview 实现一个 `sendKeybindingAction(action: string, context: string)` 接口，直接复用 CLI 的 action 名（`src/keybindings/schema.ts:64-173` 是权威清单，共 ~75 个 action）。
- 后端侧新增一个 `keybinding-action` control_request 消息类型：
  ```json
  {"type": "keybinding-action", "action": "chat:cycleMode", "context": "Chat"}
  ```
- 后端在 REPL 主 process 内直接调用 `keybindingContext.invokeAction(action)`（`KeybindingContext.tsx:121-136`），复用现有 handler 注册表，**不需要**改任何业务逻辑。
- 对于 chord 类（`ctrl+x ctrl+k`），webview 直接发完整 chord string，后端查 bindings 表解析。

### 5.5 Chord 状态机（webview 需实现）

```
state: { pending: Chord | null, timeoutId: number | null }

on keydown(key):
  if pending:
    clearTimeout(timeoutId)
    testChord = pending + [key]
    if bindings matches testChord fully:
      fire action; pending = null
    elif bindings has testChord as prefix:
      pending = testChord; setTimeout(1000ms, () => pending = null)
    else:
      pending = null; fall through
  else:
    if bindings has [key] as prefix of longer chord:
      pending = [key]; setTimeout(1000ms, ...)
    else:
      fire action or fall through
```

参考 `packages/@ant/ink/src/keybindings/resolver.ts:166` (`resolveKeyWithChordState`)。

### 5.6 用户 overrides

最好在 VSCode settings 暴露：
```json
{
  "claudeCode.keybindings": [
    { "context": "Chat", "bindings": { "ctrl+k": "chat:modelPicker" } }
  ]
}
```
把这份 config push 给 CLI，让 CLI 的 `loadUserBindings.ts` 合并，或者在 webview 侧单独维护 override 表（两边保持一致）。

---

## 6. 常见陷阱

1. **Ctrl+M === Enter**（`reservedShortcuts.ts:28`）— 终端里两者都是 CR；不要分别绑定。
2. **Ctrl+C / Ctrl+D 硬编码**（reservedShortcuts.ts:18-26）— 用户 keybindings.json 里绑会被拒绝。
3. **Alt / Option 在终端 === Meta**（`match.ts:60-78`）— 终端无法区分，配置里 `alt+k` 和 `meta+k` 等价。
4. **Super (Cmd/Win)** 只在支持 kitty keyboard protocol 的终端上到达 — VSCode webview 没有这个限制，可以正常绑 Cmd。
5. **Escape quirk**（`match.ts:100; resolver.ts:88`）：Ink 在收到 Escape 时会同时置 `key.meta=true`；resolver 专门忽略这个。VSCode 不需要这个 workaround。
6. **Windows Terminal 的 Shift+Tab**（`defaultBindings.ts:21-30`）：没 VT mode 时 shift+tab 收不到，降级成 `Meta+M`。VSCode webview 收得到 shift+tab，直接用。
7. **Space voice push-to-talk 破坏输入**（`defaultBindings.ts:93-96`）：Space 被 `voice:pushToTalk` 吃掉后，Space 不能打入 prompt。VOICE_MODE feature 关闭时不注册。
8. **`feature()` 不是函数调用**：很多绑定门控在 `if (feature('FLAG'))` 内（Bun compile-time 展开）。VSCode 扩展需要显式读 feature flags 或由后端在 runtime 告知启用了哪些 action。

---

## 7. 参考文件清单

- `packages/@ant/ink/src/keybindings/types.ts` — 类型定义
- `packages/@ant/ink/src/keybindings/parser.ts` — 字符串 → ParsedKeystroke
- `packages/@ant/ink/src/keybindings/match.ts` — Ink key + input → bindings 匹配
- `packages/@ant/ink/src/keybindings/resolver.ts` — chord 解析主逻辑
- `packages/@ant/ink/src/keybindings/KeybindingContext.tsx` — React context + handler registry
- `packages/@ant/ink/src/keybindings/KeybindingSetup.tsx` — ChordInterceptor + 配置加载
- `packages/@ant/ink/src/keybindings/useKeybinding.ts` — Hook API
- `packages/@ant/ink/docs/08-keybindings.md` — 系统文档
- `src/keybindings/defaultBindings.ts` — **CLI 默认绑定总表（权威）**
- `src/keybindings/schema.ts` — Zod schema + 所有 action/context 白名单
- `src/keybindings/reservedShortcuts.ts` — 不可重绑的键
- `src/keybindings/loadUserBindings.ts` — 用户配置合并逻辑
- `src/keybindings/KeybindingProviderSetup.tsx` — CLI wrapper
- `src/hooks/useGlobalKeybindings.tsx` — Global context handlers
- `src/hooks/useCancelRequest.ts` — Escape / Ctrl+C / chat:killAgents
- `src/hooks/useExitOnCtrlCD.ts` — 双击退出
- `src/hooks/useHistorySearch.ts` — Ctrl+R 搜索
- `src/hooks/useTextInput.ts` — readline 编辑 + Esc double-press
- `src/hooks/useTypeahead.tsx` — 补全 + Tab 行为
- `src/components/PromptInput/PromptInput.tsx` — Chat handlers 集中注册
- `src/components/PromptInput/inputModes.ts` — `!` / bash mode 检测
- `src/components/ScrollKeybindingHandler.tsx` — 滚动 + modal pager
- `src/screens/REPL.tsx` — REPL 根组件（KeybindingSetup 挂载点）
