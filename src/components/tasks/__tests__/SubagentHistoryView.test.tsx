import { describe, expect, mock, test } from 'bun:test';
import type { AppState } from '../../../state/AppState.js';
import type { ToolUseContext } from '../../../Tool.js';
import { logMock } from '../../../../tests/mocks/log';
import { debugMock } from '../../../../tests/mocks/debug';

mock.module('bun:bundle', () => ({
  feature: (_name: string) => true,
}));
mock.module('src/utils/log.ts', logMock);
mock.module('src/utils/debug.ts', debugMock);

// ── Mocked resumeAgentBackground (the resume call path under test) ─────────

const resumeAgentBackgroundCalls: {
  agentId: string;
  prompt: string;
  toolUseContext: ToolUseContext;
  canUseTool: unknown;
}[] = [];
let resumeAgentBackgroundError: Error | null = null;

mock.module('@claude-code-best/builtin-tools/tools/AgentTool/resumeAgent.js', () => ({
  resumeAgentBackground: mock(
    async (args: { agentId: string; prompt: string; toolUseContext: ToolUseContext; canUseTool: unknown }) => {
      resumeAgentBackgroundCalls.push(args);
      if (resumeAgentBackgroundError) throw resumeAgentBackgroundError;
    },
  ),
}));

const { resumeRecordedAgent } = await import('../SubagentHistoryView.js');

/** Fake toolUseContext recording setAppState calls (enterTeammateView). */
function makeToolUseContext(): {
  context: ToolUseContext;
  states: AppState[];
} {
  const states: AppState[] = [];
  const context = {
    options: {},
    setAppState: (updater: (prev: AppState) => AppState) => {
      // enterTeammateView reads prev.tasks — an empty task table exercises
      // the needsView path (no live task to retain).
      states.push(updater({ tasks: {} } as AppState));
    },
  } as unknown as ToolUseContext;
  return { context, states };
}

// Official 2.1.330 changelog L1555: "Added an 'Earlier in this session' row
// to /tasks that lists finished subagents, so you can reopen one and message
// it even after it leaves the list or you restart."
describe('resumeRecordedAgent (reopen + message a recorded agent)', () => {
  test('calls resumeAgentBackground with the agentId, prompt and context', async () => {
    const { context } = makeToolUseContext();
    await resumeRecordedAgent({ agentId: 'a1b2c3d4e5f6a7b8c', prompt: 'one more thing', toolUseContext: context });

    expect(resumeAgentBackgroundCalls).toHaveLength(1);
    expect(resumeAgentBackgroundCalls[0]!.agentId).toBe('a1b2c3d4e5f6a7b8c');
    expect(resumeAgentBackgroundCalls[0]!.prompt).toBe('one more thing');
    expect(resumeAgentBackgroundCalls[0]!.toolUseContext).toBe(context);
    // Minimal /tasks-context implementation: a permissive default canUseTool
    // (no interactive permission queue available here).
    expect(typeof resumeAgentBackgroundCalls[0]!.canUseTool).toBe('function');
  });

  test("enters the re-opened agent's viewing state (enterTeammateView)", async () => {
    const { context, states } = makeToolUseContext();
    await resumeRecordedAgent({ agentId: 'a1b2c3d4e5f6a7b8c', prompt: 'hi', toolUseContext: context });

    expect(states).toHaveLength(1);
    const next = states[0] as unknown as Record<string, unknown>;
    expect(next.viewingAgentTaskId).toBe('a1b2c3d4e5f6a7b8c');
    expect(next.viewSelectionMode).toBe('viewing-agent');
  });

  test('a custom canUseTool is passed through to resumeAgentBackground', async () => {
    const { context } = makeToolUseContext();
    const canUseTool = (async () => ({ behavior: 'allow' as const })) as never;
    await resumeRecordedAgent({ agentId: 'a1', prompt: 'p', toolUseContext: context, canUseTool });
    expect(resumeAgentBackgroundCalls.at(-1)!.canUseTool).toBe(canUseTool);
  });

  test('resume errors propagate to the caller (dialog shows the failure)', async () => {
    resumeAgentBackgroundError = new Error('No transcript found for agent ID: gone');
    const { context } = makeToolUseContext();
    await expect(resumeRecordedAgent({ agentId: 'gone', prompt: 'p', toolUseContext: context })).rejects.toThrow(
      'No transcript found for agent ID: gone',
    );
    resumeAgentBackgroundError = null;
  });
});
