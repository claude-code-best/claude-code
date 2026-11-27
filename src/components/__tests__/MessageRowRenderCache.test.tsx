import { describe, expect, test } from 'bun:test';
import { randomUUID } from 'crypto';
import type { RenderableMessage } from 'src/types/message.js';
import { areMessageRowPropsEqual } from 'src/components/MessageRow.js';
import { clearRenderCache, getRenderCacheVersion, setMessageRenderCache } from 'src/utils/hooks/renderCache.js';

function assistantMessage(text: string): RenderableMessage {
  return {
    type: 'assistant',
    uuid: randomUUID(),
    message: {
      role: 'assistant',
      content: [{ type: 'text', text }],
    },
  } as unknown as RenderableMessage;
}

// 最小 Props：比较器只消费其中少数字段，其余以空值填充
function makeProps(message: RenderableMessage, renderCacheVersion = 0) {
  return {
    message,
    isUserContinuation: false,
    hasContentAfter: false,
    tools: [],
    commands: [],
    verbose: false,
    inProgressToolUseIDs: new Set<string>(),
    streamingToolUseIDs: new Set<string>(),
    screen: 'main',
    canAnimate: false,
    lastThinkingBlockId: null,
    latestBashOutputUUID: null,
    renderCacheVersion,
    columns: 80,
    isLoading: false,
    lookups: { resolvedToolUseIDs: new Set<string>() },
  } as unknown as Parameters<typeof areMessageRowPropsEqual>[0];
}

describe('areMessageRowPropsEqual (AssistantRender cache version)', () => {
  test('renderCacheVersion bump forces re-render', () => {
    clearRenderCache();
    const message = assistantMessage('render-target');
    const prev = makeProps(message, getRenderCacheVersion());
    expect(areMessageRowPropsEqual(prev, prev)).toBe(true);
    setMessageRenderCache('render-target', 'ASCII');
    const next = makeProps(message, getRenderCacheVersion());
    expect(areMessageRowPropsEqual(prev, next)).toBe(false);
  });

  test('same renderCacheVersion with static message bails out', () => {
    clearRenderCache();
    setMessageRenderCache('stable', 'ASCII');
    const version = getRenderCacheVersion();
    const message = assistantMessage('stable');
    const prev = makeProps(message, version);
    const next = makeProps(message, version);
    expect(areMessageRowPropsEqual(prev, next)).toBe(true);
  });
});
