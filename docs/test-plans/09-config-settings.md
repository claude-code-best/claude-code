# 配置系统测试计划

## 概述

配置系统包含全局配置（GlobalConfig）、项目配置（ProjectConfig）和设置（Settings）三层。测试重点是纯函数校验逻辑、Zod schema 验证和配置合并策略。

## 被测文件

| 文件 | 关键导出 |
|------|----------|
| `src/utils/config.ts` | `getGlobalConfig`, `saveGlobalConfig`, `getCurrentProjectConfig`, `checkHasTrustDialogAccepted`, `isPathTrusted`, `getOrCreateUserID`, `isAutoUpdaterDisabled` |
| `src/utils/settings/settings.ts` | `getSettingsForSource`, `parseSettingsFile`, `getSettingsFilePathForSource`, `getInitialSettings` |
| `src/utils/settings/types.ts` | `SettingsSchema`（Zod schema） |
| `src/utils/settings/validation.ts` | 设置验证函数 |
| `src/utils/settings/constants.ts` | 设置常量 |

---

## 测试用例

### src/utils/config.ts — 纯函数/常量

#### describe('DEFAULT_GLOBAL_CONFIG')

- test('has all required fields') — 默认配置对象包含所有必需字段
- test('has null auth fields by default') — oauthAccount 等为 null

#### describe('DEFAULT_PROJECT_CONFIG')

- test('has empty allowedTools') — 默认为空数组
- test('has empty mcpServers') — 默认为空对象

#### describe('isAutoUpdaterDisabled')

- test('returns true when CLAUDE_CODE_DISABLE_AUTOUPDATER is set') — env 设置时禁用
- test('returns true when disableAutoUpdater config is true')
- test('returns false by default')

---

### src/utils/config.ts — 需 Mock

#### describe('getGlobalConfig')

- test('returns cached config on subsequent calls') — 缓存机制
- test('returns TEST_GLOBAL_CONFIG_FOR_TESTING in test mode')
- test('reads config from ~/.claude.json')
- test('returns default config when file does not exist')

#### describe('saveGlobalConfig')

- test('applies updater function to current config') — updater 修改被保存
- test('creates backup before writing') — 写入前备份
- test('prevents auth state loss') — `wouldLoseAuthState` 检查

#### describe('getCurrentProjectConfig')

- test('returns project config for current directory')
- test('returns default config when no project config exists')

#### describe('checkHasTrustDialogAccepted')

- test('returns true when trust is accepted in current directory')
- test('returns true when parent directory is trusted') — 父目录信任传递
- test('returns false when no trust accepted')
- test('caches positive results')

#### describe('isPathTrusted')

- test('returns true for trusted path')
- test('returns false for untrusted path')

#### describe('getOrCreateUserID')

- test('returns existing user ID from config')
- test('creates and persists new ID when none exists')
- test('returns consistent ID across calls')

---

### src/utils/settings/settings.ts

#### describe('getSettingsFilePathForSource')

- test('returns ~/.claude/settings.json for userSettings') — 全局用户设置路径
- test('returns .claude/settings.json for projectSettings') — 项目设置路径
- test('returns .claude/settings.local.json for localSettings') — 本地设置路径

#### describe('parseSettingsFile')（需 Mock 文件读取）

- test('parses valid settings JSON') — 有效 JSON → `{ settings, errors: [] }`
- test('returns errors for invalid fields') — 无效字段 → errors 非空
- test('returns empty settings for non-existent file')
- test('handles JSON with comments') — JSONC 格式支持

#### describe('getInitialSettings')

- test('merges settings from all sources') — user + project + local 合并
- test('later sources override earlier ones') — 优先级：policy > user > project > local

---

### src/utils/settings/types.ts — Zod Schema 验证

#### describe('SettingsSchema validation')

- test('accepts valid minimal settings') — `{}` → 有效
- test('accepts permissions block') — `{ permissions: { allow: ['Bash(*)'] } }` → 有效
- test('accepts model setting') — `{ model: 'sonnet' }` → 有效
- test('accepts hooks configuration') — 有效的 hooks 对象被接受
- test('accepts env variables') — `{ env: { FOO: 'bar' } }` → 有效
- test('rejects unknown top-level keys') — 未知字段被拒绝或忽略（取决于 schema 配置）
- test('rejects invalid permission mode') — `{ permissions: { defaultMode: 'invalid' } }` → 错误
- test('rejects non-string model') — `{ model: 123 }` → 错误
- test('accepts mcpServers configuration') — MCP server 配置有效
- test('accepts sandbox configuration')

---

### src/utils/settings/validation.ts

#### describe('settings validation')

- test('validates permission rules format') — `'Bash(npm install)'` 格式正确
- test('rejects malformed permission rules')
- test('validates hook configuration structure')
- test('provides helpful error messages') — 错误信息包含字段路径

---

## Mock 需求

| 依赖 | Mock 方式 | 说明 |
|------|-----------|------|
| 文件系统 | 临时目录 + mock | config 文件读写 |
| `lockfile` | mock module | 文件锁 |
| `getCwd` | mock module | 项目路径判断 |
| `findGitRoot` | mock module | 项目根目录 |
| `process.env` | 直接设置/恢复 | `CLAUDE_CODE_DISABLE_AUTOUPDATER` 等 |

### 测试用临时文件结构

```
/tmp/claude-test-xxx/
├── .claude/
│   ├── settings.json        # projectSettings
│   └── settings.local.json  # localSettings
├── home/
│   └── .claude/
│       └── settings.json    # userSettings（mock HOME）
└── project/
    └── .git/
```

## 集成测试场景

### describe('Config + Settings merge pipeline')

- test('user settings + project settings merge correctly') — 验证合并优先级
- test('deny rules from settings are reflected in tool permission context')
- test('trust dialog state persists across config reads')
