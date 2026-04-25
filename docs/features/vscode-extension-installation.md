# VS Code 插件安装指南

本文面向需要安装 `CCB - Claude Code Best` VS Code 插件的用户。

插件本身是 VS Code 侧边栏 UI；实际 agent 由本机的 CCB/Claude Code Best CLI 进程提供。安装插件前，建议先确认 CLI 可以在当前机器运行。

## 安装前准备

1. 安装 VS Code `1.85.0` 或更高版本。
2. 安装并构建本项目 CLI，或准备一个可执行的 CCB CLI 路径。
3. 在终端中确认 CLI 可运行：

```powershell
ccb --version
```

如果系统没有 `ccb` 命令，也可以在插件设置里手动配置 `ccb.cliPath` 指向 CLI 可执行文件。

## 方式一：安装 VSIX 包

如果你拿到的是发布者提供的 `.vsix` 文件，这是推荐给普通用户的安装方式。

### VS Code 界面安装

1. 打开 VS Code。
2. 打开 Extensions 视图。
3. 点击右上角 `...`。
4. 选择 `Install from VSIX...`。
5. 选择发布者提供的 `.vsix` 文件。
6. 完全退出 VS Code 后重新打开。

### 命令行安装

Windows PowerShell:

```powershell
code --install-extension .\ccb-vscode-0.3.0.vsix --force
```

macOS/Linux:

```bash
code --install-extension ./ccb-vscode-0.3.0.vsix --force
```

安装后重新打开 VS Code，左侧 Activity Bar 应出现 `CCB` 图标。

## 方式二：从源码安装到本机 VS Code

这是开发者或内测用户使用的方式。它会把 `packages/vscode-extension` 链接到本机 VS Code 扩展目录。

在仓库根目录先构建 CLI：

```powershell
bun run build
```

然后构建并安装 VS Code 插件。

Windows:

```powershell
cd packages\vscode-extension
bun run install-local:win
```

macOS/Linux:

```bash
cd packages/vscode-extension
bun run install-local
```

安装完成后必须完全退出 VS Code，再重新打开。只执行 `Reload Window` 不一定能更新扩展宿主进程中的旧代码。

## 配置 CLI 路径

插件默认使用：

```text
ccb.cliPath = auto
```

`auto` 会按以下优先级探测 CLI：

1. 当前仓库构建产物。
2. 开发入口。
3. `PATH` 中的 `ccb` / `claude-code-best` 命令。

如果自动探测失败，在 VS Code 设置中搜索 `CCB: Cli Path`，填入明确路径。

示例：

```json
{
  "ccb.cliPath": "E:\\Source_code\\Claude-code-bast-vscode-extension\\dist\\cli-node.js"
}
```

## 基础验证

安装后按以下步骤确认插件可用：

1. 打开一个项目文件夹。
2. 点击左侧 `CCB` 图标。
3. 输入 `/help`，确认能返回斜杠菜单说明。
4. 输入 `/login`，确认能看到登录 provider 选项。
5. 输入 `/mcp`，确认能列出 MCP servers。
6. 如果需要 Chrome MCP，输入：

```text
/mcp tools claude-in-chrome
```

正常情况下应能看到 `tabs_context_mcp` 等 Chrome MCP 工具。

## 发布包不包含源码

发布 VSIX 时使用 `packages/vscode-extension/.vscodeignore` 控制包内容。

当前发布包只包含：

```text
package.json
resources/icon.svg
dist/webview.js
dist/extension.js
```

不会包含：

```text
src/
webview/
scripts/
node_modules/
tsconfig.json
esbuild.config.mjs
*.map
```

发布前可在 `packages/vscode-extension` 下运行：

```powershell
npx @vscode/vsce ls --no-dependencies
```

确认 VSIX 内容仍然只有 manifest、资源和编译产物。

## 卸载

VS Code 界面卸载：

1. 打开 Extensions。
2. 搜索 `CCB - Claude Code Best`。
3. 点击 Uninstall。
4. 重启 VS Code。

命令行卸载：

```powershell
code --uninstall-extension claude-code-best.ccb-vscode
```

如果使用源码本地安装脚本，Windows 下扩展目录通常是：

```text
C:\Users\<用户名>\.vscode\extensions\claude-code-best.ccb-vscode-0.3.0
```

删除该目录或 junction 后重启 VS Code 即可。
