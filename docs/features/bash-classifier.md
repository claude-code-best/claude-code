# BASH_CLASSIFIER — Bash 命令分类器

> Feature Flag: `FEATURE_BASH_CLASSIFIER=1`
> 实现状态：bashClassifier.ts 全部 Stub，yoloClassifier.ts 完整实现可参考
> 引用数：45

## 一、功能概述

BASH_CLASSIFIER 使用 LLM 对 bash 命令进行意图分类（允许/拒绝/询问），实现自动权限决策。用户不需要逐个审批 bash 命令，分类器根据命令内容和上下文自动判断安全性。

### 核心特性

- **LLM 驱动分类**：使用 Opus 模型评估命令安全性
- **两阶段分类**：快速阻止/允许 → 深度思考链
- **自动审批**：分类器判定安全的命令自动通过
- **UI 集成**：权限对话框显示分类器状态和审核选项

## 二、实现架构

### 2.1 模块状态

| 模块 | 文件 | 状态 | 说明 |
|------|------|------|------|
| Bash 分类器 | `src/utils/permissions/bashClassifier.ts` | **Stub** | 所有函数返回空操作。注释："ANT-ONLY" |
| YOLO 分类器 | `src/utils/permissions/yoloClassifier.ts` | **完整** | 1496 行，两阶段 XML 分类器 |
| 审批信号 | `src/utils/classifierApprovals.ts` | **完整** | Map + 信号管理分类器决策 |
| 权限 UI | `src/components/permissions/BashPermissionRequest.tsx` | **布线** | 分类器状态显示、审核选项 |
| 权限管道 | `src/hooks/toolPermission/handlers/*.ts` | **布线** | 分类器结果路由到决策 |
| API beta 标头 | `src/services/api/withRetry.ts` | **布线** | 启用时发送 `bash_classifier` beta |

### 2.2 参考实现：yoloClassifier.ts

文件：`src/utils/permissions/yoloClassifier.ts`（1496 行）

这是已实现的完整分类器，可作为 bashClassifier.ts 的参考：

```
两阶段分类：
1. 快速阶段：构建对话记录 → 调用 sideQuery（Opus）→ 快速阻止/允许
2. 深度阶段：思考链分析 → 最终决策
```

特性：
- 构建完整对话记录上下文
- 调用安全系统提示的 sideQuery
- GrowthBook 配置和指标
- 错误处理和降级

### 2.3 分类器在权限管道中的位置

```
bash 命令到达
      │
      ▼
bashPermissions.ts 权限检查
      │
      ├── 传统规则匹配（字符串级别）
      │
      └── [BASH_CLASSIFIER] LLM 分类
            │
            ├── allow → 自动通过
            ├── deny → 自动拒绝
            └── ask → 显示权限对话框
                  │
                  ├── 分类器自动审批标记
                  └── 审核选项（用户可覆盖）
```

## 三、需要补全的内容

| 函数 | 需要实现 | 说明 |
|------|---------|------|
| `classifyBashCommand()` | LLM 调用评估安全性 | 参考 yoloClassifier.ts 的两阶段模式 |
| `isClassifierPermissionsEnabled()` | GrowthBook/配置检查 | 控制分类器是否激活 |
| `getBashPromptDenyDescriptions()` | 返回基于提示的拒绝规则 | 权限设置描述 |
| `getBashPromptAskDescriptions()` | 返回询问规则 | 需要用户确认的命令 |
| `getBashPromptAllowDescriptions()` | 返回允许规则 | 自动通过的命令 |
| `generateGenericDescription()` | LLM 生成命令描述 | 为权限对话框提供说明 |
| `extractPromptDescription()` | 解析规则内容 | 从规则中提取描述 |

## 四、关键设计决策

1. **ANT-ONLY 标记**：bashClassifier.ts 标注为 "ANT-ONLY"，可能是 Anthropic 内部服务端分类器的客户端适配
2. **两阶段分类**：快速阶段处理明确情况（减少延迟），深度阶段处理模糊情况
3. **分类器结果可审核**：权限 UI 显示分类器决策，用户可覆盖
4. **YOLO 分类器参考**：yoloClassifier.ts 提供完整的分类器实现模式，可直接参考

## 五、使用方式

```bash
# 启用 feature
FEATURE_BASH_CLASSIFIER=1 bun run dev

# 配合 TREE_SITTER_BASH 使用（AST + LLM 双重安全）
FEATURE_BASH_CLASSIFIER=1 FEATURE_TREE_SITTER_BASH=1 bun run dev
```

## 六、文件索引

| 文件 | 行数 | 职责 |
|------|------|------|
| `src/utils/permissions/bashClassifier.ts` | — | Bash 分类器（stub，ANT-ONLY） |
| `src/utils/permissions/yoloClassifier.ts` | 1496 | YOLO 分类器（完整参考实现） |
| `src/utils/classifierApprovals.ts` | — | 分类器审批信号管理 |
| `src/components/permissions/BashPermissionRequest/BashPermissionRequest.tsx` | — | 分类器 UI |
| `src/hooks/toolPermission/handlers/interactiveHandler.ts` | — | 交互式权限处理 |
| `src/services/api/withRetry.ts` | — | API beta 标头 |
