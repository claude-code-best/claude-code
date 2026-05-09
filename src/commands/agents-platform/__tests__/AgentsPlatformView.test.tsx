/**
 * Tests for AgentsPlatformView.tsx
 * Covers all 5 modes: list (empty), list (with agents), created, deleted, ran, error
 */
import { describe, expect, mock, test } from 'bun:test';
import * as React from 'react';
import { renderToString } from '../../../utils/staticRender.js';

// Mock cron utility before importing AgentsPlatformView
mock.module('src/utils/cron.js', () => ({
  cronToHuman: (expr: string) => `HumanCron(${expr})`,
  parseCronExpression: () => null,
  computeNextCronRun: () => null,
}));

const { AgentsPlatformView } = await import('../AgentsPlatformView.js');

const sampleAgent = {
  id: 'agt_abc123',
  cron_expr: '0 9 * * 1',
  prompt: 'Run standup report',
  status: 'active' as const,
  timezone: 'UTC',
  next_run: '2026-05-05T09:00:00.000Z',
};

describe('AgentsPlatformView list mode', () => {
  test('empty list shows placeholder message', async () => {
    const out = await renderToString(<AgentsPlatformView mode="list" agents={[]} />);
    expect(out).toContain('No scheduled agents');
  });

  test('non-empty list shows agent count', async () => {
    const out = await renderToString(<AgentsPlatformView mode="list" agents={[sampleAgent]} />);
    expect(out).toContain('Scheduled Agents (1)');
  });

  test('non-empty list shows agent id', async () => {
    const out = await renderToString(<AgentsPlatformView mode="list" agents={[sampleAgent]} />);
    expect(out).toContain('agt_abc123');
  });

  test('non-empty list shows agent status', async () => {
    const out = await renderToString(<AgentsPlatformView mode="list" agents={[sampleAgent]} />);
    expect(out).toContain('active');
  });

  test('non-empty list shows human-readable schedule', async () => {
    const out = await renderToString(<AgentsPlatformView mode="list" agents={[sampleAgent]} />);
    expect(out).toContain('HumanCron(0 9 * * 1)');
  });

  test('list shows agent prompt', async () => {
    const out = await renderToString(<AgentsPlatformView mode="list" agents={[sampleAgent]} />);
    expect(out).toContain('Run standup report');
  });

  test('list shows next run date', async () => {
    const out = await renderToString(<AgentsPlatformView mode="list" agents={[sampleAgent]} />);
    // next_run is formatted via toLocaleString — just check it's rendered
    expect(out).toContain('Next run');
  });

  test('list with null next_run shows em dash', async () => {
    const agentNoNextRun = { ...sampleAgent, next_run: null };
    const out = await renderToString(<AgentsPlatformView mode="list" agents={[agentNoNextRun]} />);
    expect(out).toContain('—');
  });

  test('multiple agents rendered', async () => {
    const agent2 = { ...sampleAgent, id: 'agt_xyz', cron_expr: '0 10 * * 2' };
    const out = await renderToString(<AgentsPlatformView mode="list" agents={[sampleAgent, agent2]} />);
    expect(out).toContain('Scheduled Agents (2)');
    expect(out).toContain('agt_abc123');
    expect(out).toContain('agt_xyz');
  });
});

describe('AgentsPlatformView created mode', () => {
  test('shows Agent created', async () => {
    const out = await renderToString(<AgentsPlatformView mode="created" agent={sampleAgent} />);
    expect(out).toContain('Agent created');
  });

  test('shows agent id', async () => {
    const out = await renderToString(<AgentsPlatformView mode="created" agent={sampleAgent} />);
    expect(out).toContain('agt_abc123');
  });

  test('shows schedule', async () => {
    const out = await renderToString(<AgentsPlatformView mode="created" agent={sampleAgent} />);
    expect(out).toContain('HumanCron(0 9 * * 1)');
  });

  test('shows prompt', async () => {
    const out = await renderToString(<AgentsPlatformView mode="created" agent={sampleAgent} />);
    expect(out).toContain('Run standup report');
  });
});

describe('AgentsPlatformView deleted mode', () => {
  test('shows deleted confirmation with id', async () => {
    const out = await renderToString(<AgentsPlatformView mode="deleted" id="agt_abc123" />);
    expect(out).toContain('agt_abc123');
    expect(out).toContain('deleted');
  });
});

describe('AgentsPlatformView ran mode', () => {
  test('shows triggered with agent id', async () => {
    const out = await renderToString(<AgentsPlatformView mode="ran" id="agt_abc123" runId="run_xyz" />);
    expect(out).toContain('agt_abc123');
    expect(out).toContain('triggered');
  });

  test('shows run id', async () => {
    const out = await renderToString(<AgentsPlatformView mode="ran" id="agt_abc123" runId="run_xyz" />);
    expect(out).toContain('run_xyz');
  });
});

describe('AgentsPlatformView error mode', () => {
  test('shows error message', async () => {
    const out = await renderToString(<AgentsPlatformView mode="error" message="Network failure" />);
    expect(out).toContain('Network failure');
  });
});
