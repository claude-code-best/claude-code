/**
 * Claude Code Buddy System — /buddy 斜杠命令
 * 从 @anthropic-ai/claude-code cli.js (v2.1.89) 反编译还原
 *
 * 源码位置: src/commands/buddy/buddy.ts
 *
 * 这是实际在 CLI 中运行时的 /buddy 命令入口
 * 源码中的变量映射: TCY = buddyCommand, kCY = default export
 */

import { getCompanion, getOrCreateCompanion, companionUserId, roll, buildSoulPrompt, SOUL_SYSTEM_PROMPT } from './companion.js';
import { RARITY_STARS, RARITY_COLORS, STAT_NAMES, type CompanionBones, type CompanionSoul } from './types.js';
import { renderSprite, getEmojiFace } from './sprites.js';
import { isBuddyLive } from './useBuddyNotification.js';

/**
 * /buddy 命令定义
 *
 * 源码中实际使用的子命令:
 * - /buddy (无参数) = 孵化 (如果没有) 或显示 (如果已有)
 * - /buddy pet = 抚摸
 * - /buddy off = 静音
 * - /buddy on = 取消静音
 *
 * 注意: 最终版本的子命令与早期版本 (hatch/card/mute/unmute) 不同
 */
const buddyCommand = {
  type: 'local-jsx' as const,
  name: 'buddy',
  description: 'Hatch a coding companion · pet, off',
  argumentHint: '[pet|off]',

  /** 仅在 isBuddyLive() 为 true 时可见 */
  get isHidden(): boolean {
    return !isBuddyLive();
  },

  /** 立即执行 (不等待 AI 回复) */
  immediate: true,

  load: () =>
    Promise.resolve({
      async call(
        addSystemMessage: (text: string, opts?: { display: string }) => void,
        context: any,
        args?: string,
      ) {
        const config = _getConfig();
        const subcommand = args?.trim();

        // ─── /buddy off ───
        if (subcommand === 'off') {
          if (config.companionMuted !== true) {
            _updateConfig({ companionMuted: true });
          }
          addSystemMessage('companion muted', { display: 'system' });
          return null;
        }

        // ─── /buddy on ───
        if (subcommand === 'on') {
          if (config.companionMuted === true) {
            _updateConfig({ companionMuted: false });
          }
          addSystemMessage('companion unmuted', { display: 'system' });
          return null;
        }

        // ─── 功能不可用 ───
        if (!isBuddyLive()) {
          addSystemMessage('buddy is unavailable on this configuration', { display: 'system' });
          return null;
        }

        // ─── /buddy pet ───
        if (subcommand === 'pet') {
          const companion = getCompanion();
          if (!companion) {
            addSystemMessage('no companion yet · run /buddy first', { display: 'system' });
            return null;
          }
          if (config.companionMuted === true) {
            _updateConfig({ companionMuted: false });
          }
          // 触发爱心动画: 设置 companionPetAt = Date.now()
          _updateConfig({ companionPetAt: Date.now() });
          return null;
        }

        // ─── /buddy (孵化或显示) ───
        const existing = getCompanion();
        if (existing) {
          // 已有宠物 → 显示 CompanionCard (JSX)
          // 源码: 返回 JSX 组件 <CompanionCard companion={existing} />
          return {
            type: 'local-jsx' as const,
            jsx: null, // 实际是 React JSX
            result: formatCompanionCard(existing),
          };
        }

        // 孵化新宠物
        const userId = companionUserId();
        const { bones, inspirationSeed } = roll(userId);

        // 调用 AI 生成 name + personality
        // 源码: await yFK(bones, inspirationSeed, abortSignal)
        // 使用 Haiku 模型，temperature=1，JSON schema output
        addSystemMessage('hatching a coding buddy…', { display: 'system' });
        addSystemMessage("it'll watch you work and occasionally have opinions", { display: 'system' });

        try {
          const soul = await generateSoulViaAI(bones, inspirationSeed);
          _updateConfig({ companion: { ...soul, hatchedAt: Date.now() } });
          const companion = { ...bones, ...soul, hatchedAt: Date.now() };

          // 返回孵化动画 + CompanionCard
          return {
            type: 'local-jsx' as const,
            jsx: null, // 实际是 <HatchAnimation> → <CompanionCard>
            result: formatCompanionCard(companion),
          };
        } catch (err) {
          // AI 生成失败，使用 fallback 名字
          const fallbackSoul: CompanionSoul = {
            name: bones.species.charAt(0).toUpperCase() + bones.species.slice(1),
            personality: 'Watches your code with quiet interest.',
            hatchedAt: Date.now(),
          };
          _updateConfig({ companion: fallbackSoul });
          const companion = { ...bones, ...fallbackSoul };
          return {
            type: 'local-jsx' as const,
            jsx: null,
            result: formatCompanionCard(companion),
          };
        }
      },
    }),
};

// ─── 辅助函数 ─────────────────────────────────────────────

function formatCompanionCard(companion: any): string {
  const stars = RARITY_STARS[companion.rarity as keyof typeof RARITY_STARS];
  const sprite = renderSprite(companion);
  const lines = [
    '',
    ...sprite,
    '',
    `  ${companion.name}`,
    `  ${companion.species} · ${companion.rarity.toUpperCase()} ${stars}${companion.shiny ? ' ✨ SHINY' : ''}`,
    '',
    `  ${companion.personality}`,
    '',
    ...STAT_NAMES.map((stat) => {
      const val = companion.stats?.[stat] ?? 0;
      const bar = '█'.repeat(Math.floor(val / 10)) + '░'.repeat(10 - Math.floor(val / 10));
      return `  ${stat.padEnd(12)} ${bar} ${val}`;
    }),
    '',
    `  ${companion.name} is here · it'll chime in as you code`,
    `  your buddy won't count toward your usage`,
    `  say its name to get its take · /buddy pet · /buddy off`,
  ];
  return lines.join('\n');
}

async function generateSoulViaAI(
  bones: CompanionBones,
  inspirationSeed: number,
): Promise<CompanionSoul> {
  // 源码: 调用 API 使用 Haiku 模型
  // const response = await query({
  //   querySource: 'buddy_companion',
  //   model: getHaikuModel(),
  //   system: SOUL_SYSTEM_PROMPT,
  //   messages: [{ role: 'user', content: buildSoulPrompt(bones, inspirationSeed) }],
  //   output_format: { type: 'json_schema', schema: zodToJsonSchema(soulSchema) },
  //   max_tokens: 512,
  //   temperature: 1,
  // });
  //
  // Schema: { name: string (1-14 chars), personality: string }

  const prompt = buildSoulPrompt(bones, inspirationSeed);
  console.log('[buddy] Would call AI with prompt:', prompt);

  // Fallback
  return {
    name: bones.species.charAt(0).toUpperCase() + bones.species.slice(1),
    personality: 'Friendly and curious',
    hatchedAt: Date.now(),
  };
}

// Config 存根 (需要对接实际 config 系统)
function _getConfig(): any {
  return {};
}
function _updateConfig(patch: any): void {
  // 源码: S8((prev) => ({ ...prev, ...patch }))
}

export default buddyCommand;
