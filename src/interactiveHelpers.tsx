import { feature } from 'bun:bundle';
import { appendFileSync } from 'fs';
import React from 'react';
import { logEvent } from 'src/services/analytics/index.js';
import { gracefulShutdown, gracefulShutdownSync } from 'src/utils/gracefulShutdown.js';
import {
  type ChannelEntry,
  getAllowedChannels,
  setAllowedChannels,
  setHasDevChannels,
  setSessionTrustAccepted,
  setStatsStore,
} from './bootstrap/state.js';
import type { Command } from './commands.js';
import { createStatsStore, type StatsStore } from './context/stats.js';
import { getSystemContext } from './context.js';
import { initializeTelemetryAfterTrust } from './entrypoints/init.js';
import { isSynchronizedOutputSupported } from '@anthropic/ink';
import type { RenderOptions, Root, TextProps } from '@anthropic/ink';
import { KeybindingSetup } from './keybindings/KeybindingProviderSetup.js';
import { startDeferredPrefetches } from './main.js';
import {
  checkGate_CACHED_OR_BLOCKING,
  initializeGrowthBook,
  resetGrowthBook,
} from './services/analytics/growthbook.js';
import { isQualifiedForGrove } from './services/api/grove.js';
import { handleMcpjsonServerApprovals } from './services/mcpServerApproval.js';
import { AppStateProvider } from './state/AppState.js';
import { onChangeAppState } from './state/onChangeAppState.js';
import { ThemeProvider } from '@anthropic/ink';
import { normalizeApiKeyForConfig } from './utils/authPortable.js';
import {
  getExternalClaudeMdIncludes,
  getMemoryFiles,
  shouldShowClaudeMdExternalIncludesWarning,
} from './utils/claudemd.js';
import {
  checkHasTrustDialogAccepted,
  getCustomApiKeyStatus,
  getGlobalConfig,
  saveGlobalConfig,
} from './utils/config.js';
import { updateDeepLinkTerminalPreference } from './utils/deepLink/terminalPreference.js';
import { isEnvTruthy, isRunningOnHomespace } from './utils/envUtils.js';
import { type FpsMetrics, FpsTracker } from './utils/fpsTracker.js';
import { updateGithubRepoPathMapping } from './utils/githubRepoPathMapping.js';
import { applyConfigEnvironmentVariables } from './utils/managedEnv.js';
import type { PermissionMode } from './utils/permissions/PermissionMode.js';
import { getBaseRenderOptions } from './utils/renderOptions.js';
import { getSettingsWithAllErrors } from './utils/settings/allErrors.js';
import { hasSkipDangerousModePermissionPrompt } from './utils/settings/settings.js';

export function completeOnboarding(): void {
  saveGlobalConfig(current => ({
    ...current,
    hasCompletedOnboarding: true,
    lastOnboardingVersion: MACRO.VERSION,
  }));
}
export function showDialog<T = void>(root: Root, renderer: (done: (result: T) => void) => React.ReactNode): Promise<T> {
  return new Promise<T>(resolve => {
    const done = (result: T): void => void resolve(result);
    root.render(renderer(done));
  });
}

/**
 * Render an error message through Ink, then unmount and exit.
 * Use this for fatal errors after the Ink root has been created —
 * console.error is swallowed by Ink's patchConsole, so we render
 * through the React tree instead.
 */
export async function exitWithError(root: Root, message: string, beforeExit?: () => Promise<void>): Promise<never> {
  return exitWithMessage(root, message, { color: 'error', beforeExit });
}

/** 通过 Ink 渲染一条信息，然后卸载并退出。
在 Ink 根节点创建后，对于信息输出使用此方法——
控制台输出会被 Ink 的 patchConsole 吞掉，因此我们改为通过 React 树进行渲染。 */
export async function exitWithMessage(
  root: Root,
  message: string,
  options?: {
    color?: TextProps['color'];
    exitCode?: number;
    beforeExit?: () => Promise<void>;
  },
): Promise<never> {
  const { Text } = await import('@anthropic/ink');
  const color = options?.color;
  const exitCode = options?.exitCode ?? 1;
  root.render(color ? <Text color={color}>{message}</Text> : <Text>{message}</Text>);
  root.unmount();
  await options?.beforeExit?.();
  // eslint-disable-next-line custom-rules/no-process-exit -- exit after Ink unmount
  process.exit(exitCode);
}

/** 显示一个包裹在 AppStateProvider + KeybindingSetup 中的设置对话框。
减少 showSetupScreens() 中的样板代码，因为每个对话框都需要这些包装器。 */
export function showSetupDialog<T = void>(
  root: Root,
  renderer: (done: (result: T) => void) => React.ReactNode,
  options?: { onChangeAppState?: typeof onChangeAppState },
): Promise<T> {
  return showDialog<T>(root, done => (
    <ThemeProvider
      initialState={getGlobalConfig().theme}
      onThemeSave={setting => saveGlobalConfig(current => ({ ...current, theme: setting }))}
    >
      <AppStateProvider onChangeAppState={options?.onChangeAppState}>
        <KeybindingSetup>{renderer(done)}</KeybindingSetup>
      </AppStateProvider>
    </ThemeProvider>
  ));
}

/**
 * Render the main UI into the root and wait for it to exit.
 * Handles the common epilogue: start deferred prefetches, wait for exit, graceful shutdown.
 */
export async function renderAndRun(root: Root, element: React.ReactNode): Promise<void> {
  root.render(element);
  startDeferredPrefetches();
  await root.waitUntilExit();
  await gracefulShutdown(0);
}

export async function showSetupScreens(
  root: Root,
  permissionMode: PermissionMode,
  allowDangerouslySkipPermissions: boolean,
  commands?: Command[],
  claudeInChrome?: boolean,
  devChannels?: ChannelEntry[],
): Promise<boolean> {
  if (
    process.env.NODE_ENV === 'test' ||
    isEnvTruthy(false) ||
    process.env.IS_DEMO // 在演示模式下跳过新手引导
  ) {
    return false;
  }

  const config = getGlobalConfig();
  let onboardingShown = false;
  if (
    !config.theme ||
    !config.hasCompletedOnboarding // 始终至少显示一次新手引导
  ) {
    onboardingShown = true;
    const { Onboarding } = await import('./components/Onboarding.js');
    await showSetupDialog(
      root,
      done => (
        <Onboarding
          onDone={() => {
            completeOnboarding();
            void done();
          }}
        />
      ),
      { onChangeAppState },
    );
  }

  // 在交互式会话中始终显示信任对话框，无论权限模式如何。信任对话框是工作空间信
  // 任边界——它会警告不受信任的仓库并检查 CLAUDE.md 的外部包含。
  // bypassPermissions 模式仅影响工具执行
  // 权限，不影响工作空间信任。注意：非交互式会话（使用 -
  // p 的 CI/CD）根本不会进入 showSetupScreens。在 c
  // laubbit 中跳过权限检查
  if (!isEnvTruthy(process.env.CLAUBBIT)) {
    // 快速路径：当当前工作目录已被信任时，跳过 TrustDialog
    // 的导入和渲染。如果它返回 true，则 TrustDialog
    // 将自动解析，无论安全功能如何，因此我们可以跳过动态导入和渲染周期。
    if (!checkHasTrustDialogAccepted()) {
      const { TrustDialog } = await import('./components/TrustDialog/TrustDialog.js');
      await showSetupDialog(root, done => <TrustDialog commands={commands} onDone={done} />);
    }

    // Signal that trust has been verified for this session.
    // GrowthBook checks this to decide whether to include auth headers.
    setSessionTrustAccepted(true);

    // Reset and reinitialize GrowthBook after trust is established.
    // Defense for login/logout: clears any prior client so the next init
    // picks up fresh auth headers.
    resetGrowthBook();
    void initializeGrowthBook();

    // Now that trust is established, prefetch system context if it wasn't already
    void getSystemContext();

    // If settings are valid, check for any mcp.json servers that need approval
    const { errors: allErrors } = getSettingsWithAllErrors();
    if (allErrors.length === 0) {
      await handleMcpjsonServerApprovals(root);
    }

    // 检查是否有需要批准的 claude.md 包含项
    if (await shouldShowClaudeMdExternalIncludesWarning()) {
      const externalIncludes = getExternalClaudeMdIncludes(await getMemoryFiles(true));
      const { ClaudeMdExternalIncludesDialog } = await import('./components/ClaudeMdExternalIncludesDialog.js');
      await showSetupDialog(root, done => (
        <ClaudeMdExternalIncludesDialog onDone={done} isStandaloneDialog externalIncludes={externalIncludes} />
      ));
    }
  }

  // Track current repo path for teleport directory switching (fire-and-forget)
  // This must happen AFTER trust to prevent untrusted directories from poisoning the mapping
  void updateGithubRepoPathMapping();
  if (feature('LODESTONE')) {
    updateDeepLinkTerminalPreference();
  }

  // Apply full environment variables after trust dialog is accepted OR in bypass mode
  // In bypass mode (CI/CD, automation), we trust the environment so apply all variables
  // In normal mode, this happens after the trust dialog is accepted
  // This includes potentially dangerous environment variables from untrusted sources
  applyConfigEnvironmentVariables();

  // Initialize telemetry after env vars are applied so OTEL endpoint env vars and
  // otelHeadersHelper (which requires trust to execute) are available.
  // Defer to next tick so the OTel dynamic import resolves after first render
  // instead of during the pre-render microtask queue.
  setImmediate(() => initializeTelemetryAfterTrust());

  if (await isQualifiedForGrove()) {
    const { GroveDialog } = await import('src/components/grove/Grove.js');
    const decision = await showSetupDialog<string>(root, done => (
      <GroveDialog
        showIfAlreadyViewed={false}
        location={onboardingShown ? 'onboarding' : 'policy_update_modal'}
        onDone={done}
      />
    ));
    if (decision === 'escape') {
      logEvent('tengu_grove_policy_exited', {});
      gracefulShutdownSync(0);
      return false;
    }
  }

  // 检查自定义 API 密钥。在 h
  // omespace 上，ANTHROPIC_API_KEY 会保留在 process.env 中
  // 供子进程使用，但会被 Claude Code 本身忽略（参见 auth.ts）。
  if (process.env.ANTHROPIC_API_KEY && !isRunningOnHomespace()) {
    const customApiKeyTruncated = normalizeApiKeyForConfig(process.env.ANTHROPIC_API_KEY);
    const keyStatus = getCustomApiKeyStatus(customApiKeyTruncated);
    if (keyStatus === 'new') {
      const { ApproveApiKey } = await import('./components/ApproveApiKey.js');
      await showSetupDialog<boolean>(
        root,
        done => <ApproveApiKey customApiKeyTruncated={customApiKeyTruncated} onDone={done} />,
        { onChangeAppState },
      );
    }
  }

  if (
    (permissionMode === 'bypassPermissions' || allowDangerouslySkipPermissions) &&
    !hasSkipDangerousModePermissionPrompt()
  ) {
    const { BypassPermissionsModeDialog } = await import('./components/BypassPermissionsModeDialog.js');
    await showSetupDialog(root, done => <BypassPermissionsModeDialog onAccept={done} />);
  }

  // --dangerously-load-development-channels 确
  // 认。接受后，将开发频道追加到 main.tsx 中已设置的任何 --channel
  // s 列表。组织策略不会被绕过——gateChannelServer() 仍会运行；
  // 此标志仅用于绕过 --channels 已批准服务器的允许列表。
  if (devChannels && devChannels.length > 0) {
    const { DevChannelsDialog } = await import('./components/DevChannelsDialog.js');
    await showSetupDialog(root, done => (
      <DevChannelsDialog
        channels={devChannels}
        onAccept={() => {
          // Mark dev entries per-entry so the allowlist bypass doesn't leak
          // to --channels entries when both flags are passed.
          setAllowedChannels([...getAllowedChannels(), ...devChannels.map(c => ({ ...c, dev: true }))]);
          setHasDevChannels(true);
          void done();
        }}
      />
    ));
  }

  // Show Chrome onboarding for first-time Claude in Chrome users
  if (claudeInChrome && !getGlobalConfig().hasCompletedClaudeInChromeOnboarding) {
    const { ClaudeInChromeOnboarding } = await import('./components/ClaudeInChromeOnboarding.js');
    await showSetupDialog(root, done => <ClaudeInChromeOnboarding onDone={done} />);
  }

  return onboardingShown;
}

export function getRenderContext(exitOnCtrlC: boolean): {
  renderOptions: RenderOptions;
  getFpsMetrics: () => FpsMetrics | undefined;
  stats: StatsStore;
} {
  let lastFlickerTime = 0;
  const baseOptions = getBaseRenderOptions(exitOnCtrlC);

  // 当 stdin 覆盖激活时记录分析事件
  if (baseOptions.stdin) {
    logEvent('tengu_stdin_interactive', {});
  }

  const fpsTracker = new FpsTracker();
  const stats = createStatsStore();
  setStatsStore(stats);

  // Bench mode: when set, append per-frame phase timings as JSONL for
  // offline analysis by bench/repl-scroll.ts. Captures the full TUI
  // render pipeline (yoga → screen buffer → diff → optimize → stdout)
  // so perf work on any phase can be validated against real user flows.
  const frameTimingLogPath = process.env.CLAUDE_CODE_FRAME_TIMING_LOG;
  return {
    getFpsMetrics: () => fpsTracker.getMetrics(),
    stats,
    renderOptions: {
      ...baseOptions,
      onFrame: event => {
        fpsTracker.record(event.durationMs);
        stats.observe('frame_duration_ms', event.durationMs);
        if (frameTimingLogPath && event.phases) {
          // 仅基准测试的环境变量门控路径：同步写入，以便在突然退出时不会
          // 丢帧。≤60fps 时约 100 字节可忽略不计。rss/c
          // pu 是单次系统调用；cpu 是累积的——基准测试端计算增量。
          const line =
            // eslint-disable-next-line custom-rules/no-direct-json-operations -- 小对象，热基准测试路径
            JSON.stringify({
              total: event.durationMs,
              ...event.phases,
              rss: process.memoryUsage.rss(),
              cpu: process.cpuUsage(),
            }) + '\n';
          // eslint-disable-next-line custom-rules/no-sync-fs -- bench-only, sync so no frames dropped on exit
          appendFileSync(frameTimingLogPath, line);
        }
        // 为具有同步输出的终端跳过闪烁报告——DEC 2026 在
        // BSU/ESU 之间缓冲，因此清除+重绘是原子的。
        if (isSynchronizedOutputSupported()) {
          return;
        }
        for (const flicker of event.flickers) {
          if (flicker.reason === 'resize') {
            continue;
          }
          const now = Date.now();
          if (now - lastFlickerTime < 1000) {
            logEvent('tengu_flicker', {
              desiredHeight: flicker.desiredHeight,
              actualHeight: flicker.availableHeight,
              reason: flicker.reason,
            } as unknown as Record<string, boolean | number | undefined>);
          }
          lastFlickerTime = now;
        }
      },
    },
  };
}
