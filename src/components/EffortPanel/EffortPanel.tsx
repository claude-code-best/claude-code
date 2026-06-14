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
import { useRippleFrame } from './useRippleFrame.js';
import { type Overlay, computeRippleLine, mergeLayers } from './rippleAnimation.js';

// 每档固定宽度，Ink Box 自动对齐。PANEL_WIDTH = SEGMENT * 6。
const SEGMENT = 12;
const PANEL_WIDTH = SEGMENT * PANEL_POSITIONS.length;
const SUBLABEL_ULTRACODE = 'xhigh + workflows';

// 波纹震源坐标（相对波纹区域坐标系，y=0 是档位名行）。
// ultracode 字符在 SEGMENT*5=60 起始段内居中（9 字符 in 12 列 → 偏移 1.5 → 1），
// 中心列 ≈ 60 + 1 + 4 = 65。
const RIPPLE_SOURCE_X = SEGMENT * 5 + 5;
const RIPPLE_SOURCE_Y = 0;

/**
 * 计算某段 idx 内居中文字的起始列。
 * 'ultracode' = 9 字符 in SEGMENT=12 → offset = floor((12-9)/2) = 1。
 */
function segmentTextStartX(idx: number, textLen: number): number {
  return SEGMENT * idx + Math.max(0, Math.floor((SEGMENT - textLen) / 2));
}

type Props = {
  appStateEffort: EffortValue | undefined;
  onDone: (message: string) => void;
};

export function EffortPanel({ appStateEffort, onDone }: Props): React.ReactNode {
  const setAppState = useSetAppState();
  const model = useMainLoopModel();

  const envOverride = getEffortEnvOverride();
  const displayed = getDisplayedEffortLevel(model, appStateEffort);
  const initialCursor = getInitialCursor({ envOverride, appStateEffort, displayed });

  const [cursor, setCursor] = React.useState<PanelPosition>(initialCursor);
  const [done, setDone] = React.useState(false);

  const rippleActive = cursor === 'ultracode';
  const [rippleRef, time] = useRippleFrame(rippleActive);

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

  // 波纹行渲染：返回 merge 后的单字符串。
  const renderRippleLine = React.useCallback(
    (relY: number, overlays: Overlay[]): string => {
      const ripple = computeRippleLine({
        y: relY + RIPPLE_SOURCE_Y,
        width: PANEL_WIDTH,
        time,
        sourceX: RIPPLE_SOURCE_X,
        sourceY: RIPPLE_SOURCE_Y,
      });
      return mergeLayers(ripple, overlays);
    },
    [time],
  );

  return (
    <Box ref={rippleRef} flexDirection="column" paddingX={1} width={PANEL_WIDTH + 2}>
      <Text bold color="suggestion">
        Effort
      </Text>
      {envActive && <Text color="warning">{`⚠ CLAUDE_CODE_EFFORT_LEVEL=${envRaw} overrides this session`}</Text>}
      {rippleActive ? (
        <RippleContent time={time} renderLine={renderRippleLine} cursor={cursor} />
      ) : (
        <PlainContent cursor={cursor} />
      )}
      <Box marginTop={1}>
        <Text color="subtle">←/→ adjust · Enter confirm · Esc cancel</Text>
      </Box>
    </Box>
  );
}

// ---- 普通模式（无波纹）----

function PlainContent({ cursor }: { cursor: PanelPosition }): React.ReactNode {
  return (
    <>
      <Box marginTop={1} flexDirection="row" justifyContent="space-between">
        <Text color="suggestion">Faster</Text>
        <Text color="suggestion">Smarter</Text>
      </Box>
      <Text color="subtle">{'─'.repeat(PANEL_WIDTH)}</Text>
      <Box flexDirection="row">
        {PANEL_POSITIONS.map(p => (
          <Box key={`cursor-${p}`} width={SEGMENT} justifyContent="center">
            <Text bold color={cursor === p ? 'suggestion' : 'subtle'}>
              {cursor === p ? '▲' : ' '}
            </Text>
          </Box>
        ))}
      </Box>
      <Box flexDirection="row">
        {PANEL_POSITIONS.map(p => (
          <Box key={`label-${p}`} width={SEGMENT} justifyContent="center">
            <Text bold={cursor === p} color={cursor === p ? 'suggestion' : 'subtle'}>
              {p}
            </Text>
          </Box>
        ))}
      </Box>
      <Box flexDirection="row">
        <Box width={SEGMENT * (PANEL_POSITIONS.length - 1)} />
        <Box width={SEGMENT} justifyContent="center">
          <Text color="subtle">{SUBLABEL_ULTRACODE}</Text>
        </Box>
      </Box>
    </>
  );
}

// ---- 波纹模式（cursor === 'ultracode'）----

type RippleContentProps = {
  time: number;
  renderLine: (relY: number, overlays: Overlay[]) => string;
  cursor: PanelPosition;
};

function RippleContent({ renderLine }: RippleContentProps): React.ReactNode {
  // 各档位名 overlay（基于段中心对齐）
  const labelOverlays: Overlay[] = PANEL_POSITIONS.map((p, idx) => ({
    text: p,
    x: segmentTextStartX(idx, p.length),
  }));

  // ▲ overlay：放在 ultracode 段中心
  const cursorIdx = PANEL_POSITIONS.indexOf('ultracode');
  const cursorOverlay: Overlay = {
    text: '▲',
    x: segmentTextStartX(cursorIdx, 1),
  };

  // 副标签 overlay：放在 ultracode 段中心
  const sublabelOverlay: Overlay = {
    text: SUBLABEL_ULTRACODE,
    x: segmentTextStartX(cursorIdx, SUBLABEL_ULTRACODE.length),
  };

  // Faster / Smarter overlay
  const fasterOverlay: Overlay = { text: 'Faster', x: 0 };
  const smarterOverlay: Overlay = {
    text: 'Smarter',
    x: PANEL_WIDTH - 'Smarter'.length,
  };

  // 分隔线 overlay
  const separatorOverlay: Overlay = {
    text: '─'.repeat(PANEL_WIDTH),
    x: 0,
  };

  // 各行 y 坐标（相对震源 RIPPLE_SOURCE_Y = 档位名行）
  //   y=-3: Faster/Smarter
  //   y=-2: 分隔线
  //   y=-1: ▲
  //   y=0:  档位名（震源）
  //   y=1:  副标签
  const fasterLine = renderLine(-3, [fasterOverlay, smarterOverlay]);
  const separatorLine = renderLine(-2, [separatorOverlay]);
  const cursorLine = renderLine(-1, [cursorOverlay]);
  const labelLine = renderLine(0, labelOverlays);
  const sublabelLine = renderLine(1, [sublabelOverlay]);

  return (
    <>
      <Text color="subtle">{fasterLine}</Text>
      <Text color="subtle">{separatorLine}</Text>
      <Text color="subtle">{cursorLine}</Text>
      <Text color="suggestion" bold>
        {labelLine}
      </Text>
      <Text color="subtle">{sublabelLine}</Text>
    </>
  );
}
