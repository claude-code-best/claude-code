import React from 'react';
import { Box, Text } from '@anthropic/ink';
import type { Theme } from '@anthropic/ink';
import type { AgentProgress } from '../progress/store.js';
import { PHASE_COLOR, PHASE_MARK, type PhaseStatus } from './status.js';
import { ALL_PHASE, type MergedPhase } from './selectors.js';

type PhaseRow = {
  title: string;
  status?: PhaseStatus;
  done: number;
  total: number;
};

/**
 * 左 phase 侧栏：第一行 All（汇总 done/total），其后 merged phases（含 pending ○）。
 * 选中行铺橙底（文字色不变）；selectedIndex=0 表示 All。
 */
export function PhaseSidebar({
  phases,
  agents,
  selectedIndex,
}: {
  phases: MergedPhase[];
  agents: AgentProgress[];
  selectedIndex: number;
}): React.ReactNode {
  const totalAgents = agents.length;
  const doneAgents = agents.filter(a => a.status === 'done').length;
  const rows: PhaseRow[] = [{ title: ALL_PHASE, done: doneAgents, total: totalAgents }, ...phases];

  return (
    <Box flexDirection="column">
      {rows.map((row, i) => {
        const selected = i === selectedIndex;
        const mark = row.status ? PHASE_MARK[row.status] : ' ';
        const color = row.status ? (PHASE_COLOR[row.status] as keyof Theme) : undefined;
        return (
          <Box key={row.title}>
            <Text backgroundColor={selected ? 'claude' : undefined} color={color}>
              {selected ? '▶' : ' '}
              {mark} {row.title.padEnd(10)} {row.done}/{row.total}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
