# Code Review Progress

## 2026-05-03 — 第一轮 CRUD 业务逻辑层 Code Review

### 审查范围
审查了 4 个核心 CRUD 模块：任务管理(tasks.ts)、设置管理(settings.ts)、插件管理(installedPluginsManager.ts)、团队协作邮箱(teammateMailbox.ts)。

### 变更内容
1. **新增 `src/utils/__tests__/tasks.test.ts`** — 37 个测试覆盖完整 CRUD 操作：创建/读取/更新/删除任务、高水位标记防 ID 复用、文件锁并发安全、blockTask 双向关系、claimTask 竞态保护（含 agent_busy 检查）、resetTaskList、通知信号机制、并发创建唯一 ID 验证。

### Code Review 发现
- tasks.ts 架构合理，文件锁+高水位标记保证了并发安全
- settings.ts 依赖链过深（MDM/远程管理/文件系统），63 个现有测试覆盖良好
- installedPluginsManager.ts V1→V2 迁移逻辑清晰，内存/磁盘状态分离设计良好
- teammateMailbox.ts 25 个现有测试覆盖纯函数，协议消息检测函数完整

## 2026-05-05 — 第一轮用户思维 Design Review

### 审查范围
从用户视角审视 CLI 交互体验：Onboarding 流程、Trust Dialog、错误消息、Help Menu。聚焦非代码层面的用户友好性问题。

### 发现的不友好问题
1. **错误消息缺乏可操作提示**：budget 超限/max turns 用尽时仅告知"出错了"，未指导用户如何继续
2. **Onboarding 安全说明冰冷**："Security notes"标题过于技术化，用户容易跳过
3. **Trust Dialog 文案冗长**：安全检查对话框用语偏官方，核心信息被淹没

### 变更内容
1. **`src/cli/print.ts`** — 为 3 种错误子类型（budget/turns/structured-output）添加 Tip 提示行，告知用户具体的解决方式
2. **`src/QueryEngine.ts`** — 预算超限错误消息添加 `--max-budget-usd` 指引
3. **`src/components/Onboarding.tsx`** — 安全步骤标题改为 "Before you start, keep in mind"，条目文案更口语化
4. **`src/components/TrustDialog/TrustDialog.tsx`** — 精简为两句核心信息，降低认知负荷
5. **`src/cli/__tests__/userFacingErrorMessages.test.ts`** — 7 个测试验证消息内容包含关键引导信息

## 2026-05-05 — 第二轮权限与帮助系统 Design Review

### 审查范围
从用户视角审视权限交互提示（Bash/File 权限对话框底部提示行）、Help 页面引导、权限选项标签长度。

### 发现的不友好问题
1. **权限对话框底部提示语义模糊**："Esc to cancel" 不如 "Esc to reject" 明确，"Tab to amend" 用户不知能做什么
2. **Help General 页面缺乏新手引导**：只有一句话 + 全部快捷键，新用户不知从何开始
3. **.claude/ 文件夹权限选项标签过长**（60+ 字符），窄终端截断

### 变更内容
1. **`src/components/HelpV2/General.tsx`** — 添加 3 步"Getting started"引导，取代原来的单段描述
2. **`src/components/permissions/BashPermissionRequest/BashPermissionRequest.tsx`** — 底部 "cancel"→"reject"，"amend"→"add feedback"
3. **`src/components/permissions/FilePermissionDialog/FilePermissionDialog.tsx`** — 同步底部提示用词
4. **`src/components/permissions/FilePermissionDialog/permissionOptions.tsx`** — .claude/ 选项标签从 60 字符缩至 49 字符
5. **`src/components/HelpV2/__tests__/General.test.ts`** — 10 个测试覆盖权限提示文案和帮助页引导内容

## 2026-05-05 — 第三轮模型选择与会话恢复 Design Review

### 审查范围
从用户视角审视 ModelPicker 选择器、/resume 会话恢复命令的错误提示、cost 命令展示。

### 发现的不友好问题
1. **ModelPicker 副标题信息过载**：一句话里混合了模型切换说明和 --model 参数提示，新用户容易困惑
2. **Resume 错误提示缺乏操作指导**："Session X was not found" 没告诉用户怎么列出所有会话

### 变更内容
1. **`src/components/ModelPicker.tsx`** — 副标题从技术说明改为操作提示（"← → 调整 effort，Space 切换 1M context"），控制在 120 字符内
2. **`src/commands/resume/resume.tsx`** — 错误提示添加 "Run /resume to browse" 操作引导
3. **`src/commands/resume/__tests__/resume.test.ts`** — 6 个测试覆盖模型选择器、会话恢复、cost 消息文案

## 2026-05-05 — 第四轮压缩与上下文管理 Design Review

### 审查范围
从用户视角审视 /compact 命令体验、自动压缩提示、上下文窗口耗尽错误、CompactSummary 组件展示。

### 发现的不友好问题
1. **"Not enough messages to compact" 缺乏指导**：用户不知下一步该做什么
2. **"Conversation too long" 提示的 "Press esc twice" 操作不直观**：esc twice 对用户来说是模糊的操作
3. **"Compact summary" 标题对用户没有信息量**：自动压缩时用户不知道发生了什么

### 变更内容
1. **`src/services/compact/compact.ts`** — "Not enough messages" 添加 "Send a few more messages first" 引导；"Conversation too long" 改为建议 `/compact` 或 `/clear`
2. **`src/components/CompactSummary.tsx`** — 自动压缩标题从 "Compact summary" 改为 "Conversation summarized to free up context"，快捷键提示从 "expand" 改为 "view summary"
3. **`src/components/__tests__/compactMessages.test.ts`** — 7 个测试覆盖压缩错误消息和展示文案
