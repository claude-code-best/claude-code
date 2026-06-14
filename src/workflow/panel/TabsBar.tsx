import React from 'react';
import { Box, Text } from '@anthropic/ink';
import type { Theme } from '@anthropic/ink';
import type { RunProgress } from '../progress/store.js';
import { RUN_STATUS_COLOR, STATUS_DOT } from './status.js';
import { tabLabel } from './selectors.js';

/**
 * Top run tab row: one tab per run (status dot + name + #short code).
 * The current tab is highlighted with an orange ═ underline.
 */
export function TabsBar({ runs, activeRunId }: { runs: RunProgress[]; activeRunId: string | null }): React.ReactNode {
  if (runs.length === 0) {
    return <Text color="subtle">(no runs)</Text>;
  }
  return (
    <Box>
      {runs.map(r => {
        const active = r.runId === activeRunId;
        const label = tabLabel(r.workflowName, r.runId);
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
    </Box>
  );
}
