# API 提供商集成

> 记录 Claude Code 支持的 API 提供商、配置方式、模型映射和集成细节。

## 支持的提供商

| 提供商 | modelType | 环境变量前缀 | API 兼容层 |
|--------|-----------|-------------|-----------|
| Anthropic (默认) | anthropic | ANTHROPIC_* | 原生 SDK |
| OpenAI | openai | OPENAI_* | OpenAI Chat Completions |
| Gemini | gemini | GEMINI_* | Gemini Generate Content |
| xAI Grok | grok | GROK_* / XAI_* | OpenAI 兼容 |
| **阿里云百炼 (DashScope)** | **anthropic** | **DASHSCOPE_* → ANTHROPIC_*** | **Anthropic 原生 SDK** |
| Amazon Bedrock | — | — | AWS SDK |
| Vertex AI | — | — | Google Cloud SDK |
| Azure Foundry | — | — | Azure SDK |

## 阿里云百炼 (DashScope)

### 概述

DashScope 是阿里云百炼平台的 **Anthropic 兼容 API** 端点。URL 路径 `/apps/anthropic` 明确表明其使用 Anthropic 接口协议。代码中将 `DASHSCOPE_*` 环境变量映射为 `ANTHROPIC_*`，然后走 firstParty Anthropic SDK 路径，**不经过 OpenAI 兼容层**。

### 默认配置

| 项目 | 值 |
|------|-----|
| Base URL | `https://coding.dashscope.aliyuncs.com/apps/anthropic` |
| OPUS 默认模型 | `qwen3-max-2026-01-23` |
| SONNET 默认模型 | `qwen3.6-plus` |
| HAIKU 默认模型 | `qwen3-coder-plus` |

### 支持的模型

| 模型 | 推荐用途 |
|------|---------|
| qwen3-max-2026-01-23 | OPUS 级能力 |
| qwen3.6-plus | SONNET 级能力 |
| qwen3.5-plus | SONNET 级备选 |
| qwen3-coder-next | 编码专用 |
| qwen3-coder-plus | HAIKU 级编码 |
| glm-5 | 智谱最新 |
| glm-4.7 | 智谱稳定 |
| kimi-k2.5 | 月之暗面 |
| MiniMax-M2.5 | MiniMax |

### 环境变量

| 变量名 | 必需 | 默认值 | 说明 |
|--------|------|--------|------|
| `DASHSCOPE_API_KEY` | 是 | — | DashScope API 密钥 → 映射为 `ANTHROPIC_AUTH_TOKEN` |
| `DASHSCOPE_BASE_URL` | 否 | `https://coding.dashscope.aliyuncs.com/apps/anthropic` | 自定义 API 端点 → 映射为 `ANTHROPIC_BASE_URL` |
| `DASHSCOPE_DEFAULT_OPUS_MODEL` | 否 | `qwen3-max-2026-01-23` | OPUS 级模型 |
| `DASHSCOPE_DEFAULT_SONNET_MODEL` | 否 | `qwen3.6-plus` | SONNET 级模型 |
| `DASHSCOPE_DEFAULT_HAIKU_MODEL` | 否 | `qwen3-coder-plus` | HAIKU 级模型 |
| `CLAUDE_CODE_USE_DASHSCOPE` | 否 | — | 环境变量启用 |

### 架构

```
用户输入 → /login → ConsoleOAuthFlow (DashScope UI)
                → 设置 modelType: 'anthropic'
                → 写入 ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN

启动 → getAPIProvider() 返回 'dashscope'
     → claude.ts 映射 DASHSCOPE_* → ANTHROPIC_* env
     → Anthropic SDK 自动读取 ANTHROPIC_BASE_URL
     → API 调用 DashScope Anthropic 兼容端点
```

### 关键文件

| 文件 | 作用 |
|------|------|
| `src/utils/model/providers.ts` | 添加 `'dashscope'` 到 APIProvider 类型和 `getAPIProvider()` |
| `src/utils/model/model.ts` | 3 个 getDefault 函数添加 DASHSCOPE_DEFAULT_* env 检查 |
| `src/services/api/claude.ts` | dashscope provider 映射 env → firstParty Anthropic 路径 |
| `src/components/ConsoleOAuthFlow.tsx` | DashScope 登录表单，保存为 `modelType: 'anthropic'` |

### 通过 /login 配置

1. 运行 `/login`
2. 选择 **"阿里云百炼 (DashScope) · Anthropic-compatible API"**
3. 输入 API Key（预填默认值，可直接修改）
4. 可选修改 Base URL、模型名称
5. 保存后重启生效

### 手动配置

```bash
# 环境变量方式
export DASHSCOPE_API_KEY="your-api-key"
export DASHSCOPE_BASE_URL="https://coding.dashscope.aliyuncs.com/apps/anthropic"

# 或在 ~/.claude/settings.json 中配置
{
  "modelType": "anthropic",
  "env": {
    "ANTHROPIC_BASE_URL": "https://coding.dashscope.aliyuncs.com/apps/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "your-api-key",
    "DASHSCOPE_DEFAULT_SONNET_MODEL": "qwen3.6-plus",
    "DASHSCOPE_DEFAULT_OPUS_MODEL": "qwen3-max-2026-01-23",
    "DASHSCOPE_DEFAULT_HAIKU_MODEL": "qwen3-coder-plus"
  }
}
```
