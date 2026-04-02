# Buddy 恢复实施文档

## 1. 文档目的

本文档用于指导当前仓库中的 `buddy` 子系统恢复开发，目标是生成一套可直接实施、可单测、可冒烟验证的本地闭环实现。

本文档覆盖：

- 现状判定
- 恢复目标
- 文件级改动说明
- 函数签名与行为约束
- 分阶段实施顺序
- 单元测试计划
- 冒烟测试计划
- 风险点与回滚点

本文档不覆盖：

- Anthropic 内部 first-party 远程 API 接入
- 生产 GrowthBook 灰度策略
- 模型生成 soul 的在线实现

第一阶段只恢复开源仓库中可以独立运行的本地版本。

## 2. 当前现状

### 2.1 已存在的 buddy 资产

当前仓库中，`buddy` 并不是空白功能，以下链路已经存在：

- 命令注册位：`src/commands.ts`
- UI 组件：`src/buddy/CompanionSprite.tsx`
- 数据模型：`src/buddy/types.ts`
- 骨架生成逻辑：`src/buddy/companion.ts`
- sprite 渲染：`src/buddy/sprites.ts`
- teaser / live 检查：`src/buddy/useBuddyNotification.tsx`
- prompt 注入：`src/buddy/prompt.ts`
- attachment 注入：`src/utils/attachments.ts`
- system reminder 转换：`src/utils/messages.ts`
- config 字段：`src/utils/config.ts`
- AppState 字段：`src/state/AppStateStore.ts`
- REPL 接线：`src/screens/REPL.tsx`

### 2.2 当前缺失点

当前真正缺失的是动作层和 observer 实现：

- `src/commands/buddy/index.ts` 只是空 stub，当前不是合法 `Command`
- 没有 `src/commands/buddy/buddy.ts`
- 没有 hatch / off / on / pet 的实现
- `companionPetAt` 只有定义和读取，没有写入
- `companionMuted` 有读取，没有 slash command 写入
- `REPL.tsx` 调用了全局 `fireCompanionObserver(...)`
- 仓库中只有 `src/types/global.d.ts` 的声明，没有 observer 实现

### 2.3 当前已确认的真实约束

以下约束已经在源码中确认过：

- `StoredCompanion` 只持久化 soul，不持久化 bones
- `companionMuted` 属于持久态，应写入 global config
- `companionPetAt` 属于瞬时态，应写入 AppState，而不是 config
- `companionReaction` 属于瞬时态，应写入 AppState
- `local-jsx` 命令既可以用 `onDone(...)` 输出文本，也可以 `return null`
- 当前 prompt 注入链在 muted 时会自动关闭，无需额外修改

## 3. 恢复目标

第一阶段恢复的用户可见功能定义如下：

1. `/buddy`
2. `/buddy pet`
3. `/buddy off`
4. `/buddy on`
5. 本地 observer 气泡评论

每条命令的目标行为如下。

### 3.1 `/buddy`

- 若无 companion，则 hatch 一只新的 companion
- hatch 后写入 `config.companion`
- hatch 后自动设为非静音
- 返回 hatch 结果文本卡片
- 若已有 companion，则直接显示卡片

### 3.2 `/buddy pet`

- 若无 companion，则显示提示
- 若有 companion，则触发 hearts 动画
- 若当前 muted，则自动解除静音，保证动画可见

### 3.3 `/buddy off`

- 写入 `config.companionMuted = true`
- companion sprite 隐藏
- companion prompt 注入停止

### 3.4 `/buddy on`

- 写入 `config.companionMuted = false`
- companion sprite 恢复
- companion prompt 注入恢复

### 3.5 observer

- 在用户提到 companion 名字时触发 reaction
- 在检测到测试失败文本时触发 reaction
- 在检测到错误文本时触发 reaction
- 第一阶段 reaction 仅由本地模板生成，不依赖远程 API

## 4. 非目标

以下能力不属于第一阶段目标：

- 使用模型生成 `name` 和 `personality`
- 调用远程 `buddy_react` API
- Anthropic 内部 OAuth / organization gating
- 复杂 hatch 动画 modal
- 丰富的 rate limit / 灰度策略接入

这些能力可以在本地闭环稳定后作为第二阶段扩展。

## 5. 设计原则

### 5.1 保留现有 buddy 系统结构

不重写已存在模块：

- `companion.ts`
- `types.ts`
- `sprites.ts`
- `CompanionSprite.tsx`
- `prompt.ts`
- `attachments.ts`
- `messages.ts`

这些模块已经构成 buddy 的显示层和上下文注入层。

### 5.2 只补动作层

第一阶段只新增或修改：

- buddy 命令元数据
- buddy 命令分发器
- hatch 逻辑
- card 文本渲染
- observer
- REPL 中的 observer 接线

### 5.3 第一阶段使用本地 deterministic soul

理由：

- 可在无远程依赖时立即闭环
- 可单测
- 可冒烟
- 不会把恢复工作扩展为 query orchestration 工作

### 5.4 observer 必须收回仓库内

当前全局 `fireCompanionObserver(...)` 只有声明没有实现。继续依赖全局实现会让 buddy 在仓库内不可维护。

## 6. 文件级实施方案

### 6.1 修改 `src/commands/buddy/index.ts`

当前文件内容是空 stub，必须替换为合法命令元数据。

目标结构：

```ts
import type { Command } from '../../commands.js'
import { isBuddyLive } from '../../buddy/useBuddyNotification.js'

const buddy = {
  type: 'local-jsx',
  name: 'buddy',
  description: 'Hatch a coding companion · pet, off',
  argumentHint: '[pet|off|on]',
  immediate: true,
  get isHidden() {
    return !isBuddyLive()
  },
  load: () => import('./buddy.js'),
} satisfies Command

export default buddy
```

说明：

- 使用 `local-jsx`，不是 `local`
- `immediate: true`，保证命令即时执行
- 第一阶段即便不返回 JSX，也仍保留 `local-jsx`，为未来 hatch 动画保留接口

### 6.2 新建 `src/commands/buddy/buddy.ts`

该文件是 buddy 的命令分发入口。

导出函数签名：

```ts
import type React from 'react'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import type { ToolUseContext } from '../../Tool.js'

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode | null>
```

职责：

- 解析 `args`
- 获取 `companion`
- 分发到 `off / on / pet / default`
- 通过 `onDone(...)` 输出文本
- 第一阶段统一 `return null`

不负责：

- bones 生成细节
- soul 生成细节
- 卡片文本拼装
- observer 逻辑

推荐内部结构：

```ts
const subcommand = args.trim().toLowerCase()
const companion = getCompanion()

switch (subcommand) {
  case 'off':
  case 'on':
  case 'pet':
  case '':
  default:
}
```

### 6.3 新建 `src/commands/buddy/hatch.ts`

该文件负责 hatch 逻辑和本地 soul 生成。

建议导出：

```ts
import type {
  Companion,
  CompanionBones,
  CompanionSoul,
} from '../../buddy/types.js'

export function buildLocalSoul(
  bones: CompanionBones,
  inspirationSeed: number,
): CompanionSoul

export function hatchCompanion(): Companion
```

#### `buildLocalSoul(...)` 行为

输入：

- `bones`
- `inspirationSeed`

输出：

- `name`
- `personality`

约束：

- 名字长度建议 1-14 字符
- personality 一句话，不超过 120 字符

实现建议：

- `name` 由 `species`、`rarity`、`inspirationSeed` 决定
- `personality` 由最高属性和 rarity 决定

#### `hatchCompanion()` 行为

固定顺序：

1. `const userId = companionUserId()`
2. `const { bones, inspirationSeed } = roll(userId)`
3. `const soul = buildLocalSoul(bones, inspirationSeed)`
4. `const hatchedAt = Date.now()`
5. `saveGlobalConfig(...)` 写入 `companion`
6. 返回 `{ ...bones, ...soul, hatchedAt }`

写入结构必须是：

```ts
{
  companion: {
    name,
    personality,
    hatchedAt,
  },
  companionMuted: false,
}
```

禁止写入 bones 到 config。

### 6.4 新建 `src/commands/buddy/card.ts`

该文件负责将 companion 转成用户可读文本卡片。

建议导出：

```ts
import type { Companion } from '../../buddy/types.js'

export function formatCompanionCard(companion: Companion): string
export function formatHatchMessage(companion: Companion): string
```

#### `formatCompanionCard(...)` 输出结构

卡片建议包含：

- sprite
- name
- species
- rarity
- stars
- shiny 标记
- personality
- 全部 stat
- 使用提示

建议输出模板：

```text
<sprite>

Miso
cat · RARE ★★★

Judges your code quietly, and usually correctly.

DEBUGGING   ███████░░░ 74
PATIENCE    ████░░░░░░ 41
CHAOS       ██░░░░░░░░ 22
WISDOM      ██████░░░░ 63
SNARK       ████████░░ 81

Miso is here · it'll chime in as you code
say its name to get its take · /buddy pet · /buddy off
```

依赖：

- `renderSprite(companion, 0)`
- `RARITY_STARS`
- `STAT_NAMES`

#### `formatHatchMessage(...)`

第一阶段可以直接基于 `formatCompanionCard(...)` 封装，例如在顶部加两行：

```text
hatching a coding buddy…
it'll watch you work and occasionally have opinions
```

### 6.5 新建 `src/buddy/observer.ts`

该文件负责本地 observer。

导出函数签名：

```ts
import type { Message } from '../types/message.js'

export async function fireCompanionObserver(
  messages: Message[],
  callback: (reaction: string | undefined) => void,
): Promise<void>
```

#### 第一阶段触发条件

1. `addressed`
2. `test_failed`
3. `error`

建议内部辅助函数：

```ts
function findLatestUserText(messages: Message[]): string | undefined
function detectReactionReason(messages: Message[], companionName: string): ReactionReason | null
function buildLocalReaction(reason: ReactionReason, companionName: string): string | undefined
```

#### 正则建议

测试失败：

```ts
/\b[1-9]\d* (failed|failing)\b|\btests? failed\b|^FAIL(ED)?\b| ✗ | ✘ /im
```

错误：

```ts
/\berror:|\bexception\b|\btraceback\b|\bpanicked at\b|\bfatal:|exit code [1-9]/i
```

#### 输出约束

- reaction 为单行
- 长度小于等于 80 字符
- 若 muted 或无 companion，则必须返回 `undefined`

### 6.6 修改 `src/screens/REPL.tsx`

将当前隐式全局调用改为显式模块依赖。

当前需要替换的位置是：

- `fireCompanionObserver(messagesRef.current, ...)`

修改目标：

- 新增 `import { fireCompanionObserver } from '../buddy/observer.js'`
- 保留原有 `setAppState` 写 `companionReaction` 的逻辑

不改：

- `CompanionSprite` 渲染位置
- `companionReaction` 清理逻辑
- fullscreen / narrow 相关布局逻辑

### 6.7 收尾修改 `src/types/global.d.ts`

在 observer 显式模块化后，删除：

```ts
declare function fireCompanionObserver(...)
```

该步骤放在 Phase 4，避免在过渡期打断编译。

## 7. 命令行为定义

### 7.1 `/buddy off`

行为：

- `saveGlobalConfig(current => ({ ...current, companionMuted: true }))`
- `onDone('companion muted', { display: 'system' })`
- `return null`

### 7.2 `/buddy on`

行为：

- `saveGlobalConfig(current => ({ ...current, companionMuted: false }))`
- `onDone('companion unmuted', { display: 'system' })`
- `return null`

### 7.3 `/buddy pet`

行为：

- 若 `getCompanion()` 为 `undefined`
  - `onDone('no companion yet · run /buddy first', { display: 'system' })`
- 若有 companion
  - 若 `companionMuted === true`，先解除静音
  - `context.setAppState(prev => ({ ...prev, companionPetAt: Date.now() }))`
  - `onDone(undefined, { display: 'skip' })`

说明：

- 推荐 `pet` 时自动解除静音
- 推荐 `display: 'skip'`，避免在 transcript 留下低价值输出

### 7.4 `/buddy`

无参数时：

- 若已有 companion
  - `onDone(formatCompanionCard(companion), { display: 'system' })`
- 若无 companion
  - `const companion = hatchCompanion()`
  - `onDone(formatHatchMessage(companion), { display: 'system' })`

### 7.5 非法参数

行为：

```text
usage: /buddy [pet|off|on]
```

输出方式：

- `display: 'system'`

## 8. 状态链说明

### 8.1 持久态

写入位置：

- `config.companion`
- `config.companionMuted`

消费位置：

- `getCompanion()`
- `prompt.ts`
- `CompanionSprite.tsx`
- `PromptInput.tsx`

### 8.2 瞬时态

写入位置：

- `AppState.companionPetAt`
- `AppState.companionReaction`

消费位置：

- `CompanionSprite.tsx`
- `REPL.tsx`

禁止：

- 将 `companionPetAt` 写入 global config
- 将 `companionReaction` 写入 global config

## 9. 测试实施方案

### 9.1 新增测试文件

- `src/commands/buddy/buddy.test.ts`
- `src/commands/buddy/card.test.ts`
- `src/buddy/observer.test.ts`

### 9.2 测试前提

已确认 `src/utils/config.ts` 在 `NODE_ENV=test` 下有测试态 config：

- `getGlobalConfig()` 返回测试对象
- `saveGlobalConfig(...)` 直接写测试对象

这意味着 buddy 的 config 行为可以直接单测，不需要自建文件 mock。

### 9.3 `buddy.test.ts` 用例

1. `/buddy` 首次执行时会创建 `config.companion`
2. 再次执行 `/buddy` 不会覆盖现有 companion
3. `/buddy off` 会设置 `companionMuted = true`
4. `/buddy on` 会设置 `companionMuted = false`
5. `/buddy pet` 在无 companion 时返回提示
6. `/buddy pet` 在有 companion 时调用 `setAppState(...)`
7. 非法参数返回 usage

### 9.4 `card.test.ts` 用例

1. 卡片包含名字
2. 卡片包含 species
3. 卡片包含 rarity
4. 卡片包含 personality
5. 卡片包含所有 stat 名称
6. 卡片至少包含一行 sprite

### 9.5 `observer.test.ts` 用例

1. 提到 companion 名字时触发 reaction
2. 测试失败文本触发 reaction
3. 错误文本触发 reaction
4. muted 时不触发
5. 无 companion 时不触发

## 10. 冒烟测试

以下 smoke 为实施完成后的人工验证脚本。

### 10.1 启动

命令：

```bash
bun run dev
```

预期：

- 若 dev build 中启用了 `feature('BUDDY')`，则命令系统中应存在 `/buddy`
- 在 2026-04-02 这个日期上，应处于 live 时间范围内

说明：

- 当前会话中 `bun` 不可用，因此文档内保留为待执行 smoke

### 10.2 首次孵化

输入：

```text
/buddy
```

预期：

- 创建 companion
- 显示 hatch 文案和卡片
- companion sprite 出现在输入区旁
- 全局 config 出现 `companion`

### 10.3 再次查看

输入：

```text
/buddy
```

预期：

- 显示同一只 companion
- 不重新 hatch
- 名字和 personality 不变化

### 10.4 抚摸

输入：

```text
/buddy pet
```

预期：

- hearts 动画持续约 2.5 秒
- 若之前为 off，则 pet 后应可见 sprite

### 10.5 关闭

输入：

```text
/buddy off
```

预期：

- sprite 消失
- 后续消息不再注入 `companion_intro`

### 10.6 打开

输入：

```text
/buddy on
```

预期：

- sprite 恢复
- 后续消息重新注入 `companion_intro`

### 10.7 observer

完成 observer 后测试：

1. 输入包含 companion 名字的消息
2. 制造一次测试失败文本
3. 制造一次错误文本

预期：

- `companionReaction` 被更新
- bubble 出现
- bubble 自动淡出

## 11. 实施顺序

### Phase 1

- 修改 `src/commands/buddy/index.ts`
- 新建 `src/commands/buddy/buddy.ts`
- 实现 `off / on / pet`

完成标准：

- `/buddy off`
- `/buddy on`
- `/buddy pet`

全部可运行

### Phase 2

- 新建 `src/commands/buddy/hatch.ts`
- 新建 `src/commands/buddy/card.ts`
- 实现 `/buddy`

完成标准：

- 可 hatch
- 可持久化
- 可查看卡片

### Phase 3

- 新建 `src/buddy/observer.ts`
- 修改 `src/screens/REPL.tsx`

完成标准：

- 本地 reaction bubble 可工作

### Phase 4

- 增加测试
- 跑 smoke
- 删除 `global.d.ts` 中的旧 observer 声明

## 12. 风险点

### 12.1 最高风险

- `src/commands/buddy/index.ts` 若仍为空对象，则在 `feature('BUDDY')` 启用时命令系统是坏的

### 12.2 高风险

- 若把 `companionPetAt` 写进 config，现有 UI 链路不会正确工作
- 若继续依赖全局 `fireCompanionObserver(...)`，后续维护仍不可控

### 12.3 中风险

- 若 hatch 同时引入模型生成，会把恢复范围扩展到 query / structured output / error fallback

## 13. 回滚点

若实施中断，可按以下顺序回滚：

1. 删除 `src/commands/buddy/buddy.ts`
2. 删除 `src/commands/buddy/hatch.ts`
3. 删除 `src/commands/buddy/card.ts`
4. 删除 `src/buddy/observer.ts`
5. 恢复 `src/commands/buddy/index.ts` 到原始状态
6. 恢复 `src/screens/REPL.tsx` 的 observer 调用

现有 buddy 显示层不会受影响。

## 14. 第二阶段扩展建议

第一阶段稳定后，可以继续做：

- hatch 使用模型生成 `name` 和 `personality`
- observer 接远程 API
- hatch 动画 JSX
- 更细致的 reaction reason 分类
- `/buddy rename` 或更多 companion 管理命令

这些都不应阻塞第一阶段落地。

## 15. 结论

当前 buddy 恢复工作的本质不是“重做一个新功能”，而是“把已经存在的显示层和上下文层补成完整系统”。

当前仓库已经具备：

- deterministic bones
- config schema
- AppState schema
- sprite UI
- prompt injection
- REPL 挂载点

因此第一阶段只需要完成三块：

- 命令层
- hatch / card
- observer

按本文档实施后，buddy 将具备：

- 可执行 slash command
- 可持久化 companion
- 可显示 sprite
- 可响应 pet
- 可静音和恢复
- 可进行本地 bubble reaction

