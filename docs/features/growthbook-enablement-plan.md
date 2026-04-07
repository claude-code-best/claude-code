# GrowthBook 功能启用计划

> 编制日期: 2026-04-06
> 基于: feature-flags-codex-review.md + 4 个并行研究代理的深度分析
> 前提: 我们是付费订阅用户，拥有有效的 Anthropic API key

---

## 背景

Claude Code 使用三层门控系统：
1. **编译时 feature flag** — `feature('FLAG_NAME')` from `bun:bundle`
2. **GrowthBook 远程开关** — `tengu_*` 前缀，通过 SDK 连接 Anthropic 服务端
3. **运行时环境变量** — `USER_TYPE`、`CLAUDE_CODE_*` 等

在我们的反编译版本中，GrowthBook 不启动（analytics 链空实现），导致所有 `tengu_*` 检查默认返回 `false`。

**核心发现：所有被 GrowthBook 门控的功能代码都是真实现，没有 stub。**

---

## 启用方式说明

### 方式 1：硬编码绕过（推荐先用）
在 `src/services/analytics/growthbook.ts` 的 `getFeatureValueInternal()` 函数中添加默认值映射。

### 方式 2：自建 GrowthBook 服务器
```bash
docker run -p 3100:3100 growthbook/growthbook
# 设置环境变量
CLAUDE_GB_ADAPTER_URL=http://localhost:3100
CLAUDE_GB_ADAPTER_KEY=sdk-xxx
```

### 方式 3：恢复原生 1P 连接
让 `is1PEventLoggingEnabled()` 返回 `true`，连接 Anthropic 的 GrowthBook 服务端。
注意：会发送使用统计（不含代码/对话内容）。

---

## 优先级 P0：纯本地功能（零外部依赖，立即可用）

这些功能不需要 API 调用，开启 gate 即可工作。

### P0-1. 自定义快捷键
- **Gate**: `tengu_keybinding_customization_release` → `true`
- **编译 flag**: 无（已内置）
- **代码量**: 473 行，完整实现
- **功能**: 加载 `~/.claude/keybindings.json`，支持热重载、重复键检测、结构验证
- **效果**: 用户可自定义所有快捷键
- **风险**: 无

### P0-2. 流式工具执行
- **Gate**: `tengu_streaming_tool_execution2` → `true`
- **编译 flag**: 无（已内置）
- **代码量**: 577 行（StreamingToolExecutor），完整实现
- **功能**: API 响应还在流式返回时就开始执行工具，减少等待时间
- **效果**: 显著提升交互速度
- **风险**: 低（生产级代码，有错误处理）

### P0-3. 定时任务系统
- **Gate**: `tengu_kairos_cron` → `true`（额外：`tengu_kairos_cron_durable` 默认 `true`）
- **编译 flag**: `AGENT_TRIGGERS`（需新增）或 `AGENT_TRIGGERS_REMOTE`（已启用）
- **代码量**: 1025 行（cronTasks + cronScheduler），完整实现
- **功能**: 本地 cron 调度，支持一次性/周期性任务、防雷群效应 jitter、自动过期
- **效果**: 可设置定时执行的 Claude 任务
- **风险**: 低

### P0-4. Agent 团队 / Swarm
- **Gate**: `tengu_amber_flint` → `true`（这是 kill switch，默认已 `true`）
- **编译 flag**: 无（已内置）
- **代码量**: 45 行（gate 层），实际 swarm 实现在 teammate tools 中
- **功能**: 多 agent 协作，需额外设置 `--agent-teams` 或 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
- **效果**: 允许创建和管理 agent 团队
- **风险**: 无（kill switch 默认就是 true）

### P0-5. Token 高效 JSON 工具格式
- **Gate**: `tengu_amber_json_tools` → `true`
- **编译 flag**: 无（已内置）
- **代码量**: betas.ts 中几行 gate 检查
- **功能**: 启用 FC v3 格式，减少约 4.5% 的输出 token
- **效果**: 省钱
- **风险**: 低（需要模型支持该 beta header）

### P0-6. Ultrathink 扩展思考
- **Gate**: `tengu_turtle_carbon` → `true`（默认已 `true`，kill switch）
- **编译 flag**: 无
- **功能**: 通过关键词触发扩展思考模式
- **效果**: 已默认启用，确保不被远程关闭即可
- **风险**: 无

### P0-7. 即时模型切换
- **Gate**: `tengu_immediate_model_command` → `true`
- **编译 flag**: 无
- **功能**: 在 query 运行过程中即时执行 `/model`、`/fast`、`/effort` 命令
- **效果**: 无需等当前任务完成就能切换
- **风险**: 低

---

## 优先级 P1：需要 Claude API 的功能（有 API key 即可用）

这些功能需要调用 Claude API（使用 forked subagent 或 queryModel），有订阅即可。

### P1-1. 会话记忆
- **Gate**: `tengu_session_memory` → `true`（配置：`tengu_sm_config` → `{}`）
- **编译 flag**: 无（已内置）
- **代码量**: 1127 行，完整实现
- **功能**: 跨会话上下文持久化。用 forked agent 定期提取会话笔记到 markdown 文件
- **效果**: Claude 记住跨会话的工作上下文
- **依赖**: Claude API（forked subagent）
- **风险**: 低（额外 API token 消耗）

### P1-2. 自动记忆提取
- **Gate**: `tengu_passport_quail` → `true`（相关：`tengu_moth_copse`、`tengu_coral_fern`）
- **编译 flag**: `EXTRACT_MEMORIES`（需新增）
- **代码量**: 616 行，完整实现
- **功能**: 对话中自动提取持久记忆到 `~/.claude/projects/<path>/memory/`
- **效果**: 自动构建项目知识库
- **依赖**: Claude API（forked subagent）
- **风险**: 低

### P1-3. 提示建议
- **Gate**: `tengu_chomp_inflection` → `true`
- **编译 flag**: 无（已内置）
- **代码量**: 525 行，完整实现
- **功能**: 自动生成下一步操作建议，带投机预取（speculation prefetch）
- **效果**: 更流畅的交互体验
- **依赖**: Claude API（forked subagent）
- **风险**: 低（额外 API 消耗，但有缓存感知）

### P1-4. 验证代理
- **Gate**: `tengu_hive_evidence` → `true`
- **编译 flag**: `VERIFICATION_AGENT`（需新增）
- **代码量**: 153 行（agent 定义），完整实现
- **功能**: 对抗性验证 agent，主动尝试打破你的实现（只读模式）
- **效果**: 自动化代码验证
- **依赖**: Claude API（subagent）
- **风险**: 低（只读，不修改代码）

### P1-5. Brief 模式
- **Gate**: `tengu_kairos_brief` → `true`
- **编译 flag**: `KAIROS` 或 `KAIROS_BRIEF`（需新增）
- **代码量**: 335 行，完整实现
- **功能**: `/brief` 命令切换精简输出模式
- **效果**: 减少冗余输出
- **依赖**: Claude API
- **风险**: 低

### P1-6. 离开摘要
- **Gate**: `tengu_sedge_lantern` → `true`
- **编译 flag**: `AWAY_SUMMARY`（需新增）
- **代码量**: 176 行，完整实现
- **功能**: 离开终端 5 分钟后返回时自动总结期间发生了什么
- **效果**: 快速恢复上下文
- **依赖**: Claude API + 终端焦点事件支持
- **风险**: 低

### P1-7. 自动梦境
- **Gate**: `tengu_onyx_plover` → `{"enabled": true}`
- **编译 flag**: 无（已内置，但检查 auto-memory 是否启用）
- **代码量**: 349 行，完整实现
- **功能**: 后台自动整理/巩固记忆（等同于自动执行 `/dream`）
- **效果**: 记忆自动保持整洁有序
- **依赖**: Claude API（forked subagent）+ auto-memory 启用
- **风险**: 低

### P1-8. 空闲返回提示
- **Gate**: `tengu_willow_mode` → `"dialog"` 或 `"hint"`
- **编译 flag**: 无
- **功能**: 对话太大且缓存过期时，提示用户开新会话
- **效果**: 避免在过期缓存上浪费 token
- **风险**: 无

---

## 优先级 P2：增强型功能（提升体验但非必须）

### P2-1. MCP 指令增量传输
- **Gate**: `tengu_basalt_3kr` → `true`
- **功能**: 只发送变化的 MCP 指令而非全量
- **效果**: 减少 token 消耗
- **风险**: 低

### P2-2. 叶剪枝优化
- **Gate**: `tengu_pebble_leaf_prune` → `true`
- **功能**: 会话存储中移除死胡同消息分支
- **效果**: 减少存储和加载时间
- **风险**: 低

### P2-3. 消息合并
- **Gate**: `tengu_chair_sermon` → `true`
- **功能**: 合并相邻的 tool_result + text 块
- **效果**: 减少 token 消耗
- **风险**: 低

### P2-4. 深度链接
- **Gate**: `tengu_lodestone_enabled` → `true`
- **功能**: 注册 `claude://` URL 协议处理器
- **效果**: 可从浏览器直接打开 Claude Code
- **风险**: 低

### P2-5. Agent 自动转后台
- **Gate**: `tengu_auto_background_agents` → `true`
- **功能**: Agent 任务运行 120s 后自动转为后台
- **效果**: 不再阻塞主交互
- **风险**: 低

### P2-6. 细粒度工具状态
- **Gate**: `tengu_fgts` → `true`
- **功能**: 系统提示中包含细粒度工具状态信息
- **效果**: 模型更好地理解工具可用性
- **风险**: 低

### P2-7. 文件操作 git diff
- **Gate**: `tengu_quartz_lantern` → `true`
- **功能**: 文件写入/编辑时计算 git diff（仅远程会话）
- **效果**: 更好的变更追踪
- **风险**: 低

---

## 优先级 P3：需要自建服务或 Anthropic OAuth

### P3-1. 团队记忆
- **Gate**: `tengu_herring_clock` → `true`
- **编译 flag**: `TEAMMEM`（需新增）
- **代码量**: 1180+ 行，完整实现
- **功能**: 跨 agent 共享记忆，同步到 Anthropic API
- **依赖**: Anthropic OAuth + GitHub remote
- **状态**: 需要 Anthropic 的 `/api/claude_code/team_memory` 端点
- **可行性**: 除非自建兼容 API，否则无法使用

### P3-2. 设置同步
- **Gate**: `tengu_enable_settings_sync_push` + `tengu_strap_foyer` → `true`
- **编译 flag**: `UPLOAD_USER_SETTINGS` / `DOWNLOAD_USER_SETTINGS`（需新增）
- **代码量**: 582 行，完整实现
- **功能**: 跨设备设置同步
- **依赖**: Anthropic OAuth + `/api/claude_code/user_settings`
- **可行性**: 同上

### P3-3. Bridge 远程控制
- **Gate**: `tengu_ccr_bridge` → `true`（已有编译 flag `BRIDGE_MODE` dev 模式启用）
- **代码量**: 12,619 行，完整实现
- **功能**: claude.ai 网页端远程控制 CLI
- **依赖**: claude.ai 订阅 + WebSocket 后端
- **可行性**: 需要 Anthropic 的 CCR 后端

### P3-4. 远程定时 Agent
- **Gate**: `tengu_surreal_dali` → `true`
- **功能**: 创建在远程执行的定时 agent
- **依赖**: Anthropic CCR 基础设施
- **可行性**: 需要远程服务

---

## Kill Switch 清单（确保不被远程关闭）

这些 gate 默认为 `true`，是 kill switch。应确保它们保持 `true`：

| Gate | 默认 | 控制什么 |
|---|---|---|
| `tengu_turtle_carbon` | `true` | Ultrathink 扩展思考 |
| `tengu_amber_stoat` | `true` | 内置 Explore/Plan agent |
| `tengu_amber_flint` | `true` | Agent 团队/Swarm |
| `tengu_slim_subagent_claudemd` | `true` | 子 agent 精简 CLAUDE.md |
| `tengu_birch_trellis` | `true` | tree-sitter bash 安全分析 |
| `tengu_collage_kaleidoscope` | `true` | macOS 剪贴板图片读取 |
| `tengu_compact_cache_prefix` | `true` | 压缩时复用 prompt cache |
| `tengu_kairos_cron_durable` | `true` | 持久化 cron 任务 |
| `tengu_attribution_header` | `true` | API 请求署名 |
| `tengu_slate_prism` | `true` | Agent 进度摘要 |

---

## 需要新增的编译 flag

以下编译时 flag 尚未在 `build.ts` / `scripts/dev.ts` 中启用，但功能代码完整：

| Flag | 用于 | 优先级 |
|---|---|---|
| `AGENT_TRIGGERS` | 定时任务系统（P0-3） | P0 |
| `EXTRACT_MEMORIES` | 自动记忆提取（P1-2） | P1 |
| `VERIFICATION_AGENT` | 验证代理（P1-4） | P1 |
| `KAIROS` 或 `KAIROS_BRIEF` | Brief 模式（P1-5） | P1 |
| `AWAY_SUMMARY` | 离开摘要（P1-6） | P1 |
| `TEAMMEM` | 团队记忆（P3-1） | P3 |

---

## 实施路线图

### Phase 1：硬编码 P0 纯本地 gate（最快见效）
1. 在 growthbook.ts 添加默认值映射
2. 在 build.ts / dev.ts 添加 `AGENT_TRIGGERS` 编译 flag
3. 验证 7 个 P0 功能正常工作
4. 预计工作量：1-2 小时

### Phase 2：启用 P1 API 依赖功能
1. 添加编译 flag：`EXTRACT_MEMORIES`、`VERIFICATION_AGENT`、`KAIROS_BRIEF`、`AWAY_SUMMARY`
2. 添加 P1 gate 默认值
3. 验证 8 个 P1 功能正常工作
4. 预计工作量：2-3 小时

### Phase 3：评估自建 GrowthBook（可选）
1. Docker 部署 GrowthBook 服务器
2. 迁移硬编码值到 GrowthBook 后台管理
3. 获得 Web UI 管理所有 flag 的能力
4. 预计工作量：半天

### Phase 4：评估远程功能（可选）
1. 研究是否可以使用 Anthropic OAuth
2. 评估团队记忆、设置同步的自建可行性
3. 预计工作量：待评估

---

## 隐私说明

### 硬编码绕过（方案 A）
- **零数据外发**
- GrowthBook SDK 不启动
- 完全离线运行

### 自建 GrowthBook（方案 B）
- 数据仅发送到你自己的服务器
- Anthropic 无法获取任何数据
- 可通过 Web UI 实时管理所有 flag

### 恢复原生 1P（方案 C）
- 会发送使用统计到 `api.anthropic.com`
- **不发送**：代码、对话内容、API key
- **会发送**：邮箱、设备 ID、机器指纹、仓库哈希、订阅类型
- 可用 `DISABLE_TELEMETRY=1` 关闭遥测（但同时关闭 GrowthBook）
