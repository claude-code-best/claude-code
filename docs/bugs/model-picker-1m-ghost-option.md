# Bug: ModelPicker 1M 选项 key 不匹配导致幽灵选项

## 问题描述

用户通过 `/model` 选择 "Opus 4.6 (1M context)" 后：
1. `[1m]` 后缀被静默丢弃，实际存储的 model 是 `'claude-opus-4-6'`（无 1M）
2. 命令输出显示 `Set model to Opus 4.6` 而非 `Opus 4.6 (1M context)`
3. 再次执行 `/model` 时，选项列表从 4 个变成 5 个，多出一个 "Opus 4.6" 幽灵选项

## 影响范围

所有 value 中自带 `[1m]` 后缀的预定义选项都受影响：
- `getOpus46_1MOption()` — value: `getModelStrings().opus46 + '[1m]'` → `'claude-opus-4-6[1m]'`
- `getOpus47_1MOption()` — value: `'opus[1m]'`（firstParty）
- `getSonnet46_1MOption()` — value: `'sonnet[1m]'`（firstParty）
- `getMergedOpus1MOption()` — value: `'opus[1m]'`（firstParty）
- 所有 3P provider 的 1M 变体

## 根因分析

### 涉及文件

| 文件 | 行号 | 角色 |
|------|------|------|
| `src/components/ModelPicker.tsx` | 87-89 | `marked1MValues` 初始化（存储 base value） |
| `src/components/ModelPicker.tsx` | 91-102 | `handleToggle1M` — Space 键切换 1M 标记 |
| `src/components/ModelPicker.tsx` | 205-243 | `handleSelect` — 提交选择时的 1M 判断逻辑 |
| `src/utils/model/modelOptions.ts` | 565-601 | `getModelOptions()` — custom model 追加逻辑 |

### Bug 链条详解

#### 第 1 步：`marked1MValues` 的 key 格式

`ModelPicker.tsx:87-89`：
```typescript
const [marked1MValues, setMarked1MValues] = useState<Set<string>>(
  () => new Set(has1mContext(initialValue) ? [initialValue.replace(/\[1m\]/i, '')] : [])
)
```

初始化时，如果当前 model 带 `[1m]`，存入的是 **去掉 `[1m]` 的 base value**。
例如：`initialValue = 'claude-opus-4-6[1m]'` → set 中存 `'claude-opus-4-6'`

`handleToggle1M`（第 91-102 行）也是对 `focusedValue`（即 option 的 value 字段）直接操作，添加/删除的是 option 的原始 value。

#### 第 2 步：`handleSelect` 中的 key 查找不匹配

`ModelPicker.tsx:239-241`：
```typescript
const wants1M = marked1MValues.has(value)           // 用 option 的完整 value 查找
const baseValue = value.replace(/\[1m\]/i, '')       // 去掉 [1m]
const finalValue = wants1M ? `${baseValue}[1m]` : baseValue  // 根据 wants1M 决定
```

问题：`value` 是 select option 的原始 value，对于 `getOpus46_1MOption()` 来说就是 `'claude-opus-4-6[1m]'`。但 `marked1MValues` 中存的 key 是 `'claude-opus-4-6'`（不带 `[1m]`）。

`marked1MValues.has('claude-opus-4-6[1m]')` **永远返回 false**。

因此 `wants1M = false`，`finalValue = 'claude-opus-4-6'`，1M 后缀被丢弃。

#### 第 3 步：幽灵选项产生

下次打开 `/model` 时，`initial = 'claude-opus-4-6'`。

`modelOptions.ts` 的 `getModelOptions()` 第 565-601 行检查 `customModel`：
- `customModel = 'claude-opus-4-6'`
- 基础选项中没有 value 为 `'claude-opus-4-6'` 的（只有 `'claude-opus-4-6[1m]'`）
- 第 590 行 `getKnownModelOption('claude-opus-4-6')` 返回一个新选项 `{ value: 'claude-opus-4-6', label: 'Opus 4.6', ... }`
- 追加到列表 → **5 个选项**

最终列表：
1. Default (recommended) — value: `null`
2. Opus 4.7 (merged 1M) — value: `'opus[1m]'`
3. Opus 4.6 (1M context) — value: `'claude-opus-4-6[1m]'`（原始预定义选项）
4. Haiku — value: `'haiku'`
5. **Opus 4.6** — value: `'claude-opus-4-6'`（幽灵选项，由 custom model 逻辑追加）

## 修复方案

### 方案 A：修复 `handleSelect` 中的 1M 判断逻辑（推荐）

在 `ModelPicker.tsx` 的 `handleSelect` 中，检查 1M 状态时应该用 base value 作为 key（与 `marked1MValues` 的存储格式一致），并且要考虑 option value 本身就带 `[1m]` 的情况。

**修改位置**：`src/components/ModelPicker.tsx` 第 239-241 行

**当前代码**：
```typescript
const wants1M = marked1MValues.has(value)
const baseValue = value.replace(/\[1m\]/i, '')
const finalValue = wants1M ? `${baseValue}[1m]` : baseValue
```

**修复思路**：
```typescript
const baseValue = value.replace(/\[1m\]/i, '')
const optionHas1M = has1mContext(value)           // option 自带 [1m]?
const userToggled1M = marked1MValues.has(baseValue)  // 用 base value 查找
// 如果 option 自带 1M 且用户没有主动关闭，或者用户主动开启了 1M
const wants1M = optionHas1M ? !userToggled1M : userToggled1M  // 注意：toggle 语义需反转
// 实际上更简洁的方式：直接用 base value 查 set
const wants1M = marked1MValues.has(baseValue)
const finalValue = wants1M ? `${baseValue}[1m]` : baseValue
```

但这需要同时修改 `handleToggle1M` 和 `marked1MValues` 的初始化逻辑，确保三者的 key 格式统一。

### 方案 B：统一 `marked1MValues` 的 key 格式

让 `marked1MValues` 始终存储 base value（当前已经是这样），同时修改 `handleSelect` 用 base value 查找，修改 `handleToggle1M` 也用 base value 操作。

**需要修改的位置**：

1. **`handleToggle1M`（第 91-102 行）** — 当前直接用 `focusedValue` 作为 key。如果 `focusedValue` 带 `[1m]`（如 `'claude-opus-4-6[1m]'`），存入的 key 会与初始化时的格式不一致。需要统一为 base value：
   ```typescript
   const handleToggle1M = useCallback(() => {
     if (!focusedValue || focusedValue === NO_PREFERENCE) return
     const base = focusedValue.replace(/\[1m\]/i, '')  // 统一用 base value
     setMarked1MValues(prev => {
       const next = new Set(prev)
       if (next.has(base)) {
         next.delete(base)
       } else {
         next.add(base)
       }
       return next
     })
   }, [focusedValue])
   ```

2. **`is1MMarked` 判断（第 157 行）** — 也需要用 base value 查找：
   ```typescript
   const is1MMarked = focusedValue !== undefined
     && focusedValue !== NO_PREFERENCE
     && marked1MValues.has(focusedValue.replace(/\[1m\]/i, ''))
   ```

3. **`handleSelect`（第 239 行）** — 用 base value 查找：
   ```typescript
   const baseValue = value.replace(/\[1m\]/i, '')
   const wants1M = marked1MValues.has(baseValue)
   const finalValue = wants1M ? `${baseValue}[1m]` : baseValue
   ```

### 方案 C：让预定义 1M 选项的 value 不带 `[1m]`

将 `getOpus46_1MOption()` 等函数的 value 改为不带 `[1m]` 的 base value，让 1M 完全由 `marked1MValues` toggle 控制。这是最彻底的方案但改动最大，需要同时修改 `modelOptions.ts` 中所有 `*_1MOption` 函数。

## 推荐方案

**方案 B**：统一 `marked1MValues` 的 key 格式为 base value，修改 3 个位置。改动最小、最精准，不影响选项列表的结构。

## 验证步骤

1. 选择 "Opus 4.6 (1M context)" → 确认输出为 `Set model to Opus 4.6 (1M context)`
2. 再次 `/model` → 确认仍然是 4 个选项，无幽灵项
3. 选择 "Opus 4.7 (1M context)" → 同样验证无幽灵项
4. 手动 Space 切换 1M on/off → 确认 toggle 正常工作
5. 对已带 `[1m]` 的选项按 Space 关闭 1M → 确认存储的值不带 `[1m]`
