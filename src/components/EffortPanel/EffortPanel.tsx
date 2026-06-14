import * as React from 'react';
import { BaseText, Box, Text } from '@anthropic/ink';
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
import {
  TRANSPARENT,
  type Overlay,
  type Segment,
  applyOverlaysToCells,
  cellsToSegments,
  computeRippleCells,
} from './rippleAnimation.js';

// 每档固定宽度，Ink Box 自动对齐。PANEL_WIDTH = SEGMENT * 6。
const SEGMENT = 12;
const PANEL_WIDTH = SEGMENT * PANEL_POSITIONS.length;
const SUBLABEL_ULTRACODE = 'xhigh + workflows';

// 颜色：与项目主题对齐（suggestion=Medium blue #5769F7）。
const COLOR_LABEL_SELECTED = '#5769F7'; // 选中档位（suggestion）
const COLOR_LABEL_DEFAULT = '#8a8a8a'; // 未选中档位（subtle gray）
const COLOR_OVERLAY = '#5769F7'; // Faster / Smarter / ▲ 等 overlay 文字

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

  // 波纹行 cells 计算：返回该行所有 cell（含 overlay 文字）
  const renderRippleRow = React.useCallback(
    (relY: number, overlays: Overlay[]): Segment[] => {
      const cells = computeRippleCells({
        y: relY + RIPPLE_SOURCE_Y,
        width: PANEL_WIDTH,
        time,
        sourceX: RIPPLE_SOURCE_X,
        sourceY: RIPPLE_SOURCE_Y,
      });
      const overlayed = applyOverlaysToCells(cells, overlays);
      return cellsToSegments(overlayed);
    },
    [time],
  );

  return (
    <Box ref={rippleRef} flexDirection="column" paddingX={1} width={PANEL_WIDTH + 2}>
      <Text bold color="suggestion">
        Effort
      </Text>
      {envActive && <Text color="warning">{`⚠ CLAUDE_CODE_EFFORT_LEVEL=${envRaw} overrides this session`}</Text>}
      {rippleActive ? <RippleContent renderRow={renderRippleRow} cursor={cursor} /> : <PlainContent cursor={cursor} />}
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
//
// 渲染策略：
// - 每行先 computeRippleCells 算出强度→颜色的 cell 数组（背景为空格 + 颜色）
// - applyOverlaysToCells 把文字 overlay（Faster/▲/档位名/副标签）写入对应 cell
// - cellsToSegments 合并相邻同色段
// - 渲染层遍历 segments：每个段判断是"空格波纹段"还是"文字段"
//   - 空格段：用 backgroundColor 把空格染成色块（pure color block）
//   - 文字段：用 color 染色文字（背景保持终端默认，让文字最清晰）
//   - 混合段（既有空格又有文字，少见）：拆为前后两个 Text
//
// 注意：Segment 内可能同时有空格和非空格字符（如 "  Faster  " 居中文字）。
// 这种段用 color 渲染时，空格部分不显示色块——视觉上"色块断裂"。
// 解决：渲染时把 segment 按字符类型二次拆分（runs of whitespace vs non-whitespace）。

type RippleContentProps = {
  renderRow: (relY: number, overlays: Overlay[]) => Segment[];
  cursor: PanelPosition;
};

function RippleContent({ renderRow, cursor }: RippleContentProps): React.ReactNode {
  const cursorIdx = PANEL_POSITIONS.indexOf('ultracode');

  const fasterOverlay: Overlay = { text: 'Faster', x: 0, color: COLOR_OVERLAY };
  const smarterOverlay: Overlay = {
    text: 'Smarter',
    x: PANEL_WIDTH - 'Smarter'.length,
    color: COLOR_OVERLAY,
  };
  const separatorOverlay: Overlay = {
    text: '─'.repeat(PANEL_WIDTH),
    x: 0,
    color: COLOR_LABEL_DEFAULT,
  };
  const cursorOverlay: Overlay = {
    text: '▲',
    x: segmentTextStartX(cursorIdx, 1),
    color: COLOR_OVERLAY,
  };
  const labelOverlays: Overlay[] = PANEL_POSITIONS.map((p, idx) => ({
    text: p,
    x: segmentTextStartX(idx, p.length),
    color: p === cursor ? COLOR_LABEL_SELECTED : COLOR_LABEL_DEFAULT,
  }));
  const sublabelOverlay: Overlay = {
    text: SUBLABEL_ULTRACODE,
    x: segmentTextStartX(cursorIdx, SUBLABEL_ULTRACODE.length),
    color: COLOR_LABEL_DEFAULT,
  };

  // 各行 y 坐标（相对震源 RIPPLE_SOURCE_Y = 档位名行）
  //   y=-3: Faster/Smarter
  //   y=-2: 分隔线
  //   y=-1: ▲
  //   y=0:  档位名（震源）
  //   y=1:  副标签
  return (
    <>
      <RippleRow segments={renderRow(-3, [fasterOverlay, smarterOverlay])} />
      <RippleRow segments={renderRow(-2, [separatorOverlay])} />
      <RippleRow segments={renderRow(-1, [cursorOverlay])} />
      <RippleRow segments={renderRow(0, labelOverlays)} />
      <RippleRow segments={renderRow(1, [sublabelOverlay])} />
    </>
  );
}

/**
 * 渲染一行波纹 segments。
 *
 * 每个 segment 可能含空格 + 文字混合（如 "  Faster  "）：
 * - 空格部分用 backgroundColor 染色块（波纹颜色）
 * - 文字部分用 color 染色（亮色，背景保持终端默认）
 *
 * 简化策略：遍历 segment 字符，按"是否为空格"二次拆分为 token。
 * 相邻同类型 token 合并，避免 React key 爆炸。
 */
function RippleRow({ segments }: { segments: Segment[] }): React.ReactNode {
  const tokens: Array<{ text: string; kind: 'space' | 'text'; color: string }> = [];
  for (const seg of segments) {
    // 拆分 seg.text 为空格段和非空格段
    let buf = '';
    let bufIsSpace: boolean | null = null;
    const flush = (): void => {
      if (buf === '' || bufIsSpace === null) return;
      tokens.push({
        text: buf,
        kind: bufIsSpace ? 'space' : 'text',
        color: seg.color,
      });
      buf = '';
      bufIsSpace = null;
    };
    for (const ch of seg.text) {
      const isSpace = ch === ' ';
      if (bufIsSpace === null) {
        buf = ch;
        bufIsSpace = isSpace;
      } else if (isSpace === bufIsSpace) {
        buf += ch;
      } else {
        flush();
        buf = ch;
        bufIsSpace = isSpace;
      }
    }
    flush();
  }

  return (
    <Box flexDirection="row">
      {tokens.map((tok, i) =>
        tok.kind === 'space' ? (
          tok.color === TRANSPARENT ? (
            <BaseText key={i}>{tok.text}</BaseText>
          ) : (
            <BaseText key={i} backgroundColor={tok.color as `#${string}`}>
              {tok.text}
            </BaseText>
          )
        ) : (
          <Text key={i} color={tok.color as `#${string}`} bold>
            {tok.text}
          </Text>
        ),
      )}
    </Box>
  );
}
