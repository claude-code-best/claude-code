# 自动更新机制

## 概述

Claude Code 拥有一套复杂的多策略自动更新系统，支持三种安装方式、后台静默更新、手动 CLI 命令、服务端版本门控以及更新日志展示。系统设计目标是在最小用户干预下保持 CLI 最新，同时提供回滚和手动控制的兜底手段。

---

## 安装类型与更新策略

更新策略由安装方式决定，通过 `src/utils/doctorDiagnostic.ts` 检测：

| 安装类型 | 更新策略 | 自动安装？ |
|---|---|---|
| `native` | 从 GCS/Artifactory 下载二进制文件，通过符号链接激活 | 是（静默） |
| `npm-global` | `npm install -g` / `bun install -g` | 是（静默） |
| `npm-local` | `npm install` 到 `~/.claude/local/` | 是（静默） |
| `package-manager` | 显示通知，附带对应操作系统的升级命令 | 否（仅通知） |
| `development` | 不适用 — 执行 `claude update` 时报错 | 不适用 |

### 策略路由

`src/components/AutoUpdaterWrapper.tsx` — 挂载在 React/Ink UI 树中 — 检测安装类型并渲染对应的更新组件：

- `native` → `NativeAutoUpdater`（二进制下载 + 符号链接）
- `package-manager` → `PackageManagerAutoUpdater`（仅通知）
- 其他 → `AutoUpdater`（基于 JS/npm）

---

## 后台自动更新循环

三个更新组件共享相同的轮询模式：

```typescript
useInterval(checkForUpdates, 30 * 60 * 1000); // 每 30 分钟
```

组件挂载时（即启动时）也会执行一次检查。

### 前置检查门控

任何更新尝试之前，系统会依次检查：

1. **自动更新是否被禁用？** — `getAutoUpdaterDisabledReason()`（`src/utils/config.ts:1737`）
   - `NODE_ENV === 'development'`
   - 设置了 `DISABLE_AUTOUPDATER` 环境变量
   - 仅限必要流量模式
   - `config.autoUpdates === false`（native 安装的保护模式除外）
2. **最大版本上限？** — `getMaxVersion()`（`src/utils/autoUpdater.ts:108`）— 服务端熔断开关，防止更新到已知有问题的版本
3. **是否跳过该版本？** — `shouldSkipVersion()`（`src/utils/autoUpdater.ts:145`）— 尊重用户的 `minimumVersion` 设置，防止切换到 stable 频道时发生意外的版本降级

### Native 自动更新器（`src/components/NativeAutoUpdater.tsx`）

1. 调用 `src/utils/nativeInstaller/installer.ts` 中的 `installLatest()`
2. 通过 `src/utils/nativeInstaller/download.ts` 下载二进制文件（GCS 或 Artifactory）
3. 验证 SHA256 校验和（3 次重试，60 秒卡顿检测）
4. 将版本化二进制文件存储到 XDG 目录
5. 更新符号链接（`~/.local/bin/claude` → 新版本二进制文件）
6. 保留最近 2 个版本，清理旧版本
7. 将错误分类上报分析（超时、校验和、权限、磁盘空间不足、npm、网络）

### JS/npm 自动更新器（`src/components/AutoUpdater.tsx`）

1. 调用 `getLatestVersion()` 获取当前 npm dist-tag
2. 通过 semver `gte()` 比较版本
3. 根据安装类型路由到本地或全局安装
4. 使用文件锁（`acquireLock()` / `releaseLock()`）防止并发更新

### 包管理器通知器（`src/components/PackageManagerAutoUpdater.tsx`）

每 30 分钟通过 GCS 存储桶（非 npm）检查更新。**不会自动安装** — 仅显示对应操作系统的升级命令：

- macOS: `brew upgrade claude-code`
- Windows: `winget upgrade Anthropic.ClaudeCode`
- Alpine: `apk upgrade claude-code`

---

## 启动版本门控

`src/utils/autoUpdater.ts:70` — `assertMinVersion()`

定义于 `src/utils/autoUpdater.ts:70`，设计上在启动时调用（当前未接入启动流程）：

```typescript
void assertMinVersion();
```

1. 从 GrowthBook 动态配置获取 `tengu_version_config`
2. 如果 `MACRO.VERSION < minVersion`，打印错误信息并调用 `gracefulShutdownSync(1)` — 强制用户更新
3. 这是一个**硬性门控** — 低于最低版本的 CLI 将无法启动

---

## 手动 CLI 命令

### `claude update` / `claude upgrade`

**文件**: `src/cli/update.ts`

完整流程：
1. 运行 `getDoctorDiagnostic()` 检查系统健康状态
2. 检查是否存在多个安装及配置不一致
3. 根据安装类型路由：
   - `development` → 报错（"开发版本不支持自动更新"）
   - `package-manager` → 打印对应操作系统的更新命令
   - `native` → 使用原生安装器的 `updateLatest()`
   - `npm-local` → 在 `~/.claude/local/` 执行 `npm install`
   - `npm-global` → 执行 `npm install -g`（含权限检查）
4. 报告当前版本、最新版本、成功/失败状态

### `claude rollback [target]`（仅限内部）

回滚到之前的版本。支持 `--list`、`--dry-run`、`--safe` 标志。

### `claude install [target]`

安装或重新安装原生构建版本。接受可选的版本目标参数。

### `claude doctor`

检查自动更新器的健康状态，报告状态、权限和配置信息。

---

## 原生安装器架构

**文件**: `src/utils/nativeInstaller/installer.ts`

### 二进制文件存储布局

```
~/.local/share/claude-code/
├── versions/          # 版本化二进制文件 (claude-1.0.3, claude-1.0.4, ...)
├── staging/           # 临时下载暂存区
└── locks/             # 基于 PID 和 mtime 的锁文件

~/.local/bin/claude    # 指向当前版本二进制文件的符号链接
```

Windows 系统使用文件复制而非符号链接。

### 核心操作

| 函数 | 说明 |
|---|---|
| `updateLatest()` | 核心更新流程：最大版本上限 → 跳过检查 → 加锁 → 下载 → 安装 → 更新符号链接 |
| `installLatest()` | Singleflight 包装版本，防止重复的进行中安装 |
| `cleanupOldVersions()` | 保留最近 2 个版本，清理过期的暂存区和临时文件 |
| `lockCurrentVersion()` | 进程生命周期锁，防止正在运行的版本被删除 |
| `cleanupNpmInstallations()` | 迁移到原生安装时清理旧的 npm 安装 |

### 下载与校验

**文件**: `src/utils/nativeInstaller/download.ts`

1. 路由到 Artifactory（内部用户）或 GCS 存储桶（外部用户）
2. 下载二进制文件并跟踪进度
3. SHA256 校验和验证
4. 60 秒卡顿检测（中止停滞的下载）
5. 失败时自动重试 3 次

---

## 文件锁机制

**文件**: `src/utils/autoUpdater.ts:176-268`

防止并发更新进程破坏安装：

- 锁文件：`~/.claude/update.lock`（或等效路径）
- 5 分钟超时 — 超过 5 分钟的锁被视为过期，强制获取
- 进程将其 PID 写入锁文件
- `acquireLock()` 和 `releaseLock()` 同时被 JS/npm 和原生安装器使用

---

## 配置

### 设置项

**文件**: `src/utils/settings/types.ts`

| 设置项 | 类型 | 说明 |
|---|---|---|
| `autoUpdatesChannel` | `'latest' \| 'stable'` | 自动更新的发布频道 |
| `minimumVersion` | string | 最低版本要求，防止意外的版本降级 |

### 全局配置

**文件**: `src/utils/config.ts:191-193`

| 字段 | 类型 | 说明 |
|---|---|---|
| `autoUpdates` | boolean | 启用/禁用自动更新（旧版） |
| `autoUpdatesProtectedForNative` | boolean | 原生安装始终自动更新 |

### 配置迁移

**文件**: `src/migrations/migrateAutoUpdatesToSettings.ts`

一次性将旧版 `globalConfig.autoUpdates = false` 迁移为 settings 中的 `DISABLE_AUTOUPDATER=1` 环境变量。定义于 `src/migrations/migrateAutoUpdatesToSettings.ts`（当前未接入启动流程）。

---

## 更新通知去重

**文件**: `src/hooks/useUpdateNotification.ts`

React hook `useUpdateNotification(updatedVersion)` — 确保每次 semver 变更（major.minor.patch）只显示一次"重启以更新"消息，避免同一版本的重复通知。

---

## 更新日志

**文件**: `src/utils/releaseNotes.ts`

1. 从 `src/setup.ts:387` 在每次启动时调用
2. 从 GitHub 获取 changelog
3. 缓存到 `~/.claude/cache/changelog.md`
4. 展示比 `lastReleaseNotesSeen` 更新的版本的更新日志
5. 使用 semver 比较确定需要展示哪些日志

---

## 版本比较

**文件**: `src/utils/semver.ts`

- 提供 `gt()`、`gte()`、`lt()`、`lte()`、`satisfies()`、`order()`
- 在 Bun 环境下使用 `Bun.semver.order()`（快 20 倍）
- 在 Node.js 环境下回退到 npm `semver` 包

---

## 分析事件

所有更新相关的遥测数据使用 `tengu_` 前缀的事件：

| 类别 | 事件 |
|---|---|
| 版本检查 | `tengu_version_check_success`、`tengu_version_check_failure` |
| JS 自动更新器 | `tengu_auto_updater_start/success/fail/up_to_date/lock_contention` |
| 原生自动更新器 | `tengu_native_auto_updater_start/success/fail` |
| 原生更新 | `tengu_native_update_complete/skipped_max_version/skipped_minimum_version` |
| 锁机制 | `tengu_version_lock_acquired/failed`、`tengu_native_update_lock_failed` |
| 二进制下载 | `tengu_binary_download_attempt/success/failure`、`tengu_binary_manifest_fetch_failure` |
| 清理 | `tengu_native_version_cleanup`、`tengu_native_staging_cleanup`、`tengu_native_stale_locks_cleanup` |
| 安装 | `tengu_native_install_package_success/failure`、`tengu_native_install_binary_success/failure` |
| 手动更新 | `tengu_update_check` |
| 迁移 | `tengu_migrate_autoupdates_to_settings`、`tengu_migrate_autoupdates_error` |

---

## 关键文件索引

| 文件 | 职责 |
|---|---|
| `src/utils/autoUpdater.ts` | 核心逻辑：版本检查、npm 安装、文件锁、最低/最高版本门控 |
| `src/cli/update.ts` | `claude update` 命令处理 |
| `src/utils/nativeInstaller/installer.ts` | 原生二进制安装器：下载、版本管理、符号链接、清理 |
| `src/utils/nativeInstaller/download.ts` | 从 GCS/Artifactory 下载二进制文件并校验 |
| `src/utils/localInstaller.ts` | 本地安装器（`~/.claude/local/`）基于 npm |
| `src/components/AutoUpdaterWrapper.tsx` | 基于安装类型的策略路由 |
| `src/components/AutoUpdater.tsx` | JS/npm 后台自动更新器（30 分钟间隔） |
| `src/components/NativeAutoUpdater.tsx` | 原生二进制后台自动更新器（30 分钟间隔） |
| `src/components/PackageManagerAutoUpdater.tsx` | 包管理器通知（30 分钟，仅展示） |
| `src/hooks/useUpdateNotification.ts` | 按 semver 去重更新通知 |
| `src/utils/releaseNotes.ts` | Changelog 获取、缓存与展示 |
| `src/utils/semver.ts` | Semver 版本比较（Bun 原生 + npm 回退） |
| `src/utils/doctorDiagnostic.ts` | 安装类型检测与健康诊断 |
| `src/utils/config.ts:1737` | `getAutoUpdaterDisabledReason()` — 禁用检查逻辑 |
| `src/migrations/migrateAutoUpdatesToSettings.ts` | 旧版配置迁移 |
| `src/screens/Doctor.tsx` | Doctor 命令 UI，展示自动更新状态 |

---

## 流程图

```
启动阶段
  ├── assertMinVersion() → 版本过低时硬性拦截，拒绝启动
  ├── migrateAutoUpdatesToSettings() → 一次性配置迁移
  └── checkForReleaseNotes() → 展示新版本的更新日志

REPL 运行中（每 30 分钟）
  ├── AutoUpdaterWrapper 检测安装类型
  │
  ├── native → NativeAutoUpdater
  │     ├── 从 GCS/Artifactory 获取版本
  │     ├── 检查最大版本上限（服务端控制）
  │     ├── 检查 minimumVersion 设置（跳过）
  │     ├── acquireLock()
  │     ├── downloadAndVerifyBinary()（SHA256 校验，3 次重试）
  │     ├── 安装到 versions/ 目录
  │     ├── 更新符号链接
  │     └── cleanupOldVersions()（保留 2 个版本）
  │
  ├── npm-global/local → AutoUpdater
  │     ├── 从 npm registry 获取最新版本
  │     ├── semver 版本比较
  │     ├── acquireLock()
  │     └── npm install -g / 本地安装
  │
  └── package-manager → PackageManagerAutoUpdater
        ├── 从 GCS 获取版本
        └── 显示 "Run: brew upgrade ..."（不自动安装）

手动操作
  └── claude update → 完整诊断 + 安装编排
```
