# Chat/Code 项目与会话体验统一设计

## 背景

Remote Control Server 的后端已经区分了 Chat 与 Code 两套产品项目模型，但当前 Web 前端仍使用旧的通用会话接口：Chat 把运行环境误当作项目，Code 没有项目入口，侧栏和会话列表还会混合两种产品的数据。会话详情的顶部信息和运行控制也占据了过多聊天空间，列表项缺少右键操作，侧栏字体与折叠状态不够易用。

## 目标与边界

本次改造只覆盖 Remote Control Server Web UI 以及项目提示词进入 Code/Chat 会话运行链的必要桥接字段：

- Chat 项目由用户显式创建或选择；Chat 会话不能选择工作区，创建时只允许标题和可选 `project_id`。
- Code 项目由远程工作区（设备 + 规范化工作区 key）自动归类；Code 入口能够查看、编辑和归档项目。
- Chat/Code 会话、项目、侧栏最近项和运行页按产品分流，不再从旧 `/web/sessions` 列表混合读取。
- 项目提示词编辑后持久化并注入新启动会话的 `--append-system-prompt`，确保编辑内容真正影响模型；已有运行中的会话不强制重启。
- 会话列表支持右键菜单，同时保留三点按钮，覆盖重命名、归档/恢复、删除、移入/移出项目等操作。
- 会话顶部只保留返回、标题、状态和更多操作；运行状态、控制项、提示词和上下文信息放入右侧运行中心。
- 侧栏保持桌面可折叠和移动端抽屉，并持久化折叠状态；导航、最近会话和项目名称使用更易读的字号。

不在本次范围内：改变工作区生命周期规则、允许 Chat 访问 Code 工作区、在服务器中新增项目重命名 API、或为 Code 手工创建脱离工作区的项目。

## 方案

采用“产品数据分流 + 共享展示组件”的结构，而不是继续修补旧环境页面或复制两套完全独立页面。

### 数据与 API

前端新增 `Project`、产品化 `Session` 字段和 API client 方法：

- Chat：`/web/chat/projects`、`/web/chat/sessions`、`/web/chat/sessions/:id/project`、`/web/chat/projects/:id/prompt`、项目/会话删除。
- Code：`/web/code/projects`、`/web/code/sessions`、`/web/code/projects/:id/prompt`、项目归档/恢复。
- `useWorkspaceData` 返回 `chat` 与 `code` 两个数据分片；运行中心和侧栏只接收当前产品分片。
- Chat 首页移除环境选择器，右上角项目选择器支持无项目、已有项目、新建项目。
- Code 首页调用 `/web/code/sessions`，传递环境、远程目录、权限模式，由服务端自动 upsert 项目。

### 路由与项目详情

- Chat 保留 `/code/chat#projects`，但页面改为真实 Chat 项目列表和详情；详情按 `project_id` 过滤会话，编辑 `project_prompt`。
- Code 新增 `/code/projects` 与 `/code/projects#project=<id>`，侧栏在“新会话”下显示“项目”；详情展示 canonical path、git 信息、状态、提示词和会话，并提供归档/恢复。
- SessionDetail 接收期望产品，加载后拒绝产品不匹配的手工 URL，避免 Chat/Code 交叉打开。

### 右键与布局

抽取可复用的会话列表项和受控上下文菜单。右键时阻止原生菜单并在指针位置展示操作，键盘/触屏继续使用三点按钮。菜单动作复用现有会话生命周期 API；移入/移出项目只对 Chat 会话开放。

SessionDetail 顶部压缩为单行标题栏；`SessionControlBar` 和 cwd、模型、权限、提示词、上下文等运行信息归入已有 WorkCenter 的 Runtime/Context/Prompts 标签。WorkCenter 在窄屏仍可隐藏，聊天主体保持可用。

Sidebar 的折叠状态保存到 localStorage，展开宽度约 300px、折叠宽度保持图标栏；提高区块标题、导航项和最近会话字号，同时保留 tooltip。

### 项目提示词运行链

创建/派发产品会话时，服务端从项目记录读取当前 `projectPrompt`，在 work data 中以可选 `project_prompt` 传给桥接端；桥接端把它放入 `SessionSpawnOpts`，启动 CLI 时追加 `--append-system-prompt <prompt>`。提示词修订号继续随会话保存，用于显示会话创建时采用的版本。

## 错误处理

- Chat 项目名为空、跨产品 project id、向 Chat 会话提交工作区字段时沿用后端 400 错误，并在输入区域显示可读错误。
- Code 无在线环境或远程目录解析失败时保留当前表单内容，显示错误，不创建孤立项目。
- 项目已归档/缺失时详情页显示只读状态；恢复失败不清理本地列表。
- 右键菜单动作失败时保持菜单关闭并通过页面 toast/行内错误提示，不改变乐观状态。
- 产品路由不匹配时显示返回当前产品首页的错误，不渲染另一产品会话。

## 验收标准

1. Chat 首页可以在右上角选择已有项目或新建项目；提交后 Chat 会话列表和项目详情都显示正确归属，且不会出现工作区选择器。
2. Code 首页创建两个相同远程工作区的会话时归入同一 Code 项目；不同 workspace key 的目录产生不同项目；Code 侧栏可进入项目详情并编辑提示词。
3. 修改项目提示词后新建会话的桥接启动参数包含对应追加提示词；已有会话不被重启。
4. Chat/Code 侧栏、项目页、会话列表和运行中心不交叉显示对方产品的数据；手工输入错误产品 URL 会被拦截。
5. 侧栏最近会话、Chat/Code 项目会话列表支持右键菜单及三点按钮；归档、恢复、删除和 Chat 移入/移出项目行为可见且可重复执行。
6. 会话详情顶部高度明显降低，运行控制和提示词可在右侧运行中心访问；侧栏可折叠、刷新后保持状态，字号不低于导航 14px/最近会话 14px。

## 测试策略

- 先为 API client、产品数据分片、项目过滤和项目提示词注入补充单元测试。
- 为 ChatHome、CodeHome、ProjectsPage、Sidebar 上下文菜单和 SessionDetail 产品守卫补充 React 行为测试；若现有测试环境不支持完整 DOM，则至少使用纯函数/组件状态边界测试。
- 每个行为按 TDD 执行红-绿-重构；完成后运行 Remote Control Server 后端测试、Web 测试、TypeScript 检查和 Vite 构建。
