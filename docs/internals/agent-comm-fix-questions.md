# Agent 通讯修复问题文档

- 版本：v1.0
- 生成日期：2026-04-25
- 范围：ACP Agent / Bridge / Remote Control Server / REPL Hook 生命周期
- 配套执行文档：`docs/internals/agent-comm-fix-jira-tasks.md`
- 目的：保留决策前要问的问题、交叉验证提示词和已确认结论；不要在这里写 Jira 执行步骤。

---

## 1. 当前已确认结论

- 只保留两份交付文档：本问题文档 + Jira Task 文档。
- Jira Task 文档是唯一执行入口，包含 Owner、优先级、文件范围、验收标准、风险和验证建议。
- Claude 交叉验证结论：整体通过，无 blocking findings；建议补充协议回归 gate、JIRA-001/008 依赖、代码参考位置和阈值一致性，这些建议已合并到 Jira Task 文档。
- 本次已进入业务代码修复阶段，必须运行 `bun run typecheck` 和相关回归测试。

---

## 2. 执行前必须问清的问题

1. `session-ingress` 的 WebSocket 上限是否固定为 10MB，并与 ACP route 保持一致？
2. 超限 close code 是否统一使用 `1009`，close reason 是否固定为 `message too large`？
3. `resource_link` 的纯文本格式是否已有下游依赖，能否替代当前 markdown link 表达？
4. ACP permission mode 的真实 settings key 是哪个，非法值 fallback 是否统一为 `default`？
5. `_meta.permissionMode` 是否必须始终覆盖 settings/defaultMode？
6. abort listener 测试中，是否能通过 mock signal 或计数器稳定证明 10k next 后无 listener 累积？
7. pending prompt queue 的取消语义是否允许惰性清理，而不是立刻从数组中删除？
8. REPL hook suppress 的清理范围是否只限目标段，不顺手改其他 decompiled React Compiler 结构？
9. RCS WebSocket 测试应放在现有哪个 `__tests__` 布局下，是否已有 route/mock 基础设施可复用？
10. 发布 gate 是否必须包含 `stopReason` 决策与 `sessionUpdate` 发送顺序不回归？

---

## 3. 给 Claude 或 Reviewer 的复核问题

```text
请作为外部审查者，复核 docs/internals/agent-comm-fix-jira-tasks.md。

请检查：
1. 是否仍满足“按文件分工的执行清单”和“Jira task 文档”要求。
2. 是否存在遗漏的文件、验收标准、风险或前置依赖。
3. 是否有重复、误导执行者、优先级不合理或测试不可落地的问题。
4. 是否还有必须阻断实施的 finding。

请用中文输出：
- Verdict
- Blocking Findings
- Non-blocking Findings
- Suggested Edits
- Final Recommendation

不要修改文件，只输出审查意见。
```

---

## 4. 已处理的复核建议

- Release Checklist 已补充协议层行为无回归 gate。
- JIRA-001 与 JIRA-008 已明确同文件前后置关系。
- JIRA-001 到 JIRA-008 已补充参考代码位置。
- JIRA-003 已补回 1000 排队场景下的出队耗时验收。
- JIRA-008 story points 已从 2 调整为 3。
- JIRA-010 已明确 11MB payload 对齐 10MB 上限并触发 1009 close。
- 推荐执行顺序已明确 P0 gate：P0 全部改动和冒烟验证完成后，再启动 P1 改造。

---

## 5. 不在本文档维护的内容

- 不维护 Jira ticket 正文；统一在 `docs/internals/agent-comm-fix-jira-tasks.md` 修改。
- 不维护业务代码实现方案；实现时按具体 ticket 读取对应文件。
- 不维护历史中间稿；旧执行清单已合并进 Jira Task 文档。
