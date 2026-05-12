# 斜杠命令完整测试清单

**日期**：2026-05-06
**适用范围**：本 session 累积所有恢复/新建命令（PR-1 ~ PR-4 + audit-fix + H2 refactor）
**起点 commit**：`origin/main` (4f1649e2)
**最新 commit**：`fe99cf0e`（35+ commits ahead）

---

## 测试前准备

```bash
cd E:/Source_code/Claude-code-bast-autofix-pr

# 1. 确保最新 dist 含全部 commits
bun run build

# 2. 验证 dist 不是 stale
stat -c '%Y %n' dist/cli.js
git log -1 --format=%ct\ %h
# dist mtime 必须 ≥ HEAD commit time

# 3. 完全退出当前 dev REPL（按 Ctrl+D 或 /quit）后重启
bun run dev
```

**关键提醒**：Bun 不会动态重载 dist，任何 source 改动都必须 `bun run build` + 重启 REPL。

---

## A 组 — 纯本地（无网络/无 key，立即可测）

**前置**：无

| # | 命令 | 输入 | 期望输出 | 通过 |
|---|---|---|---|---|
| A1 | `/version` | 直接跑 | 显示版本号（如 `1.10.10`） | ☐ |
| A2 | `/env` | 直接跑 | runtime 信息 + env vars 白名单（CLAUDE_/FEATURE_/ANTHROPIC_/BUN_/NODE_/...）+ secrets masked | ☐ |
| A3 | `/context` | 直接跑 | fork 原生命令：colored grid（走 `analyzeContextUsage()` 真实 API view，含 compact boundary + projectView 转换）+ token 数与 API 看到的一致 | ☐ |
| A4 | `/context` 在压缩边界附近 | 直接跑 | 显示 compact boundary 后的 messages，不重复计 token | ☐ |
| A5 | _（删 ctx_viz；`/context` 是唯一 context 可视化命令）_ | — | — | — |
| A6 | `/debug-tool-call` | 默认 N=5 | 列最近 5 个 tool_use+tool_result 配对 | ☐ |
| A7 | `/debug-tool-call 10` | 数字参数 | 列最近 10 个 | ☐ |
| A8 | `/perf-issue` | 直接跑 | 写 `~/.claude/perf-reports/perf-<stamp>.md`（mem+cpu+token+per-tool） | ☐ |
| A9 | `/perf-issue --format=json` | flag | 写 .json 格式 | ☐ |
| A10 | `/perf-issue --limit 1000` | flag | 仅读 log 最后 1000 行 | ☐ |
| A11 | `/break-cache` | 默认 once | 写 `~/.claude/.next-request-no-cache` marker | ☐ |
| A12 | `/break-cache status` | 子命令 | 显示 marker 状态 + 累计 break 次数 | ☐ |
| A13 | `/break-cache always` | 子命令 | 写 always flag 文件 | ☐ |
| A14 | `/break-cache off` | 子命令 | 删 once + always | ☐ |
| A15 | `/tui` | toggle | 切换 marker `~/.claude/.tui-mode` | ☐ |
| A16 | `/tui status` | 子命令 | 显示当前 marker + env var 状态 | ☐ |
| A17 | `/tui on` `/tui off` | 子命令 | marker write/unlink | ☐ |
| A18 | `/onboarding status` | 子命令 | 显示 hasCompletedOnboarding / theme / lastVersion | ☐ |
| A19 | `/onboarding theme` | 子命令 | 进入 ThemePicker | ☐ |
| A20 | `/onboarding trust` | 子命令 | 清 trust dialog flag | ☐ |
| A21 | `/onboarding reset` | 子命令 | 清 hasCompletedOnboarding，下次启动重跑 | ☐ |
| A22 | `/recap` | 直接跑 | 一行 ≤40 字 session recap | ☐ |
| A23 | `/away` `/catchup` | aliases of recap | 同 A22 | ☐ |
| A24 | `/usage` | 直接跑 | 合并 cost + stats（Settings/Usage 或 Stats panel） | ☐ |
| A25 | `/cost` `/stats` | aliases of usage | 同 A24 | ☐ |
| A26 | `/summary` | 直接跑 | 调 manuallyExtractSessionMemory + 显示 summary.md | ☐ |

**A 组失败诊断**：
- 命令找不到 → 检查 dist staleness + 重启 REPL
- `feature() unsupported` → `bun run build` 时 feature flag 没注入

---

## B 组 — GitHub CLI（需 `gh auth login`）

**前置**：`gh auth status` 显示 logged-in；fork 仓库要有 issues enabled

| # | 命令 | 输入 | 期望输出 | 通过 |
|---|---|---|---|---|
| B1 | `/share` | 默认 secret gist | 调 `gh gist create`，输出 gist URL | ☐ |
| B2 | `/share --public` | flag | public gist | ☐ |
| B3 | `/share --mask-secrets` | flag | redact `sk-ant-*` `Bearer *` `ghp_*` 等模式 | ☐ |
| B4 | `/share --summary-only` | flag | 仅前 200 字/turn | ☐ |
| B5 | `/share --allow-public-fallback` | flag | gh 失败 → 0x0.st fallback | ☐ |
| B6 | `/issue Fix login bug` | title 参数 | 调 `gh issue create`，rich body 含最近 5 turns + errors | ☐ |
| B7 | `/issue --label bug --assignee me <title>` | 多 flag | label + assignee 生效 | ☐ |
| B8 | `/issue` （仓库 issues disabled）| — | 自动降级到 GitHub Discussions | ☐ |
| B9 | `/commit` | 直接跑（有 staged） | 生成 commit message 草稿 | ☐ |
| B10 | `/commit-push-pr` | 直接跑 | commit + push + 创建 PR | ☐ |

**B 组失败诊断**：
- `gh: command not found` → 装 https://cli.github.com/
- `gh auth status` 未登录 → `gh auth login`
- issues disabled → 看是否降级到 discussion

---

## C 组 — Subscription OAuth（已 `/login` claude.ai）

**前置**：`/login` 完成 claude.ai OAuth；`/login` 显示 `☑ Subscription`

| # | 命令 | 输入 | 期望输出 | 通过 |
|---|---|---|---|---|
| C1 | `/login` | 无参 | **3 plane summary**：☑ Subscription、☐/☑ Workspace API key、4 third-party providers（PR-4 新增） | ☐ |
| C2 | `/teleport` | 无参 | 列最近 sessions（list-style picker） | ☐ |
| C3 | `/teleport <session-uuid>` | 参数 | resume from claude.ai | ☐ |
| C4 | `/tp <session-uuid>` | alias | 同 C3 | ☐ |
| C5 | `/teleport <session-uuid> --print` | flag | print mode 直接输出 session URL | ☐ |
| C6 | `/autofix-pr 386` | PR# | CCR 派发，输出 sessionUrl | ☐ |
| C7 | `/autofix-pr stop` | 子命令 | 停止 active monitor | ☐ |
| C8 | `/autofix-pr anthropics/claude-code#999` | cwd 不匹配 | 拒绝 `repo_mismatch`（不真创建会话） | ☐ |
| C9 | `/schedule list` | 子命令 | `/v1/code/triggers` GET，返回 `data:[]` 或 trigger 列表 | ☐ |
| C10 | `/schedule create <cron> <prompt>` | 子命令 | POST，cron expr UTC 验证 | ☐ |
| C11 | `/schedule run <id>` | 子命令 | POST /run 立即触发 | ☐ |
| C12 | `/schedule update <id> <field> <value>` | 子命令 | **POST**（不是 PATCH） | ☐ |
| C13 | `/cron list` `/triggers list` | aliases | 同 C9 | ☐ |
| C14 | `/init-verifiers` | 无参 | 创建项目 verifier skills | ☐ |
| C15 | `/bridge-kick` | 无参 | bridge 故障注入测试 | ☐ |
| C16 | `/subscribe-pr` | 无参 | 列本地 `~/.claude/pr-subscriptions.json` | ☐ |
| C17 | `/ultrareview <PR#>` | 参数 | preflight gate（v1 已有） | ☐ |

**C 组失败诊断**：
- 401 → 重 `/login`
- `/v1/agents` 类 401 → 这些是 workspace endpoint，**预期会失败**，移到 F 组
- `/schedule` 401 → 检查 dist 含 `ccr-triggers-2026-01-30` beta header

---

## D 组 — _（已删除 2026-05-06）_

`/providers` 命令在 2026-05-06 移除。理由:与 fork 原生 `/login` 的 "Anthropic Compatible Setup" form 功能重叠（同样配 OpenAI-compat Base URL + API Key），保留单一入口避免双 UI 混淆。

**第三方 provider 配置请用** `/login` 内的 form:选 provider 后填 Base URL + API Key + Haiku/Sonnet/Opus 类别按钮。

`src/services/providerRegistry/*` utility 模块 **保留**（4 内置 cerebras/groq/qwen/deepseek 元数据 + DeepSeek 三模式 compatMatrix），可被未来 fork form 的 "Quick Select" enhancement 复用。

---


## E 组 — 本地兜底（PR-3 新增，订阅用户无 key 也能用）

**前置**：无

### E.1 `/local-vault`（OS keychain + AES fallback）

| # | 命令 | 输入 | 期望输出 | 通过 |
|---|---|---|---|---|
| E1 | `/local-vault list` | 无参 | 空列表（首次） | ☐ |
| E2 | `/local-vault set test-key foo-secret-value` | 写 secret | onDone 显示 `[REDACTED]`，**不**显示原值 | ☐ |
| E3 | `/local-vault list` | 再跑 | 显示 `test-key`（不含 value） | ☐ |
| E4 | `/local-vault get test-key` | 默认 mask | `foo-...e (16 chars)` 类似格式 | ☐ |
| E5 | `/local-vault get test-key --reveal` | 明文 + 警告 | `foo-secret-value` + 警告 "secret revealed in terminal" | ☐ |
| E6 | `/local-vault set bad-key C:hack` | path traversal | 拒绝（CRITICAL E1 修复） | ☐ |
| E7 | `/local-vault set ../traverse foo` | path traversal | 拒绝 | ☐ |
| E8 | `/local-vault delete test-key` | 删 | OK | ☐ |
| E9 | `/lv list` | alias | 同 E1 | ☐ |

**安全验证**：
```bash
# E1 加密文件存在 + value 不明文
ls ~/.claude/local-vault.enc.json
cat ~/.claude/local-vault.enc.json | grep -c "foo-secret-value"  # 必须是 0
# salt 16 字节存在
cat ~/.claude/local-vault.enc.json | grep "_salt"
```

### E.2 `/local-memory`（多 store 持久化）

| # | 命令 | 输入 | 期望输出 | 通过 |
|---|---|---|---|---|
| E10 | `/local-memory list` | 无参 | 空 | ☐ |
| E11 | `/local-memory create my-store` | 创建 | `~/.claude/local-memory/my-store/` 建好 | ☐ |
| E12 | `/local-memory store my-store key1 value1` | 写 entry | OK | ☐ |
| E13 | `/local-memory fetch my-store key1` | 读 | `value1` | ☐ |
| E14 | `/local-memory entries my-store` | 列 | `[key1]` | ☐ |
| E15 | `/local-memory store my-store ../escape foo` | path traversal | 拒绝 | ☐ |
| E16 | `/local-memory archive my-store` | 改名 | dir 改为 `my-store.archived` | ☐ |
| E17 | `/lm list` | alias | 同 E10 | ☐ |

**E 组失败诊断**：
- AES 错 passphrase → 提示重新 setSecret
- keychain 不可用 → 自动 fallback 文件（warn 一次）
- path traversal 接受 → audit-fix-all-40 修复未生效，重新 build

---

## F 组 — Workspace API key（需配 `ANTHROPIC_API_KEY=sk-ant-api03-*`）

**前置**：
1. 从 https://console.anthropic.com/settings/keys 创建 API key（`sk-ant-api03-*`）
2. Windows: `setx ANTHROPIC_API_KEY "sk-ant-api03-..."` 持久化
3. **完全退出 dev REPL**（Ctrl+D / `/quit`） + 启动新 shell（让 setx 生效）+ `bun run dev`
4. 验证：`/login` 应显示 `☑ Workspace API key  ANTHROPIC_API_KEY set`

| # | 命令 | 输入 | 期望输出 | 通过 |
|---|---|---|---|---|
| F1 | `/help`（配 key 后） | — | 4 命令 `/agents-platform` `/vault` `/memory-stores` `/skill-store` 出现（之前 isHidden:true） | ☐ |
| F2 | `/help`（不配 key） | — | 4 命令**不**出现（动态 isHidden） | ☐ |
| F3 | `/agents-platform list` | 无参 | `/v1/agents` GET 200，返回 agents 数组 | ☐ |
| F4 | `/vault list` | 无参 | `/v1/vaults` GET 200 | ☐ |
| F5 | `/vault create test-vault` | 子命令 | 创建 vault | ☐ |
| F6 | `/vault add-credential <vault_id> api-key sk-secret` | 子命令 | onDone 显示 `[REDACTED]`，stdout grep 不到 `sk-secret` | ☐ |
| F7 | `/memory-stores list` | 无参 | `/v1/memory_stores` GET，beta `managed-agents-2026-04-01` | ☐ |
| F8 | `/memory-stores create test-store` | 子命令 | POST | ☐ |
| F9 | `/memory-stores update-memory <id> <mid> "new"` | 子命令 | **PATCH**（不是 POST） | ☐ |
| F10 | `/skill-store list` | 无参 | `/v1/skills?beta=true` GET | ☐ |
| F11 | `/skill-store install <id>` | 子命令 | 写 `~/.claude/skills/<name>/SKILL.md` | ☐ |
| F12 | 错配（API key 不是 `sk-ant-api03-*` 前缀） | 配错 key | 友好错（不 401） | ☐ |
| F13 | 不配 key 时调 `/vault list`（手动 `/help` 找不到，但直接输入命令名） | — | 501 + 文案 "ANTHROPIC_API_KEY required" | ☐ |

**F 组失败诊断**：
- 401 with workspace key → key 没生效（重启 REPL + 检查 `echo $ANTHROPIC_API_KEY`）
- 命令仍 isHidden → dist staleness（rebuild + 重启）
- credential value 出现在 stdout → audit fix 未生效

---

## 全过验收标准

- [ ] A 组 26/26 pass
- [ ] B 组 ≥8/10 pass（有 gh + 仓库权限的）
- [ ] C 组 ≥10/17 pass（订阅环境完整）
- [ ] D 组 8/8 pass
- [ ] E 组 17/17 pass（path traversal 必须拒绝）
- [ ] F 组 ≥10/13 pass（取决于 workspace key 是否配）

任何 fail 立即报告：命令 + 实际输出 + 期望输出。我针对 fail 立即修。

---

## 已知限制

| 命令 | 限制 |
|---|---|
| `/teleport` 无参 picker | 用 list-style 不是 Ink `<SelectInput>`（LocalJSXCommandCall 不能 mid-call suspend） |
| `/autofix-pr` cross-repo | 仅元数据，git source 仍来自 cwd（`repo_mismatch` 显式拒绝跨 cwd） |
| `/skill-store install` | 写到 `~/.claude/skills/`，fork 主流程不自动 load 该目录的 markdown skills（用户手动用） |
| `/providers use <id>` | 输出 shell export 命令，**不**自动 mutate runtime（重启生效） |

---

## 测试报告模板

```markdown
## 测试报告 - 2026-05-XX

### 环境
- OS: Windows 11
- Bun: <version>
- dist mtime: <date>
- HEAD: <commit-hash>
- ANTHROPIC_API_KEY: 配/未配
- gh CLI: 装/未装

### 结果
- A: 26/26 ✅
- B: 8/10（B5/B8 fail）
- C: 12/17（C5/C13/C14/C15/C16 fail）
- D: 8/8 ✅
- E: 17/17 ✅
- F: 12/13（F12 边界）

### 失败详情
B5: <command> → 实际 <output>，期望 <expected>
...
```
