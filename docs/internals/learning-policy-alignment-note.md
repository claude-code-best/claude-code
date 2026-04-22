# learningPolicy.ts 与 ECC 概念对齐审计

> 对应任务:`docs/features/skill-learning-ecc-parity-tasks.md` P2-3(Task #12)。
>
> 本文档对 `src/services/skillLearning/learningPolicy.ts`(103 行)做代码审计——不改代码,只输出判断。每个 export 函数/常量给出:ECC 对应概念 + "合并 / 保留 / 重命名"三选一建议 + 理由。
>
> 基准:HEAD `5feb4103` on `chore/lint-cleanup`,ECC 插件 `v1.9.0`(`continuous-learning-v2` 内部版本 `2.1.0`),审计日期 2026-04-17。

## 一、文件定位

`learningPolicy.ts` 是项目自引入的**本地策略层**,审计文档 `docs/features/skill-learning-evolution-ecc-parity-audit.md` 未单独评估。

它位于:
- `src/services/skillLearning/learningPolicy.ts` — 103 行,8 个 export(2 常量 + 6 函数)+ 2 个 module-local 常量(`DOMAIN_PREFIXES`、`GENERIC_NAMES`)。

被消费:
- `src/services/skillLearning/skillGenerator.ts:6`(`buildLearnedSkillName, normalizeSkillName`)
- `src/services/skillLearning/commandGenerator.ts:7`(`normalizeSkillName`)
- `src/services/skillLearning/agentGenerator.ts:7`(`normalizeSkillName`)
- `src/services/skillLearning/evolution.ts:2,82,100,118`(`shouldGenerateSkillFromInstincts`)
- `src/services/skillLearning/index.ts:8`(`export *` 对外透出)
- `src/services/skillLearning/__tests__/learningPolicy.test.ts`(单元测试)

## 二、逐项 export 审计

### 2.1 常量 `MIN_CONFIDENCE_TO_GENERATE_SKILL = 0.5`(line 4)

**作用**:`shouldGenerateSkillFromInstincts` 使用;当 instinct 平均 confidence < 0.5 时不生成 skill。

**ECC 对应概念**:
- ECC `/evolve`(`instinct-cli.py:791`)筛选 `high_conf = [i for i in instincts if i.get('confidence', 0) >= 0.8]`——阈值 **0.8**。
- ECC `/promote` 的 `PROMOTE_CONFIDENCE_THRESHOLD = 0.8`(`instinct-cli.py:53`)。
- ECC instinct 阶段划分(`SKILL.md:313-321`):0.3 Tentative / 0.5 Moderate / 0.7 Strong / 0.9 Near-certain。

**差异**:项目 0.5 比 ECC 0.8 激进,容易生成 moderate 等级的 skill。

**建议**:**保留(但标记为可调)**。

理由:该常量是项目特有的"生成门槛";ECC 无完全等价物(ECC 走的是聚类 + high_conf 双重过滤,而非单一均值门槛)。重命名不会带来价值,合并风险更高。可以保留但在后续 P0-1(状态机)落地后考虑与 gap 的 `ACTIVE_PROMOTION_COUNT`/`ACTIVE_PROMOTION_DRAFT_HITS` 统一在 `skillGapStore.ts` 或抽到 `thresholds.ts` 专用常量文件,避免阈值散落。

---

### 2.2 常量 `MAX_SKILL_NAME_LENGTH = 64`(line 5)

**作用**:`normalizeSkillName` 用来截断 slug。

**ECC 对应概念**:
- ECC `_generate_evolved`(`instinct-cli.py:1148`)对 skill 名截 30 字符:`re.sub(r'[^a-z0-9]+', '-', trigger.lower()).strip('-')[:30]`。
- ECC command 名截 20 字符(`instinct-cli.py:1174`)。
- ECC agent 名截 20 字符(`instinct-cli.py:1190`)。

**差异**:项目 64 > ECC 20~30。

**建议**:**保留**。

理由:ECC 的 20/30 字符限制是 Python 侧的硬约束,但 SKILL.md 内 `name:` 字段本身没有 64 字符上限要求。项目选择 64 是 Claude Code 侧的既定约束(与 `normalizeSkillName` 的 output 呼应)。ECC 侧不存在等价常量可以"合并",且"重命名"不会让消费者理解更清楚。

---

### 2.3 函数 `shouldGenerateSkillFromInstincts(instincts)`(lines 25-33)

**作用**:返回 boolean,判断一组 instinct 的均值是否达到 `MIN_CONFIDENCE_TO_GENERATE_SKILL`。

```ts
export function shouldGenerateSkillFromInstincts(instincts: readonly Instinct[]): boolean {
  if (instincts.length === 0) return false
  const avg = instincts.reduce((sum, i) => sum + i.confidence, 0) / instincts.length
  return avg >= MIN_CONFIDENCE_TO_GENERATE_SKILL
}
```

**ECC 对应概念**:
- ECC `/evolve` 的 skill cluster 筛选(`instinct-cli.py:804-818`):`if len(cluster) >= 2` + 排序按 `avg_confidence`,**但不以 avg 作为门槛**(展示时才按 conf 0.8 过滤 high_conf)。
- ECC agent 候选(`instinct-cli.py:850`):`avg_confidence >= 0.75`。

**差异**:ECC 没有"单一门槛 → 决定是否生成 skill"的函数;它是"聚类 + 阈值 + 手动 `--generate` 开关"三段。

**建议**:**保留,但考虑重命名为 `shouldPromoteClusterToSkill`**(可选)。

理由:当前名称"generate skill from instincts"在 P0-3 完成后会变歧义(因为同样的 instinct 集也可能生成 command/agent)。新名明确"晋升为 skill"。若短期内 P0-3 不落地可维持现状。

**阻断因素**:该重命名需要同步改 `evolution.ts:82/100/118`(3 处调用,P0-3 新增的 command/agent 路径会各自命名类似函数,不会冲突)+ 单元测试 `learningPolicy.test.ts:54-55`。机械重命名,低风险。

---

### 2.4 函数 `buildLearnedSkillName(instincts)`(lines 35-51)

**作用**:从 instinct 集合构造 skill 名(`<domain_prefix>-<keyword1>-<keyword2>-...`),最后 `isGenericSkillName` 兜底。

**ECC 对应概念**:
- ECC `_generate_evolved`(`instinct-cli.py:1145-1151`)对 skill name 的处理:
  ```py
  name = re.sub(r'[^a-z0-9]+', '-', trigger.lower()).strip('-')[:30]
  ```
  只取 trigger(不含 domain prefix),不关键词提取。
- ECC command 名(`instinct-cli.py:1173-1174`):同样从 trigger 截,去除 "when "、"implementing "。
- ECC agent 名(`instinct-cli.py:1190`):`trigger.lower() + '-agent'`。

**差异**:
- 项目 name = `<domain>-<k1>-<k2>-...`,ECC name = `<trigger-slug>`。
- 项目用 `DOMAIN_PREFIXES` 硬编码 7 个前缀(`workflow`、`testing`、`debugging`、`style`(映射自 `code-style`)、`security`、`git`、`project`)。
- 项目用 `isUsefulNameWord` 过滤停用词,ECC 不过滤。

**建议**:**保留**。

理由:这是项目侧相对独有的 naming 策略,ECC 没有对应物。将其"合并"到 ECC 模式会让所有学习到的 skill 名不带 domain prefix,不利于人工审查。在 P0-3 拆分 commandGenerator/agentGenerator 时,应避免直接复用 `buildLearnedSkillName` — 因为 skill/command/agent 的命名语义不同(ECC 就是分开处理的)。目前 commandGenerator/agentGenerator 只复用 `normalizeSkillName`,这是正确的。

---

### 2.5 函数 `normalizeSkillName(value)`(lines 53-61)

**作用**:把任意字符串 slugify 成合法的 skill 名(小写字母数字连字符,去前后 -,截 64 字符,空则 `'learned-skill'`)。

**ECC 对应概念**:
- ECC `_generate_evolved`(多处,`instinct-cli.py:1148, 1173, 1190`)用 `re.sub(r'[^a-z0-9]+', '-', x.lower()).strip('-')` 做相同 slugify。
- 没有集中成函数,每处是一次性写 regex。

**差异**:项目把相同逻辑抽成了函数(+ 长度截断 + fallback)。

**建议**:**保留**。

理由:这是项目侧对 ECC 重复正则的合理重构。跨 skillGenerator/commandGenerator/agentGenerator 三个文件共享,是合适的复用点。无 ECC 对应函数可以"合并",无改善命名需求。

---

### 2.6 函数 `isValidLearnedSkillName(value)`(lines 63-70)

**作用**:判断一个字符串是否为合法的学习 skill 名。

**ECC 对应概念**:无直接对应。ECC 的生成路径是"先 slugify 再写"(用生成出来的值直接作文件名),没有"事后校验"步骤。

**差异**:纯项目特性。

**建议**:**保留**,但核查**是否有实际消费方**。

grep 结果:该函数在 `src/` 下**没有除 learningPolicy.ts 本身以外的引用**(本次核查未找到)。如果确认无消费者,可考虑后续清理(不在本审计范围内执行)。

**阻断因素**:若外部测试或 `src/services/skillLearning/index.ts` 的 `export *` 被外部消费,需保留。建议下一次清理时再移除。

---

### 2.7 函数 `isGenericSkillName(value)`(lines 72-74)

**作用**:检查是否是通用泛名(`'learned-skill'`、`'better-skill'`、`'new-skill'`、`'project-skill'`、`'workflow-skill'`)。

**ECC 对应概念**:无。

**差异**:纯项目特性,是 `buildLearnedSkillName` 的兜底检查。

**建议**:**保留**。

理由:是 `buildLearnedSkillName` 的必要辅助——当 instinct 关键词全部被 `isUsefulNameWord` 过滤掉时,组合出来的名可能就是 `<prefix>-learned-pattern`,防止产生 `learned-skill` 这种毫无信息的名字。内聚性高,不可合并。

---

### 2.8 函数 `decideDefaultScope(instincts)`(lines 76-82)

**作用**:决定一组 instinct 应默认落到 `project` 还是 `global`。

```ts
export function decideDefaultScope(instincts: readonly Instinct[]): SkillLearningScope {
  if (instincts.length === 0) return 'project'
  const globalFriendly = instincts.every(i =>
    ['security', 'git', 'workflow'].includes(i.domain)
  )
  return globalFriendly && instincts.length >= 2 ? 'global' : 'project'
}
```

**ECC 对应概念**:
- ECC `observer.md:120-135` Scope Decision Guide(给 Haiku 的决策表):
  - Language/framework conventions → project
  - File structure preferences → project
  - Code style → project(usually)
  - Error handling strategies → project
  - Security practices → **global**
  - General best practices → global
  - Tool workflow preferences → **global**
  - Git practices → **global**
  - 默认 `scope: project`("When in doubt, default to project")。

**差异**:
- ECC 靠 LLM 判断;项目用 domain 白名单硬过滤。
- 项目的白名单(`security / git / workflow`)覆盖了 ECC 决策表中的 3 个"global"类别。
- 项目漏了 ECC 的"General best practices → global"(项目无此 domain)。
- 项目要求"全部 instinct 都 global-friendly + 长度 ≥ 2",比 ECC"默认 project 除非 LLM 判定 global"更保守。

**建议**:**保留,但标注为 ECC 等价**。

理由:该函数是项目侧对 ECC "Scope Decision Guide" 的机械复刻(无 LLM 情况下的 fallback)。ECC 没有等价 Python 函数可以"合并";"重命名"为 `decideScopeFromDomains` 更准确,但改动面涉及未来 observer backend 接口(P1-1),不宜立即动。

**阻断因素**:
- P1-1(observer backend 接口)引入 LLM backend 后,scope 判断可能下放给 LLM,`decideDefaultScope` 退化为 fallback。届时宜重命名为 `fallbackDecideScope` 或挪到 observer backend 的默认实现里。
- 当前保留原名,是对 P1-1 的预留。

---

### 2.9 Module-local 常量 `DOMAIN_PREFIXES`(lines 7-15)

**作用**:`buildLearnedSkillName` 的 domain → prefix 映射。

**ECC 对应概念**:ECC 不在 skill name 中带 domain prefix,无等价物。

**建议**:**保留(non-export)**。

理由:非 export,仅 `buildLearnedSkillName` 内部使用,内聚性高。

---

### 2.10 Module-local 常量 `GENERIC_NAMES`(lines 17-23)

**作用**:`isGenericSkillName` 的黑名单。

**建议**:**保留(non-export)**。

理由:仅 `isGenericSkillName` 使用,封装良好。

---

### 2.11 内部辅助 `isUsefulNameWord(word)`(lines 84-102)

**作用**:过滤对 skill 命名无信息量的停用词(when/with/this/that/user/...)。

**ECC 对应概念**:无。ECC 名字生成不做停用词过滤。

**建议**:**保留(non-export)**。

---

## 三、汇总表

| 符号 | 行 | 建议 | ECC 对应 | 触发依赖 |
|---|---|---|---|---|
| `MIN_CONFIDENCE_TO_GENERATE_SKILL = 0.5` | 4 | 保留 | ECC 阈值 0.8 | 可选:P0-1 落地后考虑集中化阈值 |
| `MAX_SKILL_NAME_LENGTH = 64` | 5 | 保留 | ECC 20/30 char inline | 无 |
| `shouldGenerateSkillFromInstincts` | 25-33 | 保留(P0-3 后可选重命名为 `shouldPromoteClusterToSkill`) | 部分对应 ECC high_conf 过滤 | P0-3(新增 command/agent 路径后消歧) |
| `buildLearnedSkillName` | 35-51 | 保留 | 部分对应 ECC slugify + 改动策略 | 无 |
| `normalizeSkillName` | 53-61 | 保留 | 等价 ECC inline regex | 无 |
| `isValidLearnedSkillName` | 63-70 | 保留(潜在死代码,待独立清理) | 无 | 需核对无调用后可删 |
| `isGenericSkillName` | 72-74 | 保留 | 无 | 无 |
| `decideDefaultScope` | 76-82 | 保留(P1-1 后可重命名为 `fallbackDecideScope`) | 机械复刻 `observer.md` Scope Decision Guide | P1-1(observer backend 接口) |
| `DOMAIN_PREFIXES`(module-local) | 7-15 | 保留 | 无 | 无 |
| `GENERIC_NAMES`(module-local) | 17-23 | 保留 | 无 | 无 |
| `isUsefulNameWord`(module-local) | 84-102 | 保留 | 无 | 无 |

**整体结论**:`learningPolicy.ts` 没有与 ECC 概念冲突的导出——它是**项目对 ECC 未明确形式化的命名/置信度/scope 子策略的具体实现**。

- **6 个函数导出全部建议"保留"**,理由是它们都是项目对 ECC 非形式化部分的具体实现,不存在"合并到现有模块"能获得净收益的项。
- **2 条重命名建议**是条件性的,依赖其它任务落地(P0-3、P1-1),不在本审计执行范围内。
- **1 个 `isValidLearnedSkillName` 的潜在死代码提示**,需要下一次清理时独立核查。

## 四、本次审计边界

- 不改 `.ts` 源码(遵循 Task #12 约束)。
- 不执行重命名(写 note,由 dev-core 或 dev-evolve 团队在 P0-3 / P1-1 执行时一并处理)。
- 不评估 `learningPolicy.ts` 与 `instinctStore.ts` / `promotion.ts` 的阈值统一问题——这属于 P0-2(置信度更新)的工作范围,不在 P2-3 范畴。

## 五、给 dev-core / dev-evolve 的行动项(不是指令,是建议)

| 时机 | 动作 | 风险 |
|---|---|---|
| P0-3 合入后 | 重命名 `shouldGenerateSkillFromInstincts` → `shouldPromoteClusterToSkill`,避免与新增的 command/agent path 歧义 | 低(机械 rename + 3 处调用 + 1 处测试) |
| P1-1 合入后 | 把 `decideDefaultScope` 挪到 heuristic observer backend 里,让 LLM backend 可以覆盖 | 中(需要先立 backend 接口) |
| 独立清理 window | 核查 `isValidLearnedSkillName` 是否有消费者,若无则删除 | 低 |

## 六、文档元信息

- **作者**:researcher(skill-learning-ecc-parity 团队)
- **状态**:审计 note,不改代码。
- **审核路径**:建议由 dev-core / dev-evolve 负责消费本建议(在 P0-3 / P1-1 任务内执行可选重命名)。
