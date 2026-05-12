import React, { useMemo, useState } from 'react';
import { Box, Dialog, Text, useInput } from '@anthropic/ink';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import { callTui } from './index.js';

type TuiAction = {
  label: string;
  description: string;
  run: () => void;
};

const ACTION_LABEL_COLUMN_WIDTH = 24;

async function runTuiAction(subcommand: string, onDone: LocalJSXCommandOnDone): Promise<void> {
  const result = await callTui(subcommand);
  if (result.type === 'text') {
    onDone(result.value, { display: 'system' });
  }
}

function TuiPanel({ onDone }: { onDone: LocalJSXCommandOnDone }): React.ReactNode {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const actions = useMemo<TuiAction[]>(
    () => [
      {
        label: 'Status',
        description: 'Show marker and environment override state',
        run: () => void runTuiAction('status', onDone),
      },
      {
        label: 'Toggle',
        description: 'Flip persisted TUI mode for the next session',
        run: () => void runTuiAction('toggle', onDone),
      },
      {
        label: 'On',
        description: 'Enable flicker-free alternate-screen mode',
        run: () => void runTuiAction('on', onDone),
      },
      {
        label: 'Off',
        description: 'Disable flicker-free alternate-screen mode',
        run: () => void runTuiAction('off', onDone),
      },
    ],
    [onDone],
  );

  const selectCurrent = () => {
    const action = actions[selectedIndex];
    if (!action) return;
    action.run();
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
      title="TUI Mode"
      subtitle={`${actions.length} actions`}
      onCancel={() => onDone('TUI mode panel dismissed', { display: 'system' })}
      color="background"
      hideInputGuide
    >
      <Box flexDirection="column">
        {actions.map((action, index) => (
          <Box key={action.label} flexDirection="row">
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
    await runTuiAction(trimmed, onDone);
    return null;
  }
  return <TuiPanel onDone={onDone} />;
}
