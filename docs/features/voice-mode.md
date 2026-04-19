# VOICE_MODE — 语音输入

> Feature Flag: `FEATURE_VOICE_MODE=1`
> 实现状态：完整可用（需要 Anthropic OAuth）
> 引用数：46

## 一、功能概述

VOICE_MODE 实现"按键说话"（Push-to-Talk）语音输入。用户按住空格键录音，音频通过 WebSocket 流式传输到 Anthropic STT 端点（Nova 3），实时转录显示在终端中。

### 核心特性

- **Push-to-Talk**：长按空格键录音，释放后自动发送
- **流式转录**：录音过程中实时显示中间转录结果
- **无缝集成**：转录文本直接作为用户消息提交到对话

## 二、用户交互

| 操作 | 行为 |
|------|------|
| 长按空格 | 开始录音，显示录音状态 |
| 释放空格 | 停止录音，等待最终转录 |
| 转录完成 | 自动插入到输入框并提交 |
| `/voice` 命令 | 切换语音模式开关 |

### UI 反馈

- **录音指示器**：录音时显示红色/脉冲动画
- **中间转录**：录音过程中显示 STT 实时识别文本
- **最终转录**：完成后替换中间结果

## 三、实现架构

### 3.1 门控逻辑

文件：`src/voice/voiceModeEnabled.ts`

三层检查：

```ts
isVoiceModeEnabled() = hasVoiceAuth() && isVoiceGrowthBookEnabled()
```

1. **Feature Flag**：`feature('VOICE_MODE')` — 编译时/运行时开关
2. **GrowthBook Kill-Switch**：`!getFeatureValue_CACHED_MAY_BE_STALE('tengu_amber_quartz_disabled', false)` — 紧急关闭开关（默认 false = 未禁用）
3. **Auth 检查**：`hasVoiceAuth()` — 需要 Anthropic OAuth token（非 API key）

### 3.2 核心模块

| 模块 | 职责 |
|------|------|
| `src/voice/voiceModeEnabled.ts` | Feature flag + GrowthBook + Auth 三层门控 |
| `src/hooks/useVoice.ts` | React hook 管理录音状态和 WebSocket 连接 |
| `src/services/voiceStreamSTT.ts` | WebSocket 流式传输到 Anthropic STT |

### 3.3 数据流

```
用户按下空格键
      │
      ▼
useVoice hook 激活
      │
      ▼
macOS 原生音频 / SoX 开始录音
      │
      ▼
WebSocket 连接到 Anthropic STT 端点
      │
      ├──→ 中间转录结果 → 实时显示
      │
      ▼
用户释放空格键
      │
      ▼
停止录音，等待最终转录
      │
      ▼
转录文本 → 插入输入框 → 自动提交
```

### 3.4 音频录制

支持两种音频后端：
- **macOS 原生音频**：优先使用，低延迟
- **SoX（Sound eXchange）**：回退方案，跨平台

音频流通过 WebSocket 发送到 Anthropic 的 Nova 3 STT 模型。

## 四、关键设计决策

1. **OAuth 独占**：语音模式使用 `voice_stream` 端点（claude.ai），仅 Anthropic OAuth 用户可用。API key、Bedrock、Vertex 用户无法使用
2. **GrowthBook 负向门控**：`tengu_amber_quartz_disabled` 默认 `false`，新安装自动可用（无需等 GrowthBook 初始化）
3. **Keychain 缓存**：`getClaudeAIOAuthTokens()` 首次调用访问 macOS keychain（~20-50ms），后续缓存命中
4. **独立于主 feature flag**：`isVoiceGrowthBookEnabled()` 在 feature flag 关闭时短路返回 `false`，不触发任何模块加载

## 五、使用方式

```bash
# 启用 feature
FEATURE_VOICE_MODE=1 bun run dev

# 在 REPL 中使用
# 1. 确保已通过 OAuth 登录（claude.ai 订阅）
# 2. 按住空格键说话
# 3. 释放空格键等待转录
# 4. 或使用 /voice 命令切换开关
```

## 六、外部依赖

| 依赖 | 说明 |
|------|------|
| Anthropic OAuth | claude.ai 订阅登录，非 API key |
| GrowthBook | `tengu_amber_quartz_disabled` 紧急关闭 |
| macOS 原生音频 或 SoX | 音频录制 |
| Nova 3 STT | 语音转文本模型 |

## 七、文件索引

| 文件 | 行数 | 职责 |
|------|------|------|
| `src/voice/voiceModeEnabled.ts` | 54 | 三层门控逻辑 |
| `src/hooks/useVoice.ts` | — | React hook（录音状态 + WebSocket） |
| `src/services/voiceStreamSTT.ts` | — | STT WebSocket 流式传输 |
