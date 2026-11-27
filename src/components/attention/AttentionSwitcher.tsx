import { Box, Text, useInput } from '@anthropic/ink';
import { BLACK_CIRCLE } from '../../constants/figures.js';
import { useElapsedTime } from '../../hooks/useElapsedTime.js';
import { useAppState, useSetAppState } from '../../state/AppState.js';
import { enterTeammateView, exitTeammateView } from '../../state/teammateViewHelpers.js';
import { formatTokens } from '../../utils/format.js';
import {
  buildAttentionRows,
  closeAttentionSwitcher,
  moveAttentionSelection,
  type AttentionRow,
} from './attentionSwitcherState.js';

/**
 * Attention switcher (official 2.1.330, m60-verified).
 *
 * Opens below the status bar when chat:attentionDown (↓) fires while a panel
 * agent is running:
 *
 *   ↑/↓ to select
 *   ❯ ◯ main
 *     ⏺ general-purpose  500-word essay on mountains   4s · ↑ 16.3k tokens
 *
 * While open, ↑/↓/Enter/esc belong to this component (its useInput consumes
 * and stops them). Opening/penetration is decided by chat:attentionDown in
 * PromptInput's chat handlers; TextInput's history callbacks stand down via
 * the attention guards in handleHistoryUp/Down.
 */

/** `◯` — large circle marking the main row (m60: `◯ main`). */
const MAIN_CIRCLE = '◯';
/** `❯` — marks the currently selected row (m60: `❯ 标记当前项`). */
const SELECTION_MARKER = '❯';

function AgentRow({ row, selected }: { row: AttentionRow & { kind: 'agent' }; selected: boolean }): React.ReactNode {
  const { task } = row;
  // All switcher rows are running agents (buildAttentionRows filters), so the
  // token arrow is `↑` — the count is still climbing (m60: `↑ 16.3k tokens`).
  const elapsed = useElapsedTime(task.startTime, true);
  const tokens = task.progress?.tokenCount ?? 0;
  return (
    <Box flexDirection="row" width="100%" justifyContent="space-between">
      <Box flexDirection="row" flexShrink={1}>
        <Text>{selected ? SELECTION_MARKER : ' '}</Text>
        <Text bold={selected}>
          {BLACK_CIRCLE} {task.agentType} <Text dimColor>{task.description}</Text>
        </Text>
      </Box>
      <Box flexShrink={0}>
        <Text dimColor>
          {elapsed} · ↑ {formatTokens(tokens)} tokens
        </Text>
      </Box>
    </Box>
  );
}

export function AttentionSwitcher(): React.ReactNode {
  const switcher = useAppState(s => s.attentionSwitcher);
  const tasks = useAppState(s => s.tasks);
  const setAppState = useSetAppState();

  const isOpen = switcher !== undefined;

  // ↑/↓ move the selection (wrapping), Enter enters the selected transcript,
  // esc closes. Everything else falls through so the user can still type.
  useInput(
    (_input, key, event) => {
      if (key.escape) {
        setAppState(closeAttentionSwitcher);
        event.stopImmediatePropagation();
        return;
      }
      if (key.upArrow && !key.shift) {
        const rowCount = buildAttentionRows(tasks).length;
        setAppState(prev => moveAttentionSelection(prev, -1, rowCount));
        event.stopImmediatePropagation();
        return;
      }
      if (key.downArrow && !key.shift) {
        const rowCount = buildAttentionRows(tasks).length;
        setAppState(prev => moveAttentionSelection(prev, 1, rowCount));
        event.stopImmediatePropagation();
        return;
      }
      if (key.return) {
        const rows = buildAttentionRows(tasks);
        // Clamp: an agent may have finished while the switcher was open.
        const selectedIndex = Math.min(switcher?.selectedIndex ?? 0, rows.length - 1);
        const row = rows[selectedIndex];
        setAppState(closeAttentionSwitcher);
        if (row?.kind === 'agent') {
          enterTeammateView(row.key, setAppState);
        } else {
          // main (or the list emptied) — return to the main session.
          exitTeammateView(setAppState);
        }
        event.stopImmediatePropagation();
      }
    },
    { isActive: isOpen },
  );

  if (!isOpen) {
    return null;
  }

  const rows = buildAttentionRows(tasks);
  const selectedIndex = Math.min(switcher.selectedIndex, rows.length - 1);

  return (
    <Box flexDirection="column" width="100%">
      <Text dimColor>↑/↓ to select</Text>
      {rows.map((row, index) => {
        const selected = index === selectedIndex;
        if (row.kind === 'main') {
          return (
            <Box key="main" flexDirection="row">
              <Text>{selected ? SELECTION_MARKER : ' '}</Text>
              <Text bold={selected}>{MAIN_CIRCLE} main</Text>
            </Box>
          );
        }
        return <AgentRow key={row.key} row={row} selected={selected} />;
      })}
    </Box>
  );
}
