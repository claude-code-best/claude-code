# VSCode IDE Bridge 设计文档

**日期：** 2026-04-07

## 1. 背景

当前仓库已经具备一套较完整的 IDE 接入链路：

- CLI 能发现 `ws-ide` / `sse-ide` 类型的 IDE 连接
- CLI 能接收 `selection_changed` 并将其注入为 `<ide_selection>` 上下文
- CLI 能调用 `openDiff`、`close_tab`、`closeAllDiffTabs` 等 IDE RPC
- `/ide`、diff 预览、选区提示、已打开文件提示都依赖这套链路

但当前仓库中没有可直接使用的 VSCode 扩展实现，导致本地 VSCode 无法真正把这些能力提供给 CLI。目标不是重做一个聊天面板，而是补齐一个兼容现有 CLI 协议的 VSCode 扩展，让 CLI “像连接到原生 IDE 扩展一样”工作。

## 2. 目标

构建一个独立的 VSCode 扩展，在本地暴露一个与当前 CLI 兼容的 `ws-ide` 服务，完成以下能力：

1. 让 CLI 能自动发现 VSCode
2. 让 VSCode 当前文件和选区变化能进入 CLI 的 IDE 上下文链路
3. 让 CLI 发起的 diff 预览能在 VSCode 中打开和关闭
4. 保持实现最小、可调试、可逐步扩展

## 3. 非目标

第一版明确不做以下内容：

- 不实现 VSCode 聊天面板
- 不接入远程工作区、Codespaces、Dev Container、SSH Remote
- 不兼容多台机器之间的桥接
- 不实现复杂的会话恢复或扩展端持久化缓存
- 不覆盖官方扩展的所有功能

## 4. 总体方案

采用“独立 sidecar 扩展 + 本地 WebSocket IDE Bridge”的方式。

### 4.1 连接模型

VSCode 扩展启动后：

1. 在 `127.0.0.1` 上启动一个随机可用端口的 WebSocket 服务
2. 生成与 CLI 现有 IDE 发现逻辑兼容的 lockfile
3. 等待 CLI 以 `ws-ide` MCP 客户端身份连接
4. 扩展在该 WebSocket 连接上暴露 MCP Server，负责把 IDE 事件推送给 CLI，并响应 CLI 发来的 MCP tool 调用

### 4.2 复用现有 CLI 能力

扩展尽量不改 CLI 的上层交互，只复用现有协议：

- VSCode -> CLI：`selection_changed`、`ide_connected` 通知
- CLI -> VSCode：通过 MCP tool 调用 `openDiff`、`close_tab`、`closeAllDiffTabs`

这样可以最大化复用：

- `src/hooks/useIdeSelection.ts`
- `src/utils/attachments.ts`
- `src/utils/messages.ts`
- `src/hooks/useDiffInIDE.ts`
- `/ide` 命令及 IDE 状态展示

## 5. 协议设计

### 5.1 Lockfile

扩展写出的 lockfile 需要满足 CLI 的 IDE 自动发现逻辑。内容至少包含：

- `workspaceFolders`
- `pid`
- `ideName`
- `transport: "ws"`
- `runningInWindows`
- `authToken`

文件名使用端口号，例如 `<port>.lock`。

### 5.2 鉴权

扩展启动时生成一次随机 `authToken`：

- 写入 lockfile
- CLI 连接 `ws-ide` 时通过 `X-Claude-Code-Ide-Authorization` 头带上
- 扩展端校验成功后才允许建立 MCP/WebSocket 会话

第一版只允许本地回环地址，不暴露到公网。

### 5.3 VSCode -> CLI 通知

#### `selection_changed`

在下列事件触发后发送：

- `window.onDidChangeTextEditorSelection`
- `window.onDidChangeActiveTextEditor`
- 扩展激活完成后的初始同步

消息字段包含：

- `selection.start.line`
- `selection.start.character`
- `selection.end.line`
- `selection.end.character`
- `text`
- `filePath`

若当前没有活动选区：

- `selection` 允许为 `null`
- 仍尽量发送 `filePath`

这样 CLI 至少可以知道“用户当前打开的是哪个文件”。

### 5.4 CLI -> VSCode MCP tools

#### `openDiff`

入参：

- `old_file_path`
- `new_file_path`
- `new_file_contents`
- `tab_name`

行为：

- 读取当前磁盘文件内容作为左侧内容
- 使用临时文档或内存文档构造右侧内容
- 在 VSCode 中打开 diff 视图
- 记录 `tab_name -> 资源引用` 映射

#### `close_tab`

入参：

- `tab_name`

行为：

- 根据映射关闭对应 diff 视图
- 清理映射与临时资源

#### `closeAllDiffTabs`

行为：

- 关闭所有由本扩展打开的 diff 标签
- 清理内部状态

## 6. 扩展内部结构

建议新增独立包：`packages/vscode-ide-bridge`

目录结构如下：

```text
packages/vscode-ide-bridge/
  package.json
  tsconfig.json
  src/
    extension.ts
    server/
      bridgeServer.ts
      lockfile.ts
      workspaceInfo.ts
      selectionPublisher.ts
      diffController.ts
      protocol.ts
    util/
      randomToken.ts
      disposables.ts
  test/
    selectionPublisher.test.ts
    lockfile.test.ts
    bridgeServer.test.ts
    diffController.test.ts
```

各模块职责如下：

- `extension.ts`
  VSCode 扩展入口，负责激活、停用、启动 bridge、注册命令。

- `bridgeServer.ts`
  本地 WebSocket 服务与消息路由层，负责握手、鉴权、连接管理，以及把单个 WebSocket 连接桥接为 MCP transport。

- `lockfile.ts`
  负责写 lockfile、更新 lockfile、删除 lockfile。

- `workspaceInfo.ts`
  负责采集工作区目录、平台信息、活动编辑器文件路径。

- `selectionPublisher.ts`
  监听 VSCode 编辑器事件，并把选区信息转换为 `selection_changed`。

- `diffController.ts`
  处理 `openDiff` / `close_tab` / `closeAllDiffTabs` 这三个 MCP tools，维护临时资源和 tab 映射。

- `protocol.ts`
  统一定义扩展端需要识别和发送的消息结构，避免字符串散落。

## 7. 命令与可观察性

虽然主流程是自动连接，但第一版仍建议提供两个调试命令：

- `Claude Code Bridge: Restart`
- `Claude Code Bridge: Show Status`

状态信息至少包含：

- 当前监听端口
- lockfile 路径
- 是否有 CLI 已连接
- 当前工作区数量
- 最近一次选区推送时间

另外建议注册一个 output channel：

- `Claude Code IDE Bridge`

用于输出：

- 启动日志
- 鉴权失败
- lockfile 写入失败
- diff 打开失败
- 连接断开原因

## 8. 错误处理策略

### 8.1 端口占用

- 自动尝试新的随机端口
- 更新 lockfile
- 在 output channel 中记录端口变化

### 8.2 lockfile 写入失败

- bridge 不进入 ready 状态
- 弹出 VSCode 错误通知
- output channel 记录完整错误

### 8.3 WebSocket 鉴权失败

- 拒绝连接
- 记录远端地址和失败原因

### 8.4 活动编辑器为空

- 发送空选区状态或仅跳过通知
- 不抛异常、不打断 bridge 生命周期

### 8.5 diff 打开失败

- 返回明确错误结果给 CLI
- 不留下半开的临时资源

### 8.6 扩展退出

- 关闭 WebSocket server
- 删除 lockfile
- 释放临时文档资源
- 清空 tab 映射

## 9. 测试方案

### 9.1 单元测试

覆盖以下逻辑：

- lockfile 内容生成与路径选择
- 选区对象到协议消息的转换
- tab 映射和关闭逻辑
- 鉴权令牌校验

### 9.2 集成测试

通过 Node/WebSocket 客户端模拟 CLI：

- 连接本地 bridge server
- 验证鉴权成功与失败
- 验证 `selection_changed` 是否按预期发送
- 验证 `openDiff` / `close_tab` 是否触发预期行为

### 9.3 手工验证

手工验证路径：

1. 启动 VSCode 扩展
2. 启动 `claude-code-best`
3. 执行 `/ide`
4. 确认 CLI 能识别到 VSCode
5. 在 VSCode 中选中一段代码并提问
6. 确认 CLI 能注入 `<ide_selection>`
7. 触发一次 IDE diff
8. 确认 diff 标签可打开、保存、关闭

## 10. 风险与取舍

### 10.1 MCP 完整兼容风险

仓库当前 CLI 连接 `ws-ide` 时使用的是 MCP 客户端通路，因此扩展端若实现过薄，可能在握手或工具注册阶段与 CLI 预期不一致。

**取舍：**
第一版只实现 CLI 当前实际会调用到的最小工具与通知，不尝试泛化为完整 MCP server，但协议层要留出扩展空间。

### 10.2 VSCode diff 资源回收

VSCode diff 视图不是纯命名 tab，直接按 `tab_name` 定位关闭可能和实际标签生命周期有偏差。

**取舍：**
扩展内部维护显式映射，以资源 URI 为主、`tab_name` 为辅，不依赖 UI 文本匹配。

### 10.3 多工作区与路径兼容

Windows、WSL、单根工作区、多根工作区在路径表示上会不同。

**取舍：**
第一版先以本机本地工作区为主，路径统一走绝对路径；WSL/Windows 转换尽量复用 CLI 现有约定，不在扩展端重新发明路径映射。

## 11. 分阶段交付

### 第一阶段

目标：打通本地 VSCode 与 CLI 的最小闭环。

范围：

- 启动 `ws-ide`
- 写 lockfile
- 发送 `selection_changed`
- 实现 `openDiff`
- 实现 `close_tab`
- 实现 `closeAllDiffTabs`
- 提供状态命令和日志输出

### 第二阶段

目标：增强稳定性和调试能力。

范围：

- 更细的错误提示
- 更稳定的 tab 生命周期管理
- 更多 IDE 状态信息展示
- 更完整的集成测试

## 12. 结论

推荐按本设计实现独立的 VSCode IDE Bridge 扩展，并让它完全对齐当前 CLI 已有的 `ws-ide` 连接与 IDE 上下文/差异视图协议。这样能在不大改 CLI 上层逻辑的前提下，把 VSCode 选区、当前文件和 diff 预览能力真正打通。
