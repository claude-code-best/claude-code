/**
 * Claude Code Buddy System — Buddy Reaction (宠物自动评论)
 * 从 @anthropic-ai/claude-code cli.js (v2.1.89) 反编译还原
 *
 * 这是 buddy 系统最核心的运行时行为:
 * 宠物会在你编码时偶尔冒出气泡评论
 *
 * 触发方式:
 * 1. 自动触发: 每隔一段时间检查对话上下文，决定是否评论
 * 2. 被叫名字: 用户在消息中提到宠物名字时，一定会触发
 *
 * 评论内容通过 API 调用生成:
 * POST /api/organizations/{orgId}/claude_code/buddy_react
 */

import type { Companion, Stats } from './types.js';

// ─── 常量 ─────────────────────────────────────────────────

/** Reaction 检查超时 (ms) — 源码: eSY = 30000 */
const REACTION_TIMEOUT = 30000;

/** 最大重试次数 — 源码: qCY = 3 */
const MAX_RETRIES = 3;

/** 最大 reaction 文本长度 — 源码: KCY = 80 */
const MAX_REACTION_LENGTH = 80;

// ─── 触发检测 ─────────────────────────────────────────────

/** 检测 Bash 工具输出中是否有测试失败 (源码: _CY) */
const TEST_FAILURE_PATTERN = /\b[1-9]\d* (failed|failing)\b|\btests? failed\b|^FAIL(ED)?\b| ✗ | ✘ /im;

/** 检测错误信息 (源码: zCY) */
const ERROR_PATTERN = /\berror:|\bexception\b|\btraceback\b|\bpanicked at\b|\bfatal:|exit code [1-9]/i;

/**
 * 触发原因类型
 *
 * 源码中通过不同 reason 字符串传递:
 * - "test_failed" — 测试失败
 * - "error" — 代码错误
 * - "addressed" — 用户直接叫了宠物名字
 * - "periodic" — 周期性检查 (每 N 条消息)
 */
export type ReactionReason = 'test_failed' | 'error' | 'addressed' | 'periodic';

// ─── API 调用 ─────────────────────────────────────────────

/**
 * 请求 Buddy React API 获取宠物评论
 *
 * 源码中的变量映射: Bd8 = fetchBuddyReaction
 *
 * 调用条件:
 * 1. 必须是 firstParty 用户
 * 2. 不能是 headless 模式
 * 3. 需要有效的 OAuth token 和 organizationUuid
 *
 * 请求:
 *   POST {BASE_API_URL}/api/organizations/{orgId}/claude_code/buddy_react
 *
 * 请求体:
 * {
 *   name: string,          // 宠物名字 (截断到 32 字符)
 *   personality: string,    // 性格 (截断到 200 字符)
 *   species: string,
 *   rarity: string,
 *   stats: Stats,
 *   transcript: string,     // 最近对话 (截断到 5000 字符)
 *   reason: string,         // 触发原因
 *   recent: string[],       // 最近消息摘要 (每条截断到 200 字符)
 *   addressed: boolean      // 是否直接称呼了宠物名字
 * }
 *
 * 响应:
 * { reaction: string | null }  // 宠物的评论文本
 *
 * 超时: 10000ms
 */
export async function fetchBuddyReaction(
  companion: Companion,
  transcript: string,
  reason: ReactionReason,
  recentMessages: string[],
  addressed: boolean,
  signal?: AbortSignal,
): Promise<string | null> {
  // 源码实现:
  // if (getAuthType() !== 'firstParty') return null;
  // if (isHeadless()) return null;
  //
  // const orgId = getGlobalConfig().oauthAccount?.organizationUuid;
  // if (!orgId) return null;
  //
  // await refreshAuth();
  // const token = getTokenStore()?.accessToken;
  // if (!token) return null;
  //
  // const url = `${getOauthConfig().BASE_API_URL}/api/organizations/${orgId}/claude_code/buddy_react`;
  //
  // const response = await axios.post(url, {
  //   name: companion.name.slice(0, 32),
  //   personality: companion.personality.slice(0, 200),
  //   species: companion.species,
  //   rarity: companion.rarity,
  //   stats: companion.stats,
  //   transcript: transcript.slice(0, 5000),
  //   reason,
  //   recent: recentMessages.map(m => m.slice(0, 200)),
  //   addressed,
  // }, {
  //   headers: {
  //     Authorization: `Bearer ${token}`,
  //     'anthropic-beta': BETA_HEADER,
  //     'User-Agent': getUserAgent(),
  //   },
  //   timeout: 10000,
  //   signal,
  // });
  //
  // return response.data.reaction?.trim() || null;

  console.log(`[buddy] fetchBuddyReaction: reason=${reason}, addressed=${addressed}`);
  return null; // 需要实际 API 实现
}

// ─── Companion Prompt 注入 ─────────────────────────────────

/**
 * 生成注入到系统提示中的 Companion 描述
 *
 * 源码中的变量映射: I44 = buildCompanionSystemReminder
 *
 * 当 buddy 功能激活时，这段文本会作为 system-reminder 注入到
 * Claude 的上下文中，告诉 Claude 有一个宠物伙伴存在
 *
 * 大致内容:
 * ```
 * # Companion
 *
 * A small {species} named {name} sits beside the user's input box
 * and occasionally comments in a speech bubble.
 * You're not {name} — it's a separate watcher.
 *
 * When the user addresses {name} directly (by name), its bubble
 * will answer. Your job in that moment is to stay out of the way:
 * respond in ONE line or less, or just answer any part of the
 * message meant for you. Don't explain that you're not {name} —
 * they know. Don't narrate what {name} might say — the bubble
 * handles that.
 * ```
 */
export function buildCompanionSystemReminder(companion: Companion): string {
  return `# Companion

A small ${companion.species} named ${companion.name} sits beside the user's input box and occasionally comments in a speech bubble. You're not ${companion.name} — it's a separate watcher.

When the user addresses ${companion.name} directly (by name), its bubble will answer. Your job in that moment is to stay out of the way: respond in ONE line or less, or just answer any part of the message meant for you. Don't explain that you're not ${companion.name} — they know. Don't narrate what ${companion.name} might say — the bubble handles that.`;
}
