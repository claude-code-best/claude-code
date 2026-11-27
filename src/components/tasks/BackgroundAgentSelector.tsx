import { Box, Text } from '@anthropic/ink';
import { useBackgroundAgentTasks } from '../../hooks/useBackgroundAgentTasks.js';
import { useElapsedTime } from '../../hooks/useElapsedTime.js';
import { useAppState } from '../../state/AppState.js';
import type { LocalAgentTaskState } from '../../tasks/LocalAgentTask/LocalAgentTask.js';
import { formatTokens } from '../../utils/format.js';

function AgentRow({ task, selected }: { task: LocalAgentTaskState; selected: boolean }) {
  const elapsed = useElapsedTime(task.startTime, task.status === 'running');
  const tokens = task.progress?.tokenCount ?? 0;
  const isRunning = task.status === 'running';
  return (
    <Box flexDirection="row" width="100%" justifyContent="space-between">
      <Box flexDirection="row" flexShrink={1}>
        <Text color={isRunning ? 'success' : undefined}>{selected ? '● ' : '○ '}</Text>
        <Text bold={selected} wrap="truncate-end">
          {task.agentType} <Text dimColor>{task.description}</Text>
        </Text>
      </Box>
      <Box flexShrink={0}>
        <Text dimColor>
          {elapsed} · ↓ {formatTokens(tokens)} tokens
        </Text>
      </Box>
    </Box>
  );
}

function getHint(pillFocused: boolean, viewedTask: LocalAgentTaskState | null, runningAgentCount: number): string {
  if (pillFocused) return '↑/↓ to select · Enter to view';
  if (!viewedTask) return 'shift+↓ to manage background agents';
  // Official 2.1.330 (m60): while viewing an agent the status bar shows
  // `← 1 agent` — ← exits the view back to the main session, N = agents
  // still running (the viewed one counts even if it just completed).
  const agentCount = Math.max(1, runningAgentCount);
  return `← ${agentCount} ${agentCount === 1 ? 'agent' : 'agents'}`;
}

export function BackgroundAgentSelector(): React.ReactNode {
  const tasks = useBackgroundAgentTasks();
  const viewingId = useAppState(s => s.viewingAgentTaskId);
  const footerSelection = useAppState(s => s.footerSelection);
  const selectedBgIndex = useAppState(s => s.selectedBgAgentIndex);

  if (tasks.length === 0) return null;

  const pillFocused = footerSelection === 'bg_agent';
  const highlightedId = pillFocused
    ? selectedBgIndex === -1
      ? null
      : (tasks[selectedBgIndex]?.agentId ?? null)
    : (viewingId ?? null);
  const mainHighlighted = pillFocused ? selectedBgIndex === -1 : viewingId === undefined;
  const viewedTask = viewingId ? (tasks.find(t => t.agentId === viewingId) ?? null) : null;
  const runningAgentCount = tasks.filter(t => t.status === 'running').length;

  return (
    <Box flexDirection="column" width="100%">
      <Box flexDirection="row" width="100%" justifyContent="space-between">
        <Text bold={mainHighlighted}>{mainHighlighted ? '● ' : '○ '}main</Text>
        <Text dimColor>{getHint(pillFocused, viewedTask, runningAgentCount)}</Text>
      </Box>
      {tasks.map(task => (
        <AgentRow key={task.agentId} task={task} selected={task.agentId === highlightedId} />
      ))}
    </Box>
  );
}
