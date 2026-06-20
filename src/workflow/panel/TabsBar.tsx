import React from 'react';
import { Box, Text } from '@anthropic/ink';
import type { Theme } from '@anthropic/ink';
import type { RunProgress } from '../progress/store.js';
import { RUN_STATUS_COLOR, STATUS_DOT } from './status.js';
import { capTabsForDisplay, tabLabel } from './selectors.js';
import { truncateLabel } from './AgentList.js';

/**
 * Per-tab name width budget. Long workflow names truncate (keeping the `#xxxx` short-code suffix so
 * same-name runs stay distinguishable). Sized for a ~120-col terminal: ~6 tabs fit per row.
 */
const TAB_LABEL_MAX = 18;

/**
 * Hard ceiling on simultaneously rendered tabs. Defensive fallback: even if active runs accumulate
 * (long-lived session, runaway launcher), the row must never overflow the terminal width and
 * re-introduce the garbled overlapping render seen previously. Surplus runs are folded into `+N`.
 */
const MAX_TABS = 6;

/**
 * Top run tab row: one tab per run (status dot + name + #short code).
 * The current tab is highlighted with an orange ═ underline.
 *
 * Defenses against overflow:
 * - Per-tab name truncated via truncateLabel (keeps `#xxxx` suffix for disambiguation).
 * - Row capped at MAX_TABS; remainder rendered as a `+N` marker so total width is bounded.
 */
export function TabsBar({ runs, activeRunId }: { runs: RunProgress[]; activeRunId: string | null }): React.ReactNode {
  if (runs.length === 0) {
    return <Text color="subtle">(no runs)</Text>;
  }
  const { runs: visible, overflow } = capTabsForDisplay(runs, MAX_TABS);
  return (
    <Box>
      {visible.map(r => {
        const active = r.runId === activeRunId;
        const label = truncateLabel(tabLabel(r.workflowName, r.runId), TAB_LABEL_MAX);
        const underline = '═'.repeat(label.length + 2);
        return (
          <Box key={r.runId} flexDirection="column" marginRight={2}>
            <Box>
              <Text color={RUN_STATUS_COLOR[r.status] as keyof Theme}>{STATUS_DOT[r.status]}</Text>
              <Text> </Text>
              <Text color={active ? 'claude' : undefined} bold={active}>
                {label}
              </Text>
            </Box>
            <Text color={active ? 'claude' : undefined}>{active ? underline : ''}</Text>
          </Box>
        );
      })}
      {overflow > 0 ? (
        <Box flexDirection="column" marginRight={2}>
          <Text color="subtle">+{overflow}</Text>
          <Text> </Text>
        </Box>
      ) : null}
    </Box>
  );
}
