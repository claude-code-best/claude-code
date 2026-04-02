/**
 * Claude Code Buddy System — Types & Constants
 * 从 @anthropic-ai/claude-code cli.js (v2.1.89) 反编译还原
 */

// ─── 稀有度 ───────────────────────────────────────────────

export const RARITY_NAMES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export type Rarity = (typeof RARITY_NAMES)[number];

/** 稀有度权重（总和 100） */
export const RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 60,
  uncommon: 25,
  rare: 10,
  epic: 4,
  legendary: 1,
};

/** 稀有度 → 星级显示 */
export const RARITY_STARS: Record<Rarity, string> = {
  common: '★',
  uncommon: '★★',
  rare: '★★★',
  epic: '★★★★',
  legendary: '★★★★★',
};

/** 稀有度 → 显示颜色 (Ink color token) */
export const RARITY_COLORS: Record<Rarity, string> = {
  common: 'inactive',
  uncommon: 'success',
  rare: 'permission',
  epic: 'autoAccept',
  legendary: 'warning',
};

/** 稀有度 → 基础属性值 */
export const RARITY_BASE_STATS: Record<Rarity, number> = {
  common: 5,
  uncommon: 15,
  rare: 25,
  epic: 35,
  legendary: 50,
};

// ─── 物种 ─────────────────────────────────────────────────

export const SPECIES = [
  'duck',
  'goose',
  'blob',
  'cat',
  'dragon',
  'octopus',
  'owl',
  'penguin',
  'turtle',
  'snail',
  'ghost',
  'axolotl',
  'capybara',
  'cactus',
  'robot',
  'rabbit',
  'mushroom',
  'chonk',
] as const;
export type Species = (typeof SPECIES)[number];

// ─── 外观 ─────────────────────────────────────────────────

/** 眼睛样式 (6种) */
export const EYES = ['·', '✦', '×', '◉', '@', '°'] as const;
export type Eye = (typeof EYES)[number];

/** 帽子 (8种，common 稀有度无帽子) */
export const HATS = [
  'none',
  'crown',
  'tophat',
  'propeller',
  'halo',
  'wizard',
  'beanie',
  'tinyduck',
] as const;
export type Hat = (typeof HATS)[number];

// ─── 属性 ─────────────────────────────────────────────────

export const STAT_NAMES = ['DEBUGGING', 'PATIENCE', 'CHAOS', 'WISDOM', 'SNARK'] as const;
export type StatName = (typeof STAT_NAMES)[number];

export type Stats = Record<StatName, number>;

// ─── 复合类型 ─────────────────────────────────────────────

/** roll() 生成的确定性骨架 (不含 AI 生成的 name/personality) */
export interface CompanionBones {
  rarity: Rarity;
  species: Species;
  eye: Eye;
  hat: Hat;
  shiny: boolean;
  stats: Stats;
}

/** 由 AI 生成的 "灵魂" (name + personality)，持久化到 config */
export interface CompanionSoul {
  name: string;
  personality: string;
  hatchedAt: number;
}

/** 完整的 Companion = Bones + Soul */
export interface Companion extends CompanionBones, CompanionSoul {}
