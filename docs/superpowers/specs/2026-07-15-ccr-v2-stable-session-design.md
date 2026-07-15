# CCR v2 稳定会话链路设计

## 目标

让 Code 产品的 CCR v2 专用链路稳定支持多轮对话、内部 transcript 持久化、会话恢复和事件投递确认；服务端异常时不得因为内部事件 flush 永久阻塞下一轮。

## 已确认的问题

- Code 强制使用 CCR v2 SSE；Chat 使用的链路不经过这套内部事件协议。
- `CCRClient` 会向 `/v1/code/sessions/:id/worker/internal-events` 写入 transcript，但 RCS 没有注册该路由。
- `print.ts` 在每轮结束时等待 `flushInternalEvents()`；上传失败后队列无限重试，导致 `idle` 永远不会上报，第二轮永远无法启动。
- SSE 收到的服务器事件 ID 与 payload 中的用户 UUID 不同，生命周期 ACK 使用错误的 ID，delivery 状态无法从 `received` 进入 `processing/processed`。

## 设计

### 服务端内部事件存储

新增 SQLite `session_internal_events` 表，以 `(session_id, event_id)` 幂等保存 worker transcript 事件，保存事件类型、payload、compaction 标记、agent ID 和创建时间。通过 schema migration 创建表和索引。

RCS 新增两个受 worker epoch 和 session ingress token 保护的接口：

- `POST /v1/code/sessions/:id/worker/internal-events`：批量写入，重复 event ID 返回成功但不重复保存。
- `GET /v1/code/sessions/:id/worker/internal-events`：分页读取前台 transcript；`subagents=true` 时读取非前台 agent 事件，响应格式兼容现有 `CCRClient.paginatedGet`。

### 客户端稳定性

客户端继续等待成功写入以保证恢复数据不丢失，但把永久性 HTTP 失败从无限重试中隔离出来，并为 turn-boundary flush 设置有限等待时间；超时只跳过本次等待并记录诊断，不能让 `running` 状态锁死。

### Delivery ACK

CCR 客户端维护服务器 `event_id` 与 payload `uuid` 的有界映射。生命周期回调传入 payload UUID 时，转换为服务器事件 ID 再提交 delivery 状态；未知映射不伪造 ACK，并记录诊断。

### 流式输出

保留已有 stream event buffer 和 text snapshot 机制；本次只补齐 Code 链路协议，避免把流式输出改成依赖 transcript 内部事件。

## 验证标准

- RCS 路由和持久化测试覆盖批量写入、幂等、分页、subagent 筛选和 epoch 校验。
- CCR 客户端测试覆盖 internal event flush 成功/超时、事件 ID 映射和 delivery 状态转换。
- 回归测试证明一轮完成后会收到 idle，第二轮用户消息可以执行并产生 assistant/result。
- `bun run typecheck` 和相关 `bun test` 通过。
