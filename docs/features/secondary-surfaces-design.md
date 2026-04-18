# 次级能力面完整设计说明

> 更新日期: 2026-04-15
> 范围:
>
> 1. `SnapshotUpdateDialog`
> 2. `CtxInspectTool`
> 3. 其他 UI / 平台补洞
>
> 目的: 给出比路线图更完整的设计说明，基于当前真实调用链和代码边界，明确这些能力到底应该怎么补、补到什么程度才算完成。

## 一、为什么需要单独写这份文档

路线图文档只回答：

- 现在先做什么
- 为什么这么排

但对下面这些项，仅给“下一步做它”是不够的：

1. `SnapshotUpdateDialog`
2. `CtxInspectTool`
3. `useFrustrationDetection` / `url-handler-napi` / `modifiers-napi`

因为它们都不是单纯的“把 stub 填满”：

- `SnapshotUpdateDialog` 需要明确交互语义
- `CtxInspectTool` 需要明确是“最小可用版”还是“完整上下文诊断器”
- UI / 平台补洞需要明确哪些是外部版真的值得补，哪些只是 internal-only 壳

## 二、`SnapshotUpdateDialog`

### 2.1 当前实际调用链

真实调用链已经存在：

1. `main.tsx` 检查：
   - `feature('AGENT_MEMORY_SNAPSHOT')`
   - `mainThreadAgentDefinition`
   - `isCustomAgent(...)`
   - `agentDef.pendingSnapshotUpdate`

2. 满足条件后，调用：
   [launchSnapshotUpdateDialog](E:/Source_code/Claude-code-bast-test/src/dialogLaunchers.tsx:31)

3. `launchSnapshotUpdateDialog()` 动态加载：
   [SnapshotUpdateDialog.ts](E:/Source_code/Claude-code-bast-test/src/components/agents/SnapshotUpdateDialog.ts:1)

4. 对话框返回三种 choice：
   - `merge`
   - `keep`
   - `replace`

5. 如果返回 `merge`，`main.tsx` 会继续调用：
   - `buildMergePrompt(agentType, scope)`

### 2.2 当前缺口

当前文件还是纯 stub：

- 组件直接 `return null`
- `buildMergePrompt()` 返回空字符串

这意味着：

- 主流程已经走到这里
- 但用户根本看不到任何对话框
- `merge` 路径理论上存在，但因为 prompt 为空，行为不完整

### 2.3 这个对话框真正需要回答什么

它本质上是在问用户：

> 检测到 agent memory snapshot 与当前 agent memory 有冲突/差异，你希望怎么处理？

三个动作的语义建议固定成：

- `merge`
  保留当前内容，并把 snapshot 差异合并成一段后续指令交给模型处理
- `keep`
  保留当前内容，忽略 snapshot
- `replace`
  用 snapshot 覆盖当前 agent memory

### 2.4 第一版应该实现到什么程度

建议第一版做到：

1. 能展示对话框
2. 能展示：
   - `agentType`
   - `scope`
   - `snapshotTimestamp`
3. 三个按钮/选项：
   - Merge
   - Keep current
   - Replace with snapshot
4. `buildMergePrompt()` 返回一段清晰的系统提示，告诉模型：
   - 当前存在 snapshot update
   - 应在当前 agent memory 与 snapshot 之间做语义合并

### 2.5 `replace` 该不该第一版真正落地

当前 `main.tsx` 只在 `choice === 'merge'` 时有后续动作。  
这意味着：

- `keep` 当前天然等于“不做额外处理”
- `replace` 如果没有后续落地逻辑，只是一个假选项

所以完整设计应该二选一：

#### 方案 A：第一版只保留两个语义真实的选项

- `merge`
- `keep`

优点：

- 简化
- 不引入“选了 replace 但什么都没发生”的假交互

#### 方案 B：保留三选项，但显式补后续逻辑

需要额外实现：

- `replace` 对应的 memory 覆写动作

如果现在没有清晰的写入目标，建议第一版走 **方案 A**。

### 2.6 推荐设计

我推荐：

- 第一版 UI 仍显示三选项，但如果没有 replace 的真实行为，就先改成：
  - `Merge`
  - `Keep current`
  - `Use snapshot later`（而不是 `replace`）

或者更干脆：

- 只做二选项版

### 2.7 验收标准

满足以下条件就算完成：

1. 当 `pendingSnapshotUpdate` 存在时，真实弹出对话框
2. 用户能看到 snapshot 时间、agent 类型、scope
3. `merge` 能生成非空 merge prompt
4. `keep` 行为稳定
5. 不再出现“调用链存在但 UI 完全空”的状态

## 三、`CtxInspectTool`

### 3.1 当前实际位置

文件：

- [CtxInspectTool.ts](E:/Source_code/Claude-code-bast-test/packages/builtin-tools/src/tools/CtxInspectTool/CtxInspectTool.ts:25)

当前接线：

- `src/tools.ts` 在 `feature('CONTEXT_COLLAPSE')` 下注册它
- `/context` 命令与上下文可视化相关组件已经有自己的路径
- `services/contextCollapse/index.ts` 已存在 `getStats()`、`applyCollapsesIfNeeded()`、`recoverFromOverflow()` 等接口

### 3.2 当前缺口

当前 `CtxInspectTool.call()` 只返回：

- `total_tokens: 0`
- `message_count: 0`
- `summary: Context inspection requires the CONTEXT_COLLAPSE runtime.`

也就是说：

- 工具外壳是存在的
- 但真正的上下文检查能力完全没接起来

### 3.3 第一版不应该等完整 `CONTEXT_COLLAPSE`

这是最关键的设计点。

如果把 `CtxInspectTool` 和完整 `CONTEXT_COLLAPSE` 绑定死，就会出现两个问题：

1. 工具一直 unusable
2. 上下文诊断能力被一个大 feature 卡住

更合理的做法是：

> 先做一个**最小可用版上下文检查工具**

即使 `CONTEXT_COLLAPSE` 仍未完整，也能提供有价值的信息。

### 3.4 最小可用版应该返回什么

建议第一版输出：

1. `message_count`
2. `estimated_tokens`
3. `context_window_model`
4. `prompt_caching_enabled`
5. `session_memory_enabled`
6. `context_collapse_enabled`
7. `summary`

其中：

- `message_count` 可以直接基于当前消息数组
- `estimated_tokens` 可复用现有 token estimation / rough estimation 能力
- `summary` 用自然语言组织当前上下文状态

### 3.5 `query` 参数第一版怎么用

当前 schema 已有：

- `query?: string`

建议第一版语义：

- 无 `query`：返回整体摘要
- 有 `query`：在摘要中优先聚焦与该 query 相关的上下文项

但第一版不建议做复杂搜索。  
例如：

- `query: "tool usage"` 只触发不同摘要模板
- 不做真正的 message-level semantic filter

### 3.6 输出格式建议

建议保持工具结果紧凑但有结构：

```text
Context: 128k estimated tokens, 42 messages

- Model context: claude-sonnet-4-6
- Prompt caching: enabled
- Session memory: enabled
- Context collapse: disabled
- Tool-heavy history detected: yes
- Largest contributors: file reads, bash output
```

### 3.7 完整版可以做什么

等 `CONTEXT_COLLAPSE` 更成熟后，再扩展：

- 已折叠 span 数
- staged span 数
- collapsed message 数
- 最近一次 overflow recovery 状态
- query-based focused inspection

### 3.8 验收标准

最小可用版完成标准：

1. 工具不再返回 placeholder 文案
2. 能输出真实消息数
3. 能输出真实/估算 token 数
4. 能输出上下文机制状态摘要
5. 不依赖完整 `CONTEXT_COLLAPSE` 才能工作

## 四、其他 UI / 平台补洞

这一类不应被混在一起看。建议拆成两组：

### 4.1 UI 补洞

#### `useFrustrationDetection`

文件：

- [useFrustrationDetection.ts](E:/Source_code/Claude-code-bast-test/src/components/FeedbackSurvey/useFrustrationDetection.ts:1)

当前状态：

- 已被 REPL 使用
- 但实现恒返回 `closed`

它的设计重点不是“能不能跑”，而是：

- 用哪些信号判定用户受挫
- 何时弹出反馈调查不会打扰用户

建议第一版只做简单规则：

- 连续出现 API error
- 连续用户打断
- 同一轮多次失败后仍未完成

### 4.2 平台能力补洞

#### `url-handler-napi`

文件：

- [packages/url-handler-napi/src/index.ts](E:/Source_code/Claude-code-bast-test/packages/url-handler-napi/src/index.ts:1)

当前状态：

- `waitForUrlEvent()` 恒返回 `null`

它影响的是：

- macOS URL scheme launch / deep link 流程

如果当前外部版根本不主打 URL launch，这项可以长期后置。

#### `modifiers-napi`

文件：

- [packages/modifiers-napi/src/index.ts](E:/Source_code/Claude-code-bast-test/packages/modifiers-napi/src/index.ts:1)

当前状态：

- macOS 有部分 FFI 实现
- 其他平台全部退化为 false

这类能力的完整设计重点不在 UI，而在：

- 是否值得跨平台补齐
- 还是明确标注为 macOS-only best-effort

建议结论：

- 不要把它当成“必须恢复的主功能”
- 把它明确定位成平台增强能力

## 五、建议的实现顺序

如果真的要推进这三块，而不是只写路线图，我建议：

1. `SnapshotUpdateDialog`
2. `CtxInspectTool` 最小可用版
3. `useFrustrationDetection`
4. `url-handler-napi`
5. `modifiers-napi`

原因：

- 前两项用户价值更直接
- 后三项更偏补洞与平台增强

## 六、最终结论

这三块里：

- `SnapshotUpdateDialog`：是**真实可达但 UI 为空**，应先补
- `CtxInspectTool`：是**最适合做最小可用版** 的工具，不该继续等完整大 feature
- 其他 UI / 平台补洞：需要拆开看，不能笼统列在一起
