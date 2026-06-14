import * as React from 'react';
import { Box, Text } from '@anthropic/ink';
import { useKeybindings } from '../../keybindings/useKeybinding.js';
import { type EffortValue, getDisplayedEffortLevel, getEffortEnvOverride } from '../../utils/effort.js';
import {
  type PanelPosition,
  CANCEL_MESSAGE,
  computeConfirmOutcome,
  getInitialCursor,
  moveLeft,
  moveRight,
  PANEL_POSITIONS,
} from './effortPanelState.js';
import { executeEffort } from '../../commands/effort/effort.js';
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js';
import { useSetAppState } from '../../state/AppState.js';

// 终端 ≥ 80 cols 时使用；窄屏适配第二阶段处理
const PANEL_WIDTH = 76;
const SUBLABEL_ULTRACODE = 'xhigh + workflows';

type Props = {
  appStateEffort: EffortValue | undefined;
  onDone: (message: string) => void;
};

// ▲ 落在每档中心列：均匀分布
function cursorColumn(cursor: PanelPosition): number {
  const segment = Math.floor(PANEL_WIDTH / PANEL_POSITIONS.length);
  const idx = PANEL_POSITIONS.indexOf(cursor);
  return segment * idx + Math.floor(segment / 2);
}

function renderPaddedLine(cursor: PanelPosition): string {
  const col = cursorColumn(cursor);
  // ▲ 上方的"分隔线 + 光标"行：左侧 ─，到列处 ▲，右侧继续 ─
  return `${'─'.repeat(col)}▲${'─'.repeat(Math.max(0, PANEL_WIDTH - col - 1))}`;
}

export function EffortPanel({ appStateEffort, onDone }: Props): React.ReactNode {
  const setAppState = useSetAppState();
  const model = useMainLoopModel();

  const envOverride = getEffortEnvOverride();
  const displayed = getDisplayedEffortLevel(model, appStateEffort);
  const initialCursor = getInitialCursor({ envOverride, appStateEffort, displayed });

  const [cursor, setCursor] = React.useState<PanelPosition>(initialCursor);
  const [done, setDone] = React.useState(false);

  const handleConfirm = React.useCallback(() => {
    if (done) return;
    setDone(true);
    const outcome = computeConfirmOutcome(cursor, executeEffort);
    if (outcome.kind === 'apply' && outcome.effortUpdate) {
      setAppState(prev => ({
        ...prev,
        effortValue: outcome.effortUpdate!.value,
      }));
    }
    onDone(outcome.message);
  }, [cursor, done, onDone, setAppState]);

  const handleCancel = React.useCallback(() => {
    if (done) return;
    setDone(true);
    onDone(CANCEL_MESSAGE);
  }, [done, onDone]);

  useKeybindings(
    {
      'effortPanel:decrease': () => setCursor(c => moveLeft(c)),
      'effortPanel:increase': () => setCursor(c => moveRight(c)),
      'effortPanel:home': () => setCursor('low'),
      'effortPanel:end': () => setCursor('ultracode'),
      'effortPanel:confirm': handleConfirm,
      'effortPanel:cancel': handleCancel,
    },
    { context: 'EffortPanel' },
  );

  const envActive = envOverride !== null && envOverride !== undefined;
  const envRaw = process.env.CLAUDE_CODE_EFFORT_LEVEL;

  // 两极文字行：左 Faster + 中间空格 + 右 Smarter
  const fasterLen = 'Faster'.length;
  const smarterLen = 'Smarter'.length;
  const gap = Math.max(0, PANEL_WIDTH - fasterLen - smarterLen);
  const poleLine = `Faster${' '.repeat(gap)}Smarter`;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>Effort</Text>
      {envActive && <Text color="ansi:yellow">{`⚠ CLAUDE_CODE_EFFORT_LEVEL=${envRaw} overrides this session`}</Text>}
      <Box marginTop={1}>
        <Text>{poleLine}</Text>
      </Box>
      <Text>{renderPaddedLine(cursor)}</Text>
      <Text>
        {PANEL_POSITIONS.map(p => (p as string).padEnd(11))
          .join('')
          .trimEnd()}
      </Text>
      <Text dimColor>{`${' '.repeat(Math.max(0, PANEL_WIDTH - SUBLABEL_ULTRACODE.length))}${SUBLABEL_ULTRACODE}`}</Text>
      <Box marginTop={1}>
        <Text dimColor>←/→ adjust · Enter confirm · Esc cancel</Text>
      </Box>
    </Box>
  );
}
