# UI 渲染与界面层

> 记录 Claude Code 终端 UI（Ink 框架）的渲染行为、布局模式、常见问题及修复。

## LogoV2 启动欢迎界面

### 组件结构

```
LogoV2.tsx (src/components/LogoV2/)
├── CondensedLogo.tsx   — 缩略模式（无边框，日常最常见）
├── LogoV2.tsx          — 完整模式（有边框）/ 紧凑模式（有边框）
├── CondensedLogo.tsx   — 缩略模式（无边框，日常最常见）
├── Clawd.tsx           — ASCII 猫吉祥物
├── AnimatedClawd.tsx   — 动画版 Clawd
├── FeedColumn.tsx      — 右侧信息流（活动记录/更新日志）
└── WelcomeV2.tsx       — 首次 Onboarding 欢迎文本
```

### 三种渲染模式

| 模式 | 触发条件 | 边框 | 说明 |
|------|---------|------|------|
| **缩略模式** (Condensed) | ~~无 Release Notes 且无首次引导~~ | ❌ | **已永久关闭**（2026-04-10），不再进入 |
| **紧凑模式** (Compact) | 终端宽度 < 70 列 | ✅ | 紫色圆角边框，内容居中 |
| **完整模式** (Full) | 默认路径 | ✅ | 紫色圆角边框，双栏布局 + 信息流 |

> **注**：缩略模式已在 `LogoV2.tsx` 中永久关闭（`isCondensedMode = false`），所有启动都走完整模式或紧凑模式。

### 模式判断逻辑（源码：`src/components/LogoV2/LogoV2.tsx`）

```typescript
// 原始逻辑：三种模式切换
const isCondensedMode =
  !hasReleaseNotes &&
  !showOnboarding &&
  !isEnvTruthy(process.env.CLAUDE_CODE_FORCE_FULL_LOGO)

// 环境变量强制：始终显示完整模式
// CLAUDE_CODE_FORCE_FULL_LOGO=1 bun run dev
```

**CondensedLogo 内部**（`src/components/LogoV2/CondensedLogo.tsx`）：无任何边框，纯文本 + ASCII 猫。

### 边框渲染机制

边框由 `@anthropic/ink` 的 `Box` 组件通过 `cli-boxes` 库绘制：

- `borderStyle="round"` → 使用 `cli-boxes` 的 `round` 样式（`╭─╮` `│` `╰─╯`）
- `borderColor="claude"` → 紫色主题色
- `borderText` → 边框顶部嵌入标题文本 "Claude Code"

详见 `packages/@ant/ink/src/core/render-border.ts`。

## 常见问题

### 问题：启动时欢迎边框时有时无

**原因**：日常启动（无 Release Notes、非首次使用）走缩略模式，不显示边框。

**修复**：在 `LogoV2.tsx` 中永久关闭缩略模式：

```diff
-  const isCondensedMode =
-    !hasReleaseNotes &&
-    !showOnboarding &&
-    !isEnvTruthy(process.env.CLAUDE_CODE_FORCE_FULL_LOGO)
+  const isCondensedMode = false

-  if (
-    !hasReleaseNotes &&
-    !showOnboarding &&
-    !isEnvTruthy(process.env.CLAUDE_CODE_FORCE_FULL_LOGO)
-  ) {
+  if (false) {
     return <CondensedLogo />
   }
```

修改后，无论何种情况启动，都会显示完整模式的紫色圆角边框。

**影响**：
- 每次启动都会渲染完整的边框 + 信息流（活动记录或更新日志）
- 轻微增加启动渲染开销（从 0 边框到有边框双栏）
- 不再走 CondensedLogo（节省了 GuestPassesUpsell 等副作用计数逻辑）

### 问题：终端宽度不足导致边框变形

**原因**：`getLayoutMode(columns)` 在终端 < 70 列时切换到 compact 模式。

**参考**：`src/utils/logoV2Utils.ts` — `getLayoutMode(columns: number): LayoutMode`

### 问题：Recent Activity 显示 "No recent activity"

**原因**：`src/setup.ts` 中 `getRecentActivity()` 只在 `hasReleaseNotes` 为 true 时才调用。日常启动（无新 Release Notes）时，`cachedActivity` 始终为空数组。

**修复**（`src/setup.ts` 第 383-395 行）：

```diff
  if (!isBareMode()) {
-   const { hasReleaseNotes } = await checkForReleaseNotes(
-     getGlobalConfig().lastReleaseNotesSeen,
-   )
-   if (hasReleaseNotes) {
-     await getRecentActivity()
-   }
+   // Populate release notes cache (side effect: fetches changelog if needed)
+   void checkForReleaseNotes(getGlobalConfig().lastReleaseNotesSeen)
+   // Load recent activity unconditionally (not tied to release notes)
+   try {
+     await getRecentActivity()
+   } catch (error) {
+     logError('Failed to load recent activity:', error)
+   }
  }
```

**关键变化**：
1. `getRecentActivity()` 从 `if (hasReleaseNotes)` 块中移出，无条件调用
2. 增加 try-catch 防止损坏的会话文件阻塞启动
3. `checkForReleaseNotes` 改为 `void` 调用（保留 cache 填充的副作用，但不阻塞等待结果）
