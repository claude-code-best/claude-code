# VOICE_MODE — 语音输入

> Feature Flag: `FEATURE_VOICE_MODE=1`
> 实现状态：完整可用（双后端：Anthropic OAuth / 豆包 ASR）
> 引用数：46

## 一、功能概述

VOICE_MODE 实现"按键说话"（Push-to-Talk）语音输入。用户按住空格键录音，音频流式传输到 STT 后端，实时转录显示在终端中。支持两个后端：

- **Anthropic STT（默认）**：通过 WebSocket 流式传输到 Nova 3 端点，需要 Anthropic OAuth
- **豆包 ASR（Doubao）**：通过 `doubaoime-asr` 包的 AsyncGenerator 协议流式识别，使用独立凭证文件，无需 Anthropic OAuth

### 核心特性

- **Push-to-Talk**：长按空格键录音，释放后自动发送
- **流式转录**：录音过程中实时显示中间转录结果
- **无缝集成**：转录文本直接作为用户消息提交到对话
- **双后端切换**：通过 `/voice` 命令参数选择 STT 后端，持久化到 settings.json

## 二、用户交互

| 操作 | 行为 |
|------|------|
| 长按空格 | 开始录音，显示录音状态 |
| 释放空格 | 停止录音，转录结果自动提交 |
| `/voice` | 切换语音模式开关（默认使用 Anthropic 后端） |
| `/voice doubao` | 启用语音模式并使用豆包 ASR 后端 |
| `/voice anthropic` | 切换回 Anthropic STT 后端 |

### UI 反馈

- **录音指示器**：录音时显示红色/脉冲动画
- **中间转录**：录音过程中显示 STT 实时识别文本
- **最终转录**：完成后替换中间结果

## 三、实现架构

### 3.1 门控逻辑

文件：`src/voice/voiceModeEnabled.ts`

两层检查函数：

```ts
// Anthropic 后端（需要 OAuth）
isVoiceModeEnabled() = hasVoiceAuth() && isVoiceGrowthBookEnabled()

// 豆包后端 / 通用可用性检查（不需要 OAuth）
isVoiceAvailable() = isVoiceGrowthBookEnabled()
```

1. **Feature Flag**：`feature('VOICE_MODE')` — 编译时/运行时开关
2. **GrowthBook Kill-Switch**：`!getFeatureValue_CACHED_MAY_BE_STALE('tengu_amber_quartz_disabled', false)` — 紧急关闭开关（默认 false = 未禁用）
3. **Auth 检查（仅 Anthropic）**：`hasVoiceAuth()` — 需要 Anthropic OAuth token（非 API key）
4. **Provider 检查**：`voiceProvider` 设置决定使用哪个后端，豆包后端跳过 OAuth 检查

### 3.2 核心模块

| 模块 | 职责 |
|------|------|
| `src/voice/voiceModeEnabled.ts` | Feature flag + GrowthBook + Auth 三层门控 |
| `src/hooks/useVoice.ts` | React hook 管理录音状态和后端连接 |
| `src/services/voiceStreamSTT.ts` | Anthropic WebSocket 流式 STT |
| `src/services/doubaoSTT.ts` | 豆包 ASR 适配器（AsyncGenerator → VoiceStreamConnection） |
| `src/commands/voice/voice.ts` | `/voice` 命令实现，处理后端选择和持久化 |
| `src/hooks/useVoiceEnabled.ts` | 语音启用状态 hook，根据 provider 决定是否跳过 OAuth |
| `src/utils/settings/types.ts` | `voiceProvider: 'anthropic' | 'doubao'` 设置类型定义 |

### 3.3 数据流

#### Anthropic 后端

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

#### 豆包 ASR 后端

```
用户按下空格键
      │
      ▼
useVoice hook 激活（检测到 voiceProvider === 'doubao'）
      │
      ▼
macOS 原生音频 / SoX 开始录音
      │
      ▼
connectDoubaoStream() 创建 AudioChunkQueue + VoiceStreamConnection
      │
      ├──→ onReady 立即触发（无需等待握手）
      │
      ▼
音频数据通过 AudioChunkQueue 传入 transcribeRealtime()
      │
      ├──→ INTERIM_RESULT → 实时显示中间转录
      ├──→ FINAL_RESULT   → 显示最终转录
      │
      ▼
用户释放空格键
      │
      ▼
finalize() 立即返回（豆包在录音过程中已返回结果，无需等待）
      │
      ▼
转录文本 → 插入输入框 → 自动提交
```

### 3.4 音频录制

支持两种音频后端（两个 STT 后端共享）：
- **macOS 原生音频**：优先使用，低延迟
- **SoX（Sound eXchange）**：回退方案，跨平台

### 3.5 豆包 ASR 适配器设计

文件：`src/services/doubaoSTT.ts`

豆包后端使用适配器模式，将 `doubaoime-asr` 的 AsyncGenerator 协议桥接到 `VoiceStreamConnection` 接口：

**AudioChunkQueue** — push 式异步队列：
- 实现 `AsyncIterable<Uint8Array>` 接口
- `push(chunk)` 将音频数据入队，`push(null)` 发送结束信号
- 内部维护等待者（waiting）和缓冲队列（chunks）两个状态

**connectDoubaoStream()** — 连接入口：
- 动态导入 `doubaoime-asr`（optionalDependencies）
- 从 `~/.claude/tts/doubao/credentials.json` 加载凭证
- 创建 AudioChunkQueue 和 VoiceStreamConnection
- 立即触发 `onReady`（避免与 useVoice 的音频缓冲死锁）
- `finalize()` 立即返回（豆包在录音过程中已返回结果）
- 后台 async IIFE 消费 `transcribeRealtime` generator，映射响应类型到回调

**响应类型映射**：

| doubaoime-asr ResponseType | 回调映射 |
|----------------------------|----------|
| SESSION_STARTED | 日志记录 |
| VAD_START | 日志记录 |
| INTERIM_RESULT | `onTranscript(text, false)` |
| FINAL_RESULT | `onTranscript(text, true)` |
| ERROR | `onError(errorMsg)` |
| SESSION_FINISHED | 日志记录 |

### 3.6 后端选择逻辑

文件：`src/hooks/useVoice.ts`

```ts
// 判断当前 provider
isDoubaoProvider() → 读取 settings.voiceProvider

// handleKeyEvent 中的可用性检查
const sttAvailable = isDoubaoProvider()
  ? isDoubaoAvailableSync()    // 乐观检查（首次返回 true）
  : isVoiceStreamAvailable()   // Anthropic WebSocket 检查

// attemptConnect 中的连接函数选择
const connectFn = isDoubaoProvider()
  ? connectDoubaoStream
  : connectVoiceStream
```

豆包后端的特殊处理：
- 跳过 `getVoiceKeyterms()` 调用（豆包无需关键词提示）
- 跳过 Focus Mode（`if (!enabled || !focusMode || isDoubaoProvider())`）

## 四、关键设计决策

1. **双后端共存**：豆包后端作为独立适配器与 Anthropic 后端并存，不替换原有流程，通过 `voiceProvider` 设置切换
2. **设置持久化**：`voiceProvider` 存储在 `settings.json`，通过 `/voice` 命令修改，跨会话生效
3. **OAuth 独占（Anthropic）**：Anthropic 后端使用 `voice_stream` 端点（claude.ai），仅 OAuth 用户可用
4. **豆包无需 OAuth**：豆包后端使用独立凭证文件，不依赖 Anthropic 认证，通过 `isVoiceAvailable()` 放宽门控
5. **GrowthBook 负向门控**：`tengu_amber_quartz_disabled` 默认 `false`，新安装自动可用
6. **onReady 立即触发**：豆包后端在连接建立后立即触发 `onReady`，避免与 useVoice 音频缓冲的时序死锁（Anthropic 需要等待 WebSocket 握手）
7. **finalize() 立即返回**：豆包在录音过程中已返回所有结果，用户抬手时无需等待处理
8. **乐观可用性检查**：`isDoubaoAvailableSync()` 在首次调用时返回 `true`，实际导入错误在 `connectDoubaoStream` 中处理
9. **optionalDependencies**：`doubaoime-asr` 作为可选依赖，安装失败不影响 Anthropic 后端

## 五、使用方式

```bash
# 启用 feature
FEATURE_VOICE_MODE=1 bun run dev

# 在 REPL 中使用 Anthropic 后端
# 1. 确保已通过 OAuth 登录（claude.ai 订阅）
# 2. 输入 /voice 启用
# 3. 按住空格键说话
# 4. 释放空格键等待转录

# 在 REPL 中使用豆包 ASR 后端
# 1. 确保 doubaoime-asr 已安装（bun add doubaoime-asr）
# 2. 配置凭证文件：~/.claude/tts/doubao/credentials.json
# 3. 输入 /voice doubao 启用
# 4. 按住空格键说话
# 5. 释放空格键，转录结果即刻显示

# 切换后端
/voice doubao      # 切换到豆包 ASR
/voice anthropic   # 切换回 Anthropic STT
/voice             # 关闭语音模式
```

### 豆包凭证配置

凭证文件路径：`~/.claude/tts/doubao/credentials.json`

```json
{
  "deviceId": "...",
  "installId": "...",
  "cdid": "...",
  "openudid": "...",
  "clientudid": "...",
  "token": "..."
}
```

## 六、外部依赖

| 依赖 | 说明 | 适用后端 |
|------|------|----------|
| Anthropic OAuth | claude.ai 订阅登录，非 API key | Anthropic |
| GrowthBook | `tengu_amber_quartz_disabled` 紧急关闭 | 通用 |
| macOS 原生音频 或 SoX | 音频录制 | 通用 |
| Nova 3 STT | Anthropic 语音转文本模型 | Anthropic |
| doubaoime-asr | 豆包 ASR SDK（optionalDependencies） | 豆包 |
| 凭证文件 | `~/.claude/tts/doubao/credentials.json` | 豆包 |

## 七、文件索引

| 文件 | 职责 |
|------|------|
| `src/voice/voiceModeEnabled.ts` | 三层门控逻辑 + `isVoiceAvailable()` |
| `src/hooks/useVoice.ts` | React hook（录音状态 + 后端选择 + 连接管理） |
| `src/hooks/useVoiceEnabled.ts` | 语音启用状态 hook（按 provider 决定 OAuth 检查） |
| `src/services/voiceStreamSTT.ts` | Anthropic STT WebSocket 流式传输 |
| `src/services/doubaoSTT.ts` | 豆包 ASR 适配器（AudioChunkQueue + connectDoubaoStream） |
| `src/commands/voice/voice.ts` | `/voice` 命令（开关 + 后端选择） |
| `src/commands/voice/index.ts` | 命令注册（去除 availability 限制） |
| `src/utils/settings/types.ts` | `voiceProvider` 类型定义 |
