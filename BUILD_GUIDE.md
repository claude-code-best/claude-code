# Claude Code 编译指南

## 环境要求

- **Bun** >= 1.3.x（必须，Node.js 不支持 `bun build --compile`）
- **Git**（用于下载依赖和源码管理）
- **Windows/Linux/macOS**（本仓库已在 Windows 下验证）

安装 Bun：
```powershell
powershell -ExecutionPolicy Bypass -c "irm bun.sh/install.ps1 | iex"
```

---

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/claude-code-best/claude-code.git
cd claude-code
```

### 2. 安装依赖

```bash
bun install
```

> 安装时会自动运行 `postinstall` 脚本，下载 ripgrep 二进制文件（`scripts/postinstall.cjs`）。

### 3. 编译

#### 方式一：编译为可分发的 JS 包（输出 `dist/`）

```bash
bun run build
```

产物：`dist/` 目录下多个 `.js` chunk 文件，需要配合 Bun 或 Node.js 运行。

#### 方式二：编译为独立可执行文件（输出 `claude.exe`）

```bash
bun run compile
```

产物：`claude.exe`（Windows）或 `claude`（Linux/macOS），约 143 MB，可独立运行，无需安装 Bun。

#### 方式三：开发模式（热重载）

```bash
bun run dev
```

---

## 构建产物说明

| 产物 | 命令 | 用途 | 大小 |
|------|------|------|------|
| `dist/` | `bun run build` | JS 分发包，配合 Bun/Node 运行 | ~35 MB |
| `claude.exe` | `bun run compile` | 独立可执行文件，无需运行时 | ~143 MB |

---

## 编译脚本详解

### `build.ts` — JS 版本

Bun bundler 将 TypeScript/TSX 源码打包为可在 Bun/Node 运行的 JS。

**默认启用的 Feature Flags：**

```
AGENT_TRIGGERS_REMOTE   — 远程 Agent 触发
CHICAGO_MCP            — Computer Use MCP
VOICE_MODE             — 语音模式
SHOT_STATS             — 截图统计
PROMPT_CACHE_BREAK_DETECTION — Prompt 缓存检测
TOKEN_BUDGET           — Token 预算
AGENT_TRIGGERS         — P0 本地功能
ULTRATHINK             — 深度思考
BUILTIN_EXPLORE_PLAN_AGENTS — 内置探索计划 Agent
LODESTONE              — LODESTONE 功能
EXTRACT_MEMORIES       — P1 API 相关
VERIFICATION_AGENT     — 验证 Agent
KAIROS_BRIEF           — KAIROS 摘要
AWAY_SUMMARY           — 离开摘要
ULTRAPLAN              — 超计划
DAEMON                 — P2 守护进程 + 远程控制
```

启用额外功能（通过环境变量）：

```bash
FEATURE_MY_FEATURE=1 bun run build
```

**构建步骤：**
1. 清理 `dist/` 目录
2. `Bun.build` 打包为 bun target，启用代码分割
3. 后处理：替换 `import.meta.require` 为 Node.js 兼容版本
4. 复制 `vendor/audio-capture/` 原生模块到 `dist/`
5. 打包 `scripts/download-ripgrep.ts` 为独立 JS

---

### `compile.ts` — Native 版本

通过 `bun build --compile` 生成独立的可执行文件。

**构建步骤：**

1. **生成 ripgrep base64** — 将 ripgrep 二进制 base64 编码为 TypeScript 字符串，写入 `src/utils/ripgrepAssetBase64.ts`。只嵌入当前平台，减少 exe 体积。

2. **Patch SDK cli.js** — 修补 `@anthropic-ai/claude-agent-sdk` 中的 ripgrep 路径逻辑，将 `import.meta.url` 替换为 `process.execPath`（在编译后 `import.meta.url` 不可用）。

3. **执行 `bun build --compile`** — 传入以下参数：
   - `--define BUNDLED_MODE:"true"` — 告知运行时处于编译模式
   - `--feature CHICAGO_MCP` — 强制启用 MCP（否则 native 模块会被 tree-shake）
   - 原生模块路径通过环境变量注入（让 Bun 将 `.node` 文件嵌入为 asset）

4. **原生模块嵌入**（通过 `XXX_NODE_PATH` 环境变量）：

   ```
   AUDIO_CAPTURE_NODE_PATH      → vendor/audio-capture/x64-win32/audio-capture.node
   IMAGE_PROCESSOR_NODE_PATH     → vendor/image-processor/x64-win32/image-processor.node
   MODIFIERS_NODE_PATH           → vendor/modifiers-napi/x64-darwin/modifiers.node
   URL_HANDLER_NODE_PATH         → vendor/url-handler/x64-darwin/url-handler.node
   ```

   > macOS-only 的 `.node` 文件仍会被打包（即使在 Windows 下），运行时检测平台后跳过。

---

## 常见问题

### 1. `Could not resolve: @anthropic/ink`

```bash
bun install
```

需要先安装依赖，`@anthropic/ink` 是 workspace 包，`bun install` 会自动 link。

### 2. `Warning: SDK patch did not match`

正常，不影响运行。SDK 的内部结构可能有细微变化，但 ripgrep 在编译后走 base64 解码路径，不依赖 SDK 的这个文件。

### 3. 编译速度慢

- 首次编译慢（需下载 SDK 和 ripgrep）
- 后续编译通过 `bun install` 复用缓存
- ripgrep base64 每次编译都会重新生成（正常）

### 4. Windows 下 `claude.exe` 生成到错误目录

`compile.ts` 已通过 `Bun.spawn` 解决此问题，直接用 `bun build --compile` 在 Windows 上可能有此 bug。

### 5. 缺少某些工具/技能

这是**反编译版本的固有限制**，以下模块在编译时被 strip 或 tree-shake 掉了，无法通过重新编译补回：
- `skills/bundled/` 目录
- `commands/torch.js`
- `commands/subscribe-pr.js`
- 部分 PushNotification / CtxInspect / ListPeers 工具

---

## monorepo 结构

```
claude-code/
├── src/                          # 主源码
│   ├── entrypoints/cli.tsx       # CLI 入口
│   ├── commands/                 # 斜杠命令实现
│   ├── tools/                    # 工具实现
│   └── utils/                    # 工具函数
├── packages/@ant/                # 子包
│   ├── ink/                      # Ink 终端 UI 组件库（核心）
│   ├── computer-use-mcp/         # Computer Use MCP
│   ├── computer-use-swift/       # macOS Swift 集成
│   └── computer-use-input/       # 输入处理
├── vendor/                       # 原生模块（.node）
│   ├── audio-capture/
│   ├── image-processor/
│   └── modifiers-napi/
├── scripts/                      # 构建/维护脚本
│   ├── dev.ts                    # 开发启动
│   ├── dev-debug.ts              # 带调试的启动
│   ├── download-ripgrep.ts       # ripgrep 下载（TS 版）
│   ├── postinstall.cjs           # postinstall（CJS 版，bun install 用）
│   └── defines.ts                # 宏定义
├── dist/                         # JS 版本构建产物
├── build.ts                      # JS 版本构建脚本
└── compile.ts                    # Native 版本构建脚本
```

---

## 一键完整构建

```bash
# 清理 + 安装 + 构建 JS + 编译 native
rm -rf dist && bun install && bun run build && bun run compile

# 验证 exe 可运行（显示帮助）
./claude.exe --help
```

---

## 自动化构建（定时更新）

参考以下 cron 任务配置（每 2 小时）：

```
0 */2 * * *  bun install && bun run build && bun run compile
```

> 注意：需确保 ripgrep 下载网络畅通，国内可通过设置 `RIPGREP_DOWNLOAD_BASE` 环境变量指向镜像。
