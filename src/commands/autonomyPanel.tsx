import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from '@anthropic/ink';
import { Dialog } from '@anthropic/ink';
import { useRegisterOverlay } from '../context/overlayContext.js';
import type { LocalJSXCommandOnDone } from '../types/command.js';
import { getAutonomyCommandText, getAutonomyDeepSectionText, getAutonomyStatusText } from '../cli/handlers/autonomy.js';
import { listAutonomyFlows, type AutonomyFlowRecord } from '../utils/autonomyFlows.js';

type AutonomyAction = {
  label: string;
  description: string;
  run: () => Promise<string>;
};

const BASE_AUTONOMY_PANEL_ACTION_COUNT = 14;
const ACTION_LABEL_COLUMN_WIDTH = 24;

export function getAutonomyPanelBaseActionCountForTests(): number {
  return BASE_AUTONOMY_PANEL_ACTION_COUNT;
}

function AutonomyPanel({ onDone }: { onDone: LocalJSXCommandOnDone }): React.ReactNode {
  useRegisterOverlay('autonomy-panel');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [flows, setFlows] = useState<AutonomyFlowRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    void listAutonomyFlows().then(items => {
      if (!cancelled) setFlows(items.slice(0, 5));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const actions = useMemo<AutonomyAction[]>(() => {
    const base: AutonomyAction[] = [
      {
        label: 'Overview',
        description: 'Show run and flow counts plus the latest automatic activity',
        run: () => getAutonomyStatusText(),
      },
      {
        label: 'Full deep status',
        description: 'Print every local autonomy surface in one diagnostic report',
        run: () => getAutonomyStatusText({ deep: true }),
      },
      {
        label: 'Auto mode',
        description: 'Check whether auto permission mode is available and why',
        run: () => getAutonomyDeepSectionText('auto-mode'),
      },
      {
        label: 'Runs summary',
        description: 'Show queued/running/completed/failed run totals and latest run',
        run: () => getAutonomyDeepSectionText('runs'),
      },
      {
        label: 'Recent runs',
        description: 'List recent autonomy run IDs, triggers, statuses, and prompts',
        run: () => getAutonomyCommandText('runs 10'),
      },
      {
        label: 'Flows summary',
        description: 'Show managed flow totals across queued/running/waiting states',
        run: () => getAutonomyDeepSectionText('flows'),
      },
      {
        label: 'Recent flows',
        description: 'List recent managed flow IDs, status, current step, and goal',
        run: () => getAutonomyCommandText('flows 10'),
      },
      {
        label: 'Cron',
        description: 'Show scheduled autonomy jobs, durability, recurrence, and next run',
        run: () => getAutonomyDeepSectionText('cron'),
      },
      {
        label: 'Workflow runs',
        description: 'Show persisted WorkflowTool runs and their current workflow step',
        run: () => getAutonomyDeepSectionText('workflow-runs'),
      },
      {
        label: 'Teams',
        description: 'Show Agent Teams, teammate backends, activity, and open tasks',
        run: () => getAutonomyDeepSectionText('teams'),
      },
      {
        label: 'Pipes',
        description: 'Show UDS/named-pipe and LAN registry for terminal messaging',
        run: () => getAutonomyDeepSectionText('pipes'),
      },
      {
        label: 'Runtime',
        description: 'Show daemon state and live background or interactive sessions',
        run: () => getAutonomyDeepSectionText('runtime'),
      },
      {
        label: 'Remote Control',
        description: 'Show bridge mode, base URL, token presence, and entitlement note',
        run: () => getAutonomyDeepSectionText('remote-control'),
      },
      {
        label: 'RemoteTrigger',
        description: 'Show recent remote trigger audit records, failures, and latest call',
        run: () => getAutonomyDeepSectionText('remote-trigger'),
      },
    ];

    const flowActions = flows.flatMap<AutonomyAction>(flow => {
      const shortId = flow.flowId.slice(0, 8);
      const items: AutonomyAction[] = [
        {
          label: `Flow ${shortId}`,
          description: `${flow.status}: ${flow.goal}`,
          run: () => getAutonomyCommandText(`flow ${flow.flowId}`),
        },
      ];
      if (flow.status === 'waiting') {
        items.push({
          label: `Resume ${shortId}`,
          description: flow.currentStep ? `Resume waiting step: ${flow.currentStep}` : 'Resume waiting flow',
          run: () =>
            getAutonomyCommandText(`flow resume ${flow.flowId}`, {
              enqueueInMemory: true,
            }),
        });
      }
      if (
        flow.status === 'queued' ||
        flow.status === 'running' ||
        flow.status === 'waiting' ||
        flow.status === 'blocked'
      ) {
        items.push({
          label: `Cancel ${shortId}`,
          description: `Cancel ${flow.status} flow`,
          run: () =>
            getAutonomyCommandText(`flow cancel ${flow.flowId}`, {
              removeQueuedInMemory: true,
            }),
        });
      }
      return items;
    });

    return [...base, ...flowActions];
  }, [flows]);

  const selectCurrent = () => {
    const action = actions[selectedIndex];
    if (!action) return;
    void action.run().then(result => {
      onDone(result, { display: 'system' });
    });
  };

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelectedIndex(index => Math.max(0, index - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex(index => Math.min(actions.length - 1, index + 1));
      return;
    }
    if (key.return) {
      selectCurrent();
    }
  });

  return (
    <Dialog
      title="Autonomy"
      subtitle={`${actions.length} actions`}
      onCancel={() => onDone('Autonomy panel dismissed', { display: 'system' })}
      color="background"
      hideInputGuide
    >
      <Box flexDirection="column">
        {actions.map((action, index) => (
          <Box key={`${action.label}-${index}`} flexDirection="row">
            <Text>{`${index === selectedIndex ? '›' : ' '} ${action.label}`.padEnd(ACTION_LABEL_COLUMN_WIDTH)}</Text>
            <Text dimColor>{action.description}</Text>
          </Box>
        ))}
        <Box marginTop={1}>
          <Text dimColor>↑/↓ select · Enter run · Esc close</Text>
        </Box>
      </Box>
    </Dialog>
  );
}

export async function call(onDone: LocalJSXCommandOnDone, _context: unknown, args?: string): Promise<React.ReactNode> {
  const trimmed = args?.trim() ?? '';
  if (trimmed) {
    const result = await getAutonomyCommandText(trimmed, {
      enqueueInMemory: true,
      removeQueuedInMemory: true,
    });
    onDone(result, { display: 'system' });
    return null;
  }

  return <AutonomyPanel onDone={onDone} />;
}
