import * as React from 'react';
import { Box, Text, useTerminalSize } from '@anthropic/ink';
import { useKeybindings } from '../keybindings/useKeybinding.js';
import { clampSliderIndex, getInitialSliderIndex, moveSliderLeft, moveSliderRight } from './sliderState.js';

/**
 * Shared value-slider component (official 2.1.330 `/autocompact` &
 * `/scroll-speed` alignment): shows every value at once, current value
 * highlighted, ←/→ steps, Home/End jump to the ends, Enter confirms,
 * Esc/q/ctrl+c cancels. Fits narrow terminals by shrinking per-value
 * segments down to MIN_SEGMENT columns (labels truncate).
 *
 * Interaction model mirrors EffortPanel (see keybinding context 'Slider'
 * in defaultBindings.ts); rendering is intentionally simpler — no ripple.
 */

export type SliderItem = {
  /** Stable identifier for the value (e.g. 'on', '3'). */
  value: string;
  /** Displayed label for the value. Keep short — narrow terminals truncate. */
  label: string;
  /** Optional line shown while the cursor sits on this value. */
  description?: string;
};

export type SliderProps = {
  items: readonly SliderItem[];
  /** Current live value; the cursor starts on it when present in items. */
  currentValue?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
  /** Keybinding context. Defaults to 'Slider'. */
  context?: string;
  /** Optional bold heading line above the value track. */
  heading?: string;
  /** Optional dim note line under the heading (e.g. env-var override). */
  note?: string;
};

/** Minimum columns per value slot before labels start truncating. */
const MIN_SEGMENT = 6;

// Colors aligned with EffortPanel (suggestion = Claude Blue #5769F7).
const COLOR_SELECTED = '#5769F7';
const COLOR_DEFAULT = '#7a8eff';

/**
 * Per-value segment width: fill the terminal when wide, but never shrink
 * below MIN_SEGMENT (labels truncate instead of overlapping neighbors).
 */
function computeSegment(terminalColumns: number, itemCount: number): number {
  const available = terminalColumns - 2; // paddingX={1} on both sides
  const minNeeded = MIN_SEGMENT * Math.max(itemCount, 1);
  if (available <= minNeeded) return MIN_SEGMENT;
  return Math.floor(available / itemCount);
}

function truncateLabel(label: string, width: number): string {
  return label.length <= width ? label : label.slice(0, width);
}

export function Slider({
  items,
  currentValue,
  onConfirm,
  onCancel,
  context = 'Slider',
  heading,
  note,
}: SliderProps): React.ReactNode {
  const { columns } = useTerminalSize();
  const [cursor, setCursor] = React.useState(() =>
    getInitialSliderIndex(
      items.map(item => item.value),
      currentValue,
    ),
  );
  // Confirm/cancel fire exactly once even if a key repeats after done.
  const doneRef = React.useRef(false);

  const handleConfirm = React.useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    const item = items[cursor];
    onConfirm(item ? item.value : '');
  }, [cursor, items, onConfirm]);

  const handleCancel = React.useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCancel();
  }, [onCancel]);

  useKeybindings(
    {
      'slider:decrease': () => setCursor(c => moveSliderLeft(c, items.length)),
      'slider:increase': () => setCursor(c => moveSliderRight(c, items.length)),
      'slider:home': () => setCursor(0),
      'slider:end': () => setCursor(Math.max(items.length - 1, 0)),
      'slider:confirm': handleConfirm,
      'slider:cancel': handleCancel,
    },
    { context },
  );

  if (items.length === 0) {
    return <Text dimColor>Nothing to select.</Text>;
  }

  const safeCursor = clampSliderIndex(cursor, items.length);
  const segment = computeSegment(columns, items.length);
  const activeItem = items[safeCursor];

  return (
    <Box flexDirection="column" paddingX={1}>
      {heading ? (
        <Text color={COLOR_SELECTED} bold>
          {heading}
        </Text>
      ) : null}
      {note ? <Text dimColor>{note}</Text> : null}
      {/* Cursor marker row */}
      <Box flexDirection="row">
        {items.map((item, i) => (
          <Box key={item.value} width={segment} justifyContent="center">
            <Text color={i === safeCursor ? COLOR_SELECTED : COLOR_DEFAULT}>{i === safeCursor ? '▲' : ' '}</Text>
          </Box>
        ))}
      </Box>
      {/* Value labels row */}
      <Box flexDirection="row">
        {items.map((item, i) => (
          <Box key={item.value} width={segment} justifyContent="center">
            <Text color={i === safeCursor ? COLOR_SELECTED : COLOR_DEFAULT} bold={i === safeCursor}>
              {truncateLabel(item.label, segment)}
            </Text>
          </Box>
        ))}
      </Box>
      {/* Description of the value under the cursor */}
      {activeItem?.description ? <Text dimColor>{activeItem.description}</Text> : null}
      <Text color={COLOR_DEFAULT}>←/→ adjust · Home/End ends · Enter confirm · Esc cancel</Text>
    </Box>
  );
}
