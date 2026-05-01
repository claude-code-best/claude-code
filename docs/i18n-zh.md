# 适配中文本地支持

## 一句话总结

在 `/config` 中设置 Language = 中文，所有界面一键切换中文，重启持久生效。第三方/插件命令通过 `/translate` 增量翻译，无需插件开发者适配。

---

## 用户指南

### 切换语言

三种方式，效果相同：

```text
/config  →  选择 Language  →  中文
/lang zh
/lang en       # 切回英文
/lang auto     # 自动检测（默认）
```

切换后立即生效，重启后保持。

### 翻译第三方命令

安装新技能或插件后，命令列表中可能仍有英文描述。运行一次：

```text
/translate
```

Claude 会自动翻译所有未覆盖的命令描述，结果保存到 `~/.claude/translations/zh.json`，重启后自动加载。

- 安装新技能 → 再跑一次 `/translate`，只翻译新增的
- 卸载技能 → 再跑一次 `/translate`，自动清理过期翻译
- 幂等操作，跑多少次都一样

---

## 主要改动

### 1. i18n 基础设施

| 新增/修改文件 | 说明 |
|---|---|
| `src/utils/i18n/index.ts` | 核心 `t()` 翻译函数，四层查找链 |
| `src/utils/i18n/autoTranslate.ts` | 本地短语词典，兜底翻译 |
| `src/locales/zh-CN.ts` | 中文语言包，200+ 条人工翻译 |
| `src/utils/language.ts` | `getResolvedLanguage()` 解析 en/zh/auto |

翻译查找链：

```text
t(key, defaultValue, params?)
  ① lang === 'en' → 直接返回英文
  ② zh-CN.ts 内置翻译 → 命中返回
  ③ ~/.claude/translations/zh.json 持久化翻译 → 命中返回
  ④ autoTranslate(defaultValue) → 短语词典兜底
  ⑤ 返回原始 key
  最后对结果执行 {key} 插值替换
```

### 2. /translate 命令

| 文件 | 说明 |
|---|---|
| `src/commands/translate/index.ts` | prompt 类型命令，Claude 批量翻译 |

工作流程：

1. 本地扫描所有命令，过滤已翻译的（零 token）
2. 只将未翻译的增量列表发给 Claude（约 2k token）
3. Claude 翻译后合并写入 `~/.claude/translations/zh.json`
4. 同时清理已卸载命令的过期翻译

### 3. 内置命令中文注释

94+ 条命令描述翻译，覆盖 `/help`、`/config`、`/commit`、`/review` 等所有内置命令。

改动点：`src/commands.ts` 中 `formatDescriptionWithSource()` 调用 `t()` 翻译描述。

### 4. Settings 配置界面汉化

37 个配置标签全部汉化，Tab 标题翻译为中文。

| 文件 | 改动 |
|---|---|
| `src/components/Settings/Config.tsx` | 37 个 label 包裹 `t()` |
| `src/components/Settings/Settings.tsx` | Tab 添加 `id` 属性 + 大小写匹配修复 |

### 5. 权限对话框汉化

| 文件 | 翻译内容 |
|---|---|
| `BashPermissionRequest/bashToolUseOptions.tsx` | Yes/No/始终允许/描述占位符 |
| `AskUserQuestionPermissionRequest/SubmitQuestionsView.tsx` | 审核答案/警告/提交/取消 |
| `ExitPlanModePermissionRequest.tsx` | 无计划/权限请求 |
| `FilePermissionDialog/permissionOptions.tsx` | 此目录 |
| `PermissionPrompt.tsx` | 取消 |

### 6. 其他 UI 汉化

| 文件 | 翻译内容 |
|---|---|
| `src/components/LanguagePicker.tsx` | 语言选择界面 |
| `src/components/ThemePicker.tsx` | 主题选择器 |
| `src/components/PromptInput/PromptInput.tsx` | 通知提示 |
| `src/components/mcp/MCPListPanel.tsx` | MCP 状态标签 |
| `src/components/mcp/MCPStdioServerMenu.tsx` | MCP 菜单项 |
| `src/components/mcp/MCPRemoteServerMenu.tsx` | MCP 远程菜单 |
| `src/components/agents/AgentsMenu.tsx` | Agent 菜单项 |
| `src/components/agents/AgentEditor.tsx` | Agent 编辑器 |
| `src/hooks/notifs/useFastModeNotification.tsx` | 快速模式通知 |
| `src/hooks/notifs/useModelMigrationNotifications.tsx` | 模型迁移通知 |
| `src/hooks/usePipeRouter.ts` | 管道不可用通知 |
| `src/utils/suggestions/commandSuggestions.ts` | 命令搜索索引翻译 |

### 7. Bug 修复

**Settings Tab 冻结**：Tabs 组件用 `child.props.id ?? child.props.title` 做标识，中文 title 导致匹配失败。修复：给 Tab 添加 `id` 属性，`useState` 统一转小写。

---

## 开发指南

### 添加新翻译

在 `src/locales/zh-CN.ts` 中添加：

```typescript
'cmd.mycommand.description': '我的命令描述',
'settings.myLabel.label': '我的标签',
```

在组件中使用：

```typescript
import { t } from '../utils/i18n/index.js'
const label = t('settings.apiKey.label', 'API Key')
// 带插值
const hint = t('dialog.plan.editHint', 'ctrl-g to edit in {editor}', { editor: 'VS Code' })
```

### 翻译键命名规范

| 类别 | 格式 | 示例 |
|---|---|---|
| 命令描述 | `cmd.<name>.description` | `cmd.help.description` |
| Settings 标签 | `settings.<key>.label` | `settings.apiKey.label` |
| 权限相关 | `perm.<key>` | `perm.toCancel` |
| 通知消息 | `notif.<key>` | `notif.fastModeAvailable` |
| MCP 状态 | `mcp.<status>` | `mcp.status.connected` |
| Agent 界面 | `agent.<key>` | `agent.viewEdit` |

---

## 已知限制

1. `autoTranslate` 是本地正则词典，翻译质量有限（半中半英），仅作兜底
2. `/translate` 依赖 Claude 翻译，需要联网
3. `argumentHint` 等短文本未翻译（保留英文更直观）
