# Chrome Use — 浏览器自动化快速指南

让 Claude Code 直接控制你的 Chrome 浏览器，用自然语言完成网页操作。

## 快速开始（3 分钟）

### 第一步：安装 Chrome 扩展

1. 下载扩展：https://github.com/hangwin/mcp-chrome/releases
2. 解压 zip 文件
3. 打开 Chrome 访问 `chrome://extensions/`
4. 开启右上角「开发者模式」
5. 点击「加载已解压的扩展程序」，选择解压后的文件夹

### 第二步：启动 Claude Code

```bash
bun run dev
ccb # 或者 ccb 安装版也行
```

### 第三步：启用 Chrome MCP

1. 在 REPL 中输入 `/mcp` 打开 MCP 面板
2. 找到 `mcp-chrome`，按空格键启用
3. 按 Enter 确认

## 相关文档

- GitHub 仓库：https://github.com/hangwin/mcp-chrome
