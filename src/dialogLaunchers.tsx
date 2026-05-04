/** * 为主入口文件 main.tsx 中的一次性对话框 JSX 站点提供精简启动器。
 * 每个启动器动态导入其组件，并以与原始内联调用点完全相同的方式连接 `done` 回调。
 * 零行为变更。
 *
 * Part of the main.tsx React/JSX extraction effort. See sibling PRs
 * perf/extract-interactive-helpers and perf/launch-repl.
 */
import React from 'react';
import type { AssistantSession } from './assistant/sessionDiscovery.js';
import type { StatsStore } from './context/stats.js';
import type { Root } from '@anthropic/ink';
import { renderAndRun, showSetupDialog } from './interactiveHelpers.js';
import { KeybindingSetup } from './keybindings/KeybindingProviderSetup.js';
import type { AppState } from './state/AppStateStore.js';
import type { AgentMemoryScope } from '@claude-code-best/builtin-tools/tools/AgentTool/agentMemory.js';
import type { TeleportRemoteResponse } from './utils/conversationRecovery.js';
import type { FpsMetrics } from './utils/fpsTracker.js';
import type { ValidationError } from './utils/settings/validation.js';

// 通过模块类型实现对 ResumeConversation 组件 Props
// 的仅类型访问。无运行时开销——在编译时被擦除。
type ResumeConversationProps = React.ComponentProps<
  typeof import('./screens/ResumeConversation.js').ResumeConversation
>;

/** * 站点 ~3173：SnapshotUpdateDialog（代理记忆快照更新提示）。
 * 原始回调连接方式：onComplete={done}, onCancel={() => done('keep')}。 */
export async function launchSnapshotUpdateDialog(
  root: Root,
  props: {
    agentType: string;
    scope: AgentMemoryScope;
    snapshotTimestamp: string;
  },
): Promise<'merge' | 'keep' | 'replace'> {
  const { SnapshotUpdateDialog } = await import('./components/agents/SnapshotUpdateDialog.js');
  return showSetupDialog<'merge' | 'keep' | 'replace'>(root, done => (
    <SnapshotUpdateDialog
      agentType={props.agentType}
      scope={props.scope}
      snapshotTimestamp={props.snapshotTimestamp}
      onComplete={done}
      onCancel={() => done('keep')} // Esc/cancel → safe default: keep current memory
    />
  ));
}

/** * 站点 ~3250：InvalidSettingsDialog（设置验证错误）。
 * 原始回调连接方式：onContinue={done}, onExit 由调用方传入。 */
export async function launchInvalidSettingsDialog(
  root: Root,
  props: {
    settingsErrors: ValidationError[];
    onExit: () => void;
  },
): Promise<void> {
  const { InvalidSettingsDialog } = await import('./components/InvalidSettingsDialog.js');
  return showSetupDialog(root, done => (
    <InvalidSettingsDialog settingsErrors={props.settingsErrors} onContinue={done} onExit={props.onExit} />
  ));
}

/** * 站点 ~4229：AssistantSessionChooser（选择要附加到的桥接会话）。
 * 原始回调连接方式：onSelect={id => done(id)}, onCancel={() => done(null)}。 */
export async function launchAssistantSessionChooser(
  root: Root,
  props: { sessions: AssistantSession[] },
): Promise<string | null> {
  const { AssistantSessionChooser } = await import('./assistant/AssistantSessionChooser.js');
  return showSetupDialog<string | null>(root, done => (
    <AssistantSessionChooser
      sessions={props.sessions}
      onSelect={(id: string) => done(id)}
      onCancel={() => done(null)}
    />
  ));
}

/**
 * `claude assistant` found zero sessions — show the same install wizard
 * as `/assistant` when daemon.json is empty. Resolves to the installed dir on
 * success, null on cancel. Rejects on install failure so the caller can
 * distinguish errors from user cancellation.
 */
export async function launchAssistantInstallWizard(root: Root): Promise<string | null> {
  const { NewInstallWizard, computeDefaultInstallDir } = await import('./commands/assistant/assistant.js');
  const defaultDir = await computeDefaultInstallDir();
  let rejectWithError: (reason: Error) => void;
  const errorPromise = new Promise<never>((_, reject) => {
    rejectWithError = reject;
  });
  const resultPromise = showSetupDialog<string | null>(root, done => (
    <NewInstallWizard
      defaultDir={defaultDir}
      onInstalled={dir => done(dir)}
      onCancel={() => done(null)}
      onError={message => rejectWithError(new Error(`Installation failed: ${message}`))}
    />
  ));
  return Promise.race([resultPromise, errorPromise]);
}

/**
 * Site ~4549: TeleportResumeWrapper (interactive teleport session picker).
 * Original callback wiring: onComplete={done}, onCancel={() => done(null)}, source="cliArg".
 */
export async function launchTeleportResumeWrapper(root: Root): Promise<TeleportRemoteResponse | null> {
  const { TeleportResumeWrapper } = await import('./components/TeleportResumeWrapper.js');
  return showSetupDialog<TeleportRemoteResponse | null>(root, done => (
    <TeleportResumeWrapper onComplete={done} onCancel={() => done(null)} source="cliArg" />
  ));
}

/** 站点 ~4597：TeleportRepoMismatchDialog（选择目标仓库的本地检出）。
原始回调连接：onSelectPath={done}，onCancel={() => done(null)}。 */
export async function launchTeleportRepoMismatchDialog(
  root: Root,
  props: {
    targetRepo: string;
    initialPaths: string[];
  },
): Promise<string | null> {
  const { TeleportRepoMismatchDialog } = await import('./components/TeleportRepoMismatchDialog.js');
  return showSetupDialog<string | null>(root, done => (
    <TeleportRepoMismatchDialog
      targetRepo={props.targetRepo}
      initialPaths={props.initialPaths}
      onSelectPath={done}
      onCancel={() => done(null)}
    />
  ));
}

/** 站点 ~4903：ResumeConversation 挂载（交互式会话选择器）。
包装在 <App><KeybindingSetup> 中并使用 renderAndRun。
保留 getWorktreePaths 和 imports 之间原始的 Promise.all 并行性。 */
export async function launchResumeChooser(
  root: Root,
  appProps: {
    getFpsMetrics: () => FpsMetrics | undefined;
    stats: StatsStore;
    initialState: AppState;
  },
  worktreePathsPromise: Promise<string[]>,
  resumeProps: Omit<ResumeConversationProps, 'worktreePaths'>,
): Promise<void> {
  const [worktreePaths, { ResumeConversation }, { App }] = await Promise.all([
    worktreePathsPromise,
    import('./screens/ResumeConversation.js'),
    import('./components/App.js'),
  ]);
  await renderAndRun(
    root,
    <App getFpsMetrics={appProps.getFpsMetrics} stats={appProps.stats} initialState={appProps.initialState}>
      <KeybindingSetup>
        <ResumeConversation {...resumeProps} worktreePaths={worktreePaths} />
      </KeybindingSetup>
    </App>,
  );
}
