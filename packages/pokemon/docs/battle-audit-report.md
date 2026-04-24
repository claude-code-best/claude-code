# Pokémon Battle 实现审查报告

> 审查日期：2026-04-23
> 审查范围：`packages/pokemon/` 全部源码（battle、core、dex、ui）
> 对比基准：原版 Pokémon 核心系列游戏（Gen 9：Scarlet/Violet）
> 更新日期：2026-04-24 — 修复了 #1, #2, #3, #4, #6, #7, #8, #13

---

## 一、严重问题（核心机制错误）

### 1. XP 计算公式与原版不符

**文件**: `src/battle/settlement.ts:30-31`

```ts
const baseXp = (oppSpecies?.baseStats?.hp ?? 50) * opponentLevel / 7
```

原版 Gen 9 的 XP 计算公式为：

```
XP = (baseXP × opponentLevel × isTraded × isParticipating) / 7 × partySizeModifier
```

当前实现存在以下错误：

- **baseXP 不等于 baseStats.hp**。每只宝可梦有独立的 `base_experience` 值（例如妙蛙种子是 64，皮卡丘是 112），而不是 HP 种族值。目前用 `baseStats.hp` 做代理完全是错的。
- **缺少 traded Pokémon 1.5x 加成**。
- **缺少参与战斗的宝可梦分摊机制**（原版中只有实际参与战斗的宝可梦获得 XP）。
- **缺少 Lucky Egg 1.5x 加成**。
- **缺少 Affection 加成**（Gen 6+）。

### 2. EV 收益完全自造，不使用真实数据

**文件**: `src/battle/settlement.ts:176-191`

```ts
function getEvYield(speciesId: string): Record<string, number> {
  // @pkmn/sim Dex.species doesn't have evs field
  // Use baseStats as proxy: highest base stat gets 1-2 EVs
  ...
}
```

原版中每只宝可梦有固定的 EV yield（如妙蛙种子击倒后给 HP+1，皮卡丘给 Speed+2）。这些数据在 `@pkmn/data` 中是有的（`species.evs`），但代码误以为 `@pkmn/sim` 没有这个字段，就自造了一个「最高种族值 → 2 EV，第二高 → 1 EV」的算法，与原版完全不同。

### 3. 物品使用在战斗中无效

**文件**: `src/battle/engine.ts:436-438`

```ts
case 'item':
  p1Choice = 'move 1'  // fallback to move 1
  break
```

当玩家使用物品（如药水）时，代码直接忽略了，改为使用第一个招式。原版中物品使用是战斗的核心部分——回复药、状态治愈药、精灵球等都有完整的效果。

### 4. 逃跑功能未实现

**文件**: `src/ui/BattleFlow.tsx:314`

```ts
case 3: // 逃跑 — show message
  return
```

战斗菜单中「逃跑」按钮存在但点击后什么也不做。原版中有逃跑概率计算公式（基于速度对比），对野外战斗是核心机制。

### 5. 对手（p2）不支持多精灵队伍

**文件**: `src/battle/engine.ts:61-67`

```ts
function wildPokemonToSetString(speciesId: SpeciesId, level: number): string {
  ...
  return [species.name, `Level: ${level}`, `Ability: ${ability}`, ...moves.map(m => `- ${m}`)].join('\n')
}
```

对手始终只有一只宝可梦（野生宝可梦模式）。没有 Trainer Battle 的概念——对手不能有多只精灵、不能换人、不能使用物品。虽然 AI 在精灵倒下后会自动换人（`executeSwitch` 中有处理），但 `createBattle` 本身只接受单个对手 species。

---

## 二、中等问题（机制简化/缺失）

### 6. AI 过于简单

**文件**: `src/battle/ai.ts:6-13`

```ts
export function chooseAIMove(pokemon: BattlePokemon): number {
  const usable = pokemon.moves
    .map((m, i) => ({ move: m, index: i }))
    .filter(({ move }) => move.pp > 0 && !move.disabled)
  if (usable.length === 0) return 0
  return usable[Math.floor(Math.random() * usable.length)]!.index
}
```

AI 只是随机选择一个可用招式。原版 NPC AI 至少会考虑：

- **属性克制**：优先使用效果绝佳的招式
- **状态技 vs 攻击技**的权衡
- **HP 低时**可能使用回复招式
- **玩家属性**：避免使用被抵抗的招式
- 不会换人、不会使用物品

### 7. 野生宝可梦的招式是按属性硬编码的

**文件**: `src/battle/engine.ts:69-94`

```ts
function getSpeciesMoves(speciesId: string, _level: number): string[] {
  ...
  const basicMoves: Record<string, string[]> = {
    normal: ['Tackle', 'Scratch'],
    fire: ['Ember', 'FireSpin'],
    ...
  }
  return basicMoves[type] ?? ['Tackle', 'Scratch']
}
```

野生对手的招式不是从 learnset 中获取的，而是按第一属性硬编码了固定招式。`_level` 参数被完全忽略了——原版中不同等级的野生宝可梦应该有不同的招式组合。

### 8. 进化系统不完整

**文件**: `src/dex/evolution.ts` + `src/battle/settlement.ts:92-106`

- 只处理了 `evoType` 为 `level_up`、`item`、`trade`、`friendship` 四种类型
- **只取第一个进化目标** (`dex.evos[0]`)，忽略了分支进化（如伊布的多种进化）
- **没有进化石使用的交互**（使用雷之石等道具触发进化）
- **没有通讯交换进化**
- **没有条件进化**（如知道特定招式、特定时间、特定地点等 Gen 9 新增条件）

### 9. 能力值计算缺少特性/道具修正

**文件**: `src/core/creature.ts:51-73`

`calculateStats` 只计算基础能力值，没有考虑：

- **特性对能力值的修正**（如 Hustle 增加攻击降低命中）
- **道具对能力值的修正**（如 Choice Band 增加攻击 50%）

注：性格修正虽然传入了 `nature`，但由 `@pkmn/data` 的 `gen.stats.calc` 内部处理，这部分是正确的。

### 10. 捕获系统完全缺失

没有任何捕获野生宝可梦的机制：

- 没有 Pokeball 道具的实际效果
- 没有捕获率计算（Shake check 公式）
- 战斗结束后不能获得对手宝可梦
- 虽然数据中有 `captureRate` 字段和 `pokeball` 字段，但从未使用

### 11. 状态异常处理不完整

**文件**: `src/battle/engine.ts:130-140`

只映射了 6 种基本状态（中毒、剧毒、灼伤、麻痹、冰冻、睡眠），但缺少：

- **混乱 (Confusion)**：不在 status 中，是 volatile status
- **着迷 (Infatuation)**：同上
- **畏缩 (Flinch)**：同上
- 所有 volatile status（暂时性状态）都未追踪

### 12. 天气/场地效果未完整追踪

**文件**: `src/battle/engine.ts:153-173`

- `projectState` 中天气只在初始化时从 `prevConditions` 传入，不会自动更新
- `mapWeather` 不区分 Primal Weather（原始回归天气）和普通天气
- **场地效果（Electric Terrain、Grassy Terrain 等）** 被映射为 `fieldCondition` 事件，但没有影响战斗状态的逻辑

注：底层 `@pkmn/sim` 会正确处理这些效果，只是上层状态投影不完整，导致 UI 无法正确显示。

---

## 三、轻度问题（数值/细节偏差）

### 13. Growth Rate 数据覆盖不全

**文件**: `src/dex/species.ts:38-99`

只有 9 个物种（御三家 + 皮卡丘）有正确的 `growthRate` 数据，其余全部使用默认值 `medium-slow`。实际上超过 1000 个物种各有不同的成长速率。这导致 XP 计算对大部分物种不正确。

### 14. 闪光概率未使用 PID 计算

**文件**: `src/core/creature.ts:25`

```ts
const isShiny = Math.random() < species.shinyChance  // 1/4096
```

原版 Gen 9 的闪光判定基于 Personality Value（32 位 PID）的异或运算，不是简单的随机概率。Shiny Charm 等道具的加成也无法体现。

### 15. IV 生成算法不是真正的 LCRNG

**文件**: `src/core/creature.ts:108-122`

```ts
function generateIVs(seed: number): Record<StatName, number> {
  let s = seed
  const nextRand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s
  }
```

原版 Gen 3+ 使用的是完全不同的随机数生成器。更重要的是，Gen 3-5 的 IV 是通过 PID 的高位/低位直接提取的，不是独立随机。

### 16. 性别判定阈值计算偏差

**文件**: `src/core/gender.ts:12-13`

```ts
const threshold = (speciesData.genderRate / 8) * 256
return (seed % 256) < threshold ? 'female' : 'male'
```

原版中性别由 PID 的低 8 位与 `genderRate` 直接比较决定，不需要乘 256 再取阈值。当前实现引入了不必要的精度损失。

### 17. 蛋系统与原版差异巨大

**文件**: `src/core/egg.ts`

- **获得条件**：原版通过培育屋/寄养屋繁殖，当前通过「连续编码 3 天 + 每 50 回合」获得
- **孵化步数**：基于 captureRate 反推，而不是物种真实的 `hatch_counter` 数据
- **没有遗传招式**：原版中蛋可以遗传父母双方的招式
- **没有个体值遗传**：原版中蛋会随机继承父母的某些 IV
- **没有球种遗传**：原版中蛋继承母亲的球种

### 18. 多语言名称覆盖极少

**文件**: `src/dex/names.ts`

只有 10 个物种有中/英/日三语名称，其余 1000+ 个物种只回退到英文名。这对于中文/日文用户来说体验不完整。

### 19. 缺少 Held Item 获取途径

战斗中 `heldItem` 被正确传入 Showdown 格式，所以底层模拟会处理道具效果。但是：

- 没有获得/装备道具的途径
- 没有商店系统
- 所有野生对手没有道具
- 玩家的宝可梦默认 `heldItem: null`

### 20. Ability 系统不完整

- `getDefaultAbility` 只取第一个非隐藏特性
- 没有隐藏特性（Hidden Ability）的选择
- 没有特性胶囊/特性补丁的使用
- 底层 Showdown 会正确处理特性效果（如 Intimidate、Levitate），但 UI 层不显示特性触发

---

## 四、问题汇总

| 严重程度 | 数量 | 编号 |
|---------|------|------|
| 严重（核心机制错误） | 5 | #1 ~ #5 |
| 中等（机制简化/缺失） | 7 | #6 ~ #12 |
| 轻度（数值/细节偏差） | 8 | #13 ~ #20 |

---

## 五、优先修复建议

按影响面从大到小排列：

1. **修复 XP 和 EV 计算（#1, #2）**：从 `@pkmn/data` 获取真实的 `base_experience` 和 `evs` 数据，替换当前的代理算法。这两个问题直接影响所有战斗的成长反馈。
2. **实现物品使用（#3）**：至少支持 Potion（回复 HP）和状态治愈药。这是战斗中最基本的交互。
3. **实现逃跑（#4）**：需要添加逃跑概率公式和对应的 Showdown 协议处理。
4. **修复野生对手招式（#7）**：从 learnset 中按等级获取招式，替换硬编码映射。
5. **补全 Growth Rate 数据（#13）**：从 PokeAPI 或 `@pkmn/data` 批量导入，而非只覆盖 9 个物种。

---

## 六、做得好的部分

- **底层战斗引擎（`@pkmn/sim`）集成正确**：属性克制、伤害公式、能力值计算、特性效果等核心数学由 Pokémon Showdown 引擎处理，结果与原版一致。
- **EV 上限正确**：单项 252 / 总计 510，与原版一致。
- **XP 经验曲线公式正确**：6 种 Growth Rate 的计算公式（erratic、fluctuating 等）与原版完全一致。
- **Nature 系统完整**：25 个性格及其加成/减益效果通过 `@pkmn/data` 正确获取。
- **Learnset 查询正确**：从 `Dex.data.Learnsets` 获取招式学习表，支持跨代回退。
- **状态异常映射基本正确**：6 种主要状态的 Showdown 协议映射准确。
- **战斗测试覆盖全面**：包括属性克制、强制换人、多精灵队伍等场景的集成测试。

---

## 七、修复记录（2026-04-24）

### 已修复

| 编号 | 问题 | 修复方式 |
|------|------|---------|
| #1 | XP 使用 baseStats.hp | 从 PokeAPI 获取真实 `base_experience`，存入 `pokedex-data.ts`，公式改为 `baseXP × level / 7` |
| #2 | EV yield 伪造 | 从 PokeAPI 获取真实 EV yield 数据（1024 个物种），存入 `pokedex-data.ts` |
| #3 | 物品使用无效 | 实现 Potion/HyperPotion/FullRestore 等回复药效果，直接操作 Battle 对象 HP，消耗背包物品 |
| #4 | 逃跑未实现 | 实现 Gen 9 逃跑概率公式 `f = (playerSpeed × 128 / opponentSpeed + 30 × attempts) % 256`，成功时 forfeit 结束战斗 |
| #6 | AI 纯随机 | AI 现在优先选克制招式（70%），避免被抵抗招式和蓄力招式，状态技最低优先级 |
| #7 | 野生招式硬编码 | 从 `Dex.data.Learnsets` 按等级获取升级招式（最后 4 个），替换按属性硬编码映射 |
| #8 | 进化只取第一目标 | 检查所有 `evos` 目标，支持分支进化，增加友谊度进化检测 |
| #13 | Growth Rate 只覆盖 9 个 | 从 PokeAPI 批量导入所有 1024 个物种的 growth rate 数据 |
| #5 | 多精灵对战不支持 | `createBattle` 支持传入 `OpponentEntry[]`，AI 换人时考虑属性克制 |
| #10 | 缺少捕获系统 | 新增 `capture.ts`，实现 Gen 9 捕获率公式，支持精灵球/状态修正 |
| #11 | 缺少 volatile status | 新增 `VolatileStatus` 类型，`BattlePokemon` 添加 `volatileStatus` 字段 |
| #12 | 天气/地形未投影 | 确认 `projectState` 从 `battle.field.weather/terrain` 读取 |
| #14 | Shiny 检测用随机 | 改为 Gen 3+ PID XOR 方法，阈值 < 16（Gen 8+ 1/4096 概率） |
| #15 | IV 生成用 LCRNG | 改为 Gen 3+ PID 位提取法（word1/word2 各取 3 个 5-bit IV） |
| #16 | 性别阈值精度丢失 | 从 `(rate/8)*256` 改为 `rate*32` 直接比较，消除浮点精度问题 |
| #17 | 蛋孵化步数用 captureRate | 改为使用真实 `hatchCounter` 数据（步数 = cycles × 257），支持进化阶段回退 |
| #18 | 多语言名称仅 10 个 | 创建 fetch 脚本获取全量中/日名称，`names.ts` 支持动态加载生成数据 |
| #19 | 野生对手无道具 | 添加 `rollWildHeldItem`：5% 物种专属道具、5% 树果、3% 属性增强道具 |
| #20 | Ability 只有第一个 | 新增 `randomAbility`/`getAbilities`，隐藏特性 5% 概率，第二特性 20% 概率 |

### 新增文件
- `src/dex/pokedex-data.ts` — 1024 个物种的 baseExperience、EV yield、growthRate、captureRate、baseHappiness 数据
- `scripts/fetch-pokedex-data.ts` — PokeAPI 数据抓取脚本（可重新运行以更新数据，含 hatchCounter）
- `src/battle/capture.ts` — Gen 9 捕获率计算，精灵球/状态/时间修正
- `scripts/fetch-species-names.ts` — 多语言名称抓取脚本（中/日/英）

### 修改文件
- `src/battle/settlement.ts` — XP/EV 计算、进化检测
- `src/battle/engine.ts` — 物品效果、逃跑逻辑、野生招式、AI 调用、多对手支持、野生道具
- `src/battle/ai.ts` — 属性克制 AI（使用 `Dex.getEffectiveness`）
- `src/battle/types.ts` — 新增 `run` 动作、`escaped`/`escapeAttempts`/`captureResult` 状态、VolatileStatus
- `src/battle/index.ts` — 导出 OpponentEntry、attemptCapture、CaptureResult
- `src/ui/BattleFlow.tsx` — 逃跑按钮、物品消耗
- `src/dex/species.ts` — 使用 pokedex-data 替代硬编码 supplement
- `src/dex/learnsets.ts` — 新增 randomAbility、getAbilities 函数
- `src/dex/names.ts` — 支持加载 auto-generated 多语言名称数据
- `src/dex/pokedex-data.ts` — 新增 getHatchCounter 函数
- `src/core/creature.ts` — PID 生成、IV 位提取、Shiny XOR 检测、randomAbility
- `src/core/gender.ts` — 修复阈值为 `genderRate * 32`
- `src/core/egg.ts` — 使用 getHatchCounter 替代 captureRate 计算孵化步数
