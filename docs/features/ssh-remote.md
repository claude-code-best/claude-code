# SSH Remote — 远程主机运行 Claude Code

## 概述

SSH Remote 提供两种方式在远程 Linux 主机上运行 Claude Code：

1. **SSH Remote 模块**（`ccb ssh <host>`）— 本地 REPL + 远程工具执行，自动部署二进制 + 认证隧道
2. **直接 SSH 运行**（`ssh <host> -t ccb`）— 远程已安装 ccb，直接启动交互式会话

## 架构

### 方式一：SSH Remote 模块（完整模式）

适用场景：远端没有 API 凭据或没有安装 ccb。

```
┌──────────────── 本地 Windows/Mac/Linux ───────────┐
│                                                    │
│  ccb ssh <host> [dir]                              │
│     │                                              │
│     ├── 1. SSHProbe: 探测远端平台/架构/已有二进制    │
│     ├── 2. SSHDeploy: 部署 dist/ 到远端             │
│     ├── 3. SSHAuthProxy: 启动本地认证代理            │
│     │      ├─ Unix Socket (Linux/Mac)              │
│     │      └─ TCP 127.0.0.1:<port> (Windows)       │
│     │                                              │
│     └── 4. SSH -R 反向隧道 + 启动远端 CLI            │
│            ssh -R <remote>:<local> <host> \         │
│                ANTHROPIC_BASE_URL=... \             │
│                ANTHROPIC_AUTH_NONCE=... \            │
│                ccb --output-format stream-json      │
│                                                    │
│  ┌─────── 本地 REPL (Ink TUI) ───────┐             │
│  │ 用户输入 → NDJSON → SSH stdin     │             │
│  │ SSH stdout → NDJSON → 渲染消息    │             │
│  │ 工具权限请求 → 本地审批 → 回传    │             │
│  └────────────────────────────────────┘             │
└────────────────────────────────────────────────────┘
                        │
                        │ SSH 连接 (加密通道)
                        │
┌───────────────── 远端 Linux ──────────────────────┐
│                                                    │
│  ccb (自动部署或已存在)                              │
│     ├── --output-format stream-json                │
│     ├── --input-format stream-json                 │
│     ├── --verbose -p                               │
│     │                                              │
│     ├── API 请求 → ANTHROPIC_BASE_URL              │
│     │   → SSH 反向隧道 → 本地 AuthProxy             │
│     │   → 注入真实凭据 → api.anthropic.com          │
│     │                                              │
│     └── 工具执行 (Bash/Read/Write/...)              │
│         直接在远端文件系统上操作                      │
└────────────────────────────────────────────────────┘
```

### 方式二：直接 SSH 运行（简单模式）

适用场景：远端已安装 ccb 且已有 API 凭据（订阅或 API Key）。

```
┌─────── 本地终端 ───────┐          ┌──────── 远端 Linux ────────┐
│                         │   SSH    │                             │
│  ssh <host> -t ccb      │ ──────→  │  ccb (全局安装)              │
│                         │          │    ├── 使用远端自身凭据       │
│  终端直接显示远端 TUI    │  ←────── │    ├── 远端文件系统操作       │
│                         │   TTY    │    └── API 直连 Anthropic    │
└─────────────────────────┘          └─────────────────────────────┘
```

### 适用场景对比

| | SSH Remote 模块 | 直接 SSH 运行 |
|---|---|---|
| 远端需要安装 ccb | 不需要（自动部署） | 需要 |
| 远端需要 API 凭据 | 不需要（本地隧道） | 需要 |
| 本地需要安装 ccb | 需要 | 不需要（任何终端） |
| 斜杠命令 | 本地处理 | 远端处理 |
| 网络延迟敏感 | 高（NDJSON 双向） | 低（仅 TTY） |
| 推荐场景 | 远端无凭据/无安装 | 远端已配置完整 |

---

## 前置准备：SSH 密钥配置

两种方式都依赖 SSH 免密连接。以下是完整的密钥配置步骤。

### 1. 生成 SSH 密钥对（本地）

```bash
# 生成 Ed25519 密钥（推荐）
ssh-keygen -t ed25519 -C "your-email@example.com" -f ~/.ssh/id_remote

# 或 RSA 4096 位
ssh-keygen -t rsa -b 4096 -C "your-email@example.com" -f ~/.ssh/id_remote
```

生成两个文件：
- `~/.ssh/id_remote` — 私钥（不可泄露）
- `~/.ssh/id_remote.pub` — 公钥（部署到远端）

### 2. 将公钥部署到远端

```bash
# 方式 A：ssh-copy-id（推荐）
ssh-copy-id -i ~/.ssh/id_remote.pub user@remote-host

# 方式 B：手动复制
cat ~/.ssh/id_remote.pub | ssh user@remote-host "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

### 3. 配置 SSH Config（本地）

编辑 `~/.ssh/config`（不存在则创建）：

```
Host my-server
    HostName 192.168.1.100       # 远端 IP 或域名
    User root                     # 远端用户名
    IdentityFile ~/.ssh/id_remote # 私钥路径
    ServerAliveInterval 60        # 防止连接超时断开
    ServerAliveCountMax 3
```

配置后可直接用别名连接：

```bash
ssh my-server          # 等同于 ssh -i ~/.ssh/id_remote root@192.168.1.100
```

### 4. 文件权限设置

#### Linux / macOS

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/config
chmod 600 ~/.ssh/id_remote
chmod 644 ~/.ssh/id_remote.pub
```

#### Windows（OpenSSH 强制 ACL 检查）

```powershell
# 重置 .ssh 目录权限：仅允许当前用户 + SYSTEM
icacls "$env:USERPROFILE\.ssh" /inheritance:r /grant:r "$($env:USERNAME):(OI)(CI)F" /grant "SYSTEM:(OI)(CI)F"

# 修复 config 文件权限
icacls "$env:USERPROFILE\.ssh\config" /inheritance:r /grant:r "$($env:USERNAME):F" /grant "SYSTEM:F"

# 修复私钥权限
icacls "$env:USERPROFILE\.ssh\id_remote" /inheritance:r /grant:r "$($env:USERNAME):F" /grant "SYSTEM:F"
```

> **Windows 常见错误**：如果 `icacls` 显示 `UNKNOWN\UNKNOWN` ACL 条目，需要先移除再重新授权。权限错误会导致 SSH 拒绝使用密钥。

### 5. 验证免密连接

```bash
ssh my-server "echo 'SSH connection OK'"
# 应直接输出 "SSH connection OK"，不要求输入密码
```

---

## 使用方式

### 方式一：SSH Remote 模块

```bash
# 基本用法 — 自动探测、部署、启动
ccb ssh user@remote-host

# 使用 SSH Config 别名
ccb ssh my-server

# 指定远端工作目录
ccb ssh my-server /home/user/project

# 使用自定义远端二进制（跳过探测/部署）
ccb ssh my-server --remote-bin "bun /opt/ccb/dist/cli.js"

# 权限控制
ccb ssh my-server --permission-mode auto
ccb ssh my-server --dangerously-skip-permissions

# 恢复远端会话
ccb ssh my-server --continue
ccb ssh my-server --resume <session-uuid>

# 选择模型
ccb ssh my-server --model claude-sonnet-4-6-20250514

# 本地测试模式（不连接远端，测试 auth proxy 管道）
ccb ssh localhost --local
```

### 方式二：直接 SSH 运行

```bash
# 启动交互式会话
ssh my-server -t ccb

# 指定工作目录
ssh my-server -t "ccb --cwd /home/user/project"

# 使用特定模型
ssh my-server -t "ccb --model claude-sonnet-4-6-20250514"
```

---

## 构建与部署

### 构建产物

```bash
# 安装依赖
bun install

# 构建（输出到 dist/）
bun run build
```

产物说明：

| 文件 | 说明 |
|------|------|
| `dist/cli.js` | Bun 入口（`#!/usr/bin/env bun`） |
| `dist/cli-node.js` | Node.js 入口（`#!/usr/bin/env node` → `import ./cli.js`） |
| `dist/cli-bun.js` | Bun 专用入口 |
| `dist/chunk-*.js` | 代码分割 chunk 文件（约 668 个） |

### 运行方式

```bash
# 方式 A：通过 bun 直接运行（开发/调试）
bun run dev

# 方式 B：运行构建产物（bun 运行时）
bun dist/cli.js

# 方式 C：运行构建产物（node 运行时）
node dist/cli-node.js

# 方式 D：全局安装后使用命令名
ccb
```

### 全局安装

在项目根目录执行：

```bash
# bun 全局安装（推荐）
bun install -g .

# 创建的命令：
#   ccb            → dist/cli-node.js
#   ccb-bun        → dist/cli-bun.js
#   claude-code-best → dist/cli-node.js

# 安装位置：~/.bun/bin/ccb
```

或使用 npm：

```bash
npm install -g .
```

验证：

```bash
ccb --version
# → x.x.x (Claude Code)
```

### 远端部署（全流程）

```bash
# 1. 登录远端
ssh my-server

# 2. 克隆或同步项目代码
git clone <repo-url> ~/ccb-project
cd ~/ccb-project

# 3. 安装运行时（如果没有 bun）
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# 4. 安装依赖 + 构建
bun install
bun run build

# 5. 全局安装
bun install -g .

# 6. 确保非交互式 SSH 可访问 ccb 命令
#    bun install -g 安装到 ~/.bun/bin/，但非交互式 SSH 不加载 .bashrc，
#    所以 PATH 中不包含 ~/.bun/bin/
#    解决方式（任选其一）：

# 方式 A：符号链接到系统 PATH（推荐）
ln -sf ~/.bun/bin/ccb /usr/local/bin/ccb

# 方式 B：添加到 /etc/profile.d/（所有用户生效）
echo 'export PATH="$HOME/.bun/bin:$PATH"' > /etc/profile.d/bun-path.sh

# 方式 C：添加到 ~/.bash_profile（当前用户，ssh -t 时生效）
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bash_profile

# 7. 验证
ccb --version

# 8. 从本地测试
# （在本地终端）
ssh my-server -t ccb
```

### SSH Remote 自动部署

使用 `ccb ssh <host>` 时，模块自动处理：

1. **SSHProbe** 探测远端 `~/.local/bin/claude` 或 `command -v claude`
2. 若二进制不存在或版本不匹配，**SSHDeploy** 通过 `scp` 传输 `dist/` 目录
3. 在远端创建 wrapper 脚本（`~/.local/bin/claude`）
4. 无需手动安装

---

## 模块结构

```
src/ssh/
├── createSSHSession.ts     — 会话工厂：编排 probe → deploy → proxy → spawn
├── SSHSessionManager.ts    — 双向 NDJSON 通信管理 + 权限转发 + 重连
├── SSHAuthProxy.ts         — 本地认证代理（API 凭据隧道）
├── SSHProbe.ts             — 远端主机探测（平台/架构/已有二进制）
├── SSHDeploy.ts            — 远端二进制部署（scp + wrapper 脚本）
└── __tests__/
    └── SSHSessionManager.test.ts  — 17 个单元测试
```

## 关键技术细节

### 认证隧道

- **AuthProxy** 在本地监听（Unix socket 或 TCP），接收远端 CLI 的 API 请求
- 通过 SSH `-R` 反向端口转发隧道到远端
- AuthProxy 注入本地真实凭据（API key 或 OAuth token），转发到 `api.anthropic.com`
- `ANTHROPIC_AUTH_NONCE` header 防止未授权访问（nonce 通过环境变量传递给远端 CLI，远端 CLI 在每个 API 请求中携带此 header）

### waitForInit vs 存活检查

- **标准模式**：`waitForInit` 等待远端 CLI 发送 `{type:'system', subtype:'init'}` JSON 消息
- **`--remote-bin` 模式**：跳过 `waitForInit`（print+stream-json 模式下 init 只在首次查询后发送），改用 3 秒进程存活检查

### 重连机制

- `SSHSessionManager` 检测 SSH 连接断开后自动重连
- 重连时在远端 CLI 命令中追加 `--continue` 恢复会话
- 指数退避重试（最多 5 次，间隔 1s → 2s → 4s → 8s → 16s）

## Feature Flag

SSH Remote 功能受 `SSH_REMOTE` feature flag 控制：

- **Dev 模式**：默认启用
- **Build 模式**：需在 `build.ts` 的 `DEFAULT_BUILD_FEATURES` 中添加 `'SSH_REMOTE'`
- **运行时**：`FEATURE_SSH_REMOTE=1` 环境变量

---

## 常见问题

### `ccb: command not found`（SSH 远程执行时）

非交互式 SSH 不加载 `.bashrc`，`~/.bun/bin` 不在 PATH 中。

```bash
# 解决：创建符号链接
ln -sf ~/.bun/bin/ccb /usr/local/bin/ccb
```

### SSH 密钥被拒绝

```
Permission denied (publickey)
```

1. 确认公钥已添加到远端 `~/.ssh/authorized_keys`
2. 确认本地私钥文件权限正确（`chmod 600`）
3. 确认 `~/.ssh/config` 中 `IdentityFile` 路径正确
4. Windows 用户检查 ACL 权限（见上方 Windows 权限设置）

### SSH 连接超时

```
ssh: connect to host x.x.x.x port 22: Connection timed out
```

1. 确认远端 SSH 服务正在运行：`systemctl status sshd`
2. 确认防火墙允许 22 端口
3. 确认 IP 地址/域名正确
4. 在 `~/.ssh/config` 中添加 `ConnectTimeout 10`

### 403 Forbidden（SSH Remote 模块）

AuthProxy 的 nonce 验证失败。确认：
1. 远端 CLI 版本包含 nonce header 注入修复
2. `ANTHROPIC_AUTH_NONCE` 环境变量正确传递到远端
3. `src/services/api/client.ts` 中 `x-auth-nonce` header 已启用

### 远端 CLI 启动后立即退出

```
Remote process exited immediately (code 1)
```

1. 确认远端 `bun` / `node` 运行时可用
2. 手动在远端执行 `ccb --version` 验证安装
3. 检查 `--remote-bin` 路径是否正确
4. 查看 stderr 输出获取详细错误信息
