# 第二阶段 Q&A

## Q1：query.ts 的流式消息处理具体是怎样的？

**核心问题**：`deps.callModel()` yield 出的每一条消息，在 `queryLoop()` 的 `for await` 循环体（L659-866）中具体经历了什么处理？

### 场景

用户说：**"帮我看看 package.json 的内容"**

模型回复：一段文字 "我来读取文件。" + 一个 Read 工具调用。

### callModel yield 的完整消息序列

claude.ts 的 `queryModel()` 会 yield 两种类型的消息：

| 类型标记 | 含义 | 产出时机 |
|---------|------|---------|
| `stream_event` | 原始 SSE 事件包装 | 每个 SSE 事件都产出一条 |
| `assistant` | 完整的 AssistantMessage | 仅在 `content_block_stop` 时产出 |

本例中 callModel 依次 yield **共 13 条消息**：

```
#1  { type: 'stream_event', event: { type: 'message_start', ... }, ttftMs: 342 }
#2  { type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'text' } } }
#3  { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '我来' } } }
#4  { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '读取文件。' } } }
#5  { type: 'stream_event', event: { type: 'content_block_stop', index: 0 } }
#6  { type: 'assistant', uuid: 'uuid-1', message: { content: [{ type: 'text', text: '我来读取文件。' }], stop_reason: null } }
#7  { type: 'stream_event', event: { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_001', name: 'Read' } } }
#8  { type: 'stream_event', event: { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"file_path":' } } }
#9  { type: 'stream_event', event: { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '"/path/package.json"}' } } }
#10 { type: 'stream_event', event: { type: 'content_block_stop', index: 1 } }
#11 { type: 'assistant', uuid: 'uuid-2', message: { content: [{ type: 'tool_use', id: 'toolu_001', name: 'Read', input: { file_path: '/path/package.json' } }], stop_reason: null } }
#12 { type: 'stream_event', event: { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 87 } } }
#13 { type: 'stream_event', event: { type: 'message_stop' } }
```

注意 `#6` 和 `#11` 是 **assistant 类型**（content_block_stop 时由 claude.ts 组装），其余全是 **stream_event 类型**。

### 循环体结构

循环体在 L708-866，结构如下：

```
for await (const message of deps.callModel({...})) {   // L659
    // A. 降级检查 (L712)
    // B. backfill (L747-789)
    // C. withheld 检查 (L801-824)
    // D. yield (L825-827)
    // E. assistant 收集 + addTool (L828-848)
    // F. getCompletedResults (L850-865)
}
```

### 逐条走循环体

#### #1 stream_event (message_start)

```
A. L712: streamingFallbackOccured = false → 跳过

B. L748: message.type === 'assistant'?
   → 'stream_event' !== 'assistant' → 跳过整个 backfill 块

C. L801-824: withheld 检查
   → 不是 assistant 类型，各项检查均为 false → withheld = false

D. L825: yield message  ✅ → 透传给 REPL（REPL 记录 ttftMs）

E. L828: message.type === 'assistant'? → 否 → 跳过

F. L850-854: streamingToolExecutor.getCompletedResults()
   → tools 数组为空 → 无结果
```

**净效果**：`yield` 透传。

---

#### #2 stream_event (content_block_start, type: text)

```
A-C. 同 #1
D.   yield message  ✅ → REPL 设置 spinner 为 "Responding..."
E-F. 同 #1
```

**净效果**：`yield` 透传。

---

#### #3 stream_event (text_delta: "我来")

```
A-C. 同 #1
D.   yield message  ✅ → REPL 追加 streamingText += "我来"（打字机效果）
E-F. 同 #1
```

**净效果**：`yield` 透传。

---

#### #4 stream_event (text_delta: "读取文件。")

```
同 #3
D. yield message  ✅ → REPL streamingText += "读取文件。"
```

**净效果**：`yield` 透传。

---

#### #5 stream_event (content_block_stop, index:0)

```
同 #2
D. yield message  ✅ → REPL 无特殊操作（真正的 AssistantMessage 在下一条 #6）
```

**净效果**：`yield` 透传。

---

#### #6 assistant (text block 完整消息) ★

第一条 `type: 'assistant'` 的消息，走**完全不同的路径**：

```
A. L712: streamingFallbackOccured = false → 跳过

B. L748: message.type === 'assistant'? → ✅ 进入 backfill
   L750: contentArr = [{ type: 'text', text: '我来读取文件。' }]
   L752: for i=0: block.type === 'text'
   L754: block.type === 'tool_use'? → 否 → 跳过
   L783: clonedContent 为 undefined → yieldMessage = message（原样不变）

C. L801: let withheld = false
   L802: feature('CONTEXT_COLLAPSE') → false → 跳过
   L813: reactiveCompact?.isWithheldPromptTooLong(message) → 否 → false
   L822: isWithheldMaxOutputTokens(message)
         → message.message.stop_reason === null → false
   → withheld = false

D. L825: yield message  ✅ → REPL 清除 streamingText，添加完整 text 消息到列表

E. L828: message.type === 'assistant'? → ✅
   L830: assistantMessages.push(message)
         → assistantMessages = [uuid-1(text)]

   L832-834: msgToolUseBlocks = content.filter(type === 'tool_use')
             → []（这是 text block，没有 tool_use）

   L835: length > 0? → 否 → 不设 needsFollowUp
   L844: msgToolUseBlocks 为空 → 不调用 addTool

F. L854: getCompletedResults() → 空
```

**净效果**：`yield` 消息 + `assistantMessages` 增加一条。`needsFollowUp` 仍为 `false`。

---

#### #7 stream_event (content_block_start, tool_use: Read)

```
A-C. 同 stream_event 通用路径
D.   yield message  ✅ → REPL 设置 spinner 为 "tool-input"，添加 streamingToolUse
E.   不是 assistant → 跳过
F.   getCompletedResults() → 空
```

---

#### #8 stream_event (input_json_delta: `'{"file_path":'`)

```
D. yield message  ✅ → REPL 追加工具输入 JSON 碎片
F. getCompletedResults() → 空
```

---

#### #9 stream_event (input_json_delta: '"/path/package.json"}')

```
D. yield message  ✅
F. getCompletedResults() → 空
```

---

#### #10 stream_event (content_block_stop, index:1)

```
D. yield message  ✅
F. getCompletedResults() → 空
```

---

#### #11 assistant (tool_use block 完整消息) ★★

这条是**最关键的**——触发工具执行：

```
A. L712: streamingFallbackOccured = false → 跳过

B. L748: message.type === 'assistant'? → ✅ 进入 backfill
   L750: contentArr = [{ type: 'tool_use', id: 'toolu_001', name: 'Read',
                          input: { file_path: '/path/package.json' } }]
   L752: for i=0:
   L754: block.type === 'tool_use'? → ✅
   L756: typeof block.input === 'object' && !== null? → ✅
   L759: tool = findToolByName(tools, 'Read') → Read 工具定义
   L763: tool.backfillObservableInput 存在? → 假设存在
   L764-766: inputCopy = { file_path: '/path/package.json' }
             tool.backfillObservableInput(inputCopy)
             → 可能添加 absolutePath 字段
   L773-776: addedFields? → 假设有新增字段
             clonedContent = [...contentArr]
             clonedContent[0] = { ...block, input: inputCopy }
   L783-788: yieldMessage = {
               ...message,                 // uuid, type, timestamp 不变
               message: {
                 ...message.message,        // stop_reason, usage 不变
                 content: clonedContent      // ★ 替换为带 absolutePath 的副本
               }
             }
             // ★ 原始 message 保持不变（回传 API 保证缓存一致）

C. L801-824: withheld 检查 → 全部 false → withheld = false

D. L825: yield yieldMessage  ✅
         → yield 的是克隆版（带 backfill 字段），给 REPL 和 SDK 用
         → 原始 message 下面存进 assistantMessages，回传 API 保证缓存一致

E. L828: message.type === 'assistant'? → ✅
   L830: assistantMessages.push(message)   // ★ push 原始 message，不是 yieldMessage
         → assistantMessages = [uuid-1(text), uuid-2(tool_use)]

   L832-834: msgToolUseBlocks = content.filter(type === 'tool_use')
             → [{ type: 'tool_use', id: 'toolu_001', name: 'Read', input: {...} }]

   L835: length > 0? → ✅
   L836: toolUseBlocks.push(...msgToolUseBlocks)
         → toolUseBlocks = [Read_block]
   L837: needsFollowUp = true          // ★★★ 决定 while(true) 不会终止

   L840-842: streamingToolExecutor 存在 ✓ && !aborted ✓
   L844-846: for (const toolBlock of msgToolUseBlocks):
             streamingToolExecutor.addTool(Read_block, uuid-2消息)
             // ★★★ 工具开始执行！
             // → StreamingToolExecutor 内部：
             //   isConcurrencySafe = true（Read 是安全的）
             //   queued → processQueue() → canExecuteTool() → true
             //   → executeTool() → runToolUse() → 后台异步读文件

F. L850-854: getCompletedResults()
   → Read 刚开始执行，status = 'executing' → 无完成结果
```

**净效果**：
- `yield` 克隆消息（带 backfill 字段）
- `assistantMessages` push 原始消息
- `needsFollowUp = true`
- **Read 工具在后台异步开始执行**

---

#### #12 stream_event (message_delta, stop_reason: 'tool_use')

```
A-C. 同 stream_event 通用路径
D.   yield message  ✅

E.   不是 assistant → 跳过

F. L854: getCompletedResults()
   → ★ 此时 Read 可能已经完成了!（读文件通常 <1ms）
   → 如果完成: status = 'completed', results 有值
     L428(StreamingToolExecutor): tool.status = 'yielded'
     L431-432: yield { message: UserMsg(tool_result) }
   → 回到 query.ts:
     L855: result.message 存在
     L856: yield result.message  ✅ → REPL 显示工具结果
     L857-862: toolResults.push(normalizeMessagesForAPI([result.message])...)
               → toolResults = [Read 的 tool_result]
```

**净效果**：`yield` stream_event + **可能 yield 工具结果**（如果工具已完成）。

---

#### #13 stream_event (message_stop)

```
D. yield message  ✅
F. getCompletedResults()
   → 如果 Read 在 #12 已被收割 → 空
   → 如果 Read 此时才完成 → yield 工具结果（同 #12 的 F 逻辑）
```

---

### for await 循环退出后

```
L1018: aborted? → false → 跳过

L1065: if (!needsFollowUp)
       → needsFollowUp = true → 不进入 → 跳过终止逻辑

L1383: toolUpdates = streamingToolExecutor.getRemainingResults()
       → 如果 Read 已在 #12/#13 被收割 → 立即返回空
       → 如果 Read 还没完成 → 阻塞等待 → 完成后 yield 结果

L1387-1404: for await (const update of toolUpdates) {
              yield update.message        → REPL 显示
              toolResults.push(...)        → 收集
            }

L1718-1730: 构建 next State:
  state = {
    messages: [
      ...messagesForQuery,     // [UserMessage("帮我看看...")]
      ...assistantMessages,    // [AssistantMsg(text), AssistantMsg(tool_use)]
      ...toolResults,          // [UserMsg(tool_result)]
    ],
    turnCount: 1,
    transition: { reason: 'next_turn' },
  }
  → continue → while(true) 第 2 次迭代 → 带着工具结果再次调 API
```

### 循环体判定树总结

```
for await (const message of deps.callModel(...)) {
    │
    ├─ message.type === 'stream_event'?
    │   │
    │   └─ YES → 几乎零操作
    │        ├─ yield message（透传给 REPL 做实时 UI）
    │        └─ getCompletedResults()（顺便检查有没有完成的工具）
    │
    └─ message.type === 'assistant'?
        │
        ├─ B. backfill: 有 tool_use + backfillObservableInput?
        │   ├─ YES → 克隆消息，yield 克隆版（原始消息保留给 API）
        │   └─ NO  → yield 原始消息
        │
        ├─ C. withheld: prompt_too_long / max_output_tokens?
        │   ├─ YES → 不 yield（暂扣，等后面恢复逻辑处理）
        │   └─ NO  → yield
        │
        ├─ E. assistantMessages.push(原始 message)
        │
        ├─ E. 有 tool_use block?
        │   ├─ YES → toolUseBlocks.push()
        │   │         + needsFollowUp = true
        │   │         + streamingToolExecutor.addTool() → ★ 立即开始执行工具
        │   └─ NO  → 什么都不做
        │
        └─ F. getCompletedResults() → 收割已完成的工具结果
}
```

**一句话总结**：stream_event 透传不处理；assistant 消息才是"真正的货"——收集起来、判断要不要暂扣、有工具就立即开始执行、顺便收割已完成的工具结果。