# Chat / Code 产品隔离设计

## 背景

当前 Remote Control Web 已具有 Chat 与 Code 两套入口和视觉外壳，但二者仍共用 Session、SessionDetail、最近会话列表、环境选择、工具权限与删除流程。现有“项目”直接等同于 Environment，环境重连或重新注册可能产生重复项目；所有 Web 会话的 `source` 都是 `web`，后端无法可靠区分产品。

本设计将 Chat 与 Code 建模为两个独立产品域，同时复用底层消息事件、传输和会话运行基础设施。隔离必须由后端数据约束、运行端执行策略和文件系统边界共同保证，不能仅依赖前端过滤或系统提示词。

## 目标

- Chat 与 Code 的项目、会话、列表、提示词和生命周期完全分离。
- Chat 可使用浏览器、Web、MCP、Shell、文件工具、子代理等能力，但只能向会话专属临时目录写文件，不能修改任何 Code 工作区。
- Chat 不允许选择工作区或运行环境；运行端由服务端自动调度。
- Code 允许浏览远程目录并为新会话选择工作区；会话创建后工作区保持不变。
- 相同真实工作区在环境重连后仍归入同一 Code 项目。
- Chat 对话或项目删除时清理全部持久数据、运行端文件和会话创建的浏览器标签页。
- Code 项目的删除操作只归档隐藏；只有在线运行端确认工作区目录已经消失后，才永久删除项目及其全部会话。
- 平台为 Code 会话产生的非必要文件集中写入工作区内部的 `.real-agentc/` 隐藏目录。

## 非目标

- 不尝试撤销浏览器已在外部网站执行的发送、提交、购买或发布行为。
- 不允许把 Chat 项目转换为 Code 项目，或反向转换。
- 不允许同一会话在运行途中切换工作区。
- 不建立隔离的浏览器配置文件；Chat 复用用户当前已登录的浏览器。
- 不自动把历史 `source=web` 会话猜测为 Chat。

## 领域模型

### Project

新增持久化项目实体：

```ts
type Product = 'chat' | 'code'
type ProjectState = 'active' | 'archived' | 'missing'

interface Project {
  id: string
  ownerId: string
  product: Product
  name: string
  projectPrompt: string
  promptRevision: number
  state: ProjectState
  deviceId: string | null
  workspaceKey: string | null
  canonicalPath: string | null
  gitRoot: string | null
  gitRepoUrl: string | null
  missingConfirmedAt: number | null
  createdAt: number
  updatedAt: number
}
```

数据库约束：

- Chat 项目的全部工作区字段必须为 `NULL`。
- Code 项目必须具有 `deviceId`、`workspaceKey` 和 `canonicalPath`。
- Code 项目的稳定唯一键为 `ownerId + deviceId + workspaceKey`。
- `product` 创建后不可修改。

Environment 只表示可调度的运行端，不再直接等同于项目。环境断线、重连或重新注册不得创建重复 Code 项目。

### Session

现有会话增加：

```ts
interface ProductSessionFields {
  product: Product
  projectId: string | null
  runtimeEnvironmentId: string | null
  dataDirectory: string | null
  projectPromptRevision: number | null
}
```

约束如下：

- Chat 会话可不属于项目；用户可在创建时或之后人工分配到 Chat 项目。
- Code 会话必须属于 Code 项目。
- 会话与项目的 `product` 必须一致。
- Code 会话创建后不得改变项目或工作区。
- Chat 与 Code 会话不能跨产品移动。

## 项目提示词

两种项目使用同样的提示词字段和修订机制，但项目记录完全隔离。

- 项目提示词是系统层上下文，不拼接或伪装成用户消息。
- 新会话启动时获得当前提示词和修订号。
- 项目提示词修改后，运行端在下一轮用户消息开始前获取新修订并生效。
- Chat 会话被人工移入项目后，从下一轮开始使用该 Chat 项目的提示词。
- Code 会话始终使用其固定 Code 项目的提示词。

## Chat 执行模型

### 运行端调度

Chat 创建页面不展示 Environment 或目录选择。运行端注册时声明 Chat 与沙箱能力，服务端从当前用户可用、在线且具有 Chat 能力的运行端中自动选择。没有合适运行端时，创建请求明确失败，不回退到 Code 工作区环境。

### 会话目录

Chat 运行端在可配置根目录下为每个会话建立独立目录。默认结构：

```text
~/.real-agentc/chat-sessions/<session-id>/
├── files/
├── downloads/
├── screenshots/
├── temp/
└── logs/
```

用户上传的文件先复制到该会话目录，再提供给工具。用户不能把 Chat 根目录配置为 Code 工作区，也不能在 UI 或 API 中提交工作区路径。

### 文件系统边界

Chat 的所有本地执行能力继承同一文件策略，包括文件读写工具、Shell、终端、REPL、子代理和后台任务。

- 路径感知工具在调用前执行规范化、真实路径解析和目录包含校验。
- Shell、终端和任意子进程同时运行在文件系统沙箱内，沙箱只授予会话目录写权限。
- 子代理、后台进程和 MCP 文件输出继承同一 `product` 与会话根目录，不能扩大写入范围。
- 任何 Code 工作区及其他 Chat 会话目录都不可写。
- 安全边界由工具策略与运行沙箱双层保证，系统提示词只用于行为引导。

## Code 执行模型

### 远程目录选择器

新建 Code 会话时提供类似 VS Code 远程连接的目录选择器：

- 路径栏支持输入绝对路径。
- 运行端动态返回当前路径下条目的名称和类型，不传输普通文件内容。
- 文件夹可以进入；普通文件只显示名称和文件状态，不可进入或确认为工作区。
- 支持返回、上级目录、刷新、键盘导航、加载和错误状态。
- 目录浏览请求必须校验用户对运行端的访问权。
- 确认前由运行端验证目录存在、可读、已信任，并解析真实路径、Git 根目录与仓库信息。
- 无效目录必须失败，不能静默回退到 Environment 默认目录。

目录解析协议应返回足够建立稳定身份的信息：

```ts
interface ResolvedWorkspace {
  deviceId: string
  canonicalPath: string
  workspaceKey: string
  gitRoot: string | null
  gitRepoUrl: string | null
}
```

符号链接按最终真实路径归类，避免相同目录形成多个项目。

### 工作区固定与项目归类

服务端只有在远程目录验证成功后才创建会话。它按稳定唯一键创建或复用 Code 项目，并把会话固定到该项目。用户选择其他目录时必须创建新会话。

### 隐藏目录

平台自身产生的非必要文件写入：

```text
<workspace>/.real-agentc/
├── sessions/<session-id>/
│   ├── downloads/
│   ├── screenshots/
│   ├── temp/
│   └── logs/
└── project/
    └── runtime-metadata.json
```

用户明确要求创建或修改的源码、文档和交付文件仍写入用户指定位置。隐藏目录只承载平台管理的日志、截图、下载、缓存、转录、运行元数据和临时文件。

## 浏览器模型

Chat 和 Code 都复用用户当前已登录的浏览器，不创建隔离浏览器配置文件。

- 每个会话拥有唯一 `browserScopeId`。
- 浏览器工具记录由会话创建的标签页。
- 用户明确把已有标签页交给会话使用时，只建立关联，不取得该标签页的生命周期所有权。
- 删除 Chat 会话时关闭该会话创建的标签页，不关闭用户原本已有的关联标签页。
- 下载、截图和录制结果写入对应 Chat 会话目录；Code 则写入 `.real-agentc/sessions/<session-id>/`。
- 外部网站上已经完成的不可逆操作不在本地清理范围内。

## API 与服务边界

新界面使用显式产品路由：

```text
/web/chat/projects
/web/chat/sessions
/web/code/projects
/web/code/sessions
/web/code/environments/:environmentId/filesystem
```

服务端从已持久化的 `product` 判定权限与策略，不相信客户端传来的显示模式。共用消息事件、SSE、WebSocket 和控制协议可以保留，但每次查询、修改、归档、删除、恢复和移动操作都必须校验产品一致性。

旧 `/web/sessions` 暂时保留兼容层。新 Chat 与 Code UI 不使用兼容入口。

## 创建流程

### Chat

1. 用户输入消息，并可选择一个 Chat 项目。
2. 服务端选择支持 Chat 的在线运行端。
3. 运行端创建并确认会话专属目录。
4. 服务端创建 `product=chat` 会话，记录目录与运行端。
5. 运行端载入项目提示词并处理首条消息。
6. 任一步失败时回滚数据库记录和已创建目录。

### Code

1. 用户选择运行设备，通过远程目录选择器选定文件夹。
2. 运行端验证并返回 `ResolvedWorkspace`。
3. 服务端创建或复用 Code 项目。
4. 服务端创建 `product=code` 会话并固定项目、环境和目录。
5. 运行端在该目录启动会话，并把平台产物根目录设为 `.real-agentc/sessions/<session-id>/`。

## 删除与清理

### Chat 会话和项目

Chat 删除使用可重试、幂等的清理协调器：

1. 将会话标记为删除中并立即从用户界面隐藏。
2. 停止主会话、子代理和后台任务。
3. 关闭会话拥有的浏览器标签页。
4. 请求运行端删除会话目录。
5. 级联删除服务端事件、消息、所有权和会话记录。

删除 Chat 项目对项目内全部会话执行同一流程，然后永久删除项目。运行端离线时，服务端先删除完整对话内容，只保留不含消息内容的最小清理墓碑；运行端重连或启动时继续清理遗留目录。

### Code 项目

- 用户执行“删除”时只将项目设为 `archived` 并隐藏，工作区和会话均保留。
- 用户可以从归档列表恢复项目。
- Environment 断线不表示工作区消失。
- 只有运行端在线并明确报告目录不存在时，项目才进入 `missing`。
- 网络盘、移动盘或短暂挂载失败必须经过延迟复核，不能凭一次失败永久删除。
- 确认工作区已经消失后，永久删除 Code 项目及其全部会话、事件和消息记录。
- 因源码目录已不存在，不再执行工作区文件删除。

## 兼容迁移

现有 Web 会话无法从 `source=web` 可靠判断产品。迁移采用保守策略：

- 全部历史 Web 会话迁移为 Code，避免错误套用 Chat 清理策略。
- 已登记 Environment 按用户、设备和稳定工作区身份合并为 Code 项目。
- 可解析工作区身份的旧会话归入对应 Code 项目。
- 无法可靠解析工作区的旧会话保留为兼容 Code 会话，不自动删除，也不出现在 Chat 列表。
- 新版 Chat 使用独立数据域，不自动转换旧会话。

## 错误处理与恢复

- Chat 没有可用运行端：创建请求失败，不能借用 Code 工作区。
- Chat 目录创建失败：不创建会话，清理由运行端幂等回滚。
- Code 路径不存在、不可读或未信任：选择器显示运行端错误，不创建项目或会话。
- 项目提示词更新传递失败：保留新修订并在下一轮或重连时重试，绝不降级为用户消息。
- 清理任务失败：保留最小墓碑和重试次数，支持启动扫描与重连补偿。
- 浏览器标签页已被用户关闭：清理视为成功。
- 工作区探测超时或 Environment 离线：保持 Code 项目原状态，不标记为 `missing`。

## 测试策略

### 数据库与迁移

- Project 产品字段与工作区字段约束。
- Session 与 Project 产品一致性。
- Code 项目稳定唯一键和 Environment 重连去重。
- 历史 Web 会话保守迁移为 Code。
- Chat 项目级联永久删除。
- Code 项目归档、恢复、missing 复核与永久删除。

### API 与服务

- Chat 与 Code 的列表、详情和修改接口互不泄漏。
- Chat 创建 API 拒绝 `directory` 和 Code Environment 指定。
- Code 创建必须先获得有效 `ResolvedWorkspace`。
- 非所有者不能浏览远程目录。
- 兼容 API 不能绕过产品校验。

### 执行安全

- `..`、绝对路径、符号链接和竞态替换不能突破 Chat 目录。
- 文件编辑、写入、Shell、终端、REPL、子代理和后台任务均受限。
- MCP 文件输出写入 Chat 目录或被拒绝。
- Code 会话仍能按现有权限模式修改工作区。

### 生命周期与浏览器

- 重复删除结果一致。
- 运行端离线时生成墓碑，重连后完成文件清理。
- 只关闭会话创建的标签页，不关闭用户已有标签页。
- 外部动作不参与本地回滚。
- Environment 断线与路径真实消失得到不同处理。

### Web UI

- Chat 页面不存在 Environment 或目录选择入口。
- Chat 与 Code 最近会话、项目和归档列表完全分离。
- 目录选择器可输入路径、进入文件夹、刷新和返回。
- 普通文件显示但不可进入或确认。
- 会话创建后不能更换工作区。
- 项目提示词新修订从下一轮生效。

## 验收标准

- Chat 的任何本地写入只能落入当前会话目录。
- 删除 Chat 会话或项目后，服务端数据、临时文件和会话拥有的浏览器标签页均被清理或进入可观测的离线清理队列。
- Code 能动态浏览远程目录并选择任意有效、可信文件夹。
- 同一真实目录始终归入同一 Code 项目。
- Code 工作区内的平台非必要产物只进入 `.real-agentc/`。
- 两类产品不存在项目、会话、提示词或列表交叉。
- Code 项目删除仅归档；确认工作区消失后项目和全部会话永久删除。
- 相关单元与集成测试、Web 构建、TypeScript 严格类型检查以及仓库要求的 `bun run test:all` 通过。
