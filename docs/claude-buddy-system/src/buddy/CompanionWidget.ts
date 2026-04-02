/**
 * Claude Code Buddy System — Companion UI Widget (终端渲染)
 * 从 @anthropic-ai/claude-code cli.js (v2.1.89) 反编译还原
 *
 * 这是 Buddy 在终端中的实际渲染组件，使用 React + Ink
 * 这里还原为伪代码/逻辑描述，因为实际渲染依赖 Ink 框架
 */

import { RARITY_COLORS, RARITY_STARS, type Companion } from './types.js';
import { renderSprite, getFrameCount, getEmojiFace, FRAME_INTERVAL } from './sprites.js';

// ─── 动画常量 ─────────────────────────────────────────────

/** 动画帧率 (ms) — 源码: Zl8 = 500 */
const TICK_INTERVAL = 500;

/** Reaction 气泡显示时长 (帧数) — 源码: n$7 = 20 → 20 * 500ms = 10秒 */
const REACTION_DURATION_TICKS = 20;

/** Reaction 淡出开始 (最后 N 帧) — 源码: FiK = 6 */
const FADE_START_TICKS = 6;

/** 空闲动画序列 — 源码: miK */
const IDLE_ANIMATION = [0, 0, 0, 0, 1, 0, 0, 0, -1, 0, 0, 2, 0, 0, 0];
// -1 = 闭眼帧 (眼睛替换为 "-")

/**
 * 宠物抚摸 (pet) 的爱心动画帧
 *
 * 源码: piK (使用 ❤ = r6.heart)
 */
const PET_HEART_FRAMES = [
  '   ❤    ❤   ',
  '  ❤  ❤   ❤  ',
  ' ❤   ❤  ❤   ',
  '❤  ❤      ❤ ',
  '·    ·   ·  ',
];

// ─── 触发概率 ─────────────────────────────────────────────

/** 宠物最低消息数阈值，低于此不触发 reaction — 源码: Gl8 = 100 */
const MIN_MESSAGES_FOR_REACTION = 100;

/** 基础 reaction 行数 — 源码: CUY = 12 */
const BASE_REACTION_LINES = 12;

/** 每次 name 长度的额外行数 — 源码: bUY = 2 */
const NAME_LENGTH_BONUS = 2;

/** 额外行数上限 — 源码: xUY = 2 */
const EXTRA_LINES = 2;

/** 直接称呼名字时的额外行数 — 源码: IUY = 36 */
const ADDRESSED_BONUS = 36;

// ─── Widget 渲染逻辑 ──────────────────────────────────────

/**
 * 计算 Reaction 触发所需的最小行数
 *
 * 源码中的变量映射: diK = calculateReactionThreshold
 *
 * @param messageCount - 当前会话消息数
 * @param addressed - 是否直接称呼了宠物名字
 * @returns 需要等待的行数 (0 = 不触发)
 */
export function calculateReactionThreshold(
  companion: Companion | undefined,
  messageCount: number,
  addressed: boolean,
): number {
  if (!companion) return 0;
  // 源码: if (getGlobalConfig().companionMuted) return 0;
  if (messageCount < MIN_MESSAGES_FOR_REACTION) return 0;

  const nameLength = companion.name.length; // 源码: H1(_.name)
  const addressedBonus = addressed ? ADDRESSED_BONUS : 0;

  return Math.max(BASE_REACTION_LINES, nameLength + NAME_LENGTH_BONUS) + EXTRA_LINES + addressedBonus;
}

/**
 * CompanionWidget — 主渲染组件
 *
 * React (Ink) 组件，渲染在终端输入框旁边：
 * 1. ASCII 精灵动画 (500ms 帧率)
 * 2. 气泡对话 (reaction 文本)
 * 3. 爱心动画 (pet 后)
 * 4. 颜色由稀有度决定
 *
 * 源码中的变量映射: i$7 = CompanionWidget
 *
 * 伪代码:
 * ```
 * function CompanionWidget() {
 *   const reaction = useStore(s => s.companionReaction);
 *   const petAt = useStore(s => s.companionPetAt);
 *   const [tick, setTick] = useState(0);
 *
 *   useEffect(() => {
 *     const interval = setInterval(() => setTick(t => t + 1), TICK_INTERVAL);
 *     return () => clearInterval(interval);
 *   }, []);
 *
 *   // 自动清除过期的 reaction
 *   useEffect(() => {
 *     if (!reaction) return;
 *     const timeout = setTimeout(() => {
 *       setStore(s => ({ ...s, companionReaction: undefined }));
 *     }, REACTION_DURATION_TICKS * TICK_INTERVAL);
 *     return () => clearTimeout(timeout);
 *   }, [reaction]);
 *
 *   const companion = getCompanion();
 *   if (!companion || config.companionMuted) return null;
 *
 *   const color = RARITY_COLORS[companion.rarity];
 *   const fading = tick >= REACTION_DURATION_TICKS - FADE_START_TICKS;
 *
 *   // 选择动画帧
 *   const isPetting = petAt && tick - petStartTick < PET_HEART_FRAMES.length;
 *   let frameIdx;
 *   if (reaction || isPetting) {
 *     frameIdx = tick % getFrameCount(companion.species);
 *   } else {
 *     const idleStep = IDLE_ANIMATION[tick % IDLE_ANIMATION.length];
 *     if (idleStep === -1) {
 *       frameIdx = 0; // 闭眼
 *     } else {
 *       frameIdx = idleStep % getFrameCount(companion.species);
 *     }
 *   }
 *
 *   const spriteLines = renderSprite(companion, frameIdx);
 *   // 闭眼时替换眼睛为 "-"
 *   if (IDLE_ANIMATION[tick % IDLE_ANIMATION.length] === -1) {
 *     spriteLines.forEach((line, i) => {
 *       spriteLines[i] = line.replaceAll(companion.eye, '-');
 *     });
 *   }
 *
 *   return (
 *     <Box flexDirection="column">
 *       {isPetting && <Text color="autoAccept">{PET_HEART_FRAMES[...]}</Text>}
 *       {spriteLines.map(line => <Text color={color}>{line}</Text>)}
 *       <Text italic dimColor>{companion.name}</Text>
 *       {reaction && <SpeechBubble text={reaction} color={color} fading={fading} tail="up" />}
 *     </Box>
 *   );
 * }
 * ```
 */

/**
 * ReactionBubble — 气泡组件
 *
 * 显示在精灵上方，带有向下的尾巴指向精灵
 *
 * 源码中的变量映射: UiK = SpeechBubble
 */

/**
 * CompanionCard — 孵化/查看卡片组件
 *
 * 源码中的变量映射: Qd8 = CompanionCard
 *
 * 渲染:
 * - 精灵 (居中)
 * - 稀有度星级
 * - 名字 + 物种
 * - 性格描述
 * - 五项属性条
 *
 * 伪代码:
 * ```
 * function CompanionCard({ companion, lastReaction, onDone }) {
 *   const color = RARITY_COLORS[companion.rarity];
 *   const sprite = renderSprite(companion);
 *   const stars = RARITY_STARS[companion.rarity];
 *
 *   return (
 *     <Box borderStyle="round" padding={2} width={40}>
 *       <Box flexDirection="column" alignItems="center">
 *         {sprite.map(line => <Text color={color}>{line}</Text>)}
 *         <Text bold color={color}>{companion.name}</Text>
 *         <Text dimColor>{companion.species} · {companion.rarity.toUpperCase()} {stars}</Text>
 *         {companion.shiny && <Text color="warning">✨ SHINY</Text>}
 *         <Text italic>{companion.personality}</Text>
 *         {STAT_NAMES.map(stat => (
 *           <StatBar name={stat} value={companion.stats[stat]} color={color} />
 *         ))}
 *       </Box>
 *     </Box>
 *   );
 * }
 * ```
 */

/**
 * HatchAnimation — 孵化动画
 *
 * 源码: 显示蛋的破碎动画帧序列
 *
 * ```
 * 帧序列 (wz7):
 * 1. 完整蛋: ╱╲  ╱╲  → 裂纹逐渐扩大
 * 2. 蛋裂开: 裂缝变大
 * 3. 蛋碎裂: 碎片散开
 * 4. 星光闪烁: ·  ✦  · 过渡
 * 5. 最终: 显示 CompanionCard
 * ```
 */
export const HATCH_EGG_FRAMES = [
  // 完整蛋
  { offset: 0, lines: ['    __ __    ', '   / ___ \\   ', '  / /   \\ \\  ', ' | /     \\ | ', '  \\   ∨   /  ', '   \\__∨__/   '] },
  // 裂纹
  { offset: 1, lines: ['    __ __    ', '   / V V \\   ', '  / ∕   \\ \\  ', ' | ∕     \\ | ', '  \\   ∨   /  ', '   \\__∨__/   '] },
  // 星光过渡
  { offset: 0, lines: ['   ·  ✦  ·   ', '  ·       ·  ', ' ·    ✦    · ', '  ✦       ✦  ', ' ·    ·    · ', '   ·  ✦  ·   '] },
];
