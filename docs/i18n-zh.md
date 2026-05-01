# 中文国际化 (i18n) 技术文档

## 概述

本项目实现了完整的中文国际化支持，用户在 `/config` 中设置 Language = 中文后，所有 UI 界面一键切换为中文，重启后持久生效。

## 架构

### 翻译查找链

```
t(key, defaultValue)
  ① lang === 'en' → 直接返回 defaultValue
  ② zh-CN.ts 内置翻译 → 命中则返回
  ③ ~/.claude/translations/zh.json 持久化翻译 → 命中则返回
  ④ autoTranslate(defaultValue) → 短语词典 + 单词级回退
  ⑤ 返回原始 key
```

### 核心模块

| 模块 | 文件 | 职责 |
|------|------|------|
| 翻译函数 | `src/utils/i18n/index.ts` | `t()` 函数，查找链调度 |
| 语言包 | `src/locales/zh-CN.ts` | 200+ 条人工翻译 |
| 自动翻译 | `src/utils/i18n/autoTranslate.ts` | 本地短语词典，兜底翻译 |
| /translate 命令 | `src/commands/translate/index.ts` | 用户触发的增量翻译 |
| 语言解析 | `src/utils/language.ts` | `getResolvedLanguage()` 解析 en/zh |

## 使用方式

### 切换语言

```bash
# 方式 1: /config 界面设置
/config → 选择 Language → 中文

# 方式 2: /lang 命令
/lang zh       # 切换到中文
/lang en       # 切换到英文
/lang auto     # 自动检测（默认）
```

### 翻译第三方命令

安装新技能/插件后，运行 `/translate` 即可自动翻译所有未覆盖的命令描述：

```bash
/translate
```

翻译结果持久化到 `~/.claude/translations/zh.json`，重启后自动加载。

## 开发指南

### 添加新的翻译

**1. 内置翻译（推荐）**

在 `src/locales/zh-CN.ts` 中添加键值对：

```typescript
'cmd.mycommand.description': '我的命令描述',
'settings.myLabel.label': '我的标签',
```

**2. 在组件中使用**

```typescript
import { t } from '../utils/i18n/index.js'

// 基本用法
const label = t('settings.apiKey.label', 'API Key')

// 条件渲染
import { isChinese } from '../utils/i18n/index.js'
if (isChinese()) { /* 中文专属逻辑 */ }
```

### 翻译键命名规范

| 类别 | 格式 | 示例 |
|------|------|------|
| 命令描述 | `cmd.<name>.description` | `cmd.help.description` |
| Settings 标签 | `settings.<key>.label` | `settings.apiKey.label` |
| 权限相关 | `perm.<key>` | `perm.toCancel` |
| 通知消息 | `notif.<key>` | `notif.fastModeAvailable` |
| MCP 状态 | `mcp.<status>` | `mcp.status.connected` |
| Agent 界面 | `agent.<key>` | `agent.viewEdit` |

### autoTranslate 词典

`src/utils/i18n/autoTranslate.ts` 包含：
- ~100 个短语模式（正则匹配完整短语）
- ~100 个单词映射（逐词翻译）

当 `t()` 找不到显式翻译时，自动调用 `autoTranslate()` 作为兜底。
翻译质量不如人工或 `/translate` 命令，但保证任何英文描述都有基本中文输出。

### 添加新短语到词典

```typescript
// autoTranslate.ts 中的 PHRASE_DICT
[/clear (all )?cached data/i, '清除所有缓存数据'],
[/manage (your )?database/i, '管理数据库'],

// WORD_MAP 中的单词映射
'server': '服务器',
'plugin': '插件',
```

## /translate 命令工作原理

```
用户运行 /translate
    ↓
getPromptForCommand() 本地执行:
  - getCommands() 获取所有命令
  - 过滤已有翻译（zh-CN.ts + persisted JSON）
  - 只保留未翻译的描述
    ↓
生成精简 prompt（约 2k token）:
  - 仅包含未翻译的描述列表
  - 指令：翻译为中文，输出 JSON
    ↓
Claude 翻译 + Write 工具写入
  - 合并到 ~/.claude/translations/zh.json
  - 保留已有翻译，只添加新的
```

### Token 消耗

- 首次运行：约 2-3k token（取决于未翻译命令数量）
- 后续运行：几乎为零（增量，只翻译新增的）

## 已知限制

1. `autoTranslate` 是本地正则词典，翻译质量有限（半中半英）
2. `/translate` 依赖 Claude 翻译，需要联网
3. 持久化翻译不会自动清理已删除命令的条目
4. `argumentHint` 等短文本未翻译（保留英文更直观）
