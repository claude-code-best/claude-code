import { describe, expect, test } from 'bun:test';
import * as React from 'react';
import { launchSnapshotUpdateDialog } from '../../../dialogLaunchers.js';
import { buildMergePrompt, SnapshotUpdateDialog } from '../SnapshotUpdateDialog.js';
import { Select } from '../../CustomSelect/index.js';

function getSnapshotDialogFromRenderedTree(rendered: React.ReactElement) {
  const appStateProvider = rendered as React.ReactElement<{
    children: React.ReactElement;
  }>;
  const keybindingSetup = appStateProvider.props.children as React.ReactElement<{
    children: React.ReactElement;
  }>;
  return keybindingSetup.props.children as React.ReactElement<{
    agentType: string;
    scope: string;
    snapshotTimestamp: string;
    onComplete: (choice: 'merge' | 'keep' | 'replace') => void;
    onCancel: () => void;
  }>;
}

async function waitForRender(getRendered: () => React.ReactElement | null): Promise<React.ReactElement> {
  for (let i = 0; i < 10; i++) {
    const rendered = getRendered();
    if (rendered) return rendered;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  throw new Error('Snapshot update dialog was not rendered');
}

describe('SnapshotUpdateDialog', () => {
  test('launchSnapshotUpdateDialog wires props and keep-on-cancel semantics through showSetupDialog', async () => {
    let rendered: React.ReactElement | null = null;
    const root = {
      render(node: React.ReactElement) {
        rendered = node;
      },
    } as any;

    const resultPromise = launchSnapshotUpdateDialog(root, {
      agentType: 'researcher',
      scope: 'project',
      snapshotTimestamp: '2026-04-15T12:00:00.000Z',
    });

    const dialogElement = getSnapshotDialogFromRenderedTree(await waitForRender(() => rendered));

    expect(dialogElement.type).toBe(SnapshotUpdateDialog);
    expect(dialogElement.props.agentType).toBe('researcher');
    expect(dialogElement.props.scope).toBe('project');
    expect(dialogElement.props.snapshotTimestamp).toBe('2026-04-15T12:00:00.000Z');

    dialogElement.props.onCancel();
    await expect(resultPromise).resolves.toBe('keep');
  });

  test('launchSnapshotUpdateDialog forwards explicit completion choices', async () => {
    let rendered: React.ReactElement | null = null;
    const root = {
      render(node: React.ReactElement) {
        rendered = node;
      },
    } as any;

    const resultPromise = launchSnapshotUpdateDialog(root, {
      agentType: 'researcher',
      scope: 'user',
      snapshotTimestamp: '2026-04-15T12:00:00.000Z',
    });

    const dialogElement = getSnapshotDialogFromRenderedTree(await waitForRender(() => rendered));
    dialogElement.props.onComplete('replace');

    await expect(resultPromise).resolves.toBe('replace');
  });

  test('buildMergePrompt is non-empty and varies with both agentType and scope', () => {
    const projectPrompt = buildMergePrompt('researcher', 'project');
    const userPrompt = buildMergePrompt('researcher', 'user');
    const plannerPrompt = buildMergePrompt('planner', 'project');

    expect(projectPrompt.trim().length).toBeGreaterThan(0);
    expect(projectPrompt).toContain('researcher');
    expect(projectPrompt).toContain('project');
    expect(projectPrompt.toLowerCase()).toContain('snapshot');
    expect(projectPrompt.toLowerCase()).toContain('merge');
    expect(projectPrompt).not.toBe(userPrompt);
    expect(projectPrompt).not.toBe(plannerPrompt);
  });

  test('renders snapshot metadata and choice options from its public props', () => {
    const element = SnapshotUpdateDialog({
      agentType: 'researcher',
      scope: 'project',
      snapshotTimestamp: '2026-04-15T12:00:00.000Z',
      onComplete: () => {},
      onCancel: () => {},
    } as any) as React.ReactElement<{ title: string; subtitle: string; children: React.ReactNode[] }>;

    expect(element.props.title).toBe('Agent memory snapshot update');
    expect(element.props.subtitle).toContain('researcher');
    expect(element.props.subtitle).toContain('project');

    const [timestamp, select] = element.props.children as Array<React.ReactElement<Record<string, any>>>;
    expect(timestamp.props.children).toContain('2026-04-15T12:00:00.000Z');
    expect(select.type).toBe(Select);
    expect(select.props.options.map((option: { value: string }) => option.value)).toEqual(['merge', 'keep', 'replace']);
    expect(select.props.options.map((option: { label: string }) => option.label)).toEqual([
      'Merge snapshot into current memory',
      'Keep current memory',
      'Replace with snapshot',
    ]);
  });
});
