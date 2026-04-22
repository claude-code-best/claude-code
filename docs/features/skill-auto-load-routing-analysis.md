# Skill Auto-load / Skill Search 路由分析

> 日期：2026-04-21  
> 范围：当前分支中的 Skill Search、Skill Learning、skill discovery attachment、turn-0 / inter-turn prefetch 链路  
> 结论：当前实现具备“按对话输入自动发现并注入 skill 内容”的基础能力，但它是 attachment/prefetch 链路，不是系统级强制 skill router；因此在 feature gate、信号、阈值或消息渲染任一环节失效时，用户会感觉“没有自动加载 skill”。

## 一、当前能力是否存在

存在。当前项目有一条从用户输入到 skill 自动注入的链路：

```text
用户输入
  -> getTurnZeroSkillDiscovery()
  -> skillSearch/localSearch.ts 检索本地 skill index
  -> skillSearch/prefetch.ts 生成 skill_discovery attachment
  -> messages.ts 渲染 <loaded-skill>
  -> 模型上下文看到 SKILL.md 内容
  -> 无匹配时 skillLearning/skillGapStore 记录 gap
```

核心证据：

| 环节 | 文件 | 说明 |
| --- | --- | --- |
| 开关 | `src/services/skillSearch/featureCheck.ts` | `SKILL_SEARCH_ENABLED` 和 `feature('EXPERIMENTAL_SKILL_SEARCH')` 控制启用 |
| 索引/搜索 | `src/services/skillSearch/localSearch.ts` | 扫描 project/global skill，做本地检索，含 CJK bigram 分词 |
| 自动加载 | `src/services/skillSearch/prefetch.ts` | 超过阈值的 skill 会带 `autoLoaded: true` 和 `content` |
| turn-0 attachment | `src/utils/attachments.ts` | 用户输入阶段调用 `getTurnZeroSkillDiscovery()` |
| inter-turn attachment | `src/query.ts` | 主 loop 中调用 `startSkillDiscoveryPrefetch()` 和 `collectSkillDiscoveryPrefetch()` |
| 模型可见内容 | `src/utils/messages.ts` | 把 `autoLoaded && content` 渲染为 `<loaded-skill>` |
| UI 可见提示 | `src/components/messages/AttachmentMessage.tsx` | 渲染 skill discovery attachment |
| gap 记录 | `src/services/skillLearning/skillGapStore.ts` | 无匹配时记录 pending/draft/active gap |
| 测试 | `src/services/skillSearch/__tests__/prefetch.test.ts` | 覆盖高置信 skill auto-load 和无匹配 gap |

## 二、当前实现为什么像“补丁式”

### 1. 它不是硬性的系统级路由

当前逻辑通过 `skill_discovery` attachment 注入，而不是在 prompt 进入模型之前由一个统一 router 强制执行：

```text
不是：用户输入 -> 强制 router -> 必须加载 SKILL.md -> 再进入模型
而是：用户输入 -> attachment discovery -> messages 渲染 -> 模型自行遵循
```

这意味着它依赖多个中间环节：

- feature gate 是否开启；
- attachment 是否生成；
- attachment 是否被消息链保留；
- `messages.ts` 是否正确渲染；
- 模型是否使用 `<loaded-skill>` 内容；
- 当前输入能否通过本地搜索达到阈值。

### 2. feature gate 关闭时完全不生效

`feature('EXPERIMENTAL_SKILL_SEARCH')` 和 `isSkillSearchEnabled()` 是硬门：

```ts
if (process.env.SKILL_SEARCH_ENABLED === '0') return false
if (process.env.SKILL_SEARCH_ENABLED === '1') return true
if (feature('EXPERIMENTAL_SKILL_SEARCH')) return true
return false
```

因此以下情况会让用户感觉“不自动加载”：

- build/dev define 未打开 `EXPERIMENTAL_SKILL_SEARCH`；
- 环境变量 `SKILL_SEARCH_ENABLED=0`；
- 相关模块被 dead-code elimination 排除；
- `CLAUDE_CODE_SIMPLE` 或 attachment 禁用路径跳过 attachment。

### 3. inter-turn prefetch 可能没有有效信号

`query.ts` 中有 inter-turn prefetch 注释和调用：

```ts
const pendingSkillPrefetch = skillPrefetch?.startSkillDiscoveryPrefetch(
  null,
  messages,
  toolUseContext,
)
```

但 `prefetch.ts` 当前逻辑是：

```ts
if (!input) return []
```

如果运行时仍传 `null`，那么 inter-turn discovery 实际直接空返回。也就是说，真正可靠的自动发现主要发生在 turn-0 用户输入阶段，而不是每个后续内部循环。

这是当前最像补丁的点：注释描述了 inter-turn discovery，但实际信号可能为空。

### 4. 搜索阈值是本地分数，不是语义模型判断

自动加载阈值：

```ts
const AUTO_LOAD_SCORE_THRESHOLD = 0.3
```

只有 `score >= 0.3` 的结果会成为 `autoLoaded: true`。这会导致：

- 用户说法和 skill 描述词差异大时漏匹配；
- 多意图输入可能被分数稀释；
- 中文/英文混合提示虽然有 CJK token 支持，但仍不是语义 embedding；
- 复杂任务可能只记录 gap，而不加载现有近似 skill。

### 5. 无匹配时只是记录 gap

无匹配时会记录 gap：

```text
recordSkillGap(prompt, cwd, recommendations)
```

但这不是立即生成并启用 skill。gap 的后续生命周期还需要 Skill Learning / Evolution 处理，所以用户当下仍会感觉没有加载到合适 skill。

## 三、当前“可用”和“不可靠”的边界

### 已可用

- 高置信 project/global skill 可以自动加载 `SKILL.md` 内容。
- turn-0 用户输入可以触发同步 discovery。
- 无匹配时可以记录 skill gap。
- `messages.ts` 会把已加载 skill 内容注入为 `<loaded-skill>`。
- subagent 也有 skill discovery attachment 的系统提示 framing。

### 不可靠

- inter-turn discovery 是否真的有输入信号。
- feature gate 默认是否在目标运行环境开启。
- 本地 TF/关键词分数是否足够匹配复杂对话。
- gap 是否能及时演化成可用 skill。
- 没有一个统一可观察的“本轮为什么加载/没加载 skill”的状态面板。

## 四、建议修复路线

### P0：让 inter-turn prefetch 有真实输入

当前最应优先修的是 `query.ts` 传 `null` 的问题。可以把最近用户意图、当前 queued command、最近 tool pivot 或当前 assistant turn summary 作为 signal。

建议形态：

```text
startSkillDiscoveryPrefetch(signalText, messages, toolUseContext)
```

其中 `signalText` 可按优先级取：

1. 当前用户输入；
2. queued command value；
3. 最近一条 user message；
4. 当前 write/tool pivot 的简短描述；
5. 无信号时才跳过。

### P1：增加可观察性

需要一个可查看的诊断输出，例如：

```text
/skills discovery-status
claude skill-search status
```

至少显示：

- 本轮是否启用 Skill Search；
- 使用了什么 signal；
- 搜索到哪些 skill；
- 哪些 auto-loaded；
- 哪些低于阈值；
- 是否记录 gap；
- gap key / status。

### P1：收敛成统一 Skill Router

建议增加一个共享 router 模块：

```text
src/services/skillSearch/router.ts
```

职责：

```text
input/context
  -> build discovery signal
  -> search skill index
  -> decide auto-load / recommend / gap
  -> produce attachment + telemetry
```

这样 `attachments.ts`、`query.ts`、工具/CLI 诊断都调用同一套决策，不再分散。

### P2：改进匹配质量

- 对 skill name / description / frontmatter / examples 赋权；
- 中文提示加意图词扩展；
- 对显式关键词（如 “Feature Flag 审计”）做高置信 shortcut；
- 将历史成功加载反馈回 ranking；
- 对 repeated gap 做 skill evolution。

### P2：补真实链路测试

现有测试覆盖 `prefetch.ts` 单点，但还应补：

- `attachments.ts` turn-0 skill discovery 生成 attachment；
- `messages.ts` 将 auto-loaded skill 渲染成 `<loaded-skill>`；
- `query.ts` inter-turn prefetch 使用非空 signal；
- 中文任务命中 `feature-flag-implementation-auditor`；
- feature gate 关闭时不泄漏 `skill_discovery` 字符串。

## 五、判断结论

当前分支并不是完全没有“对话自动加载 skill”。它有基础实现，也有单元测试证明高置信匹配可以加载 skill 内容。

但它还不是一个稳定的、系统级的 skill auto-router。最大问题是：

```text
inter-turn prefetch 入口存在，但可能传 null，导致后续对话阶段 discovery 空返回。
```

因此用户体感上的“不行了”很可能来自：

1. feature gate 没开；
2. turn-0 之后没有有效 signal；
3. 本地搜索阈值没有命中；
4. gap 被记录但没有立即转化为 loaded skill；
5. 没有诊断面告诉用户为什么没有加载。

如果要修到可信，应优先做：

```text
P0: query.ts inter-turn signal 修复
P1: skill discovery status 可观察性
P1: 统一 router
P2: 匹配质量和真实链路测试
```

