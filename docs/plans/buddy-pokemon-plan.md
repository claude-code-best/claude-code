# Buddy Pokémon 系统重构计划

## Context

现有 buddy 系统（`src/buddy/`）是一个简单的终端宠物，18 种物种、固定属性、无成长机制。用户希望将其重构为 Pokémon 风格的收集养成系统，以独立包 `packages/pokemon/` 的形式实现，复用原始 151 版本的设计理念。MVP 先做 10 只精灵（御三家 3 条进化线 + 1 只吉祥物）。

---

## Phase 1: 包结构与数据模型

### 1.1 `packages/pokemon/` 目录结构

```
packages/pokemon/
├── package.json              # name: "@claude-code-best/pokemon"
├── tsconfig.json
├── src/
│   ├── index.ts              # 统一导出
│   ├── types.ts              # 所有类型定义
│   ├── data/
│   │   ├── species.ts        # 10 只物种定义（base stats, 进化链, 性别比, 性格）
│   │   ├── evolution.ts      # 进化条件数据
│   │   ├── evMapping.ts      # 工具→EV 映射（可配置 JSON）
│   │   ├── xpTable.ts        # 1-100 级经验表（指数曲线）
│   │   └── names.ts          # 默认名、性格文案
│   ├── sprites/
│   │   ├── index.ts          # 精灵渲染入口
│   │   ├── renderer.ts       # ASCII art 渲染器（抖动/眨眼/粒子动画）
│   │   └── fallback.ts       # 网络失败时的简易 ASCII 占位符
│   ├── core/
│   │   ├── creature.ts       # 精灵生成、属性计算、等级判定
│   │   ├── experience.ts     # XP 增减、升级检测、经验曲线
│   │   ├── effort.ts         # EV 计算、工具→EV 映射
│   │   ├── evolution.ts      # 进化条件检测、进化执行
│   │   ├── egg.ts            # 蛋获取条件判定、孵化步数
│   │   ├── gender.ts         # 性别判定（按原始 151 设计）
│   │   ├── spriteCache.ts    # GitHub 拉取 cow → 本地 JSON 缓存
│   │   └── storage.ts        # ~/.claude/buddy-data.json 读写
│   └── ui/
│       ├── CompanionCard.tsx  # 重设计：6 属性条 + 等级 + XP
│       ├── PokedexView.tsx    # 图鉴视图
│       ├── EggView.tsx        # 蛋/孵化进度
│       ├── EvolutionAnim.tsx  # 进化闪烁变形动画
│       └── StatBar.tsx        # 属性条组件（复用现有样式）
```

### 1.2 核心类型定义

```typescript
// types.ts

// 6 属性（映射到编程场景）
export type StatName = 'hp' | 'attack' | 'defense' | 'spAtk' | 'spDef' | 'speed'
export const STAT_NAMES: StatName[] = ['hp', 'attack', 'defense', 'spAtk', 'spDef', 'speed']
export const STAT_LABELS: Record<StatName, string> = {
  hp: 'HP', attack: 'ATK', defense: 'DEF',
  spAtk: 'SPA', spDef: 'SPD', speed: 'SPE'
}

// 物种 ID（MVP 10 只）
export type SpeciesId =
  | 'bulbasaur' | 'ivysaur' | 'venusaur'      // 御三家·草
  | 'charmander' | 'charmeleon' | 'charizard'  // 御三家·火
  | 'squirtle' | 'wartortle' | 'blastoise'     // 御三家·水
  | 'pikachu'                                   // 吉祥物

// 性别
export type Gender = 'male' | 'female' | 'genderless'

// 进化触发类型
export type EvolutionTrigger = 'level' | 'level_up' | 'item' | 'trade' | 'friendship'

export type EvolutionCondition = {
  trigger: EvolutionTrigger
  level?: number                    // 等级进化：目标等级
  minFriendship?: number            // 亲密度进化
  item?: string                     // 道具进化
  into: SpeciesId                   // 进化为
}

// 物种基础数据
export type SpeciesData = {
  id: SpeciesId
  name: string                      // 英文名
  names: Record<string, string>     // 多语言名 { ja, en, zh }
  dexNumber: number                 // 图鉴编号 (1-10 MVP)
  genderRatio: number               // 雌性概率 (0-1, -1=无性别)
  baseStats: Record<StatName, number>
  types: [string, string?]          // 属性 (grass/poison, fire, water 等)
  personality: string               // 默认性格描述
  evolutionChain?: EvolutionCondition[]
  sprites: string[][]               // ASCII art 帧 (每帧 5 行)
  shinyChance: number               // 闪光概率
}

// 实例化的精灵（存储在 buddy-data.json）
export type Creature = {
  id: string                        // 唯一 ID (uuid)
  speciesId: SpeciesId
  nickname?: string                 // 用户自定义名
  gender: Gender
  level: number
  xp: number
  ev: Record<StatName, number>      // 努力值
  iv: Record<StatName, number>      // 个体值 (0-31)
  friendship: number                // 亲密度 (0-255)
  isShiny: boolean
  hatchedAt: number                 // 获得时间戳
}

// 蛋
export type Egg = {
  id: string
  obtainedAt: number
  stepsRemaining: number            // 剩余孵化步数
  speciesId: SpeciesId              // 预决定的物种（保底不重复）
}

// 图鉴条目
export type DexEntry = {
  speciesId: SpeciesId
  discoveredAt: number
  caughtCount: number               // 捕获数量
  bestLevel: number                 // 最高等级记录
}

// buddy-data.json 完整结构
export type BuddyData = {
  version: 1
  activeCreatureId: string | null
  creatures: Creature[]
  eggs: Egg[]
  dex: DexEntry[]
  stats: {
    totalTurns: number
    consecutiveDays: number
    lastActiveDate: string          // ISO date
    totalEggsObtained: number
    totalEvolutions: number
  }
}
```

### 1.3 工具→EV 映射（可配置）

```typescript
// data/evMapping.ts
export const DEFAULT_EV_MAPPING: Record<string, Record<StatName, number>> = {
  "Bash":      { attack: 2, speed: 1 },
  "Edit":      { spAtk: 2, defense: 1 },
  "Write":     { spAtk: 3 },
  "Read":      { defense: 2, hp: 1 },
  "Grep":      { spDef: 2, speed: 1 },
  "Glob":      { spDef: 2, speed: 1 },
  "Agent":     { speed: 2, attack: 1 },
  "WebSearch": { spDef: 2, hp: 1 },
  "WebFetch":  { spDef: 2, hp: 1 },
}
// 不在映射中的工具 → 随机分配 1-2 点 EV
```

### 1.4 经验曲线

```typescript
// data/xpTable.ts
// 指数曲线: level N 需要 totalXP = floor(N^3 * 0.8)
// 等级 1→2: 1 XP, 5→6: ~100 XP, 16→17: ~3000 XP, 36→37: ~37000 XP
export function xpForLevel(level: number): number {
  return Math.floor(Math.pow(level, 3) * 0.8)
}
```

---

## Phase 2: 数据源 + 核心逻辑

### 2.0 PokeAPI 数据源

**API**: https://pokeapi.co/ （免费，无需认证，速率限制：100 请求/分钟/IP）

**关键端点**:

| 端点 | 数据 | 示例 |
|------|------|------|
| `/api/v2/pokemon/{id}` | base stats, types, height, weight | `hp:45, atk:49, def:49, spa:65, spd:65, spe:45` |
| `/api/v2/pokemon-species/{id}` | gender_rate, base_happiness, growth_rate, evolution_chain URL, flavor_text | `gender_rate:1, growth_rate:"medium-slow"` |
| `/api/v2/evolution-chain/{id}` | 完整进化链 + 触发条件 | `bulbasaur → Lv16 → ivysaur → Lv32 → venusaur` |

**gender_rate 含义**: -1=无性别, 0=全雄, 1=12.5%雌, 4=50%雌, 8=全雌。公式: `femaleChance = gender_rate / 8`

**growth_rate 映射到 XP 曲线**:

| growth_rate | 公式 | 100级总XP |
|-------------|------|-----------|
| erratic | 复杂分段 | 600,000 |
| fast | `n^3 * 0.8` | 800,000 |
| medium-fast | `n^3` | 1,000,000 |
| medium-slow | `1.2n^3 - 15n^2 + 100n - 140` | 1,059,860 |
| slow | `1.25n^3` | 1,250,000 |
| fluctuating | 复杂分段 | 1,640,000 |

**MVP 10 只的 growth_rate**:
- Bulbasaur line: `medium-slow` (链 #1)
- Charmander line: `medium-slow` (链 #2)
- Squirtle line: `medium-slow` (链 #3)
- Pikachu: `medium-fast` (链 #10)

**数据获取策略**: 构建时调用 PokeAPI 预拉取 10 只精灵数据，生成静态 `data/species.ts`，运行时无需网络请求。用脚本 `scripts/fetch-species.ts` 实现：

```bash
# 构建时拉取，生成 species.ts
bun run packages/pokemon/scripts/fetch-species.ts
```

预拉取的数据项：
- `baseStats`: 6 项种族值（直接用于属性计算）
- `types`: 属性组合（grass/poison, fire, water 等）
- `genderRate`: 性别比例
- `baseHappiness`: 基础亲密度（70）
- `growthRate`: 经验曲线类型
- `evolutionChain`: 进化链 + 触发条件（level/friendship/item）
- `captureRate`: 捕获率（影响蛋的稀有度）
- `flavorText`: 图鉴描述文本

### 2.0.1 端点数据示例

**GET /api/v2/pokemon/1 (Bulbasaur)**:
```json
{
  "base_stats": {"hp":45, "attack":49, "defense":49, "special-attack":65, "special-defense":65, "speed":45},
  "types": ["grass", "poison"]
}
```

**GET /api/v2/pokemon-species/1**:
```json
{
  "gender_rate": 1,            // 12.5% 雌性
  "base_happiness": 70,
  "growth_rate": {"name": "medium-slow"},
  "capture_rate": 45,
  "evolution_chain": {"url": "https://pokeapi.co/api/v2/evolution-chain/1/"}
}
```

**GET /api/v2/evolution-chain/1**:
```json
{
  "chain": {
    "species": {"name": "bulbasaur"},
    "evolves_to": [{
      "species": {"name": "ivysaur"},
      "evolution_details": [{"min_level": 16, "trigger": {"name": "level-up"}}],
      "evolves_to": [{
        "species": {"name": "venusaur"},
        "evolution_details": [{"min_level": 32, "trigger": {"name": "level-up"}}]
      }]
    }]
  }
}
```

---

### 2.1 精灵生成 (`core/creature.ts`)

- `generateCreature(speciesId, seed?)`: 创建新精灵
  - IV 随机生成 (0-31)，用种子确定性
  - 性别按 speciesData.genderRatio 判定
  - 等级 1，XP 0，EV 全 0
  - 亲密度 70（基础值）
- `calculateStats(creature)`: 计算实际属性值
  - 公式参照宝可梦: `stat = floor((2*base + iv + floor(ev/4)) * level / 100) + 5`
  - HP 特殊: `hp = floor((2*base + iv + floor(ev/4)) * level / 100) + level + 10`
- `getCreatureName(creature)`: 返回 nickname || species name

### 2.2 经验系统 (`core/experience.ts`)

- `awardXP(creature, amount)`: 增加经验，返回是否升级
- `calculateLevel(xp)`: 根据 totalXP 计算当前等级
- 来源：
  - 对话轮次完成: +5 XP
  - /buddy pet: +2 XP
  - 工具使用（通过 EV 间接）: +1 XP/tool
  - 进化: +50 XP bonus

### 2.3 努力值系统 (`core/effort.ts`)

- `awardEV(creature, toolName, count)`: 根据工具名查映射表，加 EV
- `getEVForTool(toolName)`: 查映射表，未定义则随机
- EV 上限: 每项 252，总计 510（跟宝可梦一致）
- 冷却: 每种工具类型 30 秒内只计算一次 EV

### 2.4 进化系统 (`core/evolution.ts`)

- `checkEvolution(creature)`: 检查是否满足进化条件
  - 等级进化: level >= condition.level
  - 亲密度进化: friendship >= condition.minFriendship
- `evolve(creature)`: 执行进化
  - 物种 ID 变更为进化目标
  - 属性重新计算（base stats 变化）
  - 返回进化动画数据（旧物种 → 新物种）

MVP 进化链（参照原始 151）:
```
Bulbasaur(#1) → Lv16 → Ivysaur(#2) → Lv32 → Venusaur(#3)
Charmander(#4) → Lv16 → Charmeleon(#5) → Lv36 → Charizard(#6)
Squirtle(#7) → Lv16 → Wartortle(#8) → Lv36 → Blastoise(#9)
Pikachu(#10) — MVP 不进化（后续加 Raichu）
```

### 2.5 蛋系统 (`core/egg.ts`)

- `checkEggEligibility(buddyData)`: 判断是否满足获蛋条件
  - consecutiveDays >= 7 && totalTurns % 50 === 0（每 50 轮检查一次）
  - 持有蛋数 < 1（一次只能有一个蛋）
- `generateEgg(buddyData)`: 生成蛋
  - 物种从「未收集」列表随机选取（保底不重复）
  - 步数 = 2000-5000（按稀有度）
- `advanceEggSteps(egg, steps)`: 推进步数
  - pet +5 步，对话轮次 +3 步，任意命令 +1 步
- `tryHatch(egg)`: 检查步数是否归零，返回新 Creature

### 2.6 数据持久化 (`core/storage.ts`)

- `loadBuddyData()`: 从 `~/.claude/buddy-data.json` 读取
- `saveBuddyData(data)`: 写入
- `migrateFromLegacy()`: 迁移旧 buddy 数据
  - 现有 duck→Bulbasaur, cat→Charmander, turtle→Squirtle 等
  - 保留 nickname 和 personality
  - 等级设为 5（奖励老用户）

---

## Phase 3: ASCII Art 精灵

### 3.1 素材来源

**彩色像素精灵仓库**: https://github.com/HRKings/pokemonsay-newgenerations/tree/master/pokemons

该仓库包含大量 Pokémon `.cow` 文件（Perl cowsay 格式），使用 256 色 ANSI 转义 + Unicode 半块字符（▄▀）渲染高分辨率彩色像素精灵。MVP 所需的 10 个文件：

```
001_bulbasaur.cow  → 002_ivysaur.cow  → 003_venusaur.cow
004_charmander.cow → 005_charmeleon.cow → 006_charizard.cow
007_squirtle.cow   → 008_wartortle.cow  → 009_blastoise.cow
025_pikachu.cow
```

**格式特征**:
- Perl heredoc: `$the_cow =<<EOC;` ... `EOC`
- ANSI 256 色: `\e[38;5;Nm`（前景色）、`\e[48;5;Nm`（背景色）
- Unicode 半块字符: `\N{U+2584}`（▄）、`\N{U+2580}`（▀）、普通空格
- 每行含多个色块，组合出像素画效果

**转换引擎**: 不在代码中硬编码精灵图。运行时从 GitHub 拉取 .cow 文件，转换后缓存到本地。

**存储路径**: `~/.claude/buddy-sprites/{speciesId}.json`

**JSON 格式**:
```json
{
  "speciesId": "bulbasaur",
  "lines": ["           \e[49m           ...", "...", "...", "...", "..."],
  "width": 36,
  "height": 10,
  "fetchedAt": 1745260800000
}
```

**拉取 + 转换流程** (`core/spriteCache.ts`):
1. 获取精灵时（蛋孵化 / 首次获得 / 进化）触发 `fetchAndCacheSprite(speciesId)`
2. `fetch("https://raw.githubusercontent.com/HRKings/pokemonsay-newgenerations/master/pokemons/{NNN}_{name}.cow")`
3. 解析 .cow → 转换 → 写入 `~/.claude/buddy-sprites/{speciesId}.json`
4. 之后所有渲染从本地缓存读取，不再需要网络
5. `loadSprite(speciesId)` — 直接读本地缓存，无网络调用
6. 首次获取无网络 → 使用内置 fallback 简易 ASCII，下次有网时补拉

**转换步骤**:
1. 提取 heredoc 内容（`$the_cow =<<EOC;` 和 `EOC` 之间）
2. `\N{U+XXXX}` → 实际 Unicode 字符（`String.fromCharCode(0xXXXX)`）
3. 保留 ANSI 序列（`\e[38;5;Nm` / `\e[48;5;Nm`）— 终端直接渲染彩色
4. 去除前 4 行 `$thoughts` 占位行（cowsay 对话气泡引导线）
5. 按目标宽度缩放（CompanionCard 宽度约 36 列）
6. 写入本地 JSON 缓存

**动画策略**: 每物种只存 1 帧基础图，运行时通过变换生成动画：
- **idle**: 原图静态显示（占大部分时间）
- **fidget**: 整体右移 1 列 → 回原位，循环 1 次（500ms/帧，共 1 秒）
- **blink**: 将眼睛字符替换为 `—`（1 帧 500ms）
- **excited**: 快速左右抖动（每 250ms 交替 ±1 列偏移）
- **pet**: 在基础图上方叠加心形粒子帧（复用现有 PET_HEARTS）

不需要为每个物种单独设计帧。动画循环统一由 `sprites/renderer.ts` 的 `renderAnimatedSprite(sprite, tick, mode)` 处理：

```typescript
type AnimMode = 'idle' | 'fidget' | 'blink' | 'excited' | 'pet'

function renderAnimatedSprite(lines: string[], tick: number, mode: AnimMode): string[] {
  switch (mode) {
    case 'idle': return lines
    case 'fidget': return shiftLines(lines, tick % 2 === 0 ? 0 : 1)
    case 'blink': return lines.map(l => l.replace(/[·✦×◉@°]/g, '—'))
    case 'excited': return shiftLines(lines, tick % 2 === 0 ? -1 : 1)
    case 'pet': return [...PET_HEARTS[tick % 5], ...lines]
  }
}
```

**IDLE_SEQUENCE**（复用现有设计）: `[idle, idle, idle, idle, fidget, idle, idle, idle, blink, idle, idle, idle, idle]`

### 3.2 渲染适配

复用现有 `renderSprite()` 的架构，但扩展支持 ANSI 彩色：
- **彩色模式**: 保留原始 ANSI 256 色序列，直接输出到终端（256 色兼容性 > 99%）
- **单色回退**: 剥离 ANSI 序列，用 Ink `<Text color>` 代替（兼容 16 色终端）
- 眼睛替换：保留现有 `{E}` 占位符机制
- 帽子 slot：第 0 行保留空白（可选装饰）
- 3 帧动画循环：500ms tick（与现有一致）

### 3.3 进化动画帧

进化时使用闪烁变形效果：
- 帧 1-3: 旧形态 + 闪烁（间隔显示空白）
- 帧 4-6: 新旧形态交替
- 帧 7-8: 新形态 + ✨ 粒子
- 总时长 ~4 秒（8 帧 × 500ms）

---

## Phase 4: UI 组件

### 4.1 CompanionCard 重设计

```
┌──────────────────────────────────┐
│ ★ CHARIZARD #6           Lv.36  │
│ ✨ SHINY ✨                     │
│                                  │
│        ASCII art here            │
│                                  │
│ "Blaze" (nicknamed Ember)       │
│ Type: Fire/Flying  Gender: ♂    │
│                                  │
│ HP  ████████░░  85               │
│ ATK ██████░░░░  62               │
│ DEF █████░░░░░  55               │
│ SPA ███████░░░  78               │
│ SPD ████░░░░░░  48               │
│ SPE ██████░░░░  65               │
│                                  │
│ XP [████████░░░░░░░] 14200/15680 │
│ EV: ATK+42 SPA+28 SPE+18        │
│ Friendship: ████████░░ 180/255   │
│                                  │
│ ── Commands ──                   │
│ /buddy pet   Pet for hearts      │
│ /buddy dex   View Pokédex        │
│ /buddy egg   Check egg progress  │
│ /buddy switch Change buddy       │
└──────────────────────────────────┘
```

### 4.2 PokédexView (`/buddy dex`)

```
┌───── Pokédex ────────────────────┐
│ Collected: 4/10                  │
│                                  │
│ #001 Bulbasaur  ████████ Lv.12  │
│ #002 Ivysaur    ████████ Lv.24  │
│ #003 Venusaur   ────── ???       │
│ #004 Charmander ████████ Lv.8   │
│ #005 Charmeleon ────── ???       │
│ #006 Charizard  ────── ???       │
│ #007 Squirtle   ████████ Lv.16  │
│ #008 Wartortle  ────── ???       │
│ #009 Blastoise  ────── ???       │
│ #010 Pikachu    ████████ Lv.5   │
│                                  │
│ 🥚 Egg: 1240/3000 steps         │
│ Next egg in: 3 days + 12 turns  │
└──────────────────────────────────┘
```

### 4.3 EggView (`/buddy egg`)

```
┌───── Egg Status ─────────────────┐
│                                  │
│        .                          │
│       / \                         │
│      |   |                        │
│       \_/                         │
│                                  │
│ Steps: 1240 / 3000               │
│ ████████░░░░░░░░ 41%             │
│                                  │
│ Pet (+5) · Chat (+3) · Cmd (+1) │
│ Hatch: ~588 more interactions    │
└──────────────────────────────────┘
```

### 4.4 进化动画 (`EvolutionAnim.tsx`)

在 REPL 面板右侧区域显示：
- 设置 `AppState.companionEvolving = true`
- 500ms tick 循环：
  - tick 0-3: 旧精灵 + 闪烁（每隔一帧显示空白）
  - tick 4-7: 新旧交替 + ✨ 粒子效果
  - tick 8: 新形态稳定显示 + "进化成功!" 文字
- 用户按任意键结束动画
- 更新 buddy-data.json 中的物种数据

---

## Phase 5: 集成点

### 5.1 REPL.tsx 钩子（关键修改文件）

在 `src/screens/REPL.tsx` 约 3407 行（turn metrics 收集后）:

```typescript
// 现有代码
const toolMs = getTurnToolDurationMs()
const toolCount = getTurnToolCount()

// 新增: EV + XP 奖励
if (feature('BUDDY')) {
  const buddyData = loadBuddyData()
  if (buddyData.activeCreatureId) {
    // 1. 遍历本 turn 的工具调用，计算 EV
    const evResult = awardTurnEV(buddyData, messages)
    // 2. 奖励对话 XP
    const xpResult = awardXP(buddyData, 5 + toolCount)
    // 3. 推进蛋步数
    advanceEggSteps(buddyData, 3)
    // 4. 检查进化
    const evoResult = checkEvolution(getActiveCreature(buddyData))
    if (evoResult) {
      setAppState(prev => ({ ...prev, companionEvolving: evoResult }))
    }
    saveBuddyData(buddyData)
  }
}
```

### 5.2 /buddy 命令重构

修改 `src/commands/buddy/buddy.ts`，子命令：

| 命令 | 说明 |
|------|------|
| `/buddy` | 显示 CompanionCard（新版） |
| `/buddy status` | 详细属性 + EV 分布 |
| `/buddy pet` | 摸摸 (+5 蛋步数, +2 XP, 心形动画) |
| `/buddy dex` | 显示 PokédexView |
| `/buddy switch` | 列出已拥有精灵，选择首发 |
| `/buddy egg` | 显示 EggView |
| `/buddy rename <name>` | 重命名当前精灵 |
| `/buddy on/off` | 静音/取消静音 |

### 5.3 AppState 扩展

`src/state/AppStateStore.ts` 新增:
```typescript
companionEvolving?: { from: SpeciesId; to: SpeciesId }  // 进化动画状态
companionEggSteps?: number                                // 蛋步数更新（触发 UI 刷新）
```

### 5.4 buddy-data.json 持久化

路径: `~/.claude/buddy-data.json`

```typescript
// core/storage.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const BUDDY_DATA_PATH = join(homedir(), '.claude', 'buddy-data.json')

export function loadBuddyData(): BuddyData {
  if (!existsSync(BUDDY_DATA_PATH)) return getDefaultBuddyData()
  return JSON.parse(readFileSync(BUDDY_DATA_PATH, 'utf-8'))
}

export function saveBuddyData(data: BuddyData): void {
  writeFileSync(BUDDY_DATA_PATH, JSON.stringify(data, null, 2))
}
```

---

## Phase 6: 迁移方案

### 6.1 物种映射表

| 旧物种 | 新物种 | 原因 |
|--------|--------|------|
| duck | Bulbasaur | 同为初始伙伴 |
| cat | Charmander | 独立/判断力 → 火 |
| turtle | Squirtle | 耐心/稳重 → 水 |
| dragon | Pikachu | 稀有度最高 → 吉祥物 |
| 其他 14 种 | 随机御三家之一 | 按稀有度映射 |

### 6.2 迁移逻辑

```typescript
function migrateFromLegacy(storedCompanion: StoredCompanion): BuddyData {
  const speciesMap = { duck: 'bulbasaur', cat: 'charmander', turtle: 'squirtle', dragon: 'pikachu', ... }
  const speciesId = speciesMap[storedCompanion.species] ?? randomStarter()
  const creature = generateCreature(speciesId)
  creature.level = 5          // 奖励老用户
  creature.nickname = storedCompanion.name !== defaultName ? storedCompanion.name : undefined
  creature.friendship = 120   // 已有伙伴基础亲密度
  return {
    version: 1,
    activeCreatureId: creature.id,
    creatures: [creature],
    eggs: [],
    dex: [{ speciesId, discoveredAt: Date.now(), caughtCount: 1, bestLevel: 5 }],
    stats: { totalTurns: 0, consecutiveDays: 0, lastActiveDate: new Date().toISOString(), totalEggsObtained: 0, totalEvolutions: 0 }
  }
}
```

---

## Phase 7: 实施顺序

### Step 1: 包骨架 + 类型
- 创建 `packages/pokemon/` 目录结构
- 定义所有 TypeScript 类型
- 配置 package.json、tsconfig.json
- 在根 `package.json` 添加 workspace 引用

### Step 2: 数据文件（PokeAPI 预拉取）
- 编写 `scripts/fetch-species.ts` — 调用 PokeAPI 拉取 10 只精灵数据
- 运行脚本生成 `data/species.ts`（base stats, types, gender_rate, growth_rate, evolution_chain, capture_rate, flavor_text）
- 手动编写 EV 映射 (`data/evMapping.ts`)
- 编写 XP 经验表 (`data/xpTable.ts`)，支持 6 种 growth_rate 曲线

### Step 3: ASCII Art 精灵（获取时拉取，永久缓存）
- 编写 `core/spriteCache.ts` — 获取精灵时从 GitHub 拉取 .cow → 解析 → 缓存到 `~/.claude/buddy-sprites/`
- `loadSprite(speciesId)` 纯读本地缓存，无网络调用
- `fetchAndCacheSprite(speciesId)` 仅在获得新精灵/进化时触发
- 编写 `sprites/fallback.ts` — 网络不可用时的简易占位 ASCII
- 动画由 `renderAnimatedSprite()` 运行时变换（抖动/眨眼/心形粒子），每物种只缓存 1 帧

### Step 4: 核心逻辑
- `core/creature.ts` — 精灵生成、属性计算
- `core/experience.ts` — XP/等级系统
- `core/effort.ts` — EV 系统
- `core/evolution.ts` — 进化检测与执行
- `core/egg.ts` — 蛋系统
- `core/storage.ts` — 数据持久化
- `core/gender.ts` — 性别判定

### Step 5: UI 组件
- 重写 `CompanionCard.tsx`（6 属性 + 等级 + XP）
- 新建 `PokedexView.tsx`
- 新建 `EggView.tsx`
- 新建 `EvolutionAnim.tsx`

### Step 6: 集成
- 修改 `src/commands/buddy/buddy.ts` — 新子命令
- 修改 `src/screens/REPL.tsx` — EV/XP 钩子
- 修改 `src/state/AppStateStore.ts` — 新状态字段
- 修改 `src/buddy/CompanionSprite.tsx` — 使用新精灵系统
- 迁移逻辑在首次加载时自动执行

### Step 7: 测试
- `packages/pokemon/src/__tests__/` 单元测试
- 覆盖: 属性计算、XP 曲线、EV 映射、进化条件、蛋系统、迁移

---

## 关键文件清单

### 新建文件
- `packages/pokemon/` — 整个包（~20 个文件，不含精灵图）
- `~/.claude/buddy-data.json` — 运行时自动创建
- `~/.claude/buddy-sprites/` — 运行时从 GitHub 拉取并缓存的精灵 JSON（每个物种 1 个文件）

### 修改文件
- `src/commands/buddy/buddy.ts` — 新子命令路由
- `src/commands/buddy/index.ts` — 命令注册
- `src/screens/REPL.tsx` — EV/XP 钩子（~20 行新增）
- `src/state/AppStateStore.ts` — 新状态字段（~3 行）
- `src/buddy/CompanionSprite.tsx` — 使用 packages/pokemon 的精灵渲染
- `src/buddy/CompanionCard.tsx` — 可能直接替换为 packages/pokemon 的版本

### 不修改文件
- `src/utils/config.ts` — 旧 companion 字段保留，向后兼容
- `src/buddy/companionReact.ts` — API 调用层不变，只更新传入的数据结构
- `src/buddy/prompt.ts` — 伙伴 intro 逻辑微调

---

## 验证方案

1. **类型检查**: `bun run typecheck` 零错误
2. **单元测试**: `bun test packages/pokemon/` 覆盖核心逻辑
3. **全量测试**: `bun test` 确保 0 失败
4. **手动验证**:
   - `bun run dev` 启动 → `/buddy` 显示新卡片
   - `/buddy dex` 显示图鉴（初始只有 1 只）
   - `/buddy pet` 心形动画 + XP 增长
   - 模拟工具使用 → EV 增长
   - `/buddy egg` 显示蛋进度
   - 等级达到 16 → 进化动画触发
   - 旧用户 `~/.claude.json` 有 companion → 自动迁移
