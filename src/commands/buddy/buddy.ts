import React from 'react'
import {
  getCompanion,
  rollWithSeed,
  generateSeed,
} from '../../buddy/companion.js'
import { type StoredCompanion, RARITY_STARS } from '../../buddy/types.js'
import { renderSprite } from '../../buddy/sprites.js'
import { CompanionCard } from '../../buddy/CompanionCard.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { triggerCompanionReaction } from '../../buddy/companionReact.js'
import type { ToolUseContext } from '../../Tool.js'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'

// 物种 → 孵化时的默认名称片段（无需 API）
const SPECIES_NAMES: Record<string, string> = {
  duck: 'Waddles',
  goose: 'Goosberry',
  blob: 'Gooey',
  cat: 'Whiskers',
  dragon: 'Ember',
  octopus: 'Inky',
  owl: 'Hoots',
  penguin: 'Waddleford',
  turtle: 'Shelly',
  snail: 'Trailblazer',
  ghost: 'Casper',
  axolotl: 'Axie',
  capybara: 'Chill',
  cactus: 'Spike',
  robot: 'Byte',
  rabbit: 'Flops',
  mushroom: 'Spore',
  chonk: 'Chonk',
}

const SPECIES_PERSONALITY: Record<string, string> = {
  duck: '古怪且容易开心。到处留下橡皮鸭调试技巧。',
  goose: '自信，对糟糕的代码发出警告。在代码审查中毫不留情。',
  blob: '适应性强，随波逐流。困惑时有时会分裂成两个。',
  cat: '独立且挑剔。带着些许轻蔑看着你打字。',
  dragon: '热情如火，对架构充满激情。囤积好的变量名。',
  octopus: '非凡的多任务处理者。用触手同时缠绕每个问题。',
  owl: '智慧但话多。总是说“让我想想”，并且恰好思考3秒钟。',
  penguin: '压力下保持冷静。优雅地滑过合并冲突。',
  turtle: '耐心且细致。相信慢而稳才能赢得部署。',
  snail: '有条不紊，留下一串有用的注释。从不匆忙。',
  ghost: '空灵，在最糟糕的时刻出现，带着令人毛骨悚然的见解。',
  axolotl: '再生能力强且性格开朗。总是微笑着从任何bug中恢复。',
  capybara: '禅宗大师。周围一切着火时仍保持冷静。',
  cactus: '外表带刺但内心充满善意。在忽视中茁壮成长。',
  robot: '高效且字面化。以二进制方式处理反馈。',
  rabbit: '精力充沛，在任务间跳跃。在你开始之前就完成了。',
  mushroom: '安静而有洞察力。随着时间的推移，你会越来越喜欢它。',
  chonk: '庞大、温暖，占据了整个沙发。优先考虑舒适而非优雅。',
}

function speciesLabel(species: string): string {
  return species.charAt(0).toUpperCase() + species.slice(1)
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> {
  const sub = args?.trim().toLowerCase() ?? ''
  const setState = context.setAppState

  // ── /buddy off — 静音伙伴 ──
  if (sub === 'off') {
    saveGlobalConfig(cfg => ({ ...cfg, companionMuted: true }))
    onDone('伙伴已静音', { display: 'system' })
    return null
  }

  // ── /buddy on — 取消静音伙伴 ──
  if (sub === 'on') {
    saveGlobalConfig(cfg => ({ ...cfg, companionMuted: false }))
    onDone('伙伴已取消静音', { display: 'system' })
    return null
  }

  // ── /buddy pet — 触发爱心动画 + 自动取消静音 ──
  if (sub === 'pet') {
    const companion = getCompanion()
    if (!companion) {
      onDone('尚无伙伴 · 请先运行 /buddy', { display: 'system' })
      return null
    }

    // 抚摸时自动取消静音 + 触发爱心动画
    saveGlobalConfig(cfg => ({ ...cfg, companionMuted: false }))
    setState?.(prev => ({ ...prev, companionPetAt: Date.now() }))

    // 触发抚摸后的反应
    triggerCompanionReaction(context.messages ?? [], reaction =>
      setState?.(prev =>
        prev.companionReaction === reaction
          ? prev
          : { ...prev, companionReaction: reaction },
      ),
    )

    onDone(`抚摸 ${companion.name}`, { display: 'system' })
    return null
  }

  // ── /buddy（无参数）— 显示现有伙伴或孵化 ──
  const companion = getCompanion()

  // 查看时自动取消静音
  if (companion && getGlobalConfig().companionMuted) {
    saveGlobalConfig(cfg => ({ ...cfg, companionMuted: false }))
  }

  if (companion) {
    // 返回 JSX 卡片 — 匹配官方 vc8 组件
    const lastReaction = context.getAppState?.()?.companionReaction
    return React.createElement(CompanionCard, {
      companion,
      lastReaction,
      onDone: onDone as unknown as Parameters<
        typeof CompanionCard
      >[0]['onDone'],
    })
  }

  // ── 无伙伴 → 孵化 ──
  const seed = generateSeed()
  const r = rollWithSeed(seed)
  const name = SPECIES_NAMES[r.bones.species] ?? 'Buddy'
  const personality = SPECIES_PERSONALITY[r.bones.species] ?? '神秘且精通代码。'

  const stored: StoredCompanion = {
    name,
    personality,
    seed,
    hatchedAt: Date.now(),
  }

  saveGlobalConfig(cfg => ({ ...cfg, companion: stored }))

  const stars = RARITY_STARS[r.bones.rarity]
  const sprite = renderSprite(r.bones, 0)
  const shiny = r.bones.shiny ? ' ✨ 闪闪发光！' : ''

  const lines = [
    '一位狂野的伙伴出现了！',
    '',
    ...sprite,
    '',
    `${name} the ${speciesLabel(r.bones.species)}${shiny}`,
    `稀有度：${stars} (${r.bones.rarity})`,
    `"${personality}"`,
    '',
    '你的伙伴现在将出现在你的输入框旁边！',
    '说出它的名字以获取它的见解 · /buddy pet · /buddy off',
  ]
  onDone(lines.join('\n'), { display: 'system' })
  return null
}
