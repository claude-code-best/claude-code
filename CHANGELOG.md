# Changelog

All notable changes to this project will be documented in this file.

## [4.0.14] - 2026-05-12

### 主要变更

- **合并 merge 分支**: 同步社区 upstream 代码至 v2.4.2，合并长期积累的功能增强分支
- **Review 系统重构**: review agents 和 skills 迁移至 bundled skill files 机制（`generate-review-builtin`），统一从 `costrict-review` 仓库生成
- **版本信息增强**: `--version` 输出添加 git commit hash 和 build time
- **二进制构建**: 新增 `bun compile` 脚本支持 Linux/Windows 二进制打包（`build:binary:*`）

### 功能改进

- **max_tokens 动态设置**: 根据当前 provider 的可用模型列表动态调整 max_tokens 参数（CoStrict provider）
- **Agent-type header**: 为 CoStrict provider 添加 `x-agent-type` 请求头
- **rawDump 模块**: 新增会话数据 raw-dump 上报模块，支持队列 + batch worker 防 429
- **GitHub 集成**: 添加 issue、share、autofix-pr 等 GitHub 相关命令
- **本地 Memory/Vault**: 添加 LocalMemoryRecallTool 和 Local Vault 加密存储服务
- **登录认证增强**: 支持 workspace key、host guard、auth status 等
- **Provider Registry**: 添加 Provider 注册中心、StatusLine、Cache Stats 等

### Bug 修复

- 修复大量node内存彪高问题
- 修复 betas 导入名称不匹配
- 修复 rawDump batch worker 并发级联和 fetch 超时问题
- 修复 CI 测试 Bun mock.module 跨文件污染导致 87 个测试失败
- 修复 issue-template 测试误删 `.github/workflows` 目录
- 修复非 UTF-8 编码文件读写 round-trip 字节损坏（后 revert）
- 修复 GBK 编码自动检测支持（后 revert）
- 修复 CoStrict provider 模型列表与 token 估算问题
- 将 `undici` 移至 `dependencies` 修复 Node.js 启动挂起问题（`https_proxy` 环境变量）

### 清理优化

- 移除 `.npmrc` 中的 npm auth token
- 关闭默认的 FORK_SUBAGENT feature flag
- 移除废弃的 `ctx_viz` 类型声明和废弃文档

### 构建与 CI

- 新增 Vite 构建流程支持
- CI 添加 codecov 覆盖率上报
- CI 添加 review agent 生成步骤
- 添加 npm 发布工作流
- 统一 typecheck 命令

## [4.0.13] - 2026-04-29

### 品牌重构

- **Rebrand**: CLI 从 Claude 全面重命名为 CoStrict/csc，包括命令行帮助输出、终端标题等
- 统一所有 provider 的 User-Agent 为 `csc/${VERSION}`

### 功能改进

- **BUDDY 功能默认启用**：移除日期限制，开箱即用
- **构建时替换 feature flags**：构建产物中自动将 `feature('FLAG_NAME')` 替换为 `true/false`，不再依赖运行时环境变量
- **内置 KB 套件（cosknow）**：打包时将 KB 知识库套件内置进 csc，安装后自动注册命令到 `~/.claude/commands/`

### Bug 修复

- **修复 CoStrict provider 递归解析问题**：`getDefaultSonnetModel` / `getDefaultHaikuModel` 返回具体模型名，避免无限递归
- **修复 sideQuery/模型选择**：CoStrict 和 OpenAI provider 下的模型选择逻辑
- **修复登录提示问题**：将 costrict 加入 `is3P` 判断，消除登录后误报的 "Not logged in" 提示
- **修复 truncate 函数崩溃**：处理 `undefined` / `null` 输入时不再崩溃
- **修复 ripgrep 安装**：支持内网私服兜底下载

### 性能优化

- **移除消息流中的 diff 渲染**：仅保留权限审批页面的 diff 展示，降低内存峰值

### 安全加固

- **网络伪设备重定向检测**：添加 `/dev/tcp`、`/dev/udp` 等 Bash 网络伪设备的安全检测

### 测试

- 添加 subagent 僵死场景相关测试用例
- 修复 RemoteTriggerTool 和 autonomy 测试的全量运行失败

## [4.0.12] - 2026-04-24

### 变更

- 版本号升级至 4.0.12

## [4.0.8] - 2026-04-23

### 新功能

- 同步上游主仓库最新代码
- 远程控制 Web 展示优化、状态同步与桥接控制流程改进
- 添加对 ACP 协议的支持
- 重构供应商层次结构
- 新增 Vite 构建流程
- 添加环境变量支持以覆盖 max_tokens 设置
- Langfuse LLM generation 记录工具定义

### 修复

- 修复 node 下 loading 按钮计算错误问题
- 修复 Linux 端的安装问题
- 修复类型校验问题
- **Package**: `files` 字段补充遗漏的 `scripts/run-parallel.mjs`，修复 npm install 时 `MODULE_NOT_FOUND` 错误

### 变更

- **Commands**: 移除 `desktop` 命令及相关注册
- **UI**: `LogoV2` 强制使用 condensed 模式，跳过 release notes / onboarding 检测
- **Tips**: 将 desktop app 提示文案更新为 CoStrict Web
- **Package**: 包名改为 `@costrict/csc`，描述更新为 `costrict`
- **Bin**: bin 命令统一为 `csc`，移除 `ccb`、`ccb-bun`、`claude-code-best`

## [4.0.6] - 2026-04-16

### 新功能

- 去除了运行时bun的依赖

## [4.0.5] - 2026-04-15

### 新功能

- 工具层及 MCP 大重构
- 完成第一个 MCP Chrome 浏览器接入版本
- 添加 Langfuse 监控支持
- Langfuse 工具调用显示为嵌套结构
- Brave 作为 WebSearchTool 的备选搜索引擎
- 支持自托管 remote-control-server
- 支持Ultraplan Feature 支持高级多 Agent 规划
- 增加了upgrade/update 命令

### Agent 系统

- 新增 CoStrict agent 套件用于结构化工作流
- 新增 TDD 工作流（test design / prepare / execute / run-and-fix 四个 agent）
- 新增 QuickExploreAgent，启用默认规划 agents
- 新增 planApply agent 工具列表
- 新增 StrictPlan 模式

### Skills

- 新增 `project-wiki` skill 自动生成技术文档
- 新增 `security-review` 内置 skill 支持代码审计

### 修复

- 修复内置 agent prompt 中工具名引用归一化
- 修复 mintlify ignore 和侧边栏
- 修复 Windows 上 `bun.exe` 命令识别问题
- 修复初次登陆的校验问题
- 修复类型问题（多处）