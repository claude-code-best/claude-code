# i18n 国际化指南

## 概述

Claude Code 的国际化 (i18n) 系统允许应用支持多种语言，目前支持：
- **en-US** - 英语（默认）
- **zh-CN** - 简体中文

## 快速开始

### 1. 导入翻译函数

```typescript
import { t } from 'src/i18n';
```

### 2. 使用翻译

```typescript
// 简单翻译
const text = t('common.loading');  // "加载中..." 或 "Loading..."

// 带参数的翻译
const message = t('notifications.noImage', { shortcut: 'Ctrl+V' });
// 输出："剪贴板中没有图片。使用 Ctrl+V 粘贴图片。"
```

## 翻译键命名规范

使用点分隔的层级命名：

```
category.subcategory.item
```

例如：
- `common.loading` - 通用加载文本
- `chat.input.placeholder` - 聊天输入框占位符
- `permissions.title` - 权限对话框标题

## 可用的翻译键

### 通用 (common.*)
| 键 | 英文 | 中文 |
|---|---|---|
| `common.loading` | Loading... | 加载中... |
| `common.confirm` | Confirm | 确认 |
| `common.cancel` | Cancel | 取消 |
| `common.yes` | Yes | 是 |
| `common.no` | No | 否 |
| `common.ok` | OK | 确定 |
| `common.close` | Close | 关闭 |
| `common.retry` | Retry | 重试 |

### 聊天 (chat.*)
| 键 | 英文 | 中文 |
|---|---|---|
| `chat.input.placeholder` | Type a message... | 输入消息或 '/' 查看命令... |
| `chat.submit` | Send | 发送 |
| `chat.cancelling` | Cancelling... | 取消中... |

### 权限 (permissions.*)
| 键 | 英文 | 中文 |
|---|---|---|
| `permissions.title` | Permission Request | 权限请求 |
| `permissions.allow` | Allow | 允许 |
| `permissions.deny` | Deny | 拒绝 |

### 设置 (settings.*)
| 键 | 英文 | 中文 |
|---|---|---|
| `settings.title` | Settings | 设置 |
| `settings.general` | General | 通用 |
| `settings.appearance` | Appearance | 外观 |

## 添加新的翻译

### 步骤 1: 在翻译文件中添加键值

编辑 `src/i18n/locales/en-US.json` 和 `src/i18n/locales/zh-CN.json`：

```json
{
  "my.new.key": "English text",
  "my.new.key": "中文文本"
}
```

### 步骤 2: 在代码中使用

```typescript
const text = t('my.new.key');
```

### 步骤 3: 带参数的翻译

如果文本包含动态内容，使用参数：

```json
{
  "greeting": "Hello, {name}!",
  "greeting": "你好，{name}！"
}
```

```typescript
const text = t('greeting', { name: 'World' });
```

## 运行时切换语言

```typescript
import { setLocale, getLocale } from 'src/i18n';

// 获取当前语言
const current = getLocale();  // 'en-US' 或 'zh-CN'

// 切换语言
setLocale('zh-CN');
```

## 最佳实践

1. **始终使用翻译键**：不要在 UI 代码中使用硬编码的字符串
2. **保持一致性**：相同的概念使用相同的翻译键
3. **避免过度嵌套**：键名深度不超过 3-4 层
4. **参数化动态内容**：使用 `{param}` 语法而不是字符串拼接
5. **翻译所有用户可见文本**：包括错误消息、通知、按钮文本等

## 示例

### 组件中使用 i18n

```typescript
import { t } from 'src/i18n';
import { Text } from 'src/ink.js';

function MyComponent() {
  return (
    <Box>
      <Text>{t('common.loading')}</Text>
      <Text>{t('permissions.title')}</Text>
    </Box>
  );
}
```

### 错误处理

```typescript
import { t } from 'src/i18n';

function handleError(error: Error) {
  console.error(t('errors.generic'), error);
  // 如果翻译键不存在，会返回键名本身，便于调试
}
```

## 文件结构

```
src/i18n/
├── index.ts           # 核心翻译函数 t()
├── init.ts            # 初始化逻辑
├── README.md          # 快速参考
└── locales/
    ├── en-US.json     # 英文翻译
    └── zh-CN.json     # 中文翻译
```

## 注意事项

1. **不要删除已有的翻译键**：可能导致旧代码返回键名
2. **保持英文和中文键名一致**：便于维护
3. **测试两种语言**：确保翻译正确显示
4. **locale 自动检测**：启动时根据系统语言自动选择
