import { describe, expect, mock, test } from 'bun:test';
import { logMock } from '../../../../../../tests/mocks/log';
import { debugMock } from '../../../../../../tests/mocks/debug';

mock.module('bun:bundle', () => ({
  feature: (_name: string) => true,
}));
mock.module('src/utils/log.ts', logMock);
mock.module('src/utils/debug.ts', debugMock);

const { TaskOutputTool: Tool } = await import('../TaskOutputTool.js');

type RenderArgs = {
  verbose?: boolean;
  isTranscriptMode?: boolean;
  toolUseResult?: unknown;
};

function renderUseMessage(input: { task_id?: string; block?: boolean }, args: RenderArgs = {}) {
  return Tool.renderToolUseMessage(
    input as never,
    {
      verbose: args.verbose ?? false,
      isTranscriptMode: args.isTranscriptMode ?? false,
      toolUseResult: args.toolUseResult,
    } as never,
  );
}

// Official 2.1.330 (tmux-verified): `⏺ Read agent output b2wa1w7c7` — the
// AGENT id (8 chars), not the task_id. For local_agent background tasks the
// task id IS the agent id (registerAsyncAgent / resumeAgentBackground
// register under agentId).
describe('TaskOutputTool.renderToolUseMessage', () => {
  test('agent task result shows `Read agent output <agentId>` (8-char id)', () => {
    const out = renderUseMessage(
      { task_id: 'a1b2c3d4e5f6a7b8c' },
      { toolUseResult: { task: { task_id: 'a1b2c3d4e5f6a7b8c', task_type: 'local_agent', status: 'completed' } } },
    );
    expect(out).toBe('Read agent output a1b2c3d4');
  });

  test('falls back to the raw task_id when the result is not an agent task yet', () => {
    // No toolUseResult yet (still running / not resolved) — cannot know the
    // task type, so the raw task_id is shown.
    expect(renderUseMessage({ task_id: 'bash-task-123' })).toBe('bash-task-123');
  });

  test('falls back to the raw task_id for non-agent (bash) tasks', () => {
    const out = renderUseMessage(
      { task_id: 'bash-task-123' },
      { toolUseResult: { task: { task_id: 'bash-task-123', task_type: 'local_bash', status: 'completed' } } },
    );
    expect(out).toBe('bash-task-123');
  });

  test('non-blocking calls still show `non-blocking`', () => {
    expect(renderUseMessage({ task_id: 'x', block: false })).toBe('non-blocking');
  });

  test('running/pending tasks hide the row (unless verbose / transcript mode)', () => {
    const running = { task: { task_id: 'a1b2c3d4e5f6a7b8c', task_type: 'local_agent', status: 'running' } };
    expect(renderUseMessage({ task_id: 'a1b2c3d4e5f6a7b8c' }, { toolUseResult: running })).toBeNull();
    expect(renderUseMessage({ task_id: 'a1b2c3d4e5f6a7b8c' }, { toolUseResult: running, verbose: true })).toBe(
      'Read agent output a1b2c3d4',
    );
    expect(renderUseMessage({ task_id: 'a1b2c3d4e5f6a7b8c' }, { toolUseResult: running, isTranscriptMode: true })).toBe(
      'Read agent output a1b2c3d4',
    );
  });

  test('renderToolUseTag renders nothing (the id moved into the use message)', () => {
    expect(Tool.renderToolUseTag?.({ task_id: 'a1b2c3d4e5f6a7b8c' } as never)).toBeNull();
  });
});
