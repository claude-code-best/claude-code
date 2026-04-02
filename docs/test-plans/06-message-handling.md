# 消息处理测试计划

## 概述

消息处理系统负责消息的创建、查询、规范化和文本提取。覆盖消息类型定义、消息工厂函数、消息过滤/查询工具和 API 规范化管线。

## 被测文件

| 文件 | 关键导出 |
|------|----------|
| `src/types/message.ts` | `MessageType`, `Message`, `AssistantMessage`, `UserMessage`, `SystemMessage` 等类型 |
| `src/utils/messages.ts` | 消息创建、查询、规范化、文本提取等函数（~3100 行） |
| `src/utils/messages/mappers.ts` | 消息映射工具 |

---

## 测试用例

### src/utils/messages.ts — 消息创建

#### describe('createAssistantMessage')

- test('creates message with type "assistant"') — type 字段正确
- test('creates message with role "assistant"') — role 正确
- test('creates message with empty content array') — 默认 content 为空
- test('generates unique uuid') — 每次调用 uuid 不同
- test('includes costUsd as 0')

#### describe('createUserMessage')

- test('creates message with type "user"') — type 字段正确
- test('creates message with provided content') — content 正确传入
- test('generates unique uuid')

#### describe('createSystemMessage')

- test('creates system message with correct type')
- test('includes message content')

#### describe('createProgressMessage')

- test('creates progress message with data')
- test('has correct type "progress"')

---

### src/utils/messages.ts — 消息查询

#### describe('getLastAssistantMessage')

- test('returns last assistant message from array') — 多条消息中返回最后一条 assistant
- test('returns undefined for empty array')
- test('returns undefined when no assistant messages exist')

#### describe('hasToolCallsInLastAssistantTurn')

- test('returns true when last assistant has tool_use content') — content 含 tool_use block
- test('returns false when last assistant has only text')
- test('returns false for empty messages')

#### describe('isSyntheticMessage')

- test('identifies interrupt message as synthetic') — INTERRUPT_MESSAGE 标记
- test('identifies cancel message as synthetic')
- test('returns false for normal user messages')

#### describe('isNotEmptyMessage')

- test('returns true for message with content')
- test('returns false for message with empty content array')
- test('returns false for message with empty text content')

---

### src/utils/messages.ts — 文本提取

#### describe('getAssistantMessageText')

- test('extracts text from text blocks') — content 含 `{ type: 'text', text: 'hello' }` 时提取
- test('returns empty string for non-text content') — 仅含 tool_use 时返回空
- test('concatenates multiple text blocks')

#### describe('getUserMessageText')

- test('extracts text from string content') — content 为纯字符串
- test('extracts text from content array') — content 为数组时提取 text 块
- test('handles empty content')

#### describe('extractTextContent')

- test('extracts text items from mixed content') — 过滤出 type: 'text' 的项
- test('returns empty array for all non-text content')

---

### src/utils/messages.ts — 规范化

#### describe('normalizeMessages')

- test('converts raw messages to normalized format') — 消息数组规范化
- test('handles empty array') — `[]` → `[]`
- test('preserves message order')
- test('handles mixed message types')

#### describe('normalizeMessagesForAPI')

- test('filters out system messages') — 系统消息不发送给 API
- test('filters out progress messages')
- test('filters out attachment messages')
- test('preserves user and assistant messages')
- test('reorders tool results to match API expectations')
- test('handles empty array')

---

### src/utils/messages.ts — 合并

#### describe('mergeUserMessages')

- test('merges consecutive user messages') — 相邻用户消息合并
- test('does not merge non-consecutive user messages')
- test('preserves assistant messages between user messages')

#### describe('mergeAssistantMessages')

- test('merges consecutive assistant messages')
- test('combines content arrays')

---

### src/utils/messages.ts — 辅助函数

#### describe('buildMessageLookups')

- test('builds index by message uuid') — 按 uuid 建立查找表
- test('returns empty lookups for empty messages')
- test('handles duplicate uuids gracefully')

---

## Mock 需求

| 依赖 | Mock 方式 | 说明 |
|------|-----------|------|
| `crypto.randomUUID` | `mock` 或 spy | 消息创建中的 uuid 生成 |
| Message 对象 | 手动构造 | 创建符合类型的 mock 消息对象 |

### Mock 消息工厂（放在 `tests/mocks/messages.ts`）

```typescript
// 通用 mock 消息构造器
export function mockAssistantMessage(overrides?: Partial<AssistantMessage>): AssistantMessage
export function mockUserMessage(content: string, overrides?: Partial<UserMessage>): UserMessage
export function mockSystemMessage(overrides?: Partial<SystemMessage>): SystemMessage
export function mockToolUseBlock(name: string, input: unknown): ToolUseBlock
export function mockToolResultMessage(toolUseId: string, content: string): UserMessage
```

## 集成测试场景

### describe('Message pipeline')

- test('create → normalize → API format produces valid request') — 创建消息 → normalizeMessagesForAPI → 验证输出结构
- test('tool use and tool result pairing is preserved through normalization')
- test('merge + normalize handles conversation with interruptions')
