# Claude Opus 4.7 Model Integration Checklist

本文档整理 `Claude-Opus-4.7.txt` 与 `src/constants/prompts.ts` 的关联点，以及将 Claude Opus 4.7 正式接入当前项目时需要联动的模型层清单。

当前判断：如果仅依赖授权文件登录，但不显式指定 `claude-opus-4-7`，当前项目大概率仍会落到 Opus 4.6，因为默认 Opus、`opus` alias、模型选择器、系统提示和能力映射均仍硬编码在 4.6。授权文件只影响认证和账号权限，不会自动更新本地模型表。

## 参考输入

- 本地参考文件：`Claude-Opus-4.7.txt`
- 关键模型 ID：`claude-opus-4-7`
- 当前项目默认 Opus：`claude-opus-4-6`
- 需要优先验证的测试路径：显式运行 `--model claude-opus-4-7`，区分本地拦截、服务端权限拒绝、provider 不支持三类问题。

## P0: `prompts.ts` 直接相关清单

这些项只覆盖 `src/constants/prompts.ts`。它们会影响系统提示里的模型自我认知、最新模型推荐、知识截止信息和用户可见说明。

| 文件位置 | 当前问题 | 建议动作 | 验收点 |
| --- | --- | --- | --- |
| `src/constants/prompts.ts:119` | `FRONTIER_MODEL_NAME` 仍为 `Claude Opus 4.6` | 更新为 `Claude Opus 4.7` | Fast mode 文案不再声称最新 frontier 是 4.6 |
| `src/constants/prompts.ts:122` | `CLAUDE_4_5_OR_4_6_MODEL_IDS` 名称和内容仍绑定 4.5/4.6 | 改名为更通用的最新模型 ID 常量，或扩展为 `CLAUDE_LATEST_MODEL_IDS` | 常量中 Opus 指向 `claude-opus-4-7` |
| `src/constants/prompts.ts:123` | `opus` ID 仍为 `claude-opus-4-6` | 改为 `claude-opus-4-7` | 系统提示推荐的 Opus ID 是 4.7 |
| `src/constants/prompts.ts:671` | 环境提示写死 “Claude 4.5/4.6” | 更新为包含 Opus 4.7 的最新模型家族说明 | `# Environment` 中不再把 4.6 说成最新 Opus |
| `src/constants/prompts.ts:671` | 模型 ID 列表只列 Opus 4.6、Sonnet 4.6、Haiku 4.5 | 把 Opus 4.7 放到最新/默认推荐位置，保留 Sonnet 4.6 和 Haiku 4.5 | AI 应用构建建议默认引用 Opus 4.7 |
| `src/constants/prompts.ts:687` | `getKnowledgeCutoff()` 没有 Opus 4.7 分支 | 新增 `claude-opus-4-7` 分支，并放在泛化 `claude-opus-4` 判断之前 | `claude-opus-4-7` 不会落入旧 Opus 4 fallback |
| `src/constants/prompts.ts:690-703` | 当前匹配顺序只特殊处理 4.6、4.5、Haiku 4，再泛化 Opus 4/Sonnet 4 | 为 4.7 增加明确 cutoff，避免返回 `January 2025` | prompt 中显示的 cutoff 与 Opus 4.7 资料一致 |
| `src/constants/prompts.ts:582-623` | `computeEnvInfo()` 输出模型描述和 knowledge cutoff，依赖模型层映射 | 在模型层补齐 4.7 后确认这里输出正确 | `You are powered by...` 能显示 Opus 4.7 |
| `src/constants/prompts.ts:627-684` | `computeSimpleEnvInfo()` 同样依赖模型层映射和 latest family 文案 | 在 4.7 接入后做一次 prompt 快照/断言 | simple env 和 full env 都一致 |

## P0: 模型注册和别名解析

这些项决定用户输入 `opus`、`best`、`default` 或不指定模型时，最终实际请求哪个模型。

| 文件位置 | 当前问题 | 建议动作 | 验收点 |
| --- | --- | --- | --- |
| `src/utils/model/configs.ts:99` | 只存在 `CLAUDE_OPUS_4_6_CONFIG` | 新增 `CLAUDE_OPUS_4_7_CONFIG` | `ALL_MODEL_CONFIGS` 可派生 `opus47` |
| `src/utils/model/configs.ts:119-132` | `ALL_MODEL_CONFIGS` 到 `opus46` 结束 | 注册 `opus47: CLAUDE_OPUS_4_7_CONFIG` | `getModelStrings().opus47` 类型可用 |
| `src/utils/model/model.ts:50-56` | `isNonCustomOpusModel()` 未包含 4.7 | 加入 `getModelStrings().opus47` | Opus 4.7 能走 Opus 相关逻辑 |
| `src/utils/model/model.ts:115-135` | `getDefaultOpusModel()` 返回 Opus 4.6 | first-party 默认切到 4.7，3P 是否切换需按 provider availability 决定 | `/model opus` 和 `best` 能解析到预期模型 |
| `src/utils/model/model.ts:250-285` | `firstPartyNameToCanonical()` 未识别 4.7 | 新增 `claude-opus-4-7`，顺序在 4.6 和泛化 `claude-opus-4` 前 | canonical 返回 `claude-opus-4-7` |
| `src/utils/model/model.ts:485-545` | `parseUserSpecifiedModel('opus')` 间接落到 4.6 | 依赖 `getDefaultOpusModel()` 更新 | `opus` alias 解析为 4.7 |
| `src/utils/model/model.ts:609-653` | `getMarketingNameForModel()` 没有 Opus 4.7 | 增加 `Opus 4.7` 显示名 | UI 和 prompt 都能显示友好名称 |
| `src/utils/model/model.ts:384-423` | `getPublicModelDisplayName()` 没有 Opus 4.7 | 增加 base 和如适用的 `[1m]` 显示名 | `/model` 当前模型显示正确 |
| `src/utils/model/model.ts:325-347` | 默认模型描述和价格后缀函数仍是 Opus 4.6 | 更新描述，必要时重命名 `getOpus46PricingSuffix` 或兼容包装 | Default option 描述不再出现过期 Opus 4.6 |

## P0: 模型选择器和用户可见选项

这些项决定 `/model` 菜单是否能看到 Opus 4.7。

| 文件位置 | 当前问题 | 建议动作 | 验收点 |
| --- | --- | --- | --- |
| `src/utils/model/modelOptions.ts:113-180` | 只有 `getOpus46Option()` | 新增 `getOpus47Option()` 或把 Opus option 改为当前默认 Opus | `/model` 菜单显示 Opus 4.7 |
| `src/utils/model/modelOptions.ts:191-201` | 1M Opus option 绑定 `opus46` | 如 Opus 4.7 支持 1M，新增/替换 4.7 1M option | 1M option 不再误指 4.6 |
| `src/utils/model/modelOptions.ts:266-300` | Max/merged Opus option 文案仍是 4.6 | 更新 Max 用户和 merged 1M 文案 | Max/Team Premium 默认说明正确 |
| `src/utils/model/modelOptions.ts:324-424` | picker 列表显式 push 4.6 option | 按用户类型和 provider 调整 4.7/4.6 顺序或替换关系 | first-party 可选项包含 4.7 |
| `src/utils/model/modelOptions.ts:486-514` | 已知模型展示依赖 marketing name | 补 4.7 marketing name 后确认这里能识别 | 显式 `claude-opus-4-7` 不显示成 Custom model |
| `src/commands/model/model.tsx:130-145` | 1M 不可用提示写死 Opus 4.6/Sonnet 4.6 | 如支持 4.7 1M，更新文案和检查函数 | 错误提示不误导用户 |
| `src/main.tsx:1349-1352` | `--model` 帮助示例仍是 Sonnet 4.6 | 更新示例，或使用稳定 alias 示例优先 | CLI help 不展示过期主推模型 |

## P0: 本地拦截和可用性判断

这些项用于判断“为什么授权文件拿不到 4.7”。

| 文件位置 | 当前问题 | 建议动作 | 验收点 |
| --- | --- | --- | --- |
| `src/utils/model/modelAllowlist.ts:100-170` | 如果 settings `availableModels` 没包含 4.7，显式 4.7 会被本地拒绝 | 检查用户配置，必要时加入 `opus` 或 `claude-opus-4-7` | `/model claude-opus-4-7` 不被本地 allowlist 拦截 |
| `src/utils/model/validateModel.ts:20-80` | 显式模型会先检查 allowlist，再请求 API 验证 | 用它区分本地拒绝和服务端拒绝 | 错误信息可分类为 allowlist、404、invalid model、auth |
| `src/utils/model/validateModel.ts:139-155` | fallback 建议链只有 4.6 到旧模型 | 加 4.7 到 4.6 的 fallback 建议 | 3P 不支持 4.7 时提示 4.6 |
| `src/services/api/errors.ts:735-745` | Pro plan invalid model 逻辑依赖 `isNonCustomOpusModel()` | 加入 Opus 4.7 后确认错误文案仍准确 | Pro 用户错误提示不漏判 |
| `src/services/api/errors.ts:902-910` | 404 模型不可用错误会提示换模型 | 加 4.7 fallback 建议 | 3P/权限问题提示可操作 |
| `src/services/api/Claude.ts:1771` | 最终请求直接发送 `options.model` 去掉 `[1m]` 后的值 | 确认显式 `claude-opus-4-7` 能传到这里 | 抓包/日志中 model 是 `claude-opus-4-7` |

## P1: 能力、beta、上下文和输出控制

这些项影响 4.7 的高级能力是否启用，或是否错误沿用 4.6 能力。

| 文件位置 | 当前问题 | 建议动作 | 验收点 |
| --- | --- | --- | --- |
| `src/utils/context.ts:43` | 1M context 匹配规则未确认 4.7 | 按官方/API 探测结果加入 4.7 | `getContextWindowForModel('claude-opus-4-7')` 正确 |
| `src/utils/model/check1mAccess.ts:45` | 1M access 检查未确认 4.7 | 如支持，加入 Opus 4.7 | 1M 权限检查不误报 |
| `src/utils/model/contextWindowUpgradeCheck.ts:4` | upgrade path 未覆盖 4.7 | 如支持 1M upgrade，补分支 | 超 200K 时提示正确 |
| `src/utils/effort.ts:24` | effort allowlist 未确认 4.7 | 加入支持项 | `--effort` 对 4.7 不被错误忽略 |
| `src/utils/effort.ts:53-54` | `max` effort 注释写 Opus 4.6 only | 确认 4.7 是否支持 max，再更新 | 文案和 API 行为一致 |
| `src/utils/thinking.ts:113` | adaptive thinking allowlist 未确认 4.7 | 加入或明确不支持 | thinking 参数不导致 400 |
| `src/utils/betas.ts:138-156` | structured outputs、auto mode 支持列表未确认 4.7 | 按 API 能力加入 | 相关 beta 不漏发也不错发 |
| `src/utils/advisor.ts:87-98` | advisor 支持列表未确认 4.7 | 按服务端能力加入 | advisor tool 对 4.7 行为正确 |
| `src/services/compact/cachedMCConfig.ts:35-36` | cached microcompact 支持模型只到 4.6 | 如 4.7 支持，加入列表 | cache editing gate 不误关 |
| `src/utils/fastMode.ts:142-143` | Fast Mode 显示为 Opus 4.6 | 确认 4.7 支持后更新 | `/fast` 文案和实际模型一致 |
| `src/utils/extraUsage.ts:17-22` | extra usage 判断可能只识别 Opus 4.6 | 扩展到 Opus 4.7 | 账单提示正确 |

## P1: provider 映射和第三方路径

这些项影响 OpenAI/Gemini/Grok/Bedrock/Vertex/Foundry 兼容层。

| 文件位置 | 当前问题 | 建议动作 | 验收点 |
| --- | --- | --- | --- |
| `src/services/api/openai/modelMapping.ts:8-12` | OpenAI 兼容层只映射到 Opus 4.6 | 加 `claude-opus-4-7` 映射，或确认透传策略 | OpenAI provider 不因未知 Anthropic ID 失败 |
| `src/services/api/grok/modelMapping.ts:11-15` | Grok 兼容层只映射到 Opus 4.6 | 加 4.7 映射或 fallback | Grok provider 行为明确 |
| `src/services/api/gemini/modelMapping.ts` | 未在搜索中看到 Opus 4.6 命中 | 确认是否通用规则覆盖 4.7 | Gemini provider 有明确策略 |
| `src/utils/model/configs.ts:99-107` | 3P provider ID 是否已发布未确认 | 对 Bedrock/Vertex/Foundry 分别确认 ID 格式 | 3P 配置不使用错误 model ID |
| `src/utils/envUtils.ts:149-162` | Vertex region override 只列现有模型 | 如 4.7 需要 region env，补映射 | Vertex 用户可覆盖 region |
| `src/utils/model/modelStrings.ts:45-53` | Bedrock profile 匹配基于 firstParty ID | 4.7 注册后确认 inference profile 可匹配 | Bedrock 自动发现可用 profile |

## P1: 成本、显示、归因和内置文档

这些项不一定阻塞请求，但会影响用户体验、账单提示和输出元数据。

| 文件位置 | 当前问题 | 建议动作 | 验收点 |
| --- | --- | --- | --- |
| `src/utils/modelCost.ts:13-152` | 成本函数和映射以 Opus 4.6 命名 | 添加 Opus 4.7 cost tier，必要时重命名公共函数 | 价格显示和成本计算正确 |
| `src/constants/figures.ts:13` | max effort 注释写 Opus 4.6 only | 按 4.7 支持情况更新注释 | 注释不过期 |
| `src/utils/commitAttribution.ts:149-160` | commit trailer 映射缺 4.7 | 加 `claude-opus-4-7` | git attribution 显示公共模型名 |
| `src/skills/bundled/claudeApiContent.ts:37-41` | Claude API skill 中 Opus ID/名称仍是 4.6 | 更新为 Opus 4.7，保留 Sonnet/Haiku 当前值 | 生成 API 示例时使用 4.7 |
| `src/utils/settings/types.ts:402` | settings 示例仍是 Opus 4.6 | 更新示例或增加 4.7 示例 | 文档化配置不误导 |
| `src/utils/swarm/teammateModel.ts:1-9` | teammate fallback model 用 Opus 4.6 config | 评估切到 Opus 4.7 | swarm/teammate 默认符合最新模型策略 |
| `scripts/probe-api-capabilities.ts:182` | `claude-opus-4-7` 标为猜测模型 | 移到正式配置/已知模型列表 | 探测脚本不再把已发布模型当猜测 |

## P2: 运行时动态补充模型的现状

当前项目有两个动态来源，但它们不能替代正式接入：

1. `src/services/api/bootstrap.ts` 会从 `/api/claude_cli/bootstrap` 拉取 `additional_model_options` 并写入 `additionalModelOptionsCache`。这可以让 `/model` 菜单临时出现额外模型，但不会更新 `opus` alias、默认模型、prompt 文案、成本、能力、thinking、effort 或 provider 映射。
2. `src/utils/model/modelCapabilities.ts` 会调用 `/v1/models` 缓存模型能力。它能帮助上下文窗口和 token 上限动态化，但同样不会改变默认模型或别名解析。

因此，授权文件或 bootstrap 结果即使能看到 Opus 4.7，也不能替代上述 P0/P1 的本地代码接入。

## 最小判定流程

用于定位“获取不到 Opus 4.7”到底是哪一层问题。

1. 显式运行：`--model claude-opus-4-7`。
2. 如果报 `not in available models` 或 `organization restricts model selection`，优先检查 `settings.availableModels` 和 `modelAllowlist.ts`。
3. 如果能发出请求但 API 返回 `invalid model name`、404 或 not available，优先检查账号权限、OAuth/API key 来源、base URL、provider 类型和服务端 gating。
4. 如果显式模型成功，但默认仍是 4.6，说明主要是本地默认模型、alias、picker 和 prompt 未更新。
5. 如果 `/model` 菜单不显示 4.7，但显式 `--model claude-opus-4-7` 成功，说明 picker/bootstrap 未更新，不是权限问题。

## 推荐实施顺序

1. 先补 `configs.ts`、`model.ts`、`prompts.ts`，让 `opus`、`best`、默认 Opus 和系统提示都认识 4.7。
2. 再补 `modelOptions.ts` 和 `/model` 命令文案，让用户能选择和看懂 4.7。
3. 然后补 `validateModel.ts`、`errors.ts`、`modelAllowlist.ts` 相关测试，让失败路径能区分本地拦截和服务端拒绝。
4. 最后补能力层、beta、thinking、effort、cost、provider 映射和文档示例。

## 测试清单

- `bun test src/utils/model/__tests__/model.test.ts`
- `bun test src/services/api/openai/__tests__/modelMapping.test.ts`
- `bun test src/services/api/grok/__tests__/modelMapping.test.ts`
- `bun test src/services/api/gemini/__tests__/modelMapping.test.ts`
- `bun test src/utils/__tests__/modelCost.test.ts`
- 增加或更新 prompt 相关断言，覆盖 `getKnowledgeCutoff('claude-opus-4-7')` 和 environment prompt。
- 运行 `bunx tsc --noEmit`，确保新增 `opus47` key 后类型全部收敛。

## 完成标准

- `claude-opus-4-7` 在模型配置中是正式条目，不再只出现在探测脚本的猜测列表。
- `opus` alias、`best`、Max/Team Premium 默认 Opus 都按设计解析到 Opus 4.7。
- `/model` 菜单能显示 Opus 4.7，显式 `--model claude-opus-4-7` 能通过本地校验。
- `src/constants/prompts.ts` 不再把 Opus 4.6 描述为最新 frontier。
- Opus 4.7 的 knowledge cutoff、marketing name、public display name、cost、effort、thinking、context window 和 beta 支持都有明确实现或明确不支持分支。
- 失败路径能区分：本地 allowlist、账号权限、provider 不支持、服务端模型不存在。
