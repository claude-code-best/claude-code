import React, { useMemo, useState } from 'react';
import { Box, Dialog, Text, useInput } from '@anthropic/ink';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import { resolveFullscreenMode } from '../../utils/fullscreen.js';
import { wasFullscreenDegradedThisSession } from '../../utils/rendererHealth.js';
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
        description: 'Show current renderer, overrides and failure state',
        run: () => void runTuiAction('status', onDone),
      },
      {
        label: 'Fullscreen',
        description: 'Alternate screen buffer, no scrollback flicker',
        run: () => void runTuiAction('fullscreen', onDone),
      },
      {
        label: 'Classic',
        description: 'Main terminal buffer with native scrollback',
        run: () => void runTuiAction('classic', onDone),
      },
    ],
    [onDone],
  );

  // Current renderer line — the panel doubles as the no-arg status view
  // (official 2.1.330: /tui with no args shows the current state).
  const resolved = resolveFullscreenMode();
  const currentRenderer = resolved.fullscreen ? 'fullscreen' : 'classic';
  const degradedNote = wasFullscreenDegradedThisSession()
    ? ' · fell back after startup failures, /tui fullscreen retries'
    : '';

  const select = () => {
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
      select();
    }
  });

  return (
    <Dialog
      title="TUI Renderer"
      subtitle={`${actions.length} actions`}
      onCancel={() => onDone('TUI panel dismissed', { display: 'system' })}
      color="background"
      hideInputGuide
    >
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text>{`Current renderer: ${currentRenderer}${degradedNote}`}</Text>
        </Box>
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
