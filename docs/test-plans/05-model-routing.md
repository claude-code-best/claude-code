# 模型路由测试计划

## 概述

模型路由系统负责 API provider 选择、模型别名解析、模型名规范化和运行时模型决策。测试重点是纯函数和环境变量驱动的逻辑。

## 被测文件

| 文件 | 关键导出 |
|------|----------|
| `src/utils/model/aliases.ts` | `MODEL_ALIASES`, `MODEL_FAMILY_ALIASES`, `isModelAlias`, `isModelFamilyAlias` |
| `src/utils/model/providers.ts` | `APIProvider`, `getAPIProvider`, `isFirstPartyAnthropicBaseUrl` |
| `src/utils/model/model.ts` | `firstPartyNameToCanonical`, `getCanonicalName`, `parseUserSpecifiedModel`, `normalizeModelStringForAPI`, `getRuntimeMainLoopModel`, `getDefaultMainLoopModelSetting` |

---

## 测试用例

### src/utils/model/aliases.ts

#### describe('isModelAlias')

- test('returns true for "sonnet"') — 有效别名
- test('returns true for "opus"')
- test('returns true for "haiku"')
- test('returns true for "best"')
- test('returns true for "sonnet[1m]"')
- test('returns true for "opus[1m]"')
- test('returns true for "opusplan"')
- test('returns false for full model ID') — `'claude-sonnet-4-6-20250514'` → false
- test('returns false for unknown string') — `'gpt-4'` → false
- test('is case-sensitive') — `'Sonnet'` → false（别名是小写）

#### describe('isModelFamilyAlias')

- test('returns true for "sonnet"')
- test('returns true for "opus"')
- test('returns true for "haiku"')
- test('returns false for "best"') — best 不是 family alias
- test('returns false for "opusplan"')
- test('returns false for "sonnet[1m]"')

---

### src/utils/model/providers.ts

#### describe('getAPIProvider')

- test('returns "firstParty" by default') — 无相关 env 时返回 firstParty
- test('returns "bedrock" when CLAUDE_CODE_USE_BEDROCK is set') — env 为 truthy 值
- test('returns "vertex" when CLAUDE_CODE_USE_VERTEX is set')
- test('returns "foundry" when CLAUDE_CODE_USE_FOUNDRY is set')
- test('bedrock takes precedence over vertex') — 多个 env 同时设置时 bedrock 优先

#### describe('isFirstPartyAnthropicBaseUrl')

- test('returns true when ANTHROPIC_BASE_URL is not set') — 默认 API
- test('returns true for api.anthropic.com') — `'https://api.anthropic.com'` → true
- test('returns false for custom URL') — `'https://my-proxy.com'` → false
- test('returns false for invalid URL') — 非法 URL → false
- test('returns true for staging URL when USER_TYPE is ant') — `'https://api-staging.anthropic.com'` + ant → true

---

### src/utils/model/model.ts

#### describe('firstPartyNameToCanonical')

- test('maps opus-4-6 full name to canonical') — `'claude-opus-4-6-20250514'` → `'claude-opus-4-6'`
- test('maps sonnet-4-6 full name') — `'claude-sonnet-4-6-20250514'` → `'claude-sonnet-4-6'`
- test('maps haiku-4-5') — `'claude-haiku-4-5-20251001'` → `'claude-haiku-4-5'`
- test('maps 3P provider format') — `'us.anthropic.claude-opus-4-6-v1:0'` → `'claude-opus-4-6'`
- test('maps claude-3-7-sonnet') — `'claude-3-7-sonnet-20250219'` → `'claude-3-7-sonnet'`
- test('maps claude-3-5-sonnet') → `'claude-3-5-sonnet'`
- test('maps claude-3-5-haiku') → `'claude-3-5-haiku'`
- test('maps claude-3-opus') → `'claude-3-opus'`
- test('is case insensitive') — `'Claude-Opus-4-6'` → `'claude-opus-4-6'`
- test('falls back to input for unknown model') — `'unknown-model'` → `'unknown-model'`
- test('differentiates opus-4 vs opus-4-5 vs opus-4-6') — 更具体的版本优先匹配

#### describe('parseUserSpecifiedModel')

- test('resolves "sonnet" to default sonnet model')
- test('resolves "opus" to default opus model')
- test('resolves "haiku" to default haiku model')
- test('resolves "best" to best model')
- test('resolves "opusplan" to default sonnet model') — opusplan 默认用 sonnet
- test('appends [1m] suffix when alias has [1m]') — `'sonnet[1m]'` → 模型名 + `'[1m]'`
- test('preserves original case for custom model names') — `'my-Custom-Model'` 保留大小写
- test('handles [1m] suffix on non-alias models') — `'custom-model[1m]'` → `'custom-model[1m]'`
- test('trims whitespace') — `'  sonnet  '` → 正确解析

#### describe('getRuntimeMainLoopModel')

- test('returns mainLoopModel by default') — 无特殊条件时原样返回
- test('returns opus in plan mode when opusplan is set') — opusplan + plan mode → opus
- test('returns sonnet in plan mode when haiku is set') — haiku + plan mode → sonnet 升级
- test('returns mainLoopModel in non-plan mode') — 非 plan 模式不做替换

---

## Mock 需求

| 依赖 | Mock 方式 | 说明 |
|------|-----------|------|
| `process.env.CLAUDE_CODE_USE_BEDROCK/VERTEX/FOUNDRY` | 直接设置/恢复 | provider 选择 |
| `process.env.ANTHROPIC_BASE_URL` | 直接设置/恢复 | URL 检测 |
| `process.env.USER_TYPE` | 直接设置/恢复 | staging URL 和 ant 功能 |
| `getModelStrings()` | mock.module | 返回固定模型 ID |
| `getMainLoopModelOverride` | mock.module | 会话中模型覆盖 |
| `getSettings_DEPRECATED` | mock.module | 用户设置中的模型 |
| `getUserSpecifiedModelSetting` | mock.module | `getRuntimeMainLoopModel` 依赖 |
| `isModelAllowed` | mock.module | allowlist 检查 |
