# /digest — 上下文回溯与蒸馏（DFS 式上下文优化）

## 概述

`/digest` 是一种**上下文优化机制**，与 `/compact` 互补。它不是「push/pop 的附属」，也不是 push/pop 内部调用的命令——`/digest` 与 `/pop` 是**平级入口**，各自独立调用同一个底层蒸馏原语（局部上下文压缩 `partialCompactConversation` + 四栏 `DIGEST_PROMPT` 模板）。区别只在**由谁圈定蒸馏范围**：`/pop` 用栈标记（marker+1），`/digest` 用消息选择器手选。

Agent 天然只能**顺序处理**：一步步往下跑，一旦某段探索失败、报错、走进死胡同，这些日志与试错来回会**一直留在上下文里**稀释后续推理，且无法回收——线性历史只能追加、不能回溯。`/digest` 给这种线性历史补上**类似 DFS 的回溯能力**：把一段可隔离的探索岔路（通常是失败调试 / 报错排查 / 发散讨论）精确圈定，蒸馏成一份结构化结论，上下文回到岔路**之前**的干净状态，只多一份 digest。它是「手术刀」——精确、可控、缓存友好。

`/digest` 与 `/push`+`/pop` 是这套底层蒸馏原语的两种入口，区别只在**由谁、何时圈定蒸馏范围**：

- **`/push` + `/pop`**：预先划界。讨论开始**前** `/push` 打标记，结束后 `/pop` 弹栈蒸馏。要求用户能提前预判「接下来要岔出去了」。
- **`/digest`**：事后选点。不需要任何提前动作，事后像 `/rewind` 一样弹消息选择器，回溯选中一条较早的消息，把它到对话底部整段蒸馏。解决「污染往往事后才发现、来不及 push」的现实问题。

## 动机：给顺序 agent 补上回溯

把 agent 与用户的协作看作一棵搜索树：每个节点是一次上下文状态，展开是深入探索，回溯是收敛结论。普通对话的上下文只能**追加**、无法**回溯**——一次失败的调试、一段跑偏的排查，会永久留在上下文里，持续消耗 token 并稀释后续推理，agent 只能带着这些噪音继续往下走。

`/digest` 为这棵树补上「回溯」：圈定那段失败探索，只让**蒸馏结论**穿过节点边界，展开过程中的中间态（大日志、死胡同、被推翻的假设）被丢弃。这正是 DFS 里「子树探索完只向父节点回传结果」的语义。

## digest vs compact

两者都做上下文瘦身，但解决的膨胀类型、控制粒度、缓存影响完全不同。一句话：**compact 是「全局打包整段历史来续命」，digest 是「把一段你圈定的探索岔路沉淀成结论、主线无损」。**

| 维度 | `/compact` | `/digest` |
|------|-----------|-----------|
| **作用范围** | 整个会话——把到目前为止的全部历史总结成一份摘要，替换原始来回 | 只针对你显式圈定的那段岔路，主线其余部分完全不动 |
| **触发/控制** | 常被动触发（触顶自动 compact）或一键；边界是「到现在为止全部」，不精确控制压什么 | 完全主动、结构化——你精确决定哪一段被收敛 |
| **保留什么** | 主线原始细节大多丢失，只剩一份总摘要 | 圈定点之前的主线**逐字保留**，只有那段岔路被换成结论 |
| **意图** | 省空间、避免触顶——「不得已的续命」 | 主动沉淀结论、丢掉过程噪音——「整理」而非「救急」 |
| **前缀缓存** | 几乎重写整个上下文 → 前缀缓存**全部失效**，compact 后第一轮基本全量重建，较贵 | 主线前缀**无损**，只有尾部那段换成小 digest → 缓存损失极小 |

## digest 能否替代 compact

对懂上下文管理的开发者，digest **能大幅降低对 compact 的依赖**——把它从「常规操作」降级为「兜底手段」，但不能完全替代。

**digest 替得漂亮的场景**：凡是可隔离的探索/调试岔路（一堆试错、读大日志、跑命令，最后只想留一个结论）——这类天然有边界，圈定即可蒸馏，主线前缀无损、缓存友好、保真度高。养成「探索前先划界、或事后 `/digest` 回收」的习惯，大量本会把主线撑到触发 compact 的膨胀，会被提前在岔路里消化掉。

**compact 仍不可少的场景**：

1. **主线自身的线性膨胀**：上下文变大不是因为岔路，而是主线本身活儿多——顺着一条线读了几十个文件、跑了很多步，全是要保留的主线。这没有可划的边界，只有 compact 能压主线本身。
2. **触顶救急**：逼近窗口硬上限时往往正处在一长串主线操作中间，来不及优雅划界。compact 是兜底救命，digest 不解决「主线超长」。

**成本形态不同**：digest 的代价是**纪律/认知负担**（要持续预判哪些是岔路、记得划界，`/digest` 的事后选点缓解了这点但仍需判断选哪条消息）；compact 的代价是**缓存重建 + 丢细节**，但零纪律（自动或一键）。

**建议的组合策略**（不是二选一）：主力用 digest 主动隔离每段探索，让主线长期精简、缓存友好，把 compact 触发频率压下去；兜底在主线确实线性长到逼近上限时，再用 compact 做安全网。

> ⚠️ 两者都不是无损。digest 的价值高度依赖蒸馏摘要写得准；若 digest 丢了后续主线要用的关键细节，仍得回 transcript 翻原文（`ctrl+o` 查看历史里被折叠的原始尾部）。

## 用户体验

```
/digest        弹出消息选择器 → 选一条较早的 user 消息 M
               → "Distill from here into a digest"（可附加 context）
               → 从 M 到对话底部被四栏 digest 替换
```

- 选择器复用 `/rewind` 的消息列表 UI，但 digest 模式下选项收敛为两个：**Distill from here into a digest**（可选填一段附加 context 影响蒸馏侧重）与 **Never mind**；标题、拾取提示、确认文案切换为 digest 语义。
- 蒸馏进行时输入框旁显示 spinner「↓ Distilling from selected message」。
- 完成后弹出通知：`↓ Distilled from selected message (ctrl+o for history) · Context: ~X → ~Y tokens`，X/Y 为蒸馏前后的上下文规模。

### 与 /rewind 的差异

`/digest` 借用 `/rewind` 的消息选择器 UI，但语义相反：`/rewind` 是**丢弃**选中点之后的内容（回到过去、可选恢复文件），`/digest` 是**蒸馏保留**选中点之后的结论（折叠而非丢弃、不动文件、不 resubmit）。digest 模式通过选择器的 `mode` 参数与 rewind 隔离，rewind 的完整 restore 选项不受影响。

## 核心机制

`/digest` 的落地主体复用局部上下文压缩 `applyPartialCompactByUuid`（方向 `from`）——把选中消息之后的段落原地蒸馏替换。这与 `/pop` 走的是同一条压缩路径、同一份 digest 模板，差异只在「选点来源」（命令弹选择器手选 vs 弹栈顶）：

```
applyPartialCompactByUuid({
  pivotUuid: M.uuid,
  feedback: 用户输入 ?? DIGEST_TEMPLATE,
  direction: 'from',
  options: { promptOverride: DIGEST_PROMPT, summaryFraming: 'digest' },
  // 注意：无 resubmit —— 蒸馏后不重新触发 agent，只折叠上下文
})
```

digest 用固定的四栏结构，让蒸馏物对后续对话可直接消费：

| 栏目 | 内容 |
|------|------|
| Decisions | 探索确定了什么 + 关键理由 |
| Rejected | 过程中否决了什么 + 否决原因（防止重蹈覆辙） |
| Open questions | 未收敛的点 |
| Action items | 对主线任务的具体影响 / 待办 |

## token / 缓存成本

`/digest` **会花 token**——蒸馏是一次真实的 LLM 调用，不是免费的。但它的成本结构相对 `/compact` 明显更省，这正是 digest 的核心优势：

- **蒸馏调用的固有成本**：走一次局部压缩 fork（`partialCompactConversation`），读入被蒸馏的那段上下文 + 输出四栏 digest。这是「把一段上下文蒸馏成结论」躲不掉的成本——探索内容接着聊本来也要为它付 token。与 `/pop` 走的是**同一次**压缩调用，digest 相对 pop 不额外多花。
- **相对 compact 更省**：因主线前缀**无损**，蒸馏刚结束时前缀缓存必热，单次成本约等于一次 cache-read 加几百 token 输出；而 compact 几乎重写整个上下文、前缀缓存全失效、下一轮全量重建。所以「省」是相对 compact 而言，不是绝对零成本。
- **唯一真正零成本的部分**：完成通知里的 `Context: ~X → ~Y tokens` 复用压缩过程**已经算好**的 `preCompactTokenCount`（压缩时计算）与 `truePostCompactTokenCount`（本地消息负载估算），**不发起任何新的 token_count 请求**，纯显示层。

## 架构

| 模块 | 路径 | 职责 |
|------|------|------|
| digest 命令 | `src/commands/digest/` | 命令定义 + 调 `openMessageSelector('digest')` |
| 消息选择器 | `src/components/MessageSelector.tsx` | `mode` 参数区分 rewind / digest；digest 模式收敛选项与文案 |
| 应用层 | `src/screens/REPL.tsx` | `messageSelectorMode` state/ref + `onSummarize` 的 digest 分支（无 resubmit + spinner + token 通知） |
| digest 模板 | `src/services/pushStack/digestPrompt.ts` | 四栏 `DIGEST_PROMPT` + `DIGEST_TEMPLATE`（push/pop 与 digest 共用） |
| 局部压缩 | `src/services/compact/compact.ts` | 复用主体；`promptOverride` + `summaryFraming: 'digest'` 参数 |

`ToolUseContext.openMessageSelector` 的签名从 `() => void` 扩展为 `(mode?: 'rewind' \| 'digest') => void`（向后兼容，rewind 不传参）。特性由 feature flag `PUSH_POP` 控制（`FEATURE_PUSH_POP=1`）。

**代码血缘**：四栏 `DIGEST_PROMPT` 与局部压缩的这套复用**最初是为 `/pop` 引入的**（见 `digestPrompt.ts` 的注释「Digest prompt for `/pop`」），`/digest` 命令后加、复用同一底座。`/pop` 的落地在 `REPL.tsx` 的 `applyPop`（pivot = 栈标记 marker+1），`/digest` 的落地在 `MessageSelector` → `onSummarize` 的 digest 分支（pivot = 手选消息）——两者各自调用同一个 `applyPartialCompactByUuid`，**谁都不调用谁的命令**。所以「共享」是平级复用同一底层原语，不是命令互调，也不存在从属关系。

## 使用场景

### 场景 1：事后隔离一段失败调试

主线跑测试冒出 SIGSEGV，没来得及 `/push` 就一头扎进排查——读了大量日志、试了几个假设、改了些实验代码，二十轮后确认是环境问题。`/digest` 选中「开始排查的那条消息」，把整段排查蒸馏成「Decisions: 确认是环境问题 / Rejected: 排除了代码 bug」，主线上下文回到排查之前的干净状态、缓存无损。

### 场景 2：回收发散讨论

与 agent 就某个设计反复权衡了很久，方向已清晰但上下文塞满了被否决的中间方案。`/digest` 选中讨论起点，把发散过程折叠成「已裁决 + 被排除及原因」，后续实现不再被反复权衡的噪音稀释。

### 场景 3：主动控形替代频繁 compact

长会话里养成习惯：每完成一段可隔离的探索就 `/digest` 收一次，让主线长期精简、前缀缓存长期热。相比被动等触顶 compact（全量缓存重建 + 丢主线细节），这是「主动控形」而非「被动救命」——只在主线本身线性膨胀到逼近上限时才回落到 `/compact` 兜底。

## 演进方向

- 与 `/push --list` 打通：允许 `/digest` 直接选一个已有 push 标记作为起点。
- digest 模板自适应：按探索类型（排查型 / 方案裁决型 / 开放发散型）切换蒸馏侧重。
- 事后多段回收：一次 `/digest` 圈定多段不连续岔路分别蒸馏。
