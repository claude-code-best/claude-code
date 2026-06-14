import React from 'react';
import { Box, Text, useAnimationFrame } from '@anthropic/ink';
import type { Theme } from '@anthropic/ink';
import type { AgentProgress } from '../progress/store.js';
import { agentMetaText, agentVisual } from './status.js';

const SPINNER_FRAMES = ['·', '✢', '✱', '✶', '✻', '✽'];
const FRAME_MS = 120;
const LABEL_MAX = 18;

/**
 * 截断 label 到 max 字符。保留尾部 `#数字` 后缀（audit workflow 的
 * `verify:${dim}#${findingIdx}` 格式）——同 dimension 多 finding 的 verify
 * agent label 仍可区分（前缀用 `…` 省略）。无后缀则从右切（旧行为）。
 * 已导出便于单测覆盖。
 */
export function truncateLabel(raw: string, max: number): string {
  if (raw.length <= max) return raw;
  const m = raw.match(/#\d+$/);
  if (!m) return raw.slice(0, max);
  const suffix = m[0]; // 含 # 号
  const prefix = raw.slice(0, raw.length - suffix.length);
  const available = max - suffix.length - 1; // -1 留给 …
  return `${prefix.slice(0, available)}…${suffix}`;
}

/**
 * 右 agent 列表（已按选中 phase 过滤）。
 * 选中行：仅在本列聚焦（focused=true）时铺 selectionBg 底（保留 fg，非反色）；
 * 焦点不在本列时不铺底色，避免“虚假聚焦”。
 * running agent 的状态符由 useAnimationFrame 驱动 spinner 动画（共享 clock，全局同步）；
 * 右侧 `model · Nk tok · N tool` 由 agent_progress / agent_done 实时刷新。
 */
export function AgentList({
  agents,
  selectedIndex,
  focused,
}: {
  agents: AgentProgress[];
  selectedIndex: number;
  focused: boolean;
}): React.ReactNode {
  // 顶层订阅一次动画帧：所有 running agent 共享同一 frame（同步动画，省去逐行 hook）。
  const [ref, time] = useAnimationFrame(FRAME_MS);
  const frame = SPINNER_FRAMES[Math.floor(time / FRAME_MS) % SPINNER_FRAMES.length];

  if (agents.length === 0) {
    return <Text color="subtle">(no agents in this phase)</Text>;
  }
  return (
    <Box ref={ref} flexDirection="column">
      {agents.map((a, i) => {
        const v = agentVisual(a);
        const selected = i === selectedIndex;
        const highlighted = selected && focused;
        const running = a.status === 'running';
        const mark = running ? frame : v.mark;
        const label = truncateLabel(a.label ?? `agent-${a.id}`, LABEL_MAX);
        return (
          <Box key={a.id} backgroundColor={highlighted ? 'selectionBg' : undefined} justifyContent="space-between">
            <Box>
              <Text color={v.color as keyof Theme}>{mark}</Text>
              <Text> {label}</Text>
            </Box>
            <Text color="subtle">{agentMetaText(a)}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
