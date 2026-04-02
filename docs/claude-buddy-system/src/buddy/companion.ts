/**
 * Claude Code Buddy System — Companion 核心模块
 * 从 @anthropic-ai/claude-code cli.js (v2.1.89) 反编译还原
 *
 * 核心职责：
 * 1. 确定性宠物生成 (userId + salt → FNV-1a → Mulberry32 PRNG → CompanionBones)
 * 2. 配置读写 (getCompanion / saveCompanion)
 * 3. AI 灵魂生成 (调用 LLM 生成 name + personality)
 */

import {
  type Companion,
  type CompanionBones,
  type CompanionSoul,
  EYES,
  HATS,
  type Hat,
  type Rarity,
  RARITY_BASE_STATS,
  RARITY_NAMES,
  RARITY_WEIGHTS,
  SPECIES,
  STAT_NAMES,
  type Stats,
} from './types.js';

// ─── 常量 ─────────────────────────────────────────────────

/** 固定盐值，与 userId 拼接后哈希，确保每人只得到一只固定宠物 */
const SALT = 'friend-2026-401';

/** AI 名字生成的灵感词库 (136 个词) */
const INSPIRATION_WORDS = [
  'thunder', 'biscuit', 'void', 'accordion', 'moss', 'velvet', 'rust', 'pickle',
  'crumb', 'whisper', 'gravy', 'frost', 'ember', 'soup', 'marble', 'thorn',
  'honey', 'static', 'copper', 'dusk', 'sprocket', 'bramble', 'cinder', 'wobble',
  'drizzle', 'flint', 'tinsel', 'murmur', 'clatter', 'gloom', 'nectar', 'quartz',
  'shingle', 'tremor', 'umber', 'waffle', 'zephyr', 'bristle', 'dapple', 'fennel',
  'gristle', 'huddle', 'kettle', 'lumen', 'mottle', 'nuzzle', 'pebble', 'quiver',
  'ripple', 'sable', 'thistle', 'vellum', 'wicker', 'yonder', 'bauble', 'cobble',
  'doily', 'fickle', 'gambit', 'hubris', 'jostle', 'knoll', 'larder', 'mantle',
  'nimbus', 'oracle', 'plinth', 'quorum', 'relic', 'spindle', 'trellis', 'urchin',
  'vortex', 'warble', 'xenon', 'yoke', 'zenith', 'alcove', 'brogue', 'chisel',
  'dirge', 'epoch', 'fathom', 'glint', 'hearth', 'inkwell', 'jetsam', 'kiln',
  'lattice', 'mirth', 'nook', 'obelisk', 'parsnip', 'quill', 'rune', 'sconce',
  'tallow', 'umbra', 'verve', 'wisp', 'yawn', 'apex', 'brine', 'crag',
  'dregs', 'etch', 'flume', 'gable', 'husk', 'ingot', 'jamb', 'knurl',
  'loam', 'mote', 'nacre', 'ogle', 'prong', 'quip', 'rind', 'slat',
  'tuft', 'vane', 'welt', 'yarn', 'bane', 'clove', 'dross', 'eave',
  'fern', 'grit', 'hive', 'jade', 'keel', 'lilt', 'muse', 'nape',
  'omen', 'pith', 'rook', 'silt', 'tome', 'urge', 'vex', 'wane', 'yew', 'zest',
];

/** AI 名字生成的备选前缀词 */
const FALLBACK_NAMES = ['Crumpet', 'Soup', 'Pickle', 'Biscuit', 'Moth', 'Gravy'];

// ─── PRNG: Mulberry32 ─────────────────────────────────────

/**
 * Mulberry32 — 确定性 32-bit PRNG
 * 输入 seed (uint32)，返回一个函数，每次调用返回 [0, 1) 浮点数
 *
 * 源码中的变量映射: GV_ = mulberry32
 */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Hash: FNV-1a ─────────────────────────────────────────

/**
 * FNV-1a 哈希 (32-bit)
 * 如果运行在 Bun 环境下，使用 Bun.hash()；否则用纯 JS 实现
 *
 * 源码中的变量映射: vV_ = fnv1a
 */
export function fnv1a(str: string): number {
  if (typeof Bun !== 'undefined') {
    // Bun 环境下使用原生哈希并截断为 32 位
    return Number(BigInt((Bun as any).hash(str)) & 0xffffffffn);
  }
  // 纯 JS FNV-1a
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619); // FNV prime
  }
  return hash >>> 0;
}

// ─── 辅助函数 ─────────────────────────────────────────────

/** 从数组中随机选一个元素 (源码: yT6) */
function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** 加权随机选择稀有度 (源码: TV_) */
function rollRarity(rng: () => number): Rarity {
  const totalWeight = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
  let roll = rng() * totalWeight;
  for (const rarity of RARITY_NAMES) {
    roll -= RARITY_WEIGHTS[rarity];
    if (roll < 0) return rarity;
  }
  return 'common';
}

/** 生成属性值 (源码: VV_) */
function rollStats(rng: () => number, rarity: Rarity): Stats {
  const base = RARITY_BASE_STATS[rarity];

  // 选两个不同的突出属性
  const primary = pick(rng, STAT_NAMES);
  let secondary = pick(rng, STAT_NAMES);
  while (secondary === primary) {
    secondary = pick(rng, STAT_NAMES);
  }

  const stats = {} as Stats;
  for (const name of STAT_NAMES) {
    if (name === primary) {
      // 主属性: 大幅加成
      stats[name] = Math.min(100, base + 50 + Math.floor(rng() * 30));
    } else if (name === secondary) {
      // 副属性: 略低
      stats[name] = Math.max(1, base - 10 + Math.floor(rng() * 15));
    } else {
      // 其他: 基础 + 随机
      stats[name] = base + Math.floor(rng() * 40);
    }
  }
  return stats;
}

/** 从 seed 选取灵感词 (源码: wCY) */
function pickInspirationWords(seed: number, count: number): string[] {
  let s = seed >>> 0;
  const indices = new Set<number>();
  while (indices.size < count) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    indices.add(s % INSPIRATION_WORDS.length);
  }
  return [...indices].map((i) => INSPIRATION_WORDS[i]);
}

// ─── 核心: roll() ─────────────────────────────────────────

export interface RollResult {
  bones: CompanionBones;
  inspirationSeed: number;
}

/**
 * 确定性宠物骨架生成
 *
 * 流程: userId + SALT → FNV-1a hash → Mulberry32 PRNG → 逐项 roll
 *
 * 源码中的变量映射: yV_ = roll
 */
export function roll(userId: string): RollResult {
  const key = userId + SALT;
  const rng = mulberry32(fnv1a(key));

  const rarity = rollRarity(rng);

  const bones: CompanionBones = {
    rarity,
    species: pick(rng, SPECIES),
    eye: pick(rng, EYES),
    hat: rarity === 'common' ? 'none' : pick(rng, HATS),
    shiny: rng() < 0.01, // 1% 闪光概率
    stats: rollStats(rng, rarity),
  };

  return {
    bones,
    inspirationSeed: Math.floor(rng() * 1e9),
  };
}

// ─── 缓存 ─────────────────────────────────────────────────

/** roll 结果缓存 (源码: LR1) */
let rollCache: { key: string; value: RollResult } | null = null;

/** 带缓存的 roll (源码: hR1) */
function cachedRoll(userId: string): RollResult {
  const key = userId + SALT;
  if (rollCache?.key === key) return rollCache.value;
  const result = roll(userId);
  rollCache = { key, value: result };
  return result;
}

// ─── Config 读写 ───────────────────────────────────────────

/**
 * 获取当前用户 ID
 * 优先使用 OAuth accountUuid，否则 userID，最后 fallback "anon"
 *
 * 源码中的变量映射: RR1 = companionUserId
 */
export function companionUserId(): string {
  // 源码: j8() = getGlobalConfig()
  // return config.oauthAccount?.accountUuid ?? config.userID ?? 'anon';
  //
  // 在还原版中简化为从环境读取:
  return process.env.CLAUDE_USER_ID ?? 'anon';
}

/**
 * 获取已孵化的 Companion (如果有)
 * 合并 config 中的 soul 和 roll 生成的 bones
 *
 * 源码中的变量映射: vC = getCompanion
 */
export function getCompanion(): Companion | undefined {
  // 源码: const soul = getGlobalConfig().companion;
  // 这里简化为从环境/config读取
  const soul = _readCompanionFromConfig();
  if (!soul) return undefined;
  const { bones } = cachedRoll(companionUserId());
  return { ...soul, ...bones };
}

/**
 * 孵化并保存 Companion
 *
 * 流程:
 * 1. roll bones
 * 2. AI 生成 name + personality (调用 LLM)
 * 3. 保存 soul 到 config
 * 4. 返回完整 Companion
 *
 * 源码中的变量映射: vCY = hatchCompanion
 */
export async function getOrCreateCompanion(
  generateSoul?: (bones: CompanionBones, seed: number) => Promise<CompanionSoul>,
): Promise<Companion> {
  const userId = companionUserId();
  const { bones, inspirationSeed } = cachedRoll(userId);

  let soul: CompanionSoul;
  if (generateSoul) {
    soul = await generateSoul(bones, inspirationSeed);
  } else {
    // Fallback: 无 AI 时使用默认名字
    soul = {
      name: bones.species.charAt(0).toUpperCase() + bones.species.slice(1),
      personality: 'Friendly and curious',
      hatchedAt: Date.now(),
    };
  }

  _saveCompanionToConfig(soul);
  return { ...bones, ...soul };
}

// ─── AI Soul 生成 ──────────────────────────────────────────

/** 系统提示词 (源码: ACY) */
export const SOUL_SYSTEM_PROMPT = `You generate coding companions — small creatures that live in a developer's terminal and occasionally comment on their work.

Given a rarity, species, stats, and a handful of inspiration words, invent:
- A name: ONE word, max 12 characters. Memorable, slightly absurd. No titles, no "the X", no epithets. Think pet name, not NPC name. The inspiration words are loose anchors — riff on one, mash two syllables, or just use the vibe. Examples: Pith, Dusker, Crumb, Brogue, Sprocket.
- A one-sentence personality (specific, funny, a quirk that affects how they'd comment on code — should feel consistent with the stats)

Higher rarity = weirder, more specific, more memorable. A legendary should be genuinely strange.
Don't repeat yourself — every companion should feel distinct.`;

/**
 * 构建 AI soul 生成的用户消息
 *
 * 源码中的变量映射: yFK = generateSoul
 */
export function buildSoulPrompt(bones: CompanionBones, inspirationSeed: number): string {
  const words = pickInspirationWords(inspirationSeed, 4);
  const statsLine = STAT_NAMES.map((s) => `${s}:${bones.stats[s]}`).join(' ');

  return [
    `Generate a companion.`,
    `Species: ${bones.species}`,
    `Rarity: ${bones.rarity}`,
    `Stats: ${statsLine}`,
    `Inspiration: ${words.join(', ')}`,
    `Make it memorable and distinct.`,
  ].join('\n');
}

// ─── Buddy API (远程 Reaction) ─────────────────────────────

/**
 * 调用 buddy_react API 获取宠物对代码的评论
 *
 * POST /api/organizations/{orgId}/claude_code/buddy_react
 *
 * 源码中的变量映射: Bd8 = fetchBuddyReaction
 *
 * 请求体:
 *   name, personality, species, rarity, stats: 宠物信息
 *   transcript: 最近对话 (截断到 5000 字符)
 *   reason: 触发原因
 *   recent: 最近消息 (每条截断到 200 字符)
 *   addressed: 是否直接称呼了宠物名字
 */
export interface BuddyReactPayload {
  name: string;
  personality: string;
  species: string;
  rarity: string;
  stats: Stats;
  transcript: string;
  reason: string;
  recent: string[];
  addressed: boolean;
}

// ─── Config 持久化存根 ────────────────────────────────────

/** 从 config 读取 companion soul (需要对接实际的 config 系统) */
function _readCompanionFromConfig(): CompanionSoul | undefined {
  // 源码: return getGlobalConfig().companion
  // 实际实现需要读取 ~/.claude/.claude.json 中的 companion 字段
  try {
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(
      process.env.HOME || process.env.USERPROFILE || '',
      '.claude',
      '.claude.json',
    );
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config.companion;
  } catch {
    return undefined;
  }
}

/** 保存 companion soul 到 config (需要对接实际的 config 系统) */
function _saveCompanionToConfig(soul: CompanionSoul): void {
  // 源码: saveGlobalConfig({ ...getGlobalConfig(), companion: soul })
  try {
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(
      process.env.HOME || process.env.USERPROFILE || '',
      '.claude',
      '.claude.json',
    );
    let config: any = {};
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {}
    config.companion = soul;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch {
    // silent fail
  }
}
