# 迁移 Review Agents 到统一 costrict-review 仓库

**日期**: 2026-05-06
**参考 PR**: https://github.com/zgsm-sangfor/opencode/pull/360
**分支**: `feat/migrate-review-agents`

## 目标

将 opencode PR #360 的 review 资源迁移改造对标到 csc。用统一方案替代当前的单仓库 skill 生成（`zgsm-ai/security-review-skill`），从 `zgsm-ai/costrict-review` 仓库同时下载 review agents（CoStrictReviewer、CoStrictValidator）和 review skills（security-review），由 `index.json` manifest 驱动。

## 关键决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 生成脚本 | 完全替代 `generate-skills.ts` | 单一数据源，统一管理 |
| Agent 集成 | 合并到现有 `getBuiltInAgents()` | 复用 `BuiltInAgentDefinition` 类型和加载流程 |
| `/review` 命令 | 路由到 CoStrictReviewer agent | 对标 opencode 行为，无需降级 |
| 多语言支持 | zh-CN + en 双语 | 对标 opencode，由 `preferredLanguage` 配置 + `getResolvedLanguage()` 驱动 |
| Frontmatter 合并 | 合并 `index.json` 中的 `claudecode` 字段 | `index.json` 有 `claudecode` key 存放 csc 专用字段 |

## 架构

### Locale 机制

csc 现有的语言系统：
- **配置项**: `GlobalConfig.preferredLanguage`，存储在 `~/.claude/.claude.json`，值为 `'auto' | 'en' | 'zh'`
- **解析函数**: `getResolvedLanguage()`（`src/utils/language.ts`），返回 `'en' | 'zh'`，无状态 pull-based
- **解析优先级**: 配置值 → 系统 locale（`Intl.DateTimeFormat`）→ 默认 `'en'`
- **Locale 映射**: csc 用 `'zh'`/`'en'`，costrict-review 仓库用 `'zh-CN'`/`'en'`，需要在运行时做 `'zh' → 'zh-CN'` 映射

各组件 locale 获取方式（均通过 `getResolvedLanguage()` 内部调用，无需修改 `ToolUseContext.options`）：

| 组件 | 获取方式 | 说明 |
|------|----------|------|
| Agent `getSystemPrompt` | 内部调用 `getResolvedLanguage()` → 映射后选 prompt 常量 | 无需改接口签名 |
| Skill 初始化 | `initializeBuiltinSkills()` 内部调用 `getResolvedLanguage()` | 传给 `extractBundledSkill()` |
| 命令模板 | `CommandLocale.get()` 内部调用 `getResolvedLanguage()` | 选择对应 locale 的 .txt |

### 数据流

```
zgsm-ai/costrict-review 仓库
  ├── index.json (manifest: agents + skills，按 locale 分路径)
  ├── zh-CN/ (agent markdown + skill 文件)
  └── en/ (agent markdown + skill 文件)
          │
          ▼  scripts/generate-review-builtin.ts (构建时执行)
          │
  ┌───────┴───────────────────────┐
  │                               │
  ▼                               ▼
agent/builtin.ts              skill/builtin.ts
(BuiltInAgentDefinition[])    (SKILL_FILES + 提取函数)
  │                               │
  ▼                               ▼
builtInAgents.ts              extension.ts → 缓存目录
(getBuiltInAgents spread)     (~/.claude/skills/<name>/)
```

## 第一部分：生成脚本

**文件**: `scripts/generate-review-builtin.ts`（新增，替代 `scripts/generate-skills.ts`）

从 opencode 移植，适配点：
- 路径调整：`scripts/` 而非 `packages/opencode/script/`
- 输出路径：`src/costrict/review/agent/builtin.ts` 和 `src/costrict/review/skill/builtin.ts`
- 缓存目录：`packages/builtin-tools/bundled-review/`
- Agent 生成输出 `BuiltInAgentDefinition[]` 而非 `ReviewAgentEntry`
- 使用 `index.json` 中的 `claudecode` 字段（而非 `opencode`）合并 frontmatter

**核心逻辑**：
1. `git ls-remote` 获取 SHA，与缓存 SHA 比对
2. `git clone --depth 1` 到临时目录
3. 读取 `index.json` manifest
4. 按 locale 复制 skill 目录和 agent 文件到 `bundled-review/{locale}/`
5. 通过 `gray-matter` 将 `claudecode` 字段合并到 agent markdown frontmatter
6. 生成 `agent/builtin.ts`：解析合并后的 frontmatter，提取 `agentType`、`whenToUse`、`tools`、`permissionMode`、`model`、`visibleTo`、`disallowedTools` 等，将 locale prompt 嵌入为字符串常量，导出 `REVIEW_AGENTS: BuiltInAgentDefinition[]`
7. 生成 `skill/builtin.ts`：将所有 skill 文件嵌入为字符串常量，导出 `SKILL_FILES`（locale → skillName → files）、版本跟踪、提取函数
8. 清理临时 clone 目录

**依赖**: `gray-matter`（用于 frontmatter 解析/合并）

## 第二部分：Agent 生成产物与集成

**生成的 `src/costrict/review/agent/builtin.ts`** 导出：

```ts
import { getResolvedLanguage } from 'src/utils/language.js'

const LOCALE_MAP: Record<string, string> = { zh: 'zh-CN', en: 'en' }

// 嵌入的 locale prompt 常量（由生成脚本填充）
const REVIEWER_PROMPTS: Record<string, string> = {
  'zh-CN': '...<中文 prompt>...',
  'en': '...<English prompt>...',
}

export const REVIEW_AGENTS: BuiltInAgentDefinition[] = [
  {
    agentType: 'CoStrictReviewer',
    whenToUse: '<从合并后的 frontmatter 提取>',
    tools: ['Glob', 'Grep', 'Read', 'TodoWrite', 'Bash', 'Agent'],
    permissionMode: 'plan',
    model: 'inherit',
    source: 'built-in',
    baseDir: 'built-in',
    getSystemPrompt: () => {
      const lang = getResolvedLanguage()
      const locale = LOCALE_MAP[lang] ?? 'zh-CN'
      return REVIEWER_PROMPTS[locale] ?? REVIEWER_PROMPTS['zh-CN']
    },
  },
  // CoStrictValidator 同理，使用 VALIDATOR_PROMPTS
]
```

- Prompt 内容以 locale 为 key 的 `Record<string, string>` 嵌入（由生成脚本填充）
- `getSystemPrompt` 内部调用 `getResolvedLanguage()`（无状态函数，可直接调用）
- 通过 `LOCALE_MAP` 将 csc 的 `'zh'` 映射为 costrict-review 仓库的 `'zh-CN'`
- `CoStrictValidator` 无 `Agent` tool → 列入 `disallowedTools`
- `CoStrictReviewer` 通过 `visibleTo` 限制可见性（仅可通过 `/review` 命令或特定 agent 调用）

**集成到 `packages/builtin-tools/src/tools/AgentTool/builtInAgents.ts`**：

```ts
import { REVIEW_AGENTS } from 'src/costrict/review/agent/builtin.js'

// 在 getBuiltInAgents() 返回数组末尾：
return [
  ...existingAgents,
  ...REVIEW_AGENTS,
]
```

## 第三部分：Skill 生成产物与初始化

**生成的 `src/costrict/review/skill/builtin.ts`** 导出：

```ts
export const SKILL_FILES: Record<string, Record<string, Record<string, string>>> = {
  "zh-CN": {
    "security-review": {
      "SKILL.md": "...",
      "knowledge/security/api_security.md": "...",
      // ... 所有文件
    }
  },
  "en": { /* 同结构 */ }
}

export const SKILL_VERSIONS: Record<string, string> = {
  "security-review": "<commit-sha>"
}

export function listBuiltinSkills(): string[]
export function getBuiltinSkillVersion(name: string): string | undefined
export function listSkillFiles(name: string, locale: string): string[]
export async function extractBundledSkill(name: string, targetDir: string, locale: string): Promise<void>
```

**`src/costrict/review/extension.ts`** — 从 opencode 适配，去除 Effect 依赖：

- `initializeBuiltinSkills(locale?: string)` — 内部调用 `getResolvedLanguage()` 获取 locale（映射 `'zh' → 'zh-CN'`），检查缓存版本，需要时从 `SKILL_FILES` 提取到磁盘
- 缓存目录：`~/.claude/skills/<name>/`（csc 配置目录，非 `~/.config/costrict/`）
- 版本文件：`.version`，内容为 `<sha>:<locale>`
- `getBuiltinSkillsDir()` — 返回缓存目录供 skill 发现扫描

**Skill 系统集成（`src/skills/bundled/index.ts`）**：

- 移除 `registerCodeReviewSecuritySkill()` 调用（旧的内联注册方式）
- 新增 `Extension.initializeBuiltinSkills()` 调用（不传参，内部自动获取 locale）
- 确保 skill 发现机制扫描 builtin skills 缓存目录

## 第四部分：命令改动

### `/review` 命令（`src/commands/review.ts`）

- 替换当前 gh CLI 本地 review，改为 agent 路由方式
- 命令注册时设置 `agent: 'CoStrictReviewer'`
- 模板通过 `CommandLocale.get('review')` 获取（内部调用 `getResolvedLanguage()` 选择对应 locale 的 .txt）
- `ultrareview` 导出保持不变（远程 bughunter 路径）

### `/security-review` 命令（`src/commands/security-review.ts`）

- 替换内联的 `SECURITY_REVIEW_MARKDOWN`，改为简化后的 Skill 工具引导 prompt
- zh-CN: `# 安全代码审查\n\n请使用 Skill 工具加载 \`security-review\` 技能来对以下内容执行安全代码审查：$ARGUMENTS\n\n全程请使用中文进行回答与文件写入。`
- en: `# Code Security Review\n\nPlease use the Skill tool to load the \`security-review\` skill to perform a security review on: $ARGUMENTS\n\nPlease respond and write all files in English throughout the entire process.`

### Locale 模板（`src/costrict/command/locales/`）

新增文件：
- `zh-CN/review.txt`
- `en/review.txt`

更新文件：
- `zh-CN/security-review.txt`（简化）
- `en/security-review.txt`（简化）

**`CommandLocale` 模块**（`src/costrict/command/locales/index.ts`）：
- 导入各 locale 的 .txt 文件为字符串常量
- `CommandLocale.get(name)` 内部调用 `getResolvedLanguage()` → 映射 `'zh' → 'zh-CN'` → 返回对应模板

## 第五部分：清理与构建集成

### 删除的文件
- `scripts/generate-skills.ts`
- `src/costrict/skills/builtin.ts`
- `src/costrict/skills/codeReviewSecurity.ts`

### 修改的文件
- `src/skills/bundled/index.ts` — 移除旧注册，新增初始化调用
- `packages/builtin-tools/src/tools/AgentTool/builtInAgents.ts` — spread `REVIEW_AGENTS`
- `.gitignore` — 添加生成文件规则
- `build.ts` — pre-build 步骤调用 `generate-review-builtin.ts`
- `scripts/dev.ts` — dev 模式调用生成脚本

### 新增 `.gitignore` 规则
```
src/costrict/review/agent/builtin.ts
src/costrict/review/skill/builtin.ts
```

### Stub 文件（提交到 git）
- `src/costrict/review/agent/builtin.ts` — `export const REVIEW_AGENTS: BuiltInAgentDefinition[] = []`
- `src/costrict/review/skill/builtin.ts` — 空结构 + 抛错的提取函数

### 构建集成
- `build.ts`: pre-build 步骤调用 `bun run scripts/generate-review-builtin.ts`
- `scripts/dev.ts`: dev 启动时调用生成脚本
- `ci.yml`: 添加 SSH agent 配置 + review agent 生成步骤

### 依赖
- `gray-matter` — 检查 `package.json`，如不存在则新增

## 新增文件汇总

| 文件 | 类型 | 说明 |
|------|------|------|
| `scripts/generate-review-builtin.ts` | 脚本 | 从 costrict-review 下载并生成 builtin 文件 |
| `src/costrict/review/index.ts` | 模块入口 | 统一导出 Extension、SkillBuiltin、agents |
| `src/costrict/review/extension.ts` | 运行时 | Skill 缓存初始化与版本跟踪 |
| `src/costrict/review/agent/builtin.ts` | 生成产物 | CoStrictReviewer + CoStrictValidator agent 定义 |
| `src/costrict/review/skill/builtin.ts` | 生成产物 | security-review skill 文件 + 版本跟踪 |
| `src/costrict/command/locales/zh-CN/review.txt` | 模板 | `/review` zh-CN prompt |
| `src/costrict/command/locales/en/review.txt` | 模板 | `/review` en prompt |
