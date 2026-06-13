import React from 'react';
import { Box, Text, useAnimationFrame } from '@anthropic/ink';
import type { Theme } from '@anthropic/ink';
import type { AgentProgress } from '../progress/store.js';
import { PHASE_COLOR, PHASE_MARK, type PhaseStatus } from './status.js';
import { ALL_PHASE, type MergedPhase } from './selectors.js';

const SPINNER_FRAMES = ['·', '✢', '✱', '✶', '✻', '✽'];
const FRAME_MS = 120;

type PhaseRow = {
  title: string;
  status?: PhaseStatus;
  done: number;
  total: number;
};

/**
 * 左 phase 侧栏：第一行 All（汇总 done/total），其后 merged phases（含 pending ○）。
 * 选中行：仅在本列聚焦（focused=true）时铺 selectionBg 底（保留 fg，非反色）+ `>` 标记；
 * 焦点不在本列时不铺底色，避免“虚假聚焦”。running phase 状态符由 useAnimationFrame 驱动 spinner 动画。
 * 样式对齐参考图：`> ✓ Scan  3/3`。
 */
export function PhaseSidebar({
  phases,
  agents,
  selectedIndex,
  focused,
}: {
  phases: MergedPhase[];
  agents: AgentProgress[];
  selectedIndex: number;
  focused: boolean;
}): React.ReactNode {
  const [ref, time] = useAnimationFrame(FRAME_MS);
  const frame = SPINNER_FRAMES[Math.floor(time / FRAME_MS) % SPINNER_FRAMES.length];
  const totalAgents = agents.length;
  const doneAgents = agents.filter(a => a.status === 'done').length;
  const rows: PhaseRow[] = [{ title: ALL_PHASE, done: doneAgents, total: totalAgents }, ...phases];

  return (
    <Box ref={ref} flexDirection="column">
      {rows.map((row, i) => {
        const selected = i === selectedIndex;
        const highlighted = selected && focused;
        const running = row.status === 'running';
        const mark = running ? frame : row.status ? PHASE_MARK[row.status] : ' ';
        const color = (row.status ? PHASE_COLOR[row.status] : 'subtle') as keyof Theme;
        return (
          <Box key={row.title} backgroundColor={highlighted ? 'selectionBg' : undefined} justifyContent="space-between">
            <Box>
              <Text color={selected ? 'claude' : undefined}>{highlighted ? '>' : ' '}</Text>
              <Text> </Text>
              <Text color={color}>{mark}</Text>
              <Text> {row.title}</Text>
            </Box>
            <Text color="subtle">
              {row.done}/{row.total}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
