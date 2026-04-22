# Task 017: Skill Learning / Evolution 内置化

> 设计文档: [skill-learning-evolution-design.md](../features/skill-learning-evolution-design.md)  
> 需求文档: [skill-learning-ecc-analysis.md](../features/skill-learning-ecc-analysis.md)  
> 策略规范: [skill-learning-policy.md](../features/skill-learning-policy.md)  
> 依赖: 当前 `EXPERIMENTAL_SKILL_SEARCH` 已实现并默认启用  
> 范围: 新增内置 Skill Learning / Evolution 的最小闭环，不改现有 Skill Search 核心算法。

## 目标

把 ECC `continuous-learning-v2` 的 observation -> instinct -> evolve -> learned skill 模型内置到项目中，形成可测试的本地学习闭环。

最终用户效果:

```text
会话 transcript
  -> 提取 observation
  -> 生成 project-scoped instinct
  -> evolve 为 learned SKILL.md
  -> clearSkillIndexCache()
  -> 现有 Skill Search 可推荐 learned skill
```

## 文件清单

### 新增

| 文件 | 说明 |
|------|------|
| `src/services/skillLearning/types.ts` | Observation / Instinct / Draft 类型。 |
| `src/services/skillLearning/featureCheck.ts` | `SKILL_LEARNING` gate 与环境变量控制。 |
| `src/services/skillLearning/learningPolicy.ts` | 学习阈值、命名、scope、生成规则。 |
| `src/services/skillLearning/projectContext.ts` | 项目识别与 project id 生成。 |
| `src/services/skillLearning/observationStore.ts` | observation 写入、读取、归档、scrub。 |
| `src/services/skillLearning/sessionObserver.ts` | 从 transcript / observations 提取 instinct 候选。 |
| `src/services/skillLearning/instinctStore.ts` | instinct 读写、upsert、status、prune。 |
| `src/services/skillLearning/skillGenerator.ts` | 从 instinct cluster 生成 SKILL.md 草稿。 |
| `src/services/skillLearning/evolution.ts` | instinct 聚类与 skill/command/agent 分类建议。 |
| `src/services/skillLearning/promotion.ts` | project -> global promotion 规则。 |
| `src/services/skillLearning/skillLifecycle.ts` | 新 skill 与旧 skill 的 create/merge/replace/archive/delete 决策。 |
| `src/services/skillLearning/__tests__/*.test.ts` | 对应单元测试。 |
| `src/commands/skill-learning/index.ts` | 命令入口。 |
| `src/commands/skill-learning/skill-learning.ts` | `status/ingest/evolve/export/import/prune` 子命令。 |

### 修改

| 文件 | 变更 |
|------|------|
| `src/commands.ts` | 注册 `skill-learning` 命令或同等入口。 |
| `src/utils/attachments.ts` | 不需要第一版改动；通过 generated SKILL.md 回流到现有索引。 |
| `build.ts` / `scripts/dev.ts` | 可选加入 `SKILL_LEARNING` feature。初版建议 dev 启用，build 暂不默认。 |

## 实现步骤

### 1. 类型与 gate

实现:

```text
types.ts
featureCheck.ts
```

验收:

- 类型包含 `SkillObservation`、`Instinct`、`LearnedSkillDraft`。
- `isSkillLearningEnabled()` 支持:
  - `SKILL_LEARNING_ENABLED=0`
  - `SKILL_LEARNING_ENABLED=1`
  - `feature('SKILL_LEARNING')`

### 2. Project Context

实现:

```text
projectContext.resolveProjectContext(cwd)
```

优先级:

1. `CLAUDE_PROJECT_DIR`
2. `git remote get-url origin`
3. `git rev-parse --show-toplevel`
4. global fallback

验收:

- 同一 git remote 在不同路径下生成相同 project id。
- 无 git 仓库时返回 global context。
- 写入 `projects.json` 与 `project.json`。

### 3. Observation Store

实现:

```text
appendObservation()
readObservations()
ingestTranscript()
scrubObservation()
archiveLargeObservationFile()
```

验收:

- 能从 Claude JSONL transcript 读取 user/assistant/tool_result。
- secret 字段被 scrub。
- 大字段截断。
- 写入 project-specific `observations.jsonl`。

### 4. Session Observer

实现最小规则引擎:

| 规则 | 输出 |
|------|------|
| 用户明确纠正 | instinct: prefer corrected action |
| tool error 后成功 | instinct: error resolution |
| 重复 tool sequence | instinct: workflow |
| 明确项目约定 | instinct: project convention |

验收:

- fixture transcript 中用户说“不要 mock，用 testing-library”能生成 testing instinct。
- fixture transcript 中重复 `Grep -> Read -> Edit` 能生成 workflow instinct。
- 没有明显模式时不生成 instinct。

### 5. Instinct Store

实现:

```text
saveInstinct()
loadInstincts()
upsertInstinct()
updateConfidence()
exportInstincts()
importInstincts()
prunePendingInstincts()
```

验收:

- instinct 文件可序列化/反序列化。
- 相同 id 的 confirming observation 增加 confidence。
- contradiction 降低 confidence。
- pending 超过 TTL 可 prune。

### 6. Skill Generator + Lifecycle

实现:

```text
generateSkillDraft(instincts)
writeLearnedSkill(draft)
compareExistingSkills(draft)
decideSkillLifecycle(draft, existingSkills)
applySkillLifecycleDecision(decision)
writeReplacementManifest(manifest)
```

输出路径:

```text
project: <repo>/.claude/skills/<name>/SKILL.md
global:  ~/.claude/skills/<name>/SKILL.md
```

`origin: skill-learning` 标记这是 learned skill。不要把 active generated skill 放在 `skills/learned/<name>/SKILL.md`，因为当前 skill loader 只索引一层 `skills/<skill>/SKILL.md`。

验收:

- 生成合法 frontmatter: `name` + `description`。
- body 包含 Trigger、Action、Evidence。
- 生成前必须检索现有 skill，判断 create/merge/replace/archive/delete。
- merge 只生成 patch 建议，不自动覆盖旧 skill。
- replace 必须让旧 skill 从 active index 消失。
- 默认 archive-first；hard delete 需要引用检查和 manifest。
- 写入后调用 `clearSkillIndexCache()`。

### 7. Evolution

实现:

```text
clusterInstincts()
classifyEvolutionTarget()
suggestEvolutions()
generateSkillCandidates()
```

第一版只真正生成 skill，command/agent 只输出建议。

验收:

- 2+ 同 domain/trigger instincts 可聚类。
- 高置信 cluster 生成 skill candidate。
- 低置信 cluster 只报告，不生成。

旧 skill 处理规则:

| 场景 | 行为 |
|------|------|
| 新能力无覆盖 | create 新 learned skill。 |
| 旧 skill 已覆盖主体 | merge，输出 patch 建议。 |
| 新 skill 明显更完整且旧 skill 会冲突 | replace，激活新 skill，旧 skill 移出 active index。 |
| 旧 skill 低质量/过期 | archive，移动到 `.archive/`。 |
| 旧 skill 无引用、可安全移除 | delete，写 tombstone 后删除。 |

### 8. Commands

提供命令:

```bash
skill-learning status
skill-learning ingest <transcript>
skill-learning evolve [--generate]
skill-learning export [--scope project|global]
skill-learning import <file>
skill-learning prune [--max-age 30]
```

验收:

- 每个子命令有单元测试或集成测试。
- 命令输出不依赖外部网络。
- 写入文件前路径清晰可见。

## 测试计划

### 单元测试

| 测试文件 | 覆盖 |
|----------|------|
| `projectContext.test.ts` | project id / registry |
| `learningPolicy.test.ts` | 命名、生成阈值、scope 决策 |
| `observationStore.test.ts` | transcript ingestion / scrub |
| `sessionObserver.test.ts` | 规则提取 |
| `instinctStore.test.ts` | upsert / confidence / prune |
| `skillGenerator.test.ts` | SKILL.md 生成 |
| `evolution.test.ts` | cluster / classify |
| `skillLifecycle.test.ts` | create/merge/replace/archive/delete 决策，replace 后旧 skill 不在 active index |

### 集成测试

```text
fixture transcript
  -> ingest
  -> observe
  -> save instinct
  -> evolve --generate
  -> compare with existing skills
  -> archive/delete superseded skill when replacing
  -> getSkillIndex finds generated skill
```

## 验证命令

```bash
bun test src/services/skillLearning
bun test src/commands/skill-learning
bunx tsc --noEmit
bun run lint
```

## 风险

| 风险 | 缓解 |
|------|------|
| 学到错误模式 | 默认 pending，生成 skill 需要 confidence/evidence。 |
| 污染全局习惯 | 默认 project scope，global 需要 promote。 |
| 泄露代码/secret | observation scrub + 不把 raw code 写进 instinct。 |
| 过度生成 skill | 低置信只保留 instinct，不生成 skill。 |
| 与 ECC 冲突 | 使用 `~/.claude/skill-learning/`，不写 `~/.claude/homunculus/`。 |
| 误删旧 skill | 默认 archive-first；hard delete 需要引用检查、manifest 和显式决策。 |

## 完成标准

- [ ] `skill-learning ingest` 能从真实 session JSONL 生成 observations。
- [ ] `skill-learning status` 能显示 project/global instincts。
- [ ] `skill-learning evolve --generate` 能生成 learned `SKILL.md`。
- [ ] 生成前能识别现有 skill 并给出 create/merge/replace/archive/delete 决策。
- [ ] replace 后旧 skill 不再被 active Skill Search 搜到。
- [ ] archive/delete 会写 replacement manifest 或 tombstone。
- [ ] 生成的 skill 能被现有 `Skill Search` 搜到。
- [ ] `bunx tsc --noEmit` 通过。
- [ ] 相关测试全部通过。
