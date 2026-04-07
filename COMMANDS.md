# Claude Code 斜杠命令完整列表

本文档列出 Claude Code leak-cc 版本中的所有斜杠命令，含原始英文描述及中文翻译。

---

## 统计概览

| 分类 | 数量 |
|------|------|
| 目录形式命令 | 94 个 |
| 文件形式命令 (.ts) | 13 个 |
| **总计** | **107 个** |

### 状态分类

| 状态 | 数量 | 说明 |
|------|------|------|
| 正常命令 | ~97 个 | 有完整描述 |
| STUB 空实现 | 5 个 | 占位符，未实际开发 |
| 动态描述 | 5 个 | 运行时动态生成 |

---

## 完整命令列表

### A-B

| 命令 | 原文描述 | 中文翻译 |
|------|----------|----------|
| `add-dir` | Add a new working directory | 添加一个新的工作目录 |
| `advisor` | Configure the advisor model | 配置顾问模型 |
| `agents` | Manage agent configurations | 管理智能体配置 |
| `agents-platform` | (内部命令) | （内部命令） |
| `ant-trace` | (内部命令) | （内部命令） |
| `assistant` | (内部命令) | （内部命令） |
| `autofix-pr` | (内部命令) | （内部命令） |
| `backfill-sessions` | (内部命令) | （内部命令） |
| `branch` | Create a branch of the current conversation at this point | 在当前位置创建当前对话的分支 |
| `break-cache` | (内部命令) | （内部命令） |
| `bridge` | Connect this terminal for remote-control sessions | 连接此终端以进行远程控制会话 |
| `bridge-kick` | Inject bridge failure states for manual recovery testing | 注入桥接故障状态以进行手动恢复测试 |
| `brief` | Toggle brief-only mode | 切换简短模式 |
| `btw` | Ask a quick side question without interrupting the main conversation | 快速提问而不中断主对话 |
| `buddy` | Hatch a coding companion · pet, off | 孵化一个编程伴侣 · 宠物，关闭 |
| `bughunter` | (内部命令) | （内部命令） |

### C

| 命令 | 原文描述 | 中文翻译 |
|------|----------|----------|
| `chrome` | Claude in Chrome (Beta) settings | Chrome 中的 Claude 设置（Beta） |
| `clear` | Clear conversation history and free up context | 清除对话历史并释放上下文 |
| `color` | Set the prompt bar color for this session | 设置此会话的提示栏颜色 |
| `commit` | Create a git commit | 创建 Git 提交 |
| `commit-push-pr` | Commit, push, and open a PR | 提交、推送并打开 PR |
| `compact` | Clear conversation history but keep a summary in context. Optional: /compact [instructions for summarization] | 清除对话历史但在上下文中保留摘要。可选：/compact [摘要说明] |
| `config` | Open config panel | 打开配置面板 |
| `context` | Visualize current context usage as a colored grid | 将当前上下文使用情况可视化为彩色网格 |
| `copy` | Copy Claude's last response to clipboard (or /copy N for the Nth-latest) | 复制 Claude 的上一条响应到剪贴板（或 /copy N 获取倒数第 N 条） |
| `cost` | Show the total cost and duration of the current session | 显示当前会话的总成本和持续时间 |
| `createMovedToPluginCommand` | (内部命令) | （内部命令） |
| `ctx_viz` | (内部命令) | （内部命令） |

### D

| 命令 | 原文描述 | 中文翻译 |
|------|----------|----------|
| `debug-tool-call` | (内部命令) | （内部命令） |
| `desktop` | Continue the current session in Claude Desktop | 在 Claude Desktop 中继续当前会话 |
| `diff` | View uncommitted changes and per-turn diffs | 查看未提交的更改和每轮对话的差异 |
| `doctor` | Diagnose and verify your Claude Code installation and settings | 诊断并验证 Claude Code 安装和设置 |

### E

| 命令 | 原文描述 | 中文翻译 |
|------|----------|----------|
| `effort` | Set effort level for model usage | 设置模型使用的 effort 级别 |
| `env` | (内部命令) | （内部命令） |
| `exit` | Exit the REPL | 退出 REPL |
| `export` | Export the current conversation to a file or clipboard | 将当前对话导出到文件或剪贴板 |
| `extra-usage` | Configure extra usage to keep working when limits are hit | 配置额外使用量，当达到限制时继续工作 |

### F

| 命令 | 原文描述 | 中文翻译 |
|------|----------|----------|
| `fast` | [DYNAMIC] Toggle fast mode (当前模式) | 切换快速模式 |
| `feedback` | Submit feedback about Claude Code | 提交关于 Claude Code 的反馈 |
| `files` | List all files currently in context | 列出当前上下文中的所有文件 |
| `fork` | [STUB 空实现] | （空实现，未开发） |
| `good-claude` | (内部命令) | （内部命令） |

### G-H

| 命令 | 原文描述 | 中文翻译 |
|------|----------|----------|
| `heapdump` | Dump the JS heap to ~/Desktop | 将 JS 堆转储到 ~/Desktop |
| `help` | Show help and available commands | 显示帮助和可用命令 |
| `hooks` | View hook configurations for tool events | 查看工具事件的钩子配置 |

### I

| 命令 | 原文描述 | 中文翻译 |
|------|----------|----------|
| `ide` | Manage IDE integrations and show status | 管理 IDE 集成并显示状态 |
| `init` | (技能初始化) | （技能初始化） |
| `init-verifiers` | Create verifier skill(s) for automated verification of code changes | 创建验证器技能以自动验证代码更改 |
| `insights` | (使用洞察) | （使用洞察和区域统计） |
| `install-github-app` | Set up Claude GitHub Actions for a repository | 为仓库设置 Claude GitHub Actions |
| `install-slack-app` | Install the Claude Slack app | 安装 Claude Slack 应用 |
| `install` | (内部命令) | （内部命令） |
| `issue` | (内部命令) | （内部命令） |

### K

| 命令 | 原文描述 | 中文翻译 |
|------|----------|----------|
| `keybindings` | Open or create your keybindings configuration file | 打开或创建快捷键配置文件 |

### L

| 命令 | 原文描述 | 中文翻译 |
|------|----------|----------|
| `login` | Switch Anthropic accounts | 切换 Anthropic 账户 |
| `logout` | Sign out from your Anthropic account | 退出 Anthropic 账户 |

### M

| 命令 | 原文描述 | 中文翻译 |
|------|----------|----------|
| `mcp` | Manage MCP servers | 管理 MCP 服务器 |
| `memory` | Edit Claude memory files | 编辑 Claude 记忆文件 |
| `mobile` | Show QR code to download the Claude mobile app | 显示二维码以下载 Claude 移动应用 |
| `model` | [DYNAMIC] Set the AI model for Claude Code (当前模型) | 设置 Claude Code 的 AI 模型 |
| `mock-limits` | (内部命令) | （内部命令） |

### O

| 命令 | 原文描述 | 中文翻译 |
|------|----------|----------|
| `oauth-refresh` | (内部命令) | （内部命令） |
| `onboarding` | (内部命令) | （内部命令） |
| `output-style` | Deprecated: use /config to change output style | 已弃用：请使用 /config 更改输出样式 |

### P

| 命令 | 原文描述 | 中文翻译 |
|------|----------|----------|
| `passes` | [DYNAMIC] Share a free week of Claude Code with friends | 与朋友分享免费 Claude Code 周 |
| `peers` | [STUB 空实现] | （空实现，未开发） |
| `perf-issue` | (内部命令) | （内部命令） |
| `permissions` | Manage allow & deny tool permission rules | 管理允许和拒绝的工具权限规则 |
| `plan` | Enable plan mode or view the current session plan | 启用计划模式或查看当前会话计划 |
| `plugin` | (内部命令) | （内部命令） |
| `pr_comments` | Get comments from a GitHub pull request | 获取 GitHub Pull Request 的评论 |
| `privacy-settings` | View and update your privacy settings | 查看和更新您的隐私设置 |
| `provider` | Switch API provider (anthropic/openai/gemini/grok/bedrock/vertex/foundry) | 切换 API 提供商 |
| `rate-limit-options` | Show options when rate limit is reached | 显示达到速率限制时的选项 |

### R

| 命令 | 原文描述 | 中文翻译 |
|------|----------|----------|
| `release-notes` | View release notes | 查看发布说明 |
| `reload-plugins` | Activate pending plugin changes in the current session | 在当前会话中激活待处理的插件更改 |
| `remote-control` | Connect this terminal for remote-control sessions | 连接此终端以进行远程控制会话 |
| `remote-control-server` | Start a persistent Remote Control server (daemon) that accepts multiple sessions | 启动持久化远程控制服务器（守护进程）以接受多个会话 |
| `remote-env` | Configure the default remote environment for teleport sessions | 配置传送会话的默认远程环境 |
| `remote-setup` | Setup Claude Code on the web (requires connecting your GitHub account) | 在 Web 上设置 Claude Code（需要连接 GitHub 账户） |
| `rename` | Rename the current conversation | 重命名当前对话 |
| `reset-limits` | [STUB 空实现] | （空实现，未开发） |
| `resume` | Resume a previous conversation | 恢复之前的对话 |
| `review` | Review a pull request | 审查 Pull Request |
| `rewind` | Restore the code and/or conversation to a previous point | 将代码和/或对话恢复到之前的某个点 |

### S

| 命令 | 原文描述 | 中文翻译 |
|------|----------|----------|
| `sandbox-toggle` | [DYNAMIC] Toggle sandbox mode (显示当前状态) | 切换沙盒模式 |
| `security-review` | Complete a security review of the pending changes on the current branch | 对当前分支上的待处理更改进行安全审查 |
| `session` | Show remote session URL and QR code | 显示远程会话 URL 和二维码 |
| `share` | (内部命令) | （内部命令） |
| `skills` | List available skills | 列出可用的技能 |
| `stats` | Show your Claude Code usage statistics and activity | 显示 Claude Code 使用统计和活动 |
| `status` | Show Claude Code status including version, model, account, API connectivity, and tool statuses | 显示 Claude Code 状态，包括版本、模型、账户、API 连接和工具状态 |
| `stickers` | Order Claude Code stickers | 订购 Claude Code 贴纸 |
| `summary` | (内部命令) | （内部命令） |

### T

| 命令 | 原文描述 | 中文翻译 |
|------|----------|----------|
| `tag` | Toggle a searchable tag on the current session | 在当前会话上切换可搜索标签 |
| `tasks` | List and manage background tasks | 列出和管理后台任务 |
| `teleport` | (内部命令) | （内部命令） |
| `terminalSetup` | Enable Option+Enter key binding for newlines and visual bell (Apple Terminal) / Install Shift+Enter key binding for newlines (other terminals) | 启用选项 Enter 键绑定以换行和视觉提示（Apple Terminal）/ 安装 Shift+Enter 键绑定以换行（其他终端） |
| `theme` | Change the theme | 更改主题 |
| `thinkback` | Your 2025 Claude Code Year in Review | 您的 2025 Claude Code 年度回顾 |
| `thinkback-play` | Play the thinkback animation | 播放 thinkback 动画 |

### U

| 命令 | 原文描述 | 中文翻译 |
|------|----------|----------|
| `ultraplan` | (内部命令) | （内部命令） |
| `upgrade` | Upgrade to Max for higher rate limits and more Opus | 升级到 Max 以获得更高的速率限制和更多 Opus |
| `usage` | Show plan usage limits | 显示计划使用限制 |

### V

| 命令 | 原文描述 | 中文翻译 |
|------|----------|----------|
| `version` | Print the version this session is running (not what autoupdate downloaded) | 打印此会话运行的版本（不是自动下载的版本） |
| `vim` | Toggle between Vim and Normal editing modes | 在 Vim 和 Normal 编辑模式之间切换 |
| `voice` | Toggle voice mode | 切换语音模式 |

### W

| 命令 | 原文描述 | 中文翻译 |
|------|----------|----------|
| `web-setup` | (内部命令) | （内部命令） |
| `workflows` | [STUB 空实现] | （空实现，未开发） |

---

## STUB 空实现列表

以下 5 个命令尚未实现，仅为占位符：

| 命令 | 说明 |
|------|------|
| `fork` | 分叉会话 |
| `peers` | 对等连接 |
| `reset-limits` | 重置限制 |
| `workflows` | 工作流 |

---

## 动态描述命令

以下 5 个命令的描述是运行时动态生成的：

| 命令 | 动态描述内容 |
|------|-------------|
| `fast` | Toggle fast mode (显示当前模式) |
| `model` | Set the AI model for Claude Code (显示当前模型) |
| `passes` | Share a free week of Claude Code with friends |
| `sandbox-toggle` | 显示沙盒状态 (enabled/disabled/auto-allow) |

---

## 内部命令（不在命令行显示）

以下命令是内部功能，不在 `/help` 中显示：

`agents-platform` · `ant-trace` · `assistant` · `autofix-pr` · `backfill-sessions` · `break-cache` · `bughunter` · `ctx_viz` · `debug-tool-call` · `env` · `good-claude` · `install` · `issue` · `mock-limits` · `oauth-refresh` · `onboarding` · `perf-issue` · `plugin` · `share` · `summary` · `teleport` · `ultraplan` · `web-setup`

---

## 按功能分类

### 会话控制
`branch` · `clear` · `compact` · `desktop` · `exit` · `export` · `fork` · `memory` · `plan` · `rename` · `resume` · `rewind` · `session` · `share` · `summary` · `tag` · `tasks` · `teleport`

### 上下文与状态
`context` · `cost` · `effort` · `files` · `status`

### 配置与管理
`add-dir` · `agents` · `config` · `keybindings` · `mcp` · `output-style` · `permissions` · `plugin` · `privacy-settings` · `provider` · `rate-limit-options` · `reload-plugins` · `remote-control` · `remote-control-server` · `remote-env` · `remote-setup` · `terminalSetup` · `theme` · `web-setup`

### 版本控制
`commit` · `commit-push-pr` · `diff` · `pr_comments` · `review`

### 代码审查与调试
`bughunter` · `doctor` · `heapdump` · `perf-issue` · `security-review`

### 账户与认证
`login` · `logout` · `oauth-refresh` · `upgrade` · `usage`

### 扩展与服务
`chrome` · `ide` · `install-github-app` · `install-slack-app` · `mobile` · `skills` · `stickers`

### 开发工具
`btw` · `buddy` · `color` · `copy` · `env` · `fast` · `feedback` · `good-claude` · `help` · `hooks` · `init` · `init-verifiers` · `model` · `release-notes` · `vim` · `voice`

### 特殊功能
`backfill-sessions` · `break-cache` · `passes` · `peers` · `reset-limits` · `sandbox-toggle` · `thinkback` · `thinkback-play` · `ultraplan` · `workflows`

---

*最后更新：2026/04/07*

---

## Bundled Skills（内置技能）

以下技能注册在 `src/skills/bundled/`，通过技能系统调用：

| 技能 | 原文描述 | 中文翻译 |
|------|----------|----------|
| `batch` | Run a prompt or slash command on a recurring interval | 研究和规划大规模变更，然后通过 5–30 个隔离的 worktree 智能体并行执行 |
| `claude-api` | Build apps with the Claude API or Anthropic SDK | 使用 Claude API 或 Anthropic SDK 构建应用 |
| `claude-in-chrome` | Automates your Chrome browser to interact with web pages | 自动化您的 Chrome 浏览器与网页交互 |
| `cron-list` | List all scheduled cron jobs in this session | 列出此会话中所有计划任务 |
| `cron-delete` | Cancel a scheduled cron job by ID | 按 ID 取消计划任务 |
| `debug` | Enable debug logging for this session and help diagnose issues | 启用此会话的调试日志并帮助诊断问题 |
| `dream` | Manually trigger memory consolidation | 手动触发记忆整合 — 审查、整理和清理您的自动记忆文件 |
| `keybindings-help` | Customize keyboard shortcuts and keybindings | 自定义键盘快捷键和按键绑定 |
| `lorem-ipsum` | Generate filler text for long context testing | 生成用于长上下文测试的填充文本 |
| `loop` | Run a prompt or slash command on a recurring interval | 按定期间隔运行提示或斜杠命令 |
| `remember` | Review auto-memory entries and propose promotions | 审查自动记忆条目并提议晋升 |
| `schedule` | Create, update, list, or run scheduled remote agents | 创建、更新、列出或运行计划远程智能体 |
| `simplify` | Review changed code for reuse, quality, and efficiency | 审查更改的代码以进行复用、质量和效率优化 |
| `skillify` | Capture this session's repeatable process into a skill | 将此会话的可重复过程捕获为技能 |
| `stuck` | Investigate frozen/stuck/slow Claude Code sessions | 调查冻结/卡住/缓慢的 Claude Code 会话 |
| `update-config` | Configure Claude Code via settings.json | 通过 settings.json 配置 Claude Code |

---

## Skills（用户技能目录）

以下技能位于 `.claude/skills/` 目录：

| 技能 | 原文描述 | 中文翻译 |
|------|----------|----------|
| `interview` | Interview me about my requirements | 通过深入提问来了解我的需求 |
| `teach-me` | Personalized 1-on-1 AI tutor | 个性化一对一 AI 导师 |

---

## MCP 工具（不属于命令）

以下为 MCP 工具，非斜杠命令：

| 工具 | 说明 |
|------|------|
| `fetch` | 获取 URL 内容 |
| `web-search` | 网页搜索 |
| `mcp__playwright__*` | 浏览器自动化工具 |
| `mcp__MiniMax__*` | MiniMax 相关工具 |

---

## 分支说明

本翻译工作在 `translated` 分支进行，与上游 `master` 分支分离。

### 分支策略

| 分支 | 用途 |
|------|------|
| `master` | 接收上游更新，直接 `git pull` 即可 |
| `translated` | 存放翻译更改，合并 master 后快速定位新命令 |

### 更新流程

1. **切换到 master 并拉取更新**：
   ```bash
   git checkout master
   git pull origin master
   ```

2. **切换到 translated 并合并**：
   ```bash
   git checkout translated
   git merge master
   ```

3. **处理冲突后，对照本文件的"翻译对照表"部分检查新增命令**

4. **翻译完成后提交**：
   ```bash
   git add .
   git commit -m "翻译: 更新至 xxxx 版本"
   ```

### 备份文件

翻译前的原始描述备份位于 `backup/commands/` 目录（77个命令描述）。

---

## 翻译对照表（用于快速定位）

当官方版本更新后，对比此表找出新增或修改的命令：

```javascript
// commands.ts 中新增命令的特征
const newCommand = {
  type: 'prompt',
  name: '新命令名',
  description: '英文描述',  // <-- 需要翻译
}

// src/commands/新命令/index.ts
export default {
  name: '新命令',
  description: '英文描述',  // <-- 需要翻译
}

// src/skills/bundled/新技能.ts
registerBundledSkill({
  name: '新技能',
  description: '英文描述',  // <-- 需要翻译
})
```

---

## 更新检查清单

每次更新 leak-cc 版本后，执行以下检查：

- [ ] 对比 `git diff src/commands.ts` 查找新增命令
- [ ] 对比 `git diff src/commands/` 目录
- [ ] 对比 `git diff src/skills/bundled/` 目录
- [ ] 检查 `.claude/skills/` 是否有新增技能
- [ ] 验证所有新增描述已翻译为中文
