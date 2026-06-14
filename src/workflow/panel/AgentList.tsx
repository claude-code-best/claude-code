import React from 'react';
import { Box, Text, useAnimationFrame } from '@anthropic/ink';
import type { Theme } from '@anthropic/ink';
import type { AgentProgress } from '../progress/store.js';
import { agentMetaText, agentVisual } from './status.js';

const SPINNER_FRAMES = ['·', '✢', '✱', '✶', '✻', '✽'];
const FRAME_MS = 120;
const LABEL_MAX = 18;

/**
 * Truncate the label to at most max characters. Preserves the trailing `#number` suffix (the audit workflow
 * `verify:${dim}#${findingIdx}` format) - so verify agent labels with multiple findings under the same dimension
 * stay distinguishable (the prefix is elided with `…`). When there is no suffix, truncates from the right (legacy behavior).
 * Exported for unit test coverage.
 */
export function truncateLabel(raw: string, max: number): string {
  if (raw.length <= max) return raw;
  const m = raw.match(/#\d+$/);
  if (!m) return raw.slice(0, max);
  const suffix = m[0]; // includes the # sign
  const prefix = raw.slice(0, raw.length - suffix.length);
  const available = max - suffix.length - 1; // -1 reserved for …
  return `${prefix.slice(0, available)}…${suffix}`;
}

/**
 * Right-side agent list (already filtered by the selected phase).
 * Selected row: only when this column has focus (focused=true) does it paint a selectionBg background (keeps fg, not inverse color);
 * when focus is not on this column it does not paint the background color, to avoid a "fake focus".
 * The status mark of a running agent is driven by useAnimationFrame via a spinner animation (shared clock, globally synchronized);
 * the right side `model · Nk tok · N tool` is refreshed in real time by agent_progress / agent_done.
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
  // Subscribe once to the animation frame at the top level: all running agents share the same frame (synchronized animation, avoids a per-row hook).
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
