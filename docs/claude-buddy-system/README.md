# Claude Code Buddy System — 源码还原

> 从 `@anthropic-ai/claude-code` npm 包 (v2.1.89) 的 `cli.js` 反编译还原

## 这是什么

Claude Code 在 2026 年 4 月 1 日推出了一个隐藏的 **AI 电子宠物系统** — 终端里的拓麻歌子。

用户输入 `/buddy` 后会"孵化"一只专属宠物，它会坐在输入框旁边看你写代码，偶尔冒出气泡吐槽你的代码。

## 系统架构

```
src/buddy/
├── types.ts              # 类型定义 & 常量 (物种/稀有度/属性/外观)
├── companion.ts          # 核心模块 (PRNG/哈希/骨架生成/Config读写)
├── sprites.ts            # ASCII 精灵动画 (18物种×3帧 + 帽子)
├── useBuddyNotification.ts  # 可用性检查 & 预告通知
├── buddyCommand.ts       # /buddy 斜杠命令入口
├── buddyReaction.ts      # 宠物自动评论 (API调用 + 触发逻辑)
└── CompanionWidget.ts    # 终端渲染组件 (React + Ink)
```

## 核心机制

### 1. 确定性宠物生成

每个用户的宠物是**确定性的** — 改配置也没用：

```
userId + "friend-2026-401" → FNV-1a hash → Mulberry32 PRNG → 逐项 roll
```

### 2. 18 种物种

| 物种 | 英文 | 特征 |
|------|------|------|
| 🦆 鸭子 | duck | `<(· )___` |
| 🪿 鹅 | goose | `(·>` |
| 🫧 果冻 | blob | 会膨胀缩小 |
| 🐱 猫 | cat | `=·ω·=` |
| 🐉 龙 | dragon | 会喷烟 |
| 🐙 章鱼 | octopus | 触手摆动 |
| 🦉 猫头鹰 | owl | 会眨眼 |
| 🐧 企鹅 | penguin | 会滑行 |
| 🐢 乌龟 | turtle | 龟壳变化 |
| 🐌 蜗牛 | snail | 留痕迹 |
| 👻 幽灵 | ghost | 飘浮波纹 |
| 🦎 六角恐龙 | axolotl | 鳃摆动 |
| 🦫 水豚 | capybara | 最大头 |
| 🌵 仙人掌 | cactus | 手臂变换 |
| 🤖 机器人 | robot | 天线闪烁 |
| 🐰 兔子 | rabbit | 耳朵抖动 |
| 🍄 蘑菇 | mushroom | 帽子变大 |
| 😺 胖猫 | chonk | 尾巴摇 |

### 3. 稀有度系统

| 稀有度 | 概率 | 星级 | 基础属性 | 帽子 |
|--------|------|------|----------|------|
| Common | 60% | ★ | 5 | 无 |
| Uncommon | 25% | ★★ | 15 | 有 |
| Rare | 10% | ★★★ | 25 | 有 |
| Epic | 4% | ★★★★ | 35 | 有 |
| Legendary | 1% | ★★★★★ | 50 | 有 |

**闪光 (Shiny)**: 任何稀有度都有 1% 概率

### 4. 外观系统

**眼睛** (6种): `·` `✦` `×` `◉` `@` `°`

**帽子** (8种):
```
crown:     \^^^/      皇冠
tophat:    [___]      高帽
propeller:  -+-       螺旋桨帽
halo:      (   )      光环
wizard:     /^\       巫师帽
beanie:    (___)      毛线帽
tinyduck:   ,>        小鸭子
```

### 5. 属性系统

五项属性: **DEBUGGING** / **PATIENCE** / **CHAOS** / **WISDOM** / **SNARK**

- 随机选 2 个为突出属性 (主属性大幅加成，副属性略低)
- 其余为基础 + 随机

### 6. AI 灵魂生成

孵化时调用 Haiku 模型生成:
- **名字**: 一个词，≤12字符，略带荒诞 (如 Pith, Dusker, Crumb)
- **性格**: 一句话，影响它评论代码的方式

### 7. 宠物评论 (Reaction)

宠物会在以下情况冒出气泡评论:
- **测试失败** — 检测到 "X failed" / "FAIL" 等
- **代码错误** — 检测到 "error:" / "exception" / "traceback"
- **被叫名字** — 用户在消息中提到宠物名字
- **周期性** — 每隔一段时间

评论通过 API 生成:
```
POST /api/organizations/{orgId}/claude_code/buddy_react
```

### 8. 系统提示注入

宠物激活后，会在 Claude 的系统提示中注入一段 `<system-reminder>`，
告诉 Claude "有一个叫 {name} 的 {species} 坐在旁边，
用户叫它名字时你要让开"。

## 编译门控

Buddy 系统受三层门控保护:

1. **编译开关**: `feature('BUDDY')` — 构建时决定代码是否包含
2. **运行时检查**: `isBuddyLive()` — firstParty + 日期 ≥ 2026-04-01
3. **远程标志**: `tengu_amber_flint` — GrowthBook A/B 测试

## 声明

- 源码版权归 [Anthropic](https://www.anthropic.com) 所有
- 仅用于技术研究与学习
