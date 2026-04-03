# Message Handling Test Plan

## Overview

The message handling system is responsible for message creation, querying, normalization, and text extraction. It covers message type definitions, message factory functions, message filtering/querying utilities, and the API normalization pipeline.

## Files Under Test

| File | Key Exports |
|------|-------------|
| `src/types/message.ts` | `MessageType`, `Message`, `AssistantMessage`, `UserMessage`, `SystemMessage` and other types |
| `src/utils/messages.ts` | Message creation, querying, normalization, text extraction functions (~3100 lines) |
| `src/utils/messages/mappers.ts` | Message mapping utilities |

---

## Test Cases

### src/utils/messages.ts — Message Creation

#### describe('createAssistantMessage')

- test('creates message with type "assistant"') — type field is correct
- test('creates message with role "assistant"') — role is correct
- test('creates message with empty content array') — Default content is empty
- test('generates unique uuid') — uuid differs on each call
- test('includes costUsd as 0')

#### describe('createUserMessage')

- test('creates message with type "user"') — type field is correct
- test('creates message with provided content') — content is passed in correctly
- test('generates unique uuid')

#### describe('createSystemMessage')

- test('creates system message with correct type')
- test('includes message content')

#### describe('createProgressMessage')

- test('creates progress message with data')
- test('has correct type "progress"')

---

### src/utils/messages.ts — Message Querying

#### describe('getLastAssistantMessage')

- test('returns last assistant message from array') — Returns the last assistant message among multiple messages
- test('returns undefined for empty array')
- test('returns undefined when no assistant messages exist')

#### describe('hasToolCallsInLastAssistantTurn')

- test('returns true when last assistant has tool_use content') — content contains a tool_use block
- test('returns false when last assistant has only text')
- test('returns false for empty messages')

#### describe('isSyntheticMessage')

- test('identifies interrupt message as synthetic') — INTERRUPT_MESSAGE marker
- test('identifies cancel message as synthetic')
- test('returns false for normal user messages')

#### describe('isNotEmptyMessage')

- test('returns true for message with content')
- test('returns false for message with empty content array')
- test('returns false for message with empty text content')

---

### src/utils/messages.ts — Text Extraction

#### describe('getAssistantMessageText')

- test('extracts text from text blocks') — Extracts when content contains `{ type: 'text', text: 'hello' }`
- test('returns empty string for non-text content') — Returns empty when containing only tool_use
- test('concatenates multiple text blocks')

#### describe('getUserMessageText')

- test('extracts text from string content') — content is a plain string
- test('extracts text from content array') — Extracts text blocks when content is an array
- test('handles empty content')

#### describe('extractTextContent')

- test('extracts text items from mixed content') — Filters out items with type: 'text'
- test('returns empty array for all non-text content')

---

### src/utils/messages.ts — Normalization

#### describe('normalizeMessages')

- test('converts raw messages to normalized format') — Message array normalization
- test('handles empty array') — `[]` → `[]`
- test('preserves message order')
- test('handles mixed message types')

#### describe('normalizeMessagesForAPI')

- test('filters out system messages') — System messages are not sent to the API
- test('filters out progress messages')
- test('filters out attachment messages')
- test('preserves user and assistant messages')
- test('reorders tool results to match API expectations')
- test('handles empty array')

---

### src/utils/messages.ts — Merging

#### describe('mergeUserMessages')

- test('merges consecutive user messages') — Adjacent user messages are merged
- test('does not merge non-consecutive user messages')
- test('preserves assistant messages between user messages')

#### describe('mergeAssistantMessages')

- test('merges consecutive assistant messages')
- test('combines content arrays')

---

### src/utils/messages.ts — Helper Functions

#### describe('buildMessageLookups')

- test('builds index by message uuid') — Builds lookup table by uuid
- test('returns empty lookups for empty messages')
- test('handles duplicate uuids gracefully')

---

## Mock Requirements

| Dependency | Mock Approach | Notes |
|------------|---------------|-------|
| `crypto.randomUUID` | `mock` or spy | UUID generation in message creation |
| Message objects | Manual construction | Create mock message objects matching the types |

### Mock Message Factory (located in `tests/mocks/messages.ts`)

```typescript
// Generic mock message constructors
export function mockAssistantMessage(overrides?: Partial<AssistantMessage>): AssistantMessage
export function mockUserMessage(content: string, overrides?: Partial<UserMessage>): UserMessage
export function mockSystemMessage(overrides?: Partial<SystemMessage>): SystemMessage
export function mockToolUseBlock(name: string, input: unknown): ToolUseBlock
export function mockToolResultMessage(toolUseId: string, content: string): UserMessage
```

## Integration Test Scenarios

### describe('Message pipeline')

- test('create → normalize → API format produces valid request') — Create messages → normalizeMessagesForAPI → verify output structure
- test('tool use and tool result pairing is preserved through normalization')
- test('merge + normalize handles conversation with interruptions')
