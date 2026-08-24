import * as React from 'react';
import { Box, Text } from '@anthropic/ink';
import { Select } from '../CustomSelect/select.js';
import { Dialog } from '../design-system/Dialog.js';
import type { CompactStrategyChoice, CompactStrategyMarker } from '../../services/pushStack/state.js';

const FULL_VALUE = '__full__';

interface CompactStrategyDialogProps {
  /** Markers ordered oldest → newest; the last is the nearest (top) push point. */
  markers: ReadonlyArray<CompactStrategyMarker>;
  onChoice: (choice: CompactStrategyChoice) => void;
}

/**
 * Stack-aware auto-compact picker (§4.2). Shown when auto-compact fires with a
 * non-empty push stack. Cancelling defaults to the nearest push point — the
 * safe choice that preserves the branch the user is currently working in.
 */
export function CompactStrategyDialog({ markers, onChoice }: CompactStrategyDialogProps): React.ReactNode {
  const top = markers[markers.length - 1];
  const depth = markers.length;

  const handleChange = React.useCallback(
    (value: string) => {
      if (value === FULL_VALUE) {
        onChoice({ kind: 'full' });
      } else {
        onChoice({ kind: 'partial', markerId: value });
      }
    },
    [onChoice],
  );

  // Cancel → nearest push point (preserve current branch, release most space).
  const handleCancel = React.useCallback(() => {
    if (top) onChoice({ kind: 'partial', markerId: top.id });
    else onChoice({ kind: 'full' });
  }, [onChoice, top]);

  // Nearest first (default highlight), then older markers, then full compact.
  const options: { label: string; value: string; description?: string }[] = [];
  if (top) {
    const noteSuffix = top.note ? ` (${top.note})` : '';
    options.push({
      label: `Compress to nearest push point #${depth}${noteSuffix}`,
      value: top.id,
      description:
        depth > 1
          ? `Keeps your current branch. Removes ${depth - 1} older push point(s).`
          : 'Keeps your current branch; only the mainline before it is compacted.',
    });
  }
  // Older markers (#1..#depth-1), newest-older first.
  for (let i = markers.length - 2; i >= 0; i--) {
    const m = markers[i]!;
    const noteSuffix = m.note ? ` (${m.note})` : '';
    options.push({
      label: `Compress to push point #${m.depth}${noteSuffix}`,
      value: m.id,
      description: `Keeps push points #${m.depth}..#${depth}; compacts everything before #${m.depth}.`,
    });
  }
  options.push({
    label: 'Full compact',
    value: FULL_VALUE,
    description: `Removes all ${depth} push point(s); /pop will no longer work for them.`,
  });

  return (
    <Dialog title="Context is full — how should auto-compact handle your push points?" onCancel={handleCancel}>
      <Box flexDirection="column" gap={1}>
        <Text dimColor>
          You have {depth} open discussion branch{depth > 1 ? 'es' : ''}. Compacting to a push point keeps that branch
          intact.
        </Text>
        <Select options={options} onChange={handleChange} />
      </Box>
    </Dialog>
  );
}

export default CompactStrategyDialog;
