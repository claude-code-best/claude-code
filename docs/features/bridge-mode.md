# BRIDGE_MODE — 远程控制

> Feature Flag: `FEATURE_BRIDGE_MODE=1`
> 实现状态：完整可用（v1 + v2 实现）
> 引用数：28

## 一、功能概述

BRIDGE_MODE 将本地 CLI 注册为"bridge 环境"，可从 claude.ai 或其他控制面远程驱动。本地终端变为一个"执行者"，接受远程指令并执行。

### 核心特性

- **环境注册**：本地 CLI 向 Anthropic 服务器注册为可用的 bridge 环境
- **工作轮询**：长轮询（long-poll）等待远程任务分配
- **会话管理**：创建、恢复、归档远程会话
- **权限透传**：远程权限请求发送到控制面，用户在 claude.ai 上批准/拒绝
- **心跳保活**：定期发送 heartbeat 延长任务租约
- **可信设备**：v2 支持可信设备令牌增强安全性

## 二、实现架构

### 2.1 版本演进

| 版本 | 实现 | 特点 |
|------|------|------|
| v1（env-based） | `src/bridge/replBridge.ts` | 基于环境变量的传统 bridge |
| v2（env-less） | `src/bridge/remoteBridgeCore.ts` | 无需环境变量，更安全的 bridge |

### 2.2 API 协议

文件：`src/bridge/bridgeApi.ts`

Bridge API Client 提供 9 个核心操作：

| 操作 | HTTP | 说明 |
|------|------|------|
| `registerBridgeEnvironment` | POST `/v1/environments/bridge` | 注册本地环境，获取 `environment_id` + `environment_secret` |
| `pollForWork` | GET `/v1/environments/{id}/work/poll` | 长轮询等待任务（10s 超时） |
| `acknowledgeWork` | POST `/v1/environments/{id}/work/{workId}/ack` | 确认接收任务 |
| `stopWork` | POST `/v1/environments/{id}/work/{workId}/stop` | 停止任务 |
| `heartbeatWork` | POST `/v1/environments/{id}/work/{workId}/heartbeat` | 续约任务租约 |
| `deregisterEnvironment` | DELETE `/v1/environments/bridge/{id}` | 注销环境 |
| `archiveSession` | POST `/v1/sessions/{id}/archive` | 归档会话（409 = 已归档，幂等） |
| `sendPermissionResponseEvent` | POST `/v1/sessions/{id}/events` | 发送权限审批结果 |
| `reconnectSession` | POST `/v1/environments/{id}/bridge/reconnect` | 重连已存在的会话 |

### 2.3 认证流程

```
注册: OAuth Bearer Token → 获取 environment_secret
轮询: environment_secret 作为 Authorization
  ├── 401 → 尝试 OAuth token 刷新（onAuth401）
  └── 刷新成功 → 重试一次
```

**OAuth 刷新**：API client 内置 `withOAuthRetry` 机制。401 时调用 `handleOAuth401Error`（同 withRetry.ts 的 v1/messages 模式），刷新后重试一次。

### 2.4 安全设计

- **路径穿越防护**：`validateBridgeId()` 使用 `/^[a-zA-Z0-9_-]+$/` 白名单验证所有服务端 ID
- **BridgeFatalError**：不可重试的错误（401/403/404/410）直接抛出，阻止重试循环
- **可信设备令牌**：v2 通过 `X-Trusted-Device-Token` header 增强安全层级
- **幂关注册**：支持 `reuseEnvironmentId` 实现会话恢复，避免重复创建环境

### 2.5 数据流

```
claude.ai 用户选择远程环境
         │
         ▼
POST /v1/environments/bridge (注册)
         │
         ◀── environment_id + environment_secret
         │
         ▼
GET .../work/poll (长轮询)
         │
         ◀── WorkResponse { id, data: { type, sessionId } }
         │
         ▼
POST .../work/{id}/ack (确认)
         │
         ▼
sessionRunner 创建 REPL session
         │
         ├── 权限请求 → sendPermissionResponseEvent
         ├── 心跳 → heartbeatWork (续约)
         └── 任务完成 → 自动归档
```

### 2.6 模块结构

| 模块 | 文件 | 职责 |
|------|------|------|
| API Client | `bridgeApi.ts` | HTTP 通信（注册/轮询/确认/心跳/注销） |
| Session Runner | `sessionRunner.ts` | 创建/恢复 REPL 会话 |
| Bridge Config | `bridgeConfig.ts` | 配置管理（machine name、max sessions 等） |
| Transport | `replBridgeTransport.ts` | Bridge 传输层 |
| Permission Callbacks | `bridgePermissionCallbacks.ts` | 权限请求处理 |
| Pointer | `bridgePointer.ts` | 当前活跃 bridge 状态指针 |
| Flush Gate | `flushGate.ts` | 刷新控制 |
| JWT Utils | `jwtUtils.ts` | JWT 令牌工具 |
| Trusted Device | `trustedDevice.ts` | 可信设备管理 |
| Debug Utils | `debugUtils.ts` | 调试日志 |
| Types | `types.ts` | 类型定义 |

## 三、关键设计决策

1. **长轮询而非 WebSocket**：`pollForWork` 使用 HTTP GET + 10s 超时。简单可靠，无需维护 WebSocket 连接
2. **OAuth 刷新内嵌**：API client 自带 `withOAuthRetry`，无需外层重试逻辑
3. **ETag 条件请求**：注册时支持 `reuseEnvironmentId` 实现幂等会话恢复
4. **v1/v2 共存**：代码中同时存在两套实现，v2 是更安全的升级版
5. **权限双向流动**：本地权限请求发送到 claude.ai，用户在 web 上审批

## 四、使用方式

```bash
# 启用 bridge mode
FEATURE_BRIDGE_MODE=1 bun run dev

# 从 claude.ai/code 远程连接
# 在 web 界面选择已注册的环境

# 配合 DAEMON 使用（后台守护）
FEATURE_BRIDGE_MODE=1 FEATURE_DAEMON=1 bun run dev
```

## 五、外部依赖

| 依赖 | 说明 |
|------|------|
| Anthropic OAuth | claude.ai 订阅登录 |
| GrowthBook | `tengu_ccr_bridge` 门控 |
| Bridge API | `/v1/environments/bridge` 系列端点 |

## 六、文件索引

| 文件 | 行数 | 职责 |
|------|------|------|
| `src/bridge/bridgeApi.ts` | 541 | API Client（核心） |
| `src/bridge/sessionRunner.ts` | — | 会话运行器 |
| `src/bridge/bridgeConfig.ts` | — | 配置管理 |
| `src/bridge/replBridgeTransport.ts` | — | 传输层 |
| `src/bridge/bridgePermissionCallbacks.ts` | — | 权限回调 |
| `src/bridge/bridgePointer.ts` | — | 状态指针 |
| `src/bridge/flushGate.ts` | — | 刷新控制 |
| `src/bridge/jwtUtils.ts` | — | JWT 工具 |
| `src/bridge/trustedDevice.ts` | — | 可信设备 |
| `src/bridge/remoteBridgeCore.ts` | — | v2 核心实现 |
| `src/bridge/types.ts` | — | 类型定义 |
| `src/bridge/debugUtils.ts` | — | 调试工具 |
| `src/bridge/pollConfigDefaults.ts` | — | 轮询配置默认值 |
| `src/bridge/bridgeUI.ts` | — | UI 组件 |
| `src/bridge/codeSessionApi.ts` | — | 代码会话 API |
| `src/bridge/peerSessions.ts` | — | 对等会话管理 |
| `src/bridge/sessionIdCompat.ts` | — | Session ID 兼容层 |
| `src/bridge/createSession.ts` | — | 会话创建 |
| `src/bridge/replBridgeHandle.ts` | — | Bridge 句柄 |
