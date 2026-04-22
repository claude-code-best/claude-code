# Skill Learning PR Review — Findings & Fix Plan

**Date:** 2026-04-21
**PR:** `chore/lint-cleanup` 单 commit `a0c19b1e`(+6317 行,20 个新文件 in `src/services/skillLearning/`)
**Reviewers:** 5 parallel code-review agents(持久化/LLM 后端/安全/运行时/intentNormalize) + Codex 独立对抗验证

## 验证方法
1. 5 个 parallel agent 分模块审查(agent 类型:code-reviewer / security-reviewer / typescript-reviewer)
2. Codex (`codex exec -s read-only`) 独立对抗验证 — 挑战/降级/补充
3. 本文档记录:共识发现 + Codex 推翻的误报 + Codex 新增的 3 个 HIGH

## 修正后的分级统计

| 优先级 | agents 初判 | Codex 修正后 |
|--------|-----------|------------|
| CRITICAL | 1 | **0** |
| HIGH | 12 | **12**(-3 降级/撤销,+3 Codex 新发现) |
| MEDIUM | 16 | ~12 |
| LOW | 8 | 9 |

---

## ✅ 高置信度共识(双方 CONFIRMED)

### H1 — `skillGapStore.ts:341-352` 全 catch-all 清零 state
`readSkillGapState` 读失败返回 `{gaps:{}}` → 下一次 write 持久化空 state → 所有 gap 记录丢失。
- Codex 补充:也 mask EACCES 等权限错误,不只是 JSON 损坏

### H2 — `observationStore.ts:250` + `skillGapStore.ts:406-414` 非原子覆盖写
直接 `writeFile` 覆盖。进程崩溃留下截断文件。`instinctStore.ts:52-54` 已有正确的 temp+rename,未推广。

### H3 — `observationStore.ts:192` JSON.parse 无保护
单一损坏行 → 整个 `readObservations` 抛异常。

### H4 — `observationStore.ts:159-175` appendObservation 并发竞态
archive 时 rename 活动文件,并发 writer 可能写入已改名的旧文件,新文件丢数据。

### H6 — `runtimeObserver.ts:122-153` messages 无 watermark 去重
每轮重扫全部 `context.messages` 并 append。无索引去重 → 重复记录 + Haiku 输入 token 膨胀。

### H7 — `llmObserverBackend.ts:97-108` 无 circuit breaker
429/timeout 失败后立即回退 heuristic,但下一轮仍死调 Haiku。无退避/熔断。

### H9 — 3 个生成器无文件数配额
长会话可填满 `~/.claude/skills/`, `~/.claude/commands/`, `~/.claude/agents/`。

### H10 — `toolExecution.ts:1228` await 阻塞 tool invoke
`recordToolStart` 被 `await` 在 `invoke()` 之前(注释说 fire-and-forget,代码真 await)。每次 tool 调用多 2-10ms(SSD)。
- Codex 补充:动态 import (`toolExecution.ts:1225-1227`) 也在每个 tool 热路径上

### H11 — `toolEventObserver.ts:39` emittedTurns Map 无界
模块级 Map,仅测试重置。长会话/daemon/server 模式内存泄漏。

### H12 — `runtimeObserver.ts:131-143` readObservations 全量扫描
每 post-sampling 读整个 NDJSON 文件后内存过滤。无 byte offset watermark。

---

## ⚠️ Codex 降级/推翻的初判

| agents 初判 | Codex 修正 | 原因 |
|-----------|-----------|------|
| C1 CRITICAL(路径遍历写 authorized_keys) | **→ HIGH (PARTIAL)** | 生产路径中 `outputRoot`/`cwd` 不由 LLM 控制,生成的名称已 normalize,filename 受限于 `SKILL.md`/`<name>.md`。攻击场景过度渲染 |
| H5 HIGH(Haiku 每轮无条件触发) | **→ PARTIAL** | 默认 backend 是 heuristic,仅 `SKILL_LEARNING_OBSERVER_BACKEND=llm` 才触 Haiku |
| H8 HIGH(YAML frontmatter 注入) | **→ PARTIAL(Markdown 注入)** | 真正 frontmatter 已结束,新 `---` 在其后。是 Markdown 内容注入,不是 YAML 头注入 |
| M1 MEDIUM(projectId 路径遍历) | **→ 撤销** | 生产 `projectId = project-${sha256.slice(0,16)}` (`projectContext.ts:149-153`),不可注入 |
| M5 MEDIUM(prompt caching no-op) | **→ 撤销** | `claude.ts:3300-3321` `buildSystemPromptBlocks` 真的注入 `cache_control`,缓存生效 |

---

## 🆕 Codex 补充的 3 个 HIGH(agents 漏报)

### NEW-H13 — feature-flag 隔离破损
**文件:** `src/tools/toolExecution.ts:1225-1228`
- 无条件 import skill-learning wrapper
- `isSkillLearningEnabled()` 检查发生在 wrapper 内部(`toolEventObserver.ts:100-107`)
- **后果:** 即使 flag 关闭,tool 执行仍过一层包装。坏模块会污染全局

### NEW-H14 — auto-lifecycle 覆盖用户手写 skill
**文件:** `runtimeObserver.ts:167-187`, `skillLifecycle.ts:149-168, 193-222, 245-252, 391-410`
- 比较所有项目/全局 `SKILL.md` 做 merge/replace
- **不检查 `origin: skill-learning`**,用户手写文件可被自动改
- **设计澄清(重要):** 进化用户 skill 是设计意图,但需走 draft + SnapshotUpdateDialog 审批流,不是直接覆盖。见 `feedback_skill_learning_evolution_model` memory

### NEW-H15 — 单条 prompt 可固化为持久 instinct
**文件:** `evolution.ts:42-43`, `learningPolicy.ts:25-32`, `sessionObserver.ts:214-223`, `runtimeObserver.ts:122-127`
- 重复 rescan 让单条消息在 cluster 中重复计数
- promotion 阈值**太低**:`cluster size ≥2` + `avg confidence ≥0.5`
- 单句 "must/always" 直接给 `0.6` 置信度
- **后果:** 用户一句"always use pnpm"就能被固化为持久 instinct,无任何独立验证

---

## 🔧 修复计划(按优先级)

### P0 — 数据安全三连修(已开始,低风险高价值)
- [ ] `observationStore.ts:250` + `skillGapStore.ts:406-414`:改 temp+rename(复制 `instinctStore.ts:52-54` 范式)
- [ ] `skillGapStore.ts:341-352`:只对 `ENOENT` 吞错,其他 rethrow
- [ ] `observationStore.ts:190-194`:JSON.parse 每行 try/catch,损坏行记录警告后 skip

### P1 — 成本 + 性能(合并前强烈建议)
- [ ] `llmObserverBackend.ts:97-108`:加 circuit breaker(N 次连续失败后进入 cooldown)
- [ ] `runtimeObserver.ts:148`:加 Haiku 每会话/每 N 轮的调用上限 + min-observation 门限
- [ ] `runtimeObserver.ts:122-153`:加 watermark 去重 message observations
- [ ] `toolEventObserver.ts:39`:emittedTurns 改有界 LRU / 加 session TTL
- [ ] `toolExecution.ts:1228`:真 fire-and-forget(`void record...` 不 await)
- [ ] `toolExecution.ts:1225-1227`:dynamic imports 提升到 top-level
- [ ] `toolExecution.ts` feature-flag gate 提前到 wrapper 外

### P2 — 架构改造(与用户对齐后做)
- [ ] **Evolution → Draft 流** 接入 `SnapshotUpdateDialog` Merge/Keep/Replace(H14)
- [ ] 区分 `origin: skill-learning` vs user-authored,只对自己产出的允许静默更新
- [ ] `learningPolicy.ts:25-32` 置信度阈值 0.5 → 0.75(H15)
- [ ] `evolution.ts:42-43` cluster size ≥2 → ≥3(H15)
- [ ] `sessionObserver.ts:214-223` 单句 "must/always" 从 0.6 → 0.4,要求 ≥2 次独立出现

### P3 — 技术债(跟 issue)
- [ ] `projectContext.ts:100-117` git 调用改 async
- [ ] 3 generators 加文件数配额
- [ ] evidence 块 secret 正则过滤(API keys / tokens / 绝对路径)
- [ ] skill-gap prompt 写入前做 scrub

---

## 📎 相关文件
- Codex artifact: `.codex/artifacts/prompt-skill-learning-adversarial.txt`
- Memory 记忆:
  - `feedback_skill_learning_evolution_model.md`
  - `project_skill_learning_pr_review.md`
