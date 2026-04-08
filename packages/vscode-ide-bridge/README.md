# VSCode IDE Bridge

这是一个给当前仓库配套的本地 VSCode 扩展，用来把 VSCode 和现有 Claude Code CLI 的 `ws-ide` 链路接起来。

## 当前能力

- 在本地 `127.0.0.1` 启动 `ws-ide` WebSocket 服务
- 写出 CLI 可发现的 `~/.claude/ide/<port>.lock`
- 把 VSCode 当前活动文件和选区变化发送为 `selection_changed`
- 实现 `openDiff`、`close_tab`、`closeAllDiffTabs` 三个 IDE MCP tools
- 提供 `Claude Code Bridge: Restart` 和 `Claude Code Bridge: Show Status` 两个调试命令

## 当前限制

- diff 现在支持通过保存右侧文件把修改回传给 CLI，但还没有补“未保存直接接受右侧手工编辑”这类更细的交互
- 还没有补 `openFile`、`getDiagnostics`、`at_mentioned`、`log_event` 这些附加能力
- 目前按单个活动 CLI 连接设计，新连接会替换旧连接

## 本地使用

推荐把这个目录单独当成一个扩展工程来打开，而不是总是从 monorepo 根目录调试。

1. 在 VSCode 中直接打开 `packages/vscode-ide-bridge`
2. 打开“运行和调试”
3. 二选一：
   - `Run VSCode IDE Bridge`
   - `Run VSCode IDE Bridge (Open Claude Code Root)`，会直接在测试窗口里打开 monorepo 根目录
4. 这会自动先执行 `Build VSCode IDE Bridge`
5. 如果用了第一个启动项，就在新开的 Extension Development Host 窗口中再打开你真正要联调的目标工作区
   如果用了第二个启动项，会直接打开 `claude-code` 根目录
6. 打开命令面板，执行 `Claude Code Bridge: Show Status`
7. 确认输出中已经出现监听端口和 lockfile 路径
8. 在这个测试窗口的集成终端里启动 Claude Code CLI；如果没有自动连上，再执行 `/ide`

这个目录自带自己的 VSCode 配置：

- `Run VSCode IDE Bridge`
- `Run VSCode IDE Bridge (Open Claude Code Root)`
- `Build VSCode IDE Bridge`
- `Test VSCode IDE Bridge`
- `Package VSCode IDE Bridge`

如果你仍然从 monorepo 根目录开发，也可以继续使用根目录下的 `.vscode` 配置。

## 打包

可以直接在这个包目录里执行：

```bash
bun run package
```

成功后会在 `dist/vscode-ide-bridge.vsix` 生成可安装的 VSCode 扩展包。

## 验证建议

- 选中一段代码后发起提问，确认 CLI prompt 中出现 `<ide_selection>`
- 触发一次文件 diff，确认 VSCode 中会打开 diff，并能通过通知选择“接受”或“拒绝”
- 查看 `Claude Code IDE Bridge` output channel，确认没有鉴权失败或 lockfile 写入失败
