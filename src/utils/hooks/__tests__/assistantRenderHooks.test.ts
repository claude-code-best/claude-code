import { describe, expect, test } from 'bun:test'
import { randomUUID } from 'crypto'
import { getSessionId } from 'src/bootstrap/state.js'
import type { AppState } from 'src/state/AppState.js'
import type { AssistantMessage } from 'src/types/message.js'
import type { HookCommand } from 'src/utils/settings/types.js'
import {
  clearRenderCache,
  getCachedRenderedText,
} from 'src/utils/hooks/renderCache.js'
import {
  executeAssistantRenderHooks,
  shouldSkipHookDueToTrust,
} from 'src/utils/hooks.js'
import { addSessionHook } from 'src/utils/hooks/sessionHooks.js'

// 全家桶运行时，先加载的测试文件会进程级 mock config.ts / bootstrap/state.js
// （bun mock.module 为 last-write-wins），把信任检查打成 false，使 spawn 类用例
// 被 shouldSkipHookDueToTrust 短路。这里以同一个信任门状态作金丝雀：
// 被污染 → 跳过 spawn 用例（隔离运行 `bun test <本文件>` 时全量执行）。
const testWithSpawn = test.skipIf(shouldSkipHookDueToTrust())

// 会话级 command hook 注册（进程内 appState，不落盘，测试结束即弃）
function makeAppState(): {
  appState: AppState
  setAppState: (updater: (prev: AppState) => AppState) => void
} {
  let state = { sessionHooks: new Map() } as unknown as AppState
  const setAppState = (updater: (prev: AppState) => AppState) => {
    state = updater(state)
  }
  return { appState: state, setAppState }
}

function assistantMessage(blocks: unknown[]): AssistantMessage {
  return {
    type: 'assistant',
    uuid: randomUUID(),
    message: {
      role: 'assistant',
      content: blocks,
    } as AssistantMessage['message'],
  }
}

function makeToolUseContext(appState: AppState) {
  return {
    getAppState: () => appState,
  } as unknown as Parameters<typeof executeAssistantRenderHooks>[1]
}

// 固定输出 AssistantRender 协议 JSON 的 command hook（stdin 用不上，直接 echo）
function echoRenderHook(blockIndex: number, text: string): HookCommand {
  return {
    type: 'command',
    command: `echo '{"continue":true,"hookSpecificOutput":{"hookEventName":"AssistantRender","updatedBlocks":[{"blockIndex":${blockIndex},"text":${JSON.stringify(text)}}]}}'`,
  }
}

// 不返回 updatedBlocks 的 command hook（验证原文保留路径）
function plainEchoHook(): HookCommand {
  return { type: 'command', command: `echo '{"continue":true}'` }
}

describe('executeAssistantRenderHooks', () => {
  test('no hooks registered → returns 0, cache untouched', async () => {
    clearRenderCache()
    const { appState } = makeAppState()
    const messages = [assistantMessage([{ type: 'text', text: 'plain' }])]
    const count = await executeAssistantRenderHooks(
      messages,
      makeToolUseContext(appState),
    )
    expect(count).toBe(0)
    expect(getCachedRenderedText('plain')).toBeUndefined()
  })

  test('message without text blocks is skipped', async () => {
    clearRenderCache()
    const { appState, setAppState } = makeAppState()
    addSessionHook(
      setAppState,
      getSessionId(),
      'AssistantRender',
      '',
      echoRenderHook(0, 'SHOULD-NOT-BE-USED'),
    )
    const messages = [
      assistantMessage([
        { type: 'tool_use', id: 't1', name: 'Bash', input: {} },
      ]),
    ]
    const count = await executeAssistantRenderHooks(
      messages,
      makeToolUseContext(appState),
    )
    expect(count).toBe(0)
  })

  testWithSpawn('hook updatedBlocks → cache write + count', async () => {
    clearRenderCache()
    const { appState, setAppState } = makeAppState()
    addSessionHook(
      setAppState,
      getSessionId(),
      'AssistantRender',
      '',
      echoRenderHook(0, 'RENDERED-ASCII'),
    )
    const messages = [assistantMessage([{ type: 'text', text: 'raw source' }])]
    const count = await executeAssistantRenderHooks(
      messages,
      makeToolUseContext(appState),
    )
    expect(count).toBe(1)
    expect(getCachedRenderedText('raw source')).toBe('RENDERED-ASCII')
  })

  test('multiple distinct hooks registered → rendering skipped entirely', async () => {
    clearRenderCache()
    const { appState, setAppState } = makeAppState()
    addSessionHook(
      setAppState,
      getSessionId(),
      'AssistantRender',
      '',
      echoRenderHook(0, 'SHOULD-NOT-RUN-A'),
    )
    addSessionHook(
      setAppState,
      getSessionId(),
      'AssistantRender',
      '',
      echoRenderHook(0, 'SHOULD-NOT-RUN-B'),
    )
    const messages = [assistantMessage([{ type: 'text', text: 'multi' }])]
    const count = await executeAssistantRenderHooks(
      messages,
      makeToolUseContext(appState),
    )
    expect(count).toBe(0)
    expect(getCachedRenderedText('multi')).toBeUndefined()
  })

  testWithSpawn('hook without updatedBlocks → original preserved', async () => {
    clearRenderCache()
    const { appState, setAppState } = makeAppState()
    addSessionHook(
      setAppState,
      getSessionId(),
      'AssistantRender',
      '',
      plainEchoHook(),
    )
    const messages = [assistantMessage([{ type: 'text', text: 'keep me' }])]
    const count = await executeAssistantRenderHooks(
      messages,
      makeToolUseContext(appState),
    )
    expect(count).toBe(0)
    expect(getCachedRenderedText('keep me')).toBeUndefined()
  })

  testWithSpawn(
    'multi-block partial replacement only counts changed blocks',
    async () => {
      clearRenderCache()
      const { appState, setAppState } = makeAppState()
      // 只回填 blockIndex 1
      addSessionHook(
        setAppState,
        getSessionId(),
        'AssistantRender',
        '',
        echoRenderHook(1, 'SECOND-BLOCK-ASCII'),
      )
      const messages = [
        assistantMessage([
          { type: 'text', text: 'first block' },
          { type: 'text', text: 'second block' },
        ]),
      ]
      const count = await executeAssistantRenderHooks(
        messages,
        makeToolUseContext(appState),
      )
      expect(count).toBe(1)
      expect(getCachedRenderedText('first block')).toBeUndefined()
      expect(getCachedRenderedText('second block')).toBe('SECOND-BLOCK-ASCII')
    },
  )

  test('replacement identical to original is not counted', async () => {
    clearRenderCache()
    const { appState, setAppState } = makeAppState()
    addSessionHook(
      setAppState,
      getSessionId(),
      'AssistantRender',
      '',
      echoRenderHook(0, 'unchanged source'),
    )
    const messages = [
      assistantMessage([{ type: 'text', text: 'unchanged source' }]),
    ]
    const count = await executeAssistantRenderHooks(
      messages,
      makeToolUseContext(appState),
    )
    expect(count).toBe(0)
  })
})
