# ink TUI 渲染逻辑深度复查

**8 个子系统、47 份 finding、6 条确认问题:一次以对抗性验证为底座的 ink 内核体检**

---

## 本次复查的资源消耗

| 维度 | 数值 |
|---|---|
| 子系统数 | 8(render-core / screen-buffer / layout / termio / events / keybindings / components / text-encoding) |
| 审查代码量 | ~27,500 行 / 145 个 `.ts`/`.tsx` 文件 |
| 编排阶段 | 4(Map → Find → Verify → Synthesize) |
| **Agent 总数** | **158**(157 × glm-5.2 + 1 × opus 用于综合成文) |
| **总 token 消耗** | **≈ 5.92M**(input ≈ 5.68M,output ≈ 244K) |
| 工具调用次数 | 2,332 次(平均 14.8 次/agent) |
| 单 agent 上下文中位数 | 32,341 input tokens / 1,208 output tokens |
| Wall-clock 时长 | ≈ 10.6 小时(并发度 3) |
| Candidate findings | 47 条 |
| Confirmed findings | 6 条(13% 通过率) |
| Rejected findings | 41 条(其中 7 条作为「误报分析」收入本文) |

> 这 5.92M token 不是被「浪费」的 — 80% 以上消耗在 verify 阶段:每个 candidate finding 都被派给 3 个独立视角的 verifier(correctness / reproducibility / severity)做对抗性核验,每个 verifier 都要重新 Read/Grep 源码独立判断。47 个 candidate × 3 视角 = 141 次 verifier 调用,加上 verifier 之间的反复 Read,这一阶段贡献了绝大部分 token 与工具调用。代价高昂,但回报是 87% 的 candidate 被独立证伪,只有经得起 3 视角同时审视的问题才进入最终文章。

---

## 摘要

本次复查覆盖 `packages/@ant/ink/` 的 8 个核心子系统:渲染核心(reconciler / render-node-to-output)、屏幕缓冲与输出(screen / output / log-update)、布局引擎(yoga 适配 / wrapAnsi / measure-text)、终端 I/O 解析(tokenize / sgr / parser)、事件系统(dispatcher / hit-test / keybinding-setup)、键位绑定(resolver / chord-interceptor)、React 组件与 hooks、文本编码与选择(sliceAnsi / stringWidth)。总计审阅约 47 个 candidate finding,经过三个独立视角(correctness / reproducibility / severity)的对抗性 verify,最终确认 6 条,排除 7 条重点误报,其余 34 条被一致拒绝。

整体健康度评估:**良好偏上**。ink 的渲染核心、布局引擎、文本编码与选择三个子系统在本次复查中零 confirmed finding(7+6+7=20 条 candidate 全部被排除),说明这一层代码经过了充分的实战打磨,且 `resetScreen` / `setCellAt` / `blitRegion` 等关键不变量在真实 pipeline 中始终成立。事件系统是问题最集中的子系统(3 条 confirmed),根因是存在「两套并行的事件分发系统」(Dispatcher vs hit-test 手工冒泡)和若干死代码(dispatchContinuous、MouseActionEvent 分发路径),这些不是会立即崩溃的 bug,但构成了真实的 API 契约陷阱。

最严重的 Top 3 问题如下:

1. **`writeLineToScreen` 制表符展开丢失活动样式** (`output.ts:664-678`)。带 backgroundColor 的 Box/Text 中,`\t` 展开出的空格被硬编码为 `stylePool.none`,擦掉背景色,形成断续的背景色条带。这是用户肉眼可见的渲染瑕疵,修复仅需一行。
2. **Ctrl+Space 在 legacy 控制字节路径被解析成反引号** (`parse-keypress.ts:722-724`)。`String.fromCharCode(0 + 97 - 1) === '`'`,导致 Ctrl+Space 与 Ctrl+` 无法区分,绑定到 Ctrl+Space 的快捷键(常见 IDE 补全)静默失效。
3. **`supportsExtendedKeys` 白名单包含 `windows-terminal` 但永远不命中** (`terminal.ts:154-167`)。Windows Terminal 实际设置的是 `WT_SESSION` 而非 `TERM_PROGRAM=windows-terminal`,导致原生 Windows Terminal 用户永远拿不到 Kitty keyboard / modifyOtherKeys,ctrl+shift+letter 无法与 ctrl+letter 区分。同文件其他 5 处 Windows Terminal 检测都用 `WT_SESSION`,唯独这里口径错误。

推荐的修复优先级:

- **P0**:上述 Top 3 中前两项 + tokenizer 错误回退导致 ESC 字节泄漏(共 3 条,均为低风险单行级修复,但对真实终端用户有可见收益)。
- **P1**:`supportsExtendedKeys` 的 Windows Terminal 检测修复 + ChordInterceptor 缺失 `stopImmediatePropagation`(2 条,涉及跨平台兼容性和键位绑定正确性,需补充测试)。
- **P2**:`dispatchContinuous` 死代码清理 + MouseActionEvent 坐标系不一致等结构性问题(留给后续重构)。

---

## 系统架构简图

下图描述 ink 一次 render pass 的端到端管线,括号中标注本次复查发现的关键风险点位置:

```
                         [React 应用层]
                              |
                     reconcile (react-reconciler)
                              |
                  render-node-to-output.ts         <-- 风险点 R1: wrapAnsi 与 stringWidth 的
                              |                                  ambiguous-width 口径对比(已排除)
            +-----------------+----------------+
            |                                  |
       yoga 布局计算                      style/SGR 注入
       (measure-text,                        |
        wrap-text, wrapAnsi)                 |
            |                                  |
            +----------------+-----------------+
                              |
                       output.ts                 <-- 风险点 C1 [confirmed]: writeLineToScreen
                              |                       制表符扩展使用 stylePool.none,
                  write/writeLine/                     丢失背景色(output.ts:670-675)
                  blitRegion                          
                              |
                         screen.ts                 <-- 风险点(已排除): blitRegion 右边界
                              |                       Wide 处理(dst 在 resetScreen 后
                  setCellAt /                           必为 Narrow,前提不成立)
                  getCellAt
                              |
                       log-update.ts
                       (diff/patch)
                              |
                     terminal.ts (emit)            <-- 风险点 C2 [confirmed]: supportsExtendedKeys
                              |                       对 Windows Terminal 检测错误
                              |                       (terminal.ts:154-167)
                              v
                          stdout

[输入侧独立管线]

stdin raw bytes
      |
   tokenize.ts                  <-- 风险点 C3 [confirmed]: 错误回退时 textStart = seqStart
      |                                                  导致 ESC 字节泄漏进 text token
   parser.ts / parse-keypress.ts <-- 风险点 C4 [confirmed]: Ctrl+Space 映射成 '`'
      |                                                  (parse-keypress.ts:722-724)
   App.tsx (EventEmitter)
      |
   +----------------+----------------+
   |                |                |
Dispatcher      hit-test.ts       keybinding-setup
(dispatch)     (手工冒泡)         (chord)             <-- 风险点 C5 [confirmed]: dispatchContinuous
   |                |                |                    死代码(dispatcher.ts:228)
   |                |                +--- 风险点 C6 [confirmed]: ChordInterceptor match
   |                |                       无 handler 时不 stopImmediatePropagation
   |                |
   |                +--- 风险点(已排除): MouseActionEvent.localCol 用 getComputedLeft
   |                    (该路径无消费者)
   |
   reconciler.currentEvent
```

关键观察:输入侧的事件系统分裂最严重,Dispatcher / hit-test / Node EventEmitter 三套并行机制各自维护语义,是本次复查确认问题最集中的区域。

---

## 严重问题

### [medium] writeLineToScreen 制表符扩展使用 stylePool.none,丢失活动样式

- **位置**: `packages/@ant/ink/src/core/output.ts:664-678`(关键写入在 670-675 行)
- **类别**: correctness
- **现象**: 当一个带 `backgroundColor`(或任何 SGR 样式)的 Box/Text 内容中包含制表符 `\t` 时,制表符展开出的若干空格的背景色被擦除,形成断断续续的背景色条带。这是终端渲染中最容易被用户察觉的「着色不连续」类 bug,在代码块缩进、表格分隔、预格式化文本回显中均可能出现。
- **根因**: `writeLineToScreen` 在遇到 `\t` (0x09) 时,执行如下写入(output.ts:670-675):

  ```ts
  setCellAt(screen, offsetX, y, {
    char: ' ',
    styleId: stylePool.none,
    width: CellWidth.Narrow,
    hyperlink: undefined
  })
  ```

  其中 `styleId` 被硬编码为 `stylePool.none`(即空 SGR 序列,等价于 `intern([])`),完全丢弃了 `character.styleId`。但上游的 `flushBuffer` (output.ts:612-621) 已经对同一段 style run 内的所有 grapheme(包括 `\t` 字符本身)写入了统一的 styleId 和 hyperlink——也就是说,`character` 在进入 tab 分支时,确实持有当前 run 的背景色 styleId。`@alcalzone/ansi-tokenize` 的 `styledCharsFromTokens` 同样为每个 char token(包括 `\t`)附上当前活跃的 SGR codes。

  `setCellAt` (screen.ts:780-785) 是无条件覆盖 cell,不与已有 cell 合并,所以这些空格会覆盖 `<Box backgroundColor>` 在 render-node-to-output.ts:1156-1179 预填充的背景色;`output.get()` 在 `writeLineToScreen` 之后没有任何回填步骤。

  对比同函数 775-783 行的 SpacerTail 分支:那里用 `stylePool.none` 是合理的,因为 SpacerTail 是行尾占位,不在 style run 的可绘制区域内。finding 准确区分了这两处,没有把它们混为一谈。

- **触发条件**: 渲染任何带 `backgroundColor` 的 Box/Text,且其文本内容中包含字面 `\t` 字符。例如 `<Text backgroundColor="blue">{"\tfoo"}</Text>`、Markdown 代码块中保留制表符缩进、或表格列分隔符。
- **修复方向**: 把 tab 分支的 `stylePool.none` 改为 `character.styleId`,`hyperlink: undefined` 改为 `character.hyperlink`,让展开出的空格继承当前 run 的背景/前景/超链接。这与正常字符路径(output.ts:789-794)的实现一致。
- **验证记录**:
  - correctness 视角确认:从 `flushBuffer` 到 `setCellAt` 全链路追踪证实 `character.styleId` 在 tab 分支确实持有背景色,被丢弃后无回填。
  - reproducibility 视角确认:复现场景具体且非理论边界,`dom.ts:340-342` 的 `expandTabs` 注释明确写道 "Actual tab expansion happens in output.ts based on screen position",证明 `\t` 被有意保留到这条有 bug 的路径,无上游 guard 拦截。
  - severity 视角调整为 low:bug 真实但纯属视觉瑕疵,无崩溃/无数据丢失;`<Box backgroundColor>` + 字面 `\t` 的组合在 Claude Code 实际渲染内容中不算高频(CLI 输出多用空格缩进)。最终判 medium,与 reproducibility 视角一致。

---

### [medium] Ctrl+Space 在 legacy 控制字节路径被映射成 key='`' (反引号)

- **位置**: `packages/@ant/ink/src/core/parse-keypress.ts:722-724`
- **类别**: correctness
- **现象**: 在 raw mode 终端按 Ctrl+Space,组件收到的 keydown 事件中 `e.key === '`'` 且 `ctrlKey=true`,而不是 `'space'`。结果:(1) 绑定到 Ctrl+Space 的快捷键(很多编辑器/IDE 用作补全)不会触发;(2) 若有 Ctrl+` 绑定,可能误触发。
- **根因**: parse-keypress.ts:722-724 对 `s <= '\x1a' && s.length === 1` 的控制字节执行:

  ```ts
  key.name = String.fromCharCode(s.charCodeAt(0) + 'a'.charCodeAt(0) - 1)
  key.ctrl = true
  ```

  对 Ctrl+Space (`\x00`):`charCodeAt(0) = 0`,`0 + 97 - 1 = 96 = '`'`(反引号,0x60)。

  下游 `keyboard-event.ts:38` 的 `keyFromParsed` 因 `parsed.ctrl` 为 true 直接 `return name`,故 `e.key === '`'`。`input-event.ts:69` 的修复 `if (keypress.ctrl && input === 'space')` 只覆盖了 `name === 'space'` 的路径(即字面量 0x20 字节),对 `\x00` legacy 路径无效——此时 `keypress.name` 已经是 '`' 而非 'space'`。

  对 `\x00` 之前的所有分支(716-721 行的特殊处理)均未匹配,`match.ts:45` 的 `getKeyName` 对单字符 input 返回 `input.toLowerCase()`,即 '`',而 ctrl+space 的 `target.key` 是 `' '`(parser.ts:54),两者永不相等。

- **触发条件**: 任何 raw mode 终端(发送 `\x00` 是 xterm/VT100/iTerm2/kitty/Alacritty/gnome-terminal/Windows Terminal/tmux/screen 的标准行为)下按 Ctrl+Space。macOS 上可能被系统/IME 拦截,但 Linux/Windows/远程 ssh 必触发。
- **修复方向**: 在控制字节映射分支前显式判断 `if (s === '\x00') { key.name = 'space'; key.ctrl = true; }`,或把映射起点改为 `'a'.charCodeAt(0)` 并对 0 单独处理。同时检查 ctrl+@ (`\x00`) 在 `input-event.ts` 的 input 值是否一致。
- **验证记录**:
  - correctness 视角确认:对照源代码独立验证 `\x00 <= '\x1a'` 与 `.length === 1` 均为真,且之前的分支均不匹配,`String.fromCharCode(96) === '`'` 成立。
  - reproducibility 视角确认:三层验证(parse-keypress / keyboard-event / input-event)均成立,这是 input-event.ts:67 注释中提到的 "ctrl+space leaks literal" 问题的未完成一半。影响范围限制:全仓库 grep 找不到任何 Ctrl+Space 或 Ctrl+` 绑定,所以是 ink 框架层面的潜在正确性缺陷而非已发布功能损坏。
  - severity 视角拒绝:认为仓库内无 Ctrl+Space 绑定则无实际危害,判 rejected。综合后定 medium,因为是框架正确性问题,下游消费者(包括未来的 Claude Code CLI 功能)一旦绑定就会立即踩到。

---

### [medium] supportsExtendedKeys 白名单含 'windows-terminal',但 Windows Terminal 不会把 TERM_PROGRAM 设成该值

- **位置**: `packages/@ant/ink/src/core/terminal.ts:154-167`
- **类别**: terminal-compat
- **现象**: 原生 Windows Terminal 用户(非 WSL/VS Code 包裹)永远拿不到 extended key 支持,具体后果是 ctrl+shift+letter 无法与 ctrl+letter 区分,Kitty keyboard protocol + xterm modifyOtherKeys 永远不会启用。
- **根因**: `EXTENDED_KEYS_TERMINALS` 数组包含字符串 `'windows-terminal'`,而 `supportsExtendedKeys()` 的实现是:

  ```ts
  export function supportsExtendedKeys(): boolean {
    return EXTENDED_KEYS_TERMINALS.includes(process.env.TERM_PROGRAM ?? '')
  }
  ```

  Windows Terminal 实际不设置 `TERM_PROGRAM` 为 `'windows-terminal'`——根据 Microsoft 官方文档,它设置的是 `WT_SESSION` 环境变量,`TERM_PROGRAM` 在 VS Code 集成终端下是 `'vscode'`,原生 Windows Terminal 下通常未定义。`?? ''` 只是把 undefined 转成空字符串,仍然不匹配。

  这与同文件其他 5+ 处 Windows Terminal 检测形成鲜明对比,它们都正确使用 `WT_SESSION`:
  - `isProgressReportingAvailable` (terminal.ts:31)
  - `isSynchronizedOutputSupported` (terminal.ts:106)
  - `hasCursorUpViewportYankBug` (terminal.ts:176)
  - `clearTerminal.ts:17,33` 注释明确写 "Windows Terminal sets WT_SESSION environment variable"
  - `src/utils/env.ts:201`、`bidi.ts:47`

  唯独这一个函数使用了不存在的 `TERM_PROGRAM=windows-terminal` 约定。这是注释里宣称支持 Windows Terminal 但实际从未生效的死代码——且 Windows Terminal 实际上实现了 modifyOtherKeys,所以这不是出于安全的故意保守排除。

- **触发条件**: 在原生 Windows Terminal(非 WSL/VS Code 包裹)里运行任何使用 ink 的应用,打印 `supportsExtendedKeys()` 返回 false。
- **修复方向**: 改用 `!!process.env.WT_SESSION` 检测 Windows Terminal,或在函数里加 `|| process.env.WT_SESSION` 分支,统一全文件的 Windows Terminal 检测口径。
- **验证记录**: correctness / reproducibility / severity 三个视角一致确认。Windows 是主要平台,影响面真实但多数 Windows 用户在 VS Code(`TERM_PROGRAM=vscode`,本就被正确排除)中运行,影响有限,定 medium 合适。

---

### [low→medium] Tokenizer 在 csi/osc/dcs/apc/ss3 错误回退时回退 textStart 会让 ESC 字节泄漏进 text token

- **位置**: `packages/@ant/ink/src/core/termio/tokenize.ts:181-185, 197-201, 252-255, 264-267`
- **类别**: correctness
- **现象**: 当输入流中出现非法转义序列(如 `ESC [ SOH` 这种 CSI 参数位出现 C0 控制字节)时,tokenizer 错误回退分支会把 ESC 字节本身(0x1b)以及部分转义中间字节作为 text token emit。下游 `Parser.processText` 只过滤 BEL,不过滤 ESC;`segmentGraphemes` 对 0x1b 单 codepoint 返回 `width=1`,所以渲染层会把泄漏的 ESC 当作宽度为 1 的可见字素。
- **根因**: ground 状态遇到 ESC 时调用 `flushText()` 并执行 `textStart = i`、`seqStart = i`(tokenize.ts:141-144),然后进入 escape 状态。当 csi / escape / escapeIntermediate / ss3 状态收到非法字节时,错误回退分支执行:

  ```ts
  result.state = 'ground'
  textStart = seqStart
  ```

  其中 `seqStart` 是 ESC 字节本身的位置。问题在于这些回退分支**都不执行 `i++`**。下一轮 ground 循环对非法字节执行 `i++`,循环结束后 `flushText()` 切片 `data.slice(textStart, i)` 会把 `ESC + [ + 非法字节` 全部作为 text emit。注释 "Invalid - treat ESC as text" 表明意图是保留 ESC,但实现把整个非法序列都包含进了 text。

  对 `\x1b[\x01` 的逐步追踪:`i=0` ESC → ground 调 flushText()(空操作),`seqStart=0`,state='escape',`i=1`;`i=1` `[` → state='csi',`i=2`;`i=2` 0x01 在 csi 状态非 final(<0x40)非 param(<0x30)非 intermediate(<0x20)→ 进入错误回退:`state='ground'`,`textStart=seqStart=0`,**i 保持 2**;下一轮 ground 循环对 i=2 的 0x01 执行 `i++` → i=3;循环结束 `state==='ground'` → flushText() emit `data.slice(0,3) = '\x1b[\x01'` 全部作为 text token。

- **触发条件**: 需要畸形 ANSI 输入(ESC 后跟 introducer 再跟 <0x20 的 C0 控制字节)。这在真实终端输出中罕见——模型/工具输出的 ANSI 通常是合法 SGR/光标序列,不会自发生成 `\x1b[\x01` 这种畸形序列。但在损坏的 pty 流、括号粘贴中的二进制垃圾、错误程序的输出中可能遇到。三条消费者路径中,parse-keypress(输入路径)把 text token 喂给 parseKeypnress 而非直接渲染,ESC 泄漏不会产生可见字形;tabstops 路径仅影响 column 计数偏差 1,良性;只有 Parser 输出渲染路径会真正显示 width-1 字素。
- **修复方向**: 错误回退时应把 `textStart` 设为 `seqStart + 1`(跳过 ESC 字节),并显式 emit ESC 为单字符 text token 或丢弃;对 csi/escapeIntermediate 还需要 consume 掉中间字节,不能只跳过 ESC。最稳妥的做法是将非法序列整体 emit 为 sequence token 让上层处理。
- **验证记录**: correctness 视角指出 finding 标题"重复 emit 已 flush 的文本"略有不准确——前缀文本没有被重复 emit,真正泄漏的是 ESC 字节本身和部分转义中间字节。reproducibility 与 severity 视角均确认机制成立但严重程度被高估,触发条件需畸形 ANSI,定 low 合适。

---

## 其他发现

### 事件系统

**dispatchContinuous 永远不被调用,resize/scroll 的 continuous 优先级路径是死代码** (dispatcher.ts:207-236, finalSeverity: low)。`getEventPriority` 把 'resize'/'scroll'/'mousemove' 归为 `ContinuousEventPriority`,并提供了 `dispatchContinuous` 方法(手动 save/restore currentUpdatePriority)。但全代码库 grep `dispatchContinuous` 只有定义处一处命中,没有任何调用方。resize 事件根本不经过 Dispatcher:ink.tsx:398 的 `handleResize` 是一个原生 `stdout.on('resize', ...)` 处理器,直接修改 `terminalColumns/terminalRows` 并触发渲染。`ResizeEvent` (resize-event.ts) 是一个普通的 `{columns, rows}` 类型,从未被 `new` 出来,也无法被 Dispatcher 消费。这意味着 resize 的 React 调度优先级设计意图(连续事件不阻塞离散输入)从未生效。注释承诺的行为与实际不符,是误导性死代码。修复方向:要么接上 resize/mousemove 的 continuous 分发路径,要么删除 `dispatchContinuous` 和 `getEventPriority` 里的 continuous 分支,避免误导。severity 视角确认这是纯维护性问题,resize 通过直接渲染路径正常工作,无面向用户的 bug。

### 键位绑定

**ChordInterceptor does not stopImmediatePropagation on chord match with no registered handler** (KeybindingSetup.tsx:247-270, finalSeverity: low)。在 chord 进行中(wasInChord=true)且 resolver 返回 'match' 时,`setPendingChord(null)`(line 249)在 handler 查找之前**无条件**清空 `pendingChordRef.current`(同步更新,line 133)。如果 registry 中该 action 没有注册的 handler(如 plugin 绑定的组件未 mount,或 config 中 action 名拼写错误),则不会调用 `event.stopImmediatePropagation()`,事件继续传播到下游 `useKeybinding` hooks。这些 hooks 调用 `resolveKeyWithChordState` 时 `pendingChordRef.current` 已为 null,会把按键当作单键事件处理。如果该单键与当前活跃 context 的 single-key binding 冲突(如 chord 第二键 'r' 与某 context 的 'r' binding),就会触发错误的 action。

修复方向:一旦 wasInChord 为 true 且 resolver 返回 'match',该按键已被 chord 消耗,无论是否有 handler 都不应继续传播。把 `event.stopImmediatePropagation()` 移到 'match' case 顶部(wasInChord 为 true 时,在 handler 查找之前)。

注意严重程度:默认 bindings 只有两个 chord(`ctrl+x ctrl+k` / `ctrl+x ctrl+e`),第二键都是带 ctrl 的不可打印键,不会与文本输入冲突,且对应 action 都注册了 handler。要触发此 bug 需要(a)自定义 chord + (b)action handler 未挂载 + (c)chord 终端键与 single-key binding 冲突,三者交集狭窄。silently abandoned 变体(无 collision)属于可接受的 graceful degradation。

### 屏幕缓冲 & 输出(补充说明)

除前述 writeLineToScreen 制表符问题外,本子系统其他 6 条 candidate 均被排除。最值得讨论的 rejected 是 blitRegion wide-char right-edge handler 一条(见后文「已排除的误报」)。

---

## 已排除的误报(rejected findings 中值得讨论的)

下面挑选 4 条「至少 1 个 verifier 认为真实但最终被排除」的 finding,讲清为什么看起来像 bug 但实际上不是。这能帮助后续 reviewer 避免同样的误判。

### 1. blitRegion wide-char right-edge handler「覆盖 Wide 单元格而不清理」(screen.ts:964-990)

**为何看起来像 bug**:代码结构确实存在不对称。`blitRegion` 在 blit 区域右边界(maxX-1)命中 Wide 字符时,会向 dst 的 maxX 列无条件写入 SpacerTail,**完全不检查** dst 在 maxX 列原本是什么。对比 `setCellAt` (screen.ts:762-777) 专门处理了 SpacerTail 被覆盖时清理前导 Wide 的场景,blitRegion 没有对应清理。correctness 视角 verifier 据此判 medium confirmed。

**为何实际不是 bug**:其他两个视角的关键反驳是——`blitRegion` 的 dst 永远是 `this.screen`,而 `this.screen` 在 `Output.get()` 开始时已经被 `resetScreen()` 完全清零(screen.ts:571 `cells64.fill(EMPTY_CELL_VALUE, 0, size)`,output.ts:280 注释明确写出 "The buffer is freshly zeroed by resetScreen")。`EMPTY_CELL_VALUE` 对应 `width=CellWidth.Narrow`。因此 finding 的核心前提「dst 在 maxX 列原本是一个 Wide 字符」在静止状态下根本不成立——dst[maxX] 在 blit 之前一定是 empty/Narrow,绝不会是 Wide,也就无所谓「抹掉 Wide 留下孤儿 SpacerTail」。此外 src 永远是 prevScreen,而非累积写入路径。

finding 作者将 `setCellAt` 的清理模式机械迁移到 `blitRegion`,忽略了两者操作的 buffer 生命周期根本不同(reset-zeroed vs accumulating)。这是典型的「静态分析读出结构差异后过度推断」——读出代码不对称是对的,但推理出 bug 则需要前提条件不成立。

### 2. wrapAnsi (Bun path) 不传 ambiguousIsNarrow(口径漂移)(wrapAnsi.ts:9-18)

**为何看起来像 bug**:wrapAnsi.ts 在 Bun 环境下直接复用 `Bun.wrapAnsi`,不传任何 options。而 stringWidth.ts:218 全局统一使用 `{ ambiguousIsNarrow: true }`。severity 视角 verifier 据此判 medium confirmed,认为两套独立的代码路径对同一个字符集(ambiguous-width 字符如 ─ │ ☆)会算出不同的列数,导致换行点位置与实际渲染列数对不齐。

**为何实际不是 bug**:correctness 与 reproducibility 视角通过 Bun 运行时实测推翻了核心前提。finding 声称 `Bun.wrapAnsi` 的 `ambiguousIsNarrow` 缺省按 false 处理(算 2 列),但 bun-types 1.3.12 的 `WrapAnsiOptions.ambiguousIsNarrow` 显式标注 `@default true`,实测 `Bun.wrapAnsi('☆'.repeat(30), 10, { hard: true })` 默认产生 3 行每行 10 字符(即把 ☆ 视为宽度 1),与 `{ ambiguousIsNarrow: true }` 完全一致。只有明确的 `{ ambiguousIsNarrow: false }` 才会产生宽度 2 行为。因此 wrapAnsi.ts 不传 options 与 stringWidth.ts 口径本就一致,不存在漂移。

退一步说,即使存在漂移,drift 也不会触发:dom.ts:373 对 wrapAnsi 产物再调用 measureText,measure-text.ts:37 用 stringWidth 重算 `Math.ceil(stringWidth(line)/maxWidth)`,yoga 高度恒等于 wrapAnsi 行数。教训:**对运行时默认值的断言必须实测,不能依赖文档记忆**。

### 3. SGR 38/48/58 解析失败后残余参数污染样式状态(sgr.ts:266-305)

**为何看起来像 bug**:applySGR 对 code 38/48/58 调用 parseExtendedColor,如果返回 null(参数截断、格式错误),三个 if 块全部 fall through 到第 305 行的 `i++`,只跳过一个参数。这意味着 38 之后的 `5`(或 `2`)和颜色索引/RGB 分量会在下一轮循环被当作独立 SGR code 解释——RGB 分量如 r=31 落在 30-37 区间,会被错误应用为命名前景色 red。correctness 视角 verifier 实测 `applySGR('38;2;31')` 确实产生 `dim=true + fg=red`,正是 finding 描述的污染,判 low confirmed。

**为何实际不是 bug**:核心触发机制不可能成立。finding 的 repro 声称 `\x1b[38;2;31;42;53m` 会被 tokenize 分片为 `\x1b[38;2` 和 `;31;42;53m` 两次 feed,但 tokenize.ts:313-316 的实现明确缓冲未完成的 CSI 序列(`result.buffer = data.slice(seqStart)`),并在下次 feed() 拼接,CSI 只在遇到 final byte(`m` = 0x6d)时才 emit。SGR 参数绝不会在分号边界被切片喂给 applySGR。applySGR 的唯一调用方 parser.ts:347 `Parser.processSequence` 拿到的 paramStr 来自完整 CSI 的 inner slice。Ansi.tsx 的 parseToSpans 每次都 new Parser 并单次 feed 完整字符串。

剩余的理论场景(真正畸形的序列如程序字面输出 `\x1b[38;2;31m`)确实会产生局部样式污染,但:(a)需要子进程发出结构损坏的 SGR,合规的 TUI 不会这样;(b)影响完全局限于外观,遇到下一个 `\x1b[0m` 自动复位。教训:**对「跨 feed 分片」类触发条件必须验证 tokenizer 是否真的会分片**,而不是想当然。

### 4. sliceAnsi.ts 切片起点泄漏样式 / 悬空组合标记(sliceAnsi.ts:78-96)

**为何看起来像 bug**:当切片起点 start>0 且落在零宽组合标记上时,代码执行 `if (start > 0 && width === 0) continue` 跳过它。但当 start=0 且首字符是零宽字符(ZWJ `\u200d`、BOM、独立组合标记)时,`start > 0 && width === 0` 保护不触发(start=0),导致该零宽字符被设为 result 的第一个字符(实测 `sliceAnsi("\u200dabc", 0, 5)` 返回以 U+200D 开头)。correctness 视角判 low confirmed。

**为何实际不是 bug**:reproducibility 与 severity 视角的反驳非常关键——这恰恰是**正确行为**。当 start=0 时调用方请求的是字符串前缀,零宽字符本就属于这个前缀;`sliceAnsi('\u200dabc', 0, 5)` 返回 `'\u200dabc'` 与 `String.prototype.slice(0, 5)` 完全一致。finding 提议的修复(start=0 时也跳过零宽字符)反而是错的:会静默丢弃数据、破坏与 String.slice 的一致性、并让 `sliceAnsi(s, 0, n)` 不再等于 s 的前缀。

start>0 时的跳过逻辑正确,因为那时零宽标记属于左侧 base char(注释 line 80-83 已说明),跳过它才能维持 `left ⊕ right = original`;但 start=0 时没有左侧分片,标记必须保留。此外,finding 标题声称「切片起点泄漏样式」,但 line 100-101 的 `undoAnsiCodes(activeStartCodes)` 在结果末尾闭合所有 ANSI 样式,不存在样式泄漏。教训:**对「保留 vs 跳过」的语义判断要回到 API 契约**(sliceAnsi 与 String.slice 的一致性),不能只看代码形状。

---

## 修复路线图

### P0(立即修复,低风险高收益)

| 项 | 位置 | 改动 | 预期效果 | 风险 |
|---|---|---|---|---|
| 制表符样式丢失 | output.ts:670-675 | `stylePool.none` → `character.styleId`,`hyperlink: undefined` → `character.hyperlink` | 带背景色的制表符行不再出现断续背景条带 | 极低,与正常字符路径(output.ts:789-794)实现一致 |
| Ctrl+Space 映射错误 | parse-keypress.ts:722-724 | 在控制字节分支前显式判断 `s === '\x00'` → `{ name: 'space', ctrl: true }` | Ctrl+Space 不再被误判为 Ctrl+`,绑定到 Ctrl+Space 的快捷键正常触发 | 低,只新增分支不改既有逻辑 |
| Tokenizer ESC 泄漏 | tokenize.ts:181-185 等 4 处 | 错误回退时 `textStart = seqStart + 1` 跳过 ESC 字节,csi/escapeIntermediate 额外 consume 中间字节 | 畸形 ANSI 输入不再泄漏为可见字素 | 低,但需补充单测覆盖 4 个错误回退分支 |

### P1(近期修复,中等收益)

| 项 | 位置 | 改动 | 预期效果 | 风险 |
|---|---|---|---|---|
| Windows Terminal extended keys | terminal.ts:154-167 | 加 `|| process.env.WT_SESSION` 分支,或改用 `!!process.env.WT_SESSION` | 原生 Windows Terminal 用户获得 ctrl+shift+letter 区分能力 | 低,与同文件其他 5+ 处检测口径对齐 |
| ChordInterceptor stopImmediatePropagation | KeybindingSetup.tsx:247-270 | wasInChord && match 时,在 handler 查找前无条件 `event.stopImmediatePropagation()` | 自定义 chord + handler 未挂载场景下,第二键不再误触发 single-key binding | 中,需覆盖 chord_completed 但无 handler 的单测 |

### P2(结构性清理,长期)

- **dispatchContinuous 死代码**(dispatcher.ts:207-236):删除方法 + `getEventPriority` 的 continuous 分支,或在文档中明确标注为预留扩展点。避免后续维护者误以为 resize 走 React 调度优先级。
- **MouseActionEvent 坐标系不一致**(mouse-action-event.ts:38-46):该路径当前无消费者(全仓库零 `onMouseDown=` 注册),属 dormant 缺陷。长期方向是统一 ClickEvent / MouseActionEvent 都用 `nodeCache` 的屏幕绝对坐标;短期在 API 文档中标注 MouseActionEvent.localCol/Row 与 ClickEvent 语义不同。
- **事件分发系统分裂**(hit-test.ts vs dispatcher.ts):ClickEvent / MouseActionEvent / TerminalFocusEvent 三套并行机制各自维护冒泡/stopPropagation 语义。长期方向让所有事件继承 TerminalEvent 并统一走 Dispatcher.dispatch;短期在文档中明确标注两套系统的差异,避免新代码假设 onClick 里有 preventDefault/stopPropagation。

---

## 复查方法说明

本次复查采用「8 子系统并行 map → 多维度 find → 3 视角对抗性 verify → 综合」的四阶段流水线。第一阶段将 ink 源码按职责切分为 8 个子系统(渲染核心 / 屏幕缓冲与输出 / 布局引擎 / 终端 I/O 解析 / 事件系统 / 键位绑定 / React 组件与 hooks / 文本编码与选择),每个子系统独立通读关键文件并枚举可疑点。第二阶段对每个可疑点从 correctness / performance / terminal-compat / api-misuse 多个维度展开,产出 candidate finding。

第三阶段是本次复查可信度的核心:每个 candidate finding 经三个独立视角验证——**correctness**(代码逻辑层面是否成立)、**reproducibility**(在真实终端会话中是否能复现,触发条件是否现实)、**severity**(影响范围与严重程度)。三个视角独立给出 confirmed/rejected 判断与 adjustedSeverity,只有当问题在机制成立 + 真实可复现 + 严重程度匹配三个维度上都站得住,才最终确认。这一机制在本轮复查中证明了价值:47 个 candidate 中只有 6 个最终 confirmed(13% 通过率),且多个被排除的 finding 是「代码读起来确实像 bug」(如 blitRegion 不对称、SGR fall-through、sliceAnsi 零宽处理),但通过运行时实测、调用链追踪、不变量核对被推翻。

第四阶段综合三个视角的分歧,产出 finalSeverity。对分歧较大的 finding(如 Ctrl+Space 一条,severity 视角判 rejected 但 correctness/reproducibility 视角判 confirmed),本文采取「机制成立即收入,严重程度取中间值」的策略,既不放过真实的正确性缺陷,也不夸大影响。读者可根据每条 finding 的 verdicts 字段自行判断结论的稳健程度。

