import React from 'react';
import { Box, Text } from '@anthropic/ink';
import type { Theme } from '@anthropic/ink';
import type { AgentProgress } from '../progress/store.js';
import { agentVisual } from './status.js';

const LABEL_WIDTH = 18;

/**
 * 右 agent 列表（已按选中 phase 过滤）。
 * 光标行铺橙底；每行：标记 + label + 行尾状态文字（running/object/text/dead）。
 */
export function AgentList({
  agents,
  selectedIndex,
}: {
  agents: AgentProgress[];
  selectedIndex: number;
}): React.ReactNode {
  if (agents.length === 0) {
    return <Text color="subtle">(no agents in this phase)</Text>;
  }
  return (
    <Box flexDirection="column">
      {agents.map((a, i) => {
        const v = agentVisual(a);
        const selected = i === selectedIndex;
        const label = (a.label ?? `agent-${a.id}`).slice(0, LABEL_WIDTH).padEnd(LABEL_WIDTH);
        return (
          <Box key={a.id}>
            <Text backgroundColor={selected ? 'claude' : undefined}>
              <Text color={v.color as keyof Theme}>{v.mark}</Text> {label} <Text color="subtle">{v.suffix}</Text>
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
