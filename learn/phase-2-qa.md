# Phase 2 Q&A

## Q1: How does query.ts handle streaming messages exactly?

**Core question**: What processing does each message yielded by `deps.callModel()` go through in the `for await` loop body (L659-866) of `queryLoop()`?

### Scenario

User says: **"Show me the contents of package.json"**

Model responds: A text segment "Let me read the file." + a Read tool call.

### Complete Message Sequence from callModel Yield

claude.ts's `queryModel()` yields two types of messages:

| Type Marker | Meaning | When Yielded |
|-------------|---------|-------------|
| `stream_event` | Raw SSE event wrapper | One for each SSE event |
| `assistant` | Complete AssistantMessage | Only at `content_block_stop` |

In this example, callModel yields **13 messages total**:

```
#1  { type: 'stream_event', event: { type: 'message_start', ... }, ttftMs: 342 }
#2  { type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'text' } } }
#3  { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Let me' } } }
#4  { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' read the file.' } } }
#5  { type: 'stream_event', event: { type: 'content_block_stop', index: 0 } }
#6  { type: 'assistant', uuid: 'uuid-1', message: { content: [{ type: 'text', text: 'Let me read the file.' }], stop_reason: null } }
#7  { type: 'stream_event', event: { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_001', name: 'Read' } } }
#8  { type: 'stream_event', event: { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"file_path":' } } }
#9  { type: 'stream_event', event: { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '"/path/package.json"}' } } }
#10 { type: 'stream_event', event: { type: 'content_block_stop', index: 1 } }
#11 { type: 'assistant', uuid: 'uuid-2', message: { content: [{ type: 'tool_use', id: 'toolu_001', name: 'Read', input: { file_path: '/path/package.json' } }], stop_reason: null } }
#12 { type: 'stream_event', event: { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 87 } } }
#13 { type: 'stream_event', event: { type: 'message_stop' } }
```

Note that `#6` and `#11` are **assistant type** (assembled by claude.ts at content_block_stop), while all others are **stream_event type**.

### Loop Body Structure

The loop body is at L708-866, structured as follows:

```
for await (const message of deps.callModel({...})) {   // L659
    // A. Fallback check (L712)
    // B. Backfill (L747-789)
    // C. Withheld check (L801-824)
    // D. Yield (L825-827)
    // E. Assistant collection + addTool (L828-848)
    // F. getCompletedResults (L850-865)
}
```

### Walking Through the Loop Body for Each Message

#### #1 stream_event (message_start)

```
A. L712: streamingFallbackOccured = false → skip

B. L748: message.type === 'assistant'?
   → 'stream_event' !== 'assistant' → skip entire backfill block

C. L801-824: withheld check
   → Not assistant type, all checks are false → withheld = false

D. L825: yield message  ✅ → Pass through to REPL (REPL records ttftMs)

E. L828: message.type === 'assistant'? → No → skip

F. L850-854: streamingToolExecutor.getCompletedResults()
   → tools array is empty → no results
```

**Net effect**: `yield` pass-through.

---

#### #2 stream_event (content_block_start, type: text)

```
A-C. Same as #1
D.   yield message  ✅ → REPL sets spinner to "Responding..."
E-F. Same as #1
```

**Net effect**: `yield` pass-through.

---

#### #3 stream_event (text_delta: "Let me")

```
A-C. Same as #1
D.   yield message  ✅ → REPL appends streamingText += "Let me" (typewriter effect)
E-F. Same as #1
```

**Net effect**: `yield` pass-through.

---

#### #4 stream_event (text_delta: " read the file.")

```
Same as #3
D. yield message  ✅ → REPL streamingText += " read the file."
```

**Net effect**: `yield` pass-through.

---

#### #5 stream_event (content_block_stop, index:0)

```
Same as #2
D. yield message  ✅ → REPL has no special action (the real AssistantMessage comes in #6)
```

**Net effect**: `yield` pass-through.

---

#### #6 assistant (text block complete message) ★

First `type: 'assistant'` message, takes a **completely different path**:

```
A. L712: streamingFallbackOccured = false → skip

B. L748: message.type === 'assistant'? → ✅ Enter backfill
   L750: contentArr = [{ type: 'text', text: 'Let me read the file.' }]
   L752: for i=0: block.type === 'text'
   L754: block.type === 'tool_use'? → No → skip
   L783: clonedContent is undefined → yieldMessage = message (unchanged)

C. L801: let withheld = false
   L802: feature('CONTEXT_COLLAPSE') → false → skip
   L813: reactiveCompact?.isWithheldPromptTooLong(message) → No → false
   L822: isWithheldMaxOutputTokens(message)
         → message.message.stop_reason === null → false
   → withheld = false

D. L825: yield message  ✅ → REPL clears streamingText, adds complete text message to list

E. L828: message.type === 'assistant'? → ✅
   L830: assistantMessages.push(message)
         → assistantMessages = [uuid-1(text)]

   L832-834: msgToolUseBlocks = content.filter(type === 'tool_use')
             → [] (this is a text block, no tool_use)

   L835: length > 0? → No → don't set needsFollowUp
   L844: msgToolUseBlocks is empty → don't call addTool

F. L854: getCompletedResults() → empty
```

**Net effect**: `yield` message + `assistantMessages` gains one entry. `needsFollowUp` remains `false`.

---

#### #7 stream_event (content_block_start, tool_use: Read)

```
A-C. Same as stream_event common path
D.   yield message  ✅ → REPL sets spinner to "tool-input", adds streamingToolUse
E.   Not assistant → skip
F.   getCompletedResults() → empty
```

---

#### #8 stream_event (input_json_delta: '{"file_path":')

```
D. yield message  ✅ → REPL appends tool input JSON fragment
F. getCompletedResults() → empty
```

---

#### #9 stream_event (input_json_delta: '"/path/package.json"}')

```
D. yield message  ✅
F. getCompletedResults() → empty
```

---

#### #10 stream_event (content_block_stop, index:1)

```
D. yield message  ✅
F. getCompletedResults() → empty
```

---

#### #11 assistant (tool_use block complete message) ★★

This is the **most critical one** — triggers tool execution:

```
A. L712: streamingFallbackOccured = false → skip

B. L748: message.type === 'assistant'? → ✅ Enter backfill
   L750: contentArr = [{ type: 'tool_use', id: 'toolu_001', name: 'Read',
                          input: { file_path: '/path/package.json' } }]
   L752: for i=0:
   L754: block.type === 'tool_use'? → ✅
   L756: typeof block.input === 'object' && !== null? → ✅
   L759: tool = findToolByName(tools, 'Read') → Read tool definition
   L763: tool.backfillObservableInput exists? → Assume yes
   L764-766: inputCopy = { file_path: '/path/package.json' }
             tool.backfillObservableInput(inputCopy)
             → May add absolutePath field
   L773-776: addedFields? → Assume new fields added
             clonedContent = [...contentArr]
             clonedContent[0] = { ...block, input: inputCopy }
   L783-788: yieldMessage = {
               ...message,                 // uuid, type, timestamp unchanged
               message: {
                 ...message.message,        // stop_reason, usage unchanged
                 content: clonedContent      // ★ Replaced with copy containing absolutePath
               }
             }
             // ★ Original message stays unchanged (sent back to API to maintain cache consistency)

C. L801-824: withheld check → all false → withheld = false

D. L825: yield yieldMessage  ✅
         → Yields the cloned version (with backfill fields), for REPL and SDK use
         → Original message is stored in assistantMessages below, sent back to API for cache consistency

E. L828: message.type === 'assistant'? → ✅
   L830: assistantMessages.push(message)   // ★ Pushes original message, not yieldMessage
         → assistantMessages = [uuid-1(text), uuid-2(tool_use)]

   L832-834: msgToolUseBlocks = content.filter(type === 'tool_use')
             → [{ type: 'tool_use', id: 'toolu_001', name: 'Read', input: {...} }]

   L835: length > 0? → ✅
   L836: toolUseBlocks.push(...msgToolUseBlocks)
         → toolUseBlocks = [Read_block]
   L837: needsFollowUp = true          // ★★★ Decides while(true) won't terminate

   L840-842: streamingToolExecutor exists ✓ && !aborted ✓
   L844-846: for (const toolBlock of msgToolUseBlocks):
             streamingToolExecutor.addTool(Read_block, uuid-2 message)
             // ★★★ Tool starts executing!
             // → StreamingToolExecutor internal:
             //   isConcurrencySafe = true (Read is safe)
             //   queued → processQueue() → canExecuteTool() → true
             //   → executeTool() → runToolUse() → async file read in background

F. L850-854: getCompletedResults()
   → Read just started executing, status = 'executing' → no completed results
```

**Net effect**:
- `yield` cloned message (with backfill fields)
- `assistantMessages` push original message
- `needsFollowUp = true`
- **Read tool starts executing asynchronously in the background**

---

#### #12 stream_event (message_delta, stop_reason: 'tool_use')

```
A-C. Same as stream_event common path
D.   yield message  ✅

E.   Not assistant → skip

F. L854: getCompletedResults()
   → ★ At this point Read may have already finished! (reading a file is typically <1ms)
   → If completed: status = 'completed', results has value
     L428(StreamingToolExecutor): tool.status = 'yielded'
     L431-432: yield { message: UserMsg(tool_result) }
   → Back to query.ts:
     L855: result.message exists
     L856: yield result.message  ✅ → REPL displays tool result
     L857-862: toolResults.push(normalizeMessagesForAPI([result.message])...)
               → toolResults = [Read's tool_result]
```

**Net effect**: `yield` stream_event + **possibly yield tool result** (if tool already completed).

---

#### #13 stream_event (message_stop)

```
D. yield message  ✅
F. getCompletedResults()
   → If Read was already harvested in #12 → empty
   → If Read completed just now → yield tool result (same logic as #12's F)
```

---

### After the for await Loop Exits

```
L1018: aborted? → false → skip

L1065: if (!needsFollowUp)
       → needsFollowUp = true → don't enter → skip termination logic

L1383: toolUpdates = streamingToolExecutor.getRemainingResults()
       → If Read was already harvested in #12/#13 → returns empty immediately
       → If Read hasn't completed → blocks waiting → yields result when done

L1387-1404: for await (const update of toolUpdates) {
              yield update.message        → REPL displays
              toolResults.push(...)        → collect
            }

L1718-1730: Build next State:
  state = {
    messages: [
      ...messagesForQuery,     // [UserMessage("Show me the contents...")]
      ...assistantMessages,    // [AssistantMsg(text), AssistantMsg(tool_use)]
      ...toolResults,          // [UserMsg(tool_result)]
    ],
    turnCount: 1,
    transition: { reason: 'next_turn' },
  }
  → continue → while(true) iteration 2 → call API again with tool results
```

### Loop Body Decision Tree Summary

```
for await (const message of deps.callModel(...)) {
    │
    ├─ message.type === 'stream_event'?
    │   │
    │   └─ YES → Nearly zero processing
    │        ├─ yield message (pass through to REPL for real-time UI)
    │        └─ getCompletedResults() (opportunistically check for completed tools)
    │
    └─ message.type === 'assistant'?
        │
        ├─ B. backfill: has tool_use + backfillObservableInput?
        │   ├─ YES → Clone message, yield cloned version (original preserved for API)
        │   └─ NO  → yield original message
        │
        ├─ C. withheld: prompt_too_long / max_output_tokens?
        │   ├─ YES → Don't yield (hold back, wait for recovery logic later)
        │   └─ NO  → yield
        │
        ├─ E. assistantMessages.push(original message)
        │
        ├─ E. Has tool_use blocks?
        │   ├─ YES → toolUseBlocks.push()
        │   │         + needsFollowUp = true
        │   │         + streamingToolExecutor.addTool() → ★ Start executing tool immediately
        │   └─ NO  → Do nothing
        │
        └─ F. getCompletedResults() → Harvest completed tool results
}
```

**One-sentence summary**: stream_events are passed through without processing; assistant messages are the "real cargo" — they get collected, checked for withholding, tools get executed immediately if present, and completed tool results get harvested along the way.
