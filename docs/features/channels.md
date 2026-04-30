# Channels — 外部频道消息接入

> 启动参数：`--channels` / `--dangerously-load-development-channels`
> 状态：已解除 feature flag 和 OAuth 限制，可直接使用

## 概述

Channel 是一个 MCP 服务器，它将外部事件推送到你运行中的 Claude Code 会话中，以便 Claude 可以在你不在终端时做出反应。详细使用说明请参考以下文档：

- **官方文档**：[使用 channels 将事件推送到运行中的会话](https://code.claude.com/docs/zh-CN/channels)
- **飞书插件**：[claude-code-feishu-channel](https://github.com/whobot-ai/claude-code-feishu-channel) — 社区首个飞书 Channel 插件，支持双向消息、配对认证、群组聊天、文件附件

本仓库现在内置了 **微信 WeChat channel**，不需要单独安装外部 marketplace 插件。

## 快速开始

```bash
# 启用频道监听（plugin 格式）
ccb --channels plugin:feishu@claude-code-feishu-channel

# 启用内置微信 channel
ccb weixin login
ccb --channels plugin:weixin@builtin

# 启用频道监听（server 格式）
ccb --channels server:my-slack-bridge

# 同时启用多个频道
ccb --channels plugin:feishu@claude-code-feishu-channel --channels server:discord-bot

# 开发模式（跳过 allowlist 检查，用于测试自定义 channel）
ccb --dangerously-load-development-channels server:my-custom-channel
```

## 支持的 Channel

| Channel | 说明 | 来源 |
|---------|------|------|
| **Telegram** | 官方 Telegram Bot 集成 | `/plugin install telegram@claude-plugins-official` |
| **Discord** | 官方 Discord Bot 集成 | `/plugin install discord@claude-plugins-official` |
| **iMessage** | macOS 原生消息 | `/plugin install imessage@claude-plugins-official` |
| **飞书 (Feishu/Lark)** | 双向消息、群组聊天、文件附件 | `/plugin install feishu@claude-code-feishu-channel` |
| **微信 (WeChat)** | 内置 channel，支持扫码登录、双向消息、附件透传 | `ccb weixin login` + `ccb --channels plugin:weixin@builtin` |

## 微信内置 Channel

### 登录

```bash
ccb weixin login
```

已登录状态可清除：

```bash
ccb weixin login clear
```

### 会话启用

```bash
ccb --channels plugin:weixin@builtin
```

### 配对授权

首次收到未授权微信用户消息时，weixin channel 会回一条 6 位 pairing code。运营侧可在终端执行：

```bash
ccb weixin access pair <code>
```

确认后，该微信用户后续消息才会进入 Claude Code 会话。

## 相关文件

| 文件 | 职责 |
|------|------|
| `src/services/mcp/channelNotification.ts` | 频道 gate 逻辑、消息包装 |
| `src/services/mcp/channelAllowlist.ts` | 频道开关（已默认开启） |
| `src/services/mcp/useManageMCPConnections.ts` | MCP 连接管理中的频道注册 |
| `src/components/LogoV2/ChannelsNotice.tsx` | 启动时频道状态提示 |
| `src/main.tsx` | `--channels` 参数解析 |
| `src/interactiveHelpers.tsx` | Dev channels 确认对话框 |

## 参考链接

- [官方 Channels 文档](https://code.claude.com/docs/zh-CN/channels) — 完整使用说明、安全性、Enterprise 控制
- [飞书 Channel 插件](https://github.com/whobot-ai/claude-code-feishu-channel) — 安装配置教程、MCP 工具、Skill 命令参考
