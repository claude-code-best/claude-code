// biome-ignore-all assist/source/organizeImports: 仅限 Ant 内部的导入标记不得重新排序
import { feature } from 'bun:bundle';
import { type KeyboardEvent, Box, Text, useTheme, useThemeSetting, useTerminalFocus } from '@anthropic/ink';
import * as React from 'react';
import { useState, useCallback } from 'react';
import { useKeybinding, useKeybindings } from '../../keybindings/useKeybinding.js';
import figures from 'figures';
import { type GlobalConfig, saveGlobalConfig, getCurrentProjectConfig, type OutputStyle } from '../../utils/config.js';
import { normalizeApiKeyForConfig } from '../../utils/authPortable.js';
import {
  getGlobalConfig,
  getAutoUpdaterDisabledReason,
  formatAutoUpdaterDisabledReason,
  getRemoteControlAtStartup,
} from '../../utils/config.js';
import chalk from 'chalk';
import {
  permissionModeTitle,
  permissionModeShortTitle,
  permissionModeFromString,
  toExternalPermissionMode,
  isExternalPermissionMode,
  EXTERNAL_PERMISSION_MODES,
  PERMISSION_MODES,
  type ExternalPermissionMode,
  type PermissionMode,
} from '../../utils/permissions/PermissionMode.js';
import {
  getAutoModeEnabledState,
  hasAutoModeOptInAnySource,
  transitionPlanAutoMode,
} from '../../utils/permissions/permissionSetup.js';
import { logError } from '../../utils/log.js';
import {
  logEvent,
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
} from 'src/services/analytics/index.js';
import { isBridgeEnabled } from '../../bridge/bridgeEnabled.js';
import { ThemePicker } from '../ThemePicker.js';
import { useAppState, useSetAppState, useAppStateStore } from '../../state/AppState.js';
import { ModelPicker } from '../ModelPicker.js';
import { modelDisplayString, isOpus1mMergeEnabled } from '../../utils/model/model.js';
import { isBilledAsExtraUsage } from '../../utils/extraUsage.js';
import { ClaudeMdExternalIncludesDialog } from '../ClaudeMdExternalIncludesDialog.js';
import { ChannelDowngradeDialog, type ChannelDowngradeChoice } from '../ChannelDowngradeDialog.js';
import { Dialog } from '@anthropic/ink';
import { Select } from '../CustomSelect/index.js';
import { OutputStylePicker } from '../OutputStylePicker.js';
import { LanguagePicker } from '../LanguagePicker.js';
import {
  type MemoryFileInfo,
  getExternalClaudeMdIncludes,
  getMemoryFiles,
  hasExternalClaudeMdIncludes,
} from 'src/utils/claudemd.js';
import { Byline, KeyboardShortcutHint, useTabHeaderFocus } from '@anthropic/ink';
import { ConfigurableShortcutHint } from '../ConfigurableShortcutHint.js';
import { useIsInsideModal } from '../../context/modalContext.js';
import { SearchBox } from '../SearchBox.js';
import { isSupportedTerminal, hasAccessToIDEExtensionDiffFeature } from '../../utils/ide.js';
import { getInitialSettings, getSettingsForSource, updateSettingsForSource } from '../../utils/settings/settings.js';
import { getUserMsgOptIn, setUserMsgOptIn } from '../../bootstrap/state.js';
import { DEFAULT_OUTPUT_STYLE_NAME } from 'src/constants/outputStyles.js';
import { isEnvTruthy, isRunningOnHomespace } from 'src/utils/envUtils.js';
import type { LocalJSXCommandContext, CommandResultDisplay } from '../../commands.js';
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js';
import { isAgentSwarmsEnabled } from '../../utils/agentSwarmsEnabled.js';
import {
  getCliTeammateModeOverride,
  clearCliTeammateModeOverride,
} from '../../utils/swarm/backends/teammateModeSnapshot.js';
import { getHardcodedTeammateModelFallback } from '../../utils/swarm/teammateModel.js';
import { useSearchInput } from '../../hooks/useSearchInput.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import {
  clearFastModeCooldown,
  FAST_MODE_MODEL_DISPLAY,
  isFastModeAvailable,
  isFastModeEnabled,
  getFastModeModel,
  isFastModeSupportedByModel,
} from '../../utils/fastMode.js';
import { isFullscreenEnvEnabled } from '../../utils/fullscreen.js';
import { getPlatform } from '../../utils/platform.js';

type Props = {
  onClose: (result?: string, options?: { display?: CommandResultDisplay }) => void;
  context: LocalJSXCommandContext;
  setTabsHidden: (hidden: boolean) => void;
  onIsSearchModeChange?: (inSearchMode: boolean) => void;
  contentHeight?: number;
};

type SettingBase =
  | {
      id: string;
      label: string;
    }
  | {
      id: string;
      label: React.ReactNode;
      searchText: string;
    };

type Setting =
  | (SettingBase & {
      value: boolean;
      onChange(value: boolean): void;
      type: 'boolean';
    })
  | (SettingBase & {
      value: string;
      options: string[];
      onChange(value: string): void;
      type: 'enum';
    })
  | (SettingBase & {
      // 对于由自定义组件设置的枚举，我们不需要传递选项，
      // 但仍需要一个值来显示在顶级配置菜单中
      value: string;
      onChange(value: string): void;
      type: 'managedEnum';
    });

type SubMenu =
  | 'Theme'
  | 'Model'
  | 'TeammateModel'
  | 'ExternalIncludes'
  | 'OutputStyle'
  | 'ChannelDowngrade'
  | 'Language'
  | 'EnableAutoUpdates';

export function Config({
  onClose,
  context,
  setTabsHidden,
  onIsSearchModeChange,
  contentHeight,
}: Props): React.ReactNode {
  const { headerFocused, focusHeader } = useTabHeaderFocus();
  const insideModal = useIsInsideModal();
  const [, setTheme] = useTheme();
  const themeSetting = useThemeSetting();
  const [globalConfig, setGlobalConfig] = useState(getGlobalConfig());
  const initialConfig = React.useRef(getGlobalConfig());
  const [settingsData, setSettingsData] = useState(getInitialSettings());
  const initialSettingsData = React.useRef(getInitialSettings());
  const [currentOutputStyle, setCurrentOutputStyle] = useState<OutputStyle>(
    settingsData?.outputStyle || DEFAULT_OUTPUT_STYLE_NAME,
  );
  const initialOutputStyle = React.useRef(currentOutputStyle);
  const [currentLanguage, setCurrentLanguage] = useState<string | undefined>(settingsData?.language);
  const initialLanguage = React.useRef(currentLanguage);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const isTerminalFocused = useTerminalFocus();
  const { rows } = useTerminalSize();
  // contentHeight 由 Settings.tsx 设置（与传递给 Tabs 的值相同，用于固定所有标签页的面板高度 — 防止切换时布局跳动）。
  // 为“浏览器”（搜索框、间隙、页脚、滚动提示）保留约 10 行。
  // 为独立渲染（测试）回退计算。
  const paneCap = contentHeight ?? Math.min(Math.floor(rows * 0.8), 30);
  const maxVisible = Math.max(5, paneCap - 10);
  const mainLoopModel = useAppState(s => s.mainLoopModel);
  const verbose = useAppState(s => s.verbose);
  const thinkingEnabled = useAppState(s => s.thinkingEnabled);
  const isFastMode = useAppState(s => (isFastModeEnabled() ? s.fastMode : false));
  const promptSuggestionEnabled = useAppState(s => s.promptSuggestionEnabled);
  const currentDefaultPermissionMode = permissionModeFromString(settingsData?.permissions?.defaultMode ?? 'default');
  // Show auto in the default-mode dropdown when the user has opted in OR the
  // config is fully 'enabled' — even if currently circuit-broken ('disabled'),
  // an opted-in user should still see it in settings (it's a temporary state).
  const showAutoInDefaultModePicker = feature('TRANSCRIPT_CLASSIFIER')
    ? hasAutoModeOptInAnySource() || getAutoModeEnabledState() === 'enabled'
    : false;
  // 聊天/对话记录视图选择器对符合条件的用户可见（通过 GB 门控），即使他们本次会话尚未选择加入 — 这就是持久的选择加入。
  // 此处写入的“chat”将在下次启动时由 main.tsx 读取，如果仍有资格则设置 userMsgOptIn。
  /* eslint-disable @typescript-eslint/no-require-imports */
  const showDefaultViewPicker =
    feature('KAIROS') || feature('KAIROS_BRIEF')
      ? (
          require('@claude-code-best/builtin-tools/tools/BriefTool/BriefTool.js') as typeof import('@claude-code-best/builtin-tools/tools/BriefTool/BriefTool.js')
        ).isBriefEntitled()
      : false;
  /* eslint-enable @typescript-eslint/no-require-imports */
  const setAppState = useSetAppState();
  const [changes, setChanges] = useState<{ [key: string]: unknown }>({});
  const initialThinkingEnabled = React.useRef(thinkingEnabled);
  // 每个来源的设置快照，用于通过 Escape 回退。getInitialSettings() 返回跨来源合并的结果，无法告诉我们删除 vs 恢复的内容；
  // 每个来源的快照 + updateSettingsForSource 的 undefined-deletes-key 语义可以做到。通过 useState 延迟初始化（无 setter），
  // 以避免在每次渲染时读取设置文件 — useRef 会急切求值其参数，即使只保留第一次的结果。
  const [initialLocalSettings] = useState(() => getSettingsForSource('localSettings'));
  const [initialUserSettings] = useState(() => getSettingsForSource('userSettings'));
  const initialThemeSetting = React.useRef(themeSetting);
  // Config 可能修改的 AppState 字段 — 挂载时一次性快照。
  const store = useAppStateStore();
  const [initialAppState] = useState(() => {
    const s = store.getState();
    return {
      mainLoopModel: s.mainLoopModel,
      mainLoopModelForSession: s.mainLoopModelForSession,
      verbose: s.verbose,
      thinkingEnabled: s.thinkingEnabled,
      fastMode: s.fastMode,
      promptSuggestionEnabled: s.promptSuggestionEnabled,
      isBriefOnly: s.isBriefOnly,
      replBridgeEnabled: s.replBridgeEnabled,
      replBridgeOutboundOnly: s.replBridgeOutboundOnly,
      settings: s.settings,
    };
  });
  // Bootstrap 状态快照 — userMsgOptIn 在 AppState 之外，因此 revertChanges 需要单独恢复它。
  // 没有这个快照，将 defaultView 切换到 'chat' 然后按 Escape 会使工具保持活动状态，而显示过滤器恢复 — 这正是本次 PR 的资格/选择加入分离意图防止的环境激活行为。
  const [initialUserMsgOptIn] = useState(() => getUserMsgOptIn());
  // 在第一次用户可见更改时设置；门控 revertChanges() 对 Escape 的响应，以便打开-然后关闭不会触发冗余的磁盘写入。
  const isDirty = React.useRef(false);
  const [showThinkingWarning, setShowThinkingWarning] = useState(false);
  const [showSubmenu, setShowSubmenu] = useState<SubMenu | null>(null);
  const {
    query: searchQuery,
    setQuery: setSearchQuery,
    cursorOffset: searchCursorOffset,
  } = useSearchInput({
    isActive: isSearchMode && showSubmenu === null && !headerFocused,
    onExit: () => setIsSearchMode(false),
    onExitUp: focusHeader,
    // Ctrl+C/D 必须到达 Settings 的 useExitOnCtrlCD；'d' 还避免双重操作（删除字符 + 退出待处理）。
    passthroughCtrlKeys: ['c', 'd'],
  });

  // 当 Config 自己的 Esc 处理程序活动时，告诉父组件，以便 Settings 让出 confirm:no。
  // 仅当搜索模式拥有键盘时为 true — 当选项卡标题被聚焦时不是（然后 Settings 必须处理 Esc 以关闭）。
  const ownsEsc = isSearchMode && !headerFocused;
  React.useEffect(() => {
    onIsSearchModeChange?.(ownsEsc);
  }, [ownsEsc, onIsSearchModeChange]);

  const isConnectedToIde = hasAccessToIDEExtensionDiffFeature(context.options.mcpClients);

  const isFileCheckpointingAvailable = !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING);

  const memoryFiles = React.use(getMemoryFiles(true)) as MemoryFileInfo[];
  const shouldShowExternalIncludesToggle = hasExternalClaudeMdIncludes(memoryFiles);

  const autoUpdaterDisabledReason = getAutoUpdaterDisabledReason();

  function onChangeMainModelConfig(value: string | null): void {
    const previousModel = mainLoopModel;
    logEvent('tengu_config_model_changed', {
      from_model: previousModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      to_model: value as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    });
    setAppState(prev => ({
      ...prev,
      mainLoopModel: value,
      mainLoopModelForSession: null,
    }));
    setChanges(prev => {
      const valStr =
        modelDisplayString(value) +
        (isBilledAsExtraUsage(value, false, isOpus1mMergeEnabled()) ? ' · 按额外使用计费' : '');
      if ('model' in prev) {
        const { model, ...rest } = prev;
        return { ...rest, model: valStr };
      }
      return { ...prev, model: valStr };
    });
  }

  function onChangeVerbose(value: boolean): void {
    // 更新全局配置以持久化设置
    saveGlobalConfig(current => ({ ...current, verbose: value }));
    setGlobalConfig({ ...getGlobalConfig(), verbose: value });

    // 立即更新应用状态以获得即时 UI 反馈
    setAppState(prev => ({
      ...prev,
      verbose: value,
    }));
    setChanges(prev => {
      if ('verbose' in prev) {
        const { verbose, ...rest } = prev;
        return rest;
      }
      return { ...prev, verbose: value };
    });
  }

  // TODO: 添加 MCP 服务器
  const settingsItems: Setting[] = [
    // 全局设置
    {
      id: 'autoCompactEnabled',
      label: '自动压缩',
      value: globalConfig.autoCompactEnabled,
      type: 'boolean' as const,
      onChange(autoCompactEnabled: boolean) {
        saveGlobalConfig(current => ({ ...current, autoCompactEnabled }));
        setGlobalConfig({ ...getGlobalConfig(), autoCompactEnabled });
        logEvent('tengu_auto_compact_setting_changed', {
          enabled: autoCompactEnabled,
        });
      },
    },
    {
      id: 'spinnerTipsEnabled',
      label: '显示提示',
      value: settingsData?.spinnerTipsEnabled ?? true,
      type: 'boolean' as const,
      onChange(spinnerTipsEnabled: boolean) {
        updateSettingsForSource('localSettings', {
          spinnerTipsEnabled,
        });
        // 立即更新本地状态以反映更改
        setSettingsData(prev => ({
          ...prev,
          spinnerTipsEnabled,
        }));
        logEvent('tengu_tips_setting_changed', {
          enabled: spinnerTipsEnabled,
        });
      },
    },
    {
      id: 'prefersReducedMotion',
      label: '减少动画',
      value: settingsData?.prefersReducedMotion ?? false,
      type: 'boolean' as const,
      onChange(prefersReducedMotion: boolean) {
        updateSettingsForSource('localSettings', {
          prefersReducedMotion,
        });
        setSettingsData(prev => ({
          ...prev,
          prefersReducedMotion,
        }));
        // 同步到 AppState，以便组件立即响应
        setAppState(prev => ({
          ...prev,
          settings: { ...prev.settings, prefersReducedMotion },
        }));
        logEvent('tengu_reduce_motion_setting_changed', {
          enabled: prefersReducedMotion,
        });
      },
    },
    {
      id: 'thinkingEnabled',
      label: '思考模式',
      value: thinkingEnabled ?? true,
      type: 'boolean' as const,
      onChange(enabled: boolean) {
        setAppState(prev => ({ ...prev, thinkingEnabled: enabled }));
        updateSettingsForSource('userSettings', {
          alwaysThinkingEnabled: enabled ? undefined : false,
        });
        logEvent('tengu_thinking_toggled', { enabled });
      },
    },
    // 快速模式切换（仅限 ant 内部，从外部构建中消除）
    ...(isFastModeEnabled() && isFastModeAvailable()
      ? [
          {
            id: 'fastMode',
            label: `快速模式（仅限 ${FAST_MODE_MODEL_DISPLAY}）`,
            value: !!isFastMode,
            type: 'boolean' as const,
            onChange(enabled: boolean) {
              clearFastModeCooldown();
              updateSettingsForSource('userSettings', {
                fastMode: enabled ? true : undefined,
              });
              if (enabled) {
                setAppState(prev => ({
                  ...prev,
                  mainLoopModel: getFastModeModel(),
                  mainLoopModelForSession: null,
                  fastMode: true,
                }));
                setChanges(prev => ({
                  ...prev,
                  model: getFastModeModel(),
                  快速模式: '开启',
                }));
              } else {
                setAppState(prev => ({
                  ...prev,
                  fastMode: false,
                }));
                setChanges(prev => ({ ...prev, 快速模式: '关闭' }));
              }
            },
          },
        ]
      : []),
    ...(getFeatureValue_CACHED_MAY_BE_STALE('tengu_chomp_inflection', false)
      ? [
          {
            id: 'promptSuggestionEnabled',
            label: '提示建议',
            value: promptSuggestionEnabled,
            type: 'boolean' as const,
            onChange(enabled: boolean) {
              setAppState(prev => ({
                ...prev,
                promptSuggestionEnabled: enabled,
              }));
              updateSettingsForSource('userSettings', {
                promptSuggestionEnabled: enabled ? undefined : false,
              });
            },
          },
        ]
      : []),
    ...(feature('POOR')
      ? [
          {
            id: 'poorMode',
            label: '穷鬼模式（节省令牌）',
            value: (() => {
              const PoorMode =
                require('../../commands/poor/poorMode.js') as typeof import('../../commands/poor/poorMode.js');
              return PoorMode.isPoorModeActive();
            })(),
            type: 'boolean' as const,
            onChange(enabled: boolean) {
              const PoorMode =
                require('../../commands/poor/poorMode.js') as typeof import('../../commands/poor/poorMode.js');
              PoorMode.setPoorMode(enabled);
              setAppState(prev => ({
                ...prev,
                promptSuggestionEnabled: !enabled,
              }));
            },
          },
        ]
      : []),
    // 推测执行切换（仅限 ant 内部）
    ...(process.env.USER_TYPE === 'ant'
      ? [
          {
            id: 'speculationEnabled',
            label: '推测执行',
            value: globalConfig.speculationEnabled ?? true,
            type: 'boolean' as const,
            onChange(enabled: boolean) {
              saveGlobalConfig(current => {
                if (current.speculationEnabled === enabled) return current;
                return {
                  ...current,
                  speculationEnabled: enabled,
                };
              });
              setGlobalConfig({
                ...getGlobalConfig(),
                speculationEnabled: enabled,
              });
              logEvent('tengu_speculation_setting_changed', {
                enabled,
              });
            },
          },
        ]
      : []),
    ...(isFileCheckpointingAvailable
      ? [
          {
            id: 'fileCheckpointingEnabled',
            label: '代码回退（检查点）',
            value: globalConfig.fileCheckpointingEnabled,
            type: 'boolean' as const,
            onChange(enabled: boolean) {
              saveGlobalConfig(current => ({
                ...current,
                fileCheckpointingEnabled: enabled,
              }));
              setGlobalConfig({
                ...getGlobalConfig(),
                fileCheckpointingEnabled: enabled,
              });
              logEvent('tengu_file_history_snapshots_setting_changed', {
                enabled: enabled,
              });
            },
          },
        ]
      : []),
    {
      id: 'verbose',
      label: '详细输出',
      value: verbose,
      type: 'boolean',
      onChange: onChangeVerbose,
    },
    {
      id: 'terminalProgressBarEnabled',
      label: '终端进度条',
      value: globalConfig.terminalProgressBarEnabled,
      type: 'boolean' as const,
      onChange(terminalProgressBarEnabled: boolean) {
        saveGlobalConfig(current => ({
          ...current,
          terminalProgressBarEnabled,
        }));
        setGlobalConfig({ ...getGlobalConfig(), terminalProgressBarEnabled });
        logEvent('tengu_terminal_progress_bar_setting_changed', {
          enabled: terminalProgressBarEnabled,
        });
      },
    },
    ...(getFeatureValue_CACHED_MAY_BE_STALE('tengu_terminal_sidebar', false)
      ? [
          {
            id: 'showStatusInTerminalTab',
            label: '在终端标签页中显示状态',
            value: globalConfig.showStatusInTerminalTab ?? false,
            type: 'boolean' as const,
            onChange(showStatusInTerminalTab: boolean) {
              saveGlobalConfig(current => ({
                ...current,
                showStatusInTerminalTab,
              }));
              setGlobalConfig({
                ...getGlobalConfig(),
                showStatusInTerminalTab,
              });
              logEvent('tengu_terminal_tab_status_setting_changed', {
                enabled: showStatusInTerminalTab,
              });
            },
          },
        ]
      : []),
    {
      id: 'showTurnDuration',
      label: '显示轮次耗时',
      value: globalConfig.showTurnDuration,
      type: 'boolean' as const,
      onChange(showTurnDuration: boolean) {
        saveGlobalConfig(current => ({ ...current, showTurnDuration }));
        setGlobalConfig({ ...getGlobalConfig(), showTurnDuration });
        logEvent('tengu_show_turn_duration_setting_changed', {
          enabled: showTurnDuration,
        });
      },
    },
    {
      id: 'defaultPermissionMode',
      label: 'Default permission mode',
      value: currentDefaultPermissionMode,
      options: (() => {
        const priorityOrder: PermissionMode[] = ['default', 'plan'];
        return [...priorityOrder, ...PERMISSION_MODES.filter(m => !priorityOrder.includes(m))];
      })(),
      type: 'enum' as const,
      onChange(mode: string) {
        const parsedMode = permissionModeFromString(mode);
        // auto is an internal-only mode — store it directly, don't convert
        // to its external mapping ('default') which would make it invisible.
        const validatedMode =
          parsedMode === 'auto'
            ? parsedMode
            : isExternalPermissionMode(parsedMode)
              ? toExternalPermissionMode(parsedMode)
              : parsedMode;
        const result = updateSettingsForSource('userSettings', {
          permissions: {
            ...settingsData?.permissions,
            defaultMode: validatedMode as (typeof PERMISSION_MODES)[number],
          },
        });

        if (result.error) {
          logError(result.error);
          return;
        }

        // 立即更新本地状态以反映更改。
        // validatedMode 被类型化为宽泛的 PermissionMode 联合，但在运行时始终是 PERMISSION_MODES 的成员（上面的选项下拉框是从该数组构建的），因此这个收窄是合理的。
        setSettingsData(prev => ({
          ...prev,
          permissions: {
            ...prev?.permissions,
            defaultMode: validatedMode as (typeof PERMISSION_MODES)[number],
          },
        }));
        // 跟踪更改
        setChanges(prev => ({ ...prev, defaultPermissionMode: mode }));
        logEvent('tengu_config_changed', {
          setting: 'defaultPermissionMode' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          value: mode as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        });
      },
    },
    ...(feature('TRANSCRIPT_CLASSIFIER') && showAutoInDefaultModePicker
      ? [
          {
            id: 'useAutoModeDuringPlan',
            label: '计划期间使用自动模式',
            value: (settingsData as { useAutoModeDuringPlan?: boolean } | undefined)?.useAutoModeDuringPlan ?? true,
            type: 'boolean' as const,
            onChange(useAutoModeDuringPlan: boolean) {
              updateSettingsForSource('userSettings', {
                useAutoModeDuringPlan,
              });
              setSettingsData(prev => ({
                ...prev,
                useAutoModeDuringPlan,
              }));
              // 内部写入会抑制文件监视器，因此 applySettingsChange 不会触发。直接协调，以便计划中途的切换立即生效。
              setAppState(prev => {
                const next = transitionPlanAutoMode(prev.toolPermissionContext);
                if (next === prev.toolPermissionContext) return prev;
                return { ...prev, toolPermissionContext: next };
              });
              setChanges(prev => ({
                ...prev,
                计划期间使用自动模式: useAutoModeDuringPlan,
              }));
            },
          },
        ]
      : []),
    {
      id: 'respectGitignore',
      label: '文件选择器中遵守 .gitignore',
      value: globalConfig.respectGitignore,
      type: 'boolean' as const,
      onChange(respectGitignore: boolean) {
        saveGlobalConfig(current => ({ ...current, respectGitignore }));
        setGlobalConfig({ ...getGlobalConfig(), respectGitignore });
        logEvent('tengu_respect_gitignore_setting_changed', {
          enabled: respectGitignore,
        });
      },
    },
    {
      id: 'copyFullResponse',
      label: '始终复制完整回复（跳过 /copy 选择器）',
      value: globalConfig.copyFullResponse,
      type: 'boolean' as const,
      onChange(copyFullResponse: boolean) {
        saveGlobalConfig(current => ({ ...current, copyFullResponse }));
        setGlobalConfig({ ...getGlobalConfig(), copyFullResponse });
        logEvent('tengu_config_changed', {
          setting: 'copyFullResponse' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          value: String(copyFullResponse) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        });
      },
    },
    // 仅在应用内全屏备用屏幕模式下，选中即复制才有意义。在线模式下，终端仿真器拥有选择权。
    ...(isFullscreenEnvEnabled()
      ? [
          {
            id: 'copyOnSelect',
            label: '选中即复制',
            value: globalConfig.copyOnSelect ?? true,
            type: 'boolean' as const,
            onChange(copyOnSelect: boolean) {
              saveGlobalConfig(current => ({ ...current, copyOnSelect }));
              setGlobalConfig({ ...getGlobalConfig(), copyOnSelect });
              logEvent('tengu_config_changed', {
                setting: 'copyOnSelect' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                value: String(copyOnSelect) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              });
            },
          },
        ]
      : []),
    // autoUpdates 设置已隐藏 - 使用 DISABLE_AUTOUPDATER 环境变量来控制
    autoUpdaterDisabledReason
      ? {
          id: 'autoUpdatesChannel',
          label: '自动更新通道',
          value: 'disabled',
          type: 'managedEnum' as const,
          onChange() {},
        }
      : {
          id: 'autoUpdatesChannel',
          label: '自动更新通道',
          value: settingsData?.autoUpdatesChannel ?? 'latest',
          type: 'managedEnum' as const,
          onChange() {
            // 通过 toggleSetting -> 'ChannelDowngrade' 处理
          },
        },
    {
      id: 'theme',
      label: '主题',
      value: themeSetting,
      type: 'managedEnum',
      onChange: setTheme,
    },
    {
      id: 'notifChannel',
      label: feature('KAIROS') || feature('KAIROS_PUSH_NOTIFICATION') ? '本地通知' : '通知',
      value: globalConfig.preferredNotifChannel,
      options: ['auto', 'iterm2', 'terminal_bell', 'iterm2_with_bell', 'kitty', 'ghostty', 'notifications_disabled'],
      type: 'enum',
      onChange(notifChannel: GlobalConfig['preferredNotifChannel']) {
        saveGlobalConfig(current => ({
          ...current,
          preferredNotifChannel: notifChannel,
        }));
        setGlobalConfig({
          ...getGlobalConfig(),
          preferredNotifChannel: notifChannel,
        });
      },
    },
    ...(feature('KAIROS') || feature('KAIROS_PUSH_NOTIFICATION')
      ? [
          {
            id: 'taskCompleteNotifEnabled',
            label: '空闲时推送',
            value: globalConfig.taskCompleteNotifEnabled ?? false,
            type: 'boolean' as const,
            onChange(taskCompleteNotifEnabled: boolean) {
              saveGlobalConfig(current => ({
                ...current,
                taskCompleteNotifEnabled,
              }));
              setGlobalConfig({
                ...getGlobalConfig(),
                taskCompleteNotifEnabled,
              });
            },
          },
          {
            id: 'inputNeededNotifEnabled',
            label: '需要输入时推送',
            value: globalConfig.inputNeededNotifEnabled ?? false,
            type: 'boolean' as const,
            onChange(inputNeededNotifEnabled: boolean) {
              saveGlobalConfig(current => ({
                ...current,
                inputNeededNotifEnabled,
              }));
              setGlobalConfig({
                ...getGlobalConfig(),
                inputNeededNotifEnabled,
              });
            },
          },
          {
            id: 'agentPushNotifEnabled',
            label: 'Claude 决定时推送',
            value: globalConfig.agentPushNotifEnabled ?? false,
            type: 'boolean' as const,
            onChange(agentPushNotifEnabled: boolean) {
              saveGlobalConfig(current => ({
                ...current,
                agentPushNotifEnabled,
              }));
              setGlobalConfig({
                ...getGlobalConfig(),
                agentPushNotifEnabled,
              });
            },
          },
        ]
      : []),
    {
      id: 'outputStyle',
      label: '输出风格',
      value: currentOutputStyle,
      type: 'managedEnum' as const,
      onChange: () => {}, // 由 OutputStylePicker 子菜单处理
    },
    ...(showDefaultViewPicker
      ? [
          {
            id: 'defaultView',
            label: '默认视图',
            // 'default' 表示该设置未设置 — 当前解析为 transcript（当 defaultView !== 'chat' 时 main.tsx 回退）。
            // String() 将条件模式扩展联合收窄为字符串。
            value: settingsData?.defaultView === undefined ? 'default' : String(settingsData.defaultView),
            options: ['transcript', 'chat', 'default'],
            type: 'enum' as const,
            onChange(selected: string) {
              const defaultView = selected === 'default' ? undefined : (selected as 'chat' | 'transcript');
              updateSettingsForSource('localSettings', { defaultView });
              setSettingsData(prev => ({ ...prev, defaultView }));
              const nextBrief = defaultView === 'chat';
              setAppState(prev => {
                if (prev.isBriefOnly === nextBrief) return prev;
                return { ...prev, isBriefOnly: nextBrief };
              });
              // 保持 userMsgOptIn 同步，以便工具列表跟随视图。
              // 现在是双向的（与 /brief 相同）— 接受缓存失效总比在切换后留下工具更好。
              // 通过 initialUserMsgOptIn 快照在 Escape 时恢复。
              setUserMsgOptIn(nextBrief);
              setChanges(prev => ({ ...prev, 默认视图: selected }));
              logEvent('tengu_default_view_setting_changed', {
                value: (defaultView ?? 'unset') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              });
            },
          },
        ]
      : []),
    {
      id: 'language',
      label: '语言',
      value: currentLanguage ?? '默认（英语）',
      type: 'managedEnum' as const,
      onChange: () => {}, // 由 LanguagePicker 子菜单处理
    },
    {
      id: 'editorMode',
      label: '编辑器模式',
      // 将 'emacs' 转换为 'normal' 以向后兼容
      value: globalConfig.editorMode === 'emacs' ? 'normal' : globalConfig.editorMode || 'normal',
      options: ['normal', 'vim'],
      type: 'enum',
      onChange(value: string) {
        saveGlobalConfig(current => ({
          ...current,
          editorMode: value as GlobalConfig['editorMode'],
        }));
        setGlobalConfig({
          ...getGlobalConfig(),
          editorMode: value as GlobalConfig['editorMode'],
        });

        logEvent('tengu_editor_mode_changed', {
          mode: value as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          source: 'config_panel' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        });
      },
    },
    {
      id: 'prStatusFooterEnabled',
      label: '显示 PR 状态页脚',
      value: globalConfig.prStatusFooterEnabled ?? true,
      type: 'boolean' as const,
      onChange(enabled: boolean) {
        saveGlobalConfig(current => {
          if (current.prStatusFooterEnabled === enabled) return current;
          return {
            ...current,
            prStatusFooterEnabled: enabled,
          };
        });
        setGlobalConfig({
          ...getGlobalConfig(),
          prStatusFooterEnabled: enabled,
        });
        logEvent('tengu_pr_status_footer_setting_changed', {
          enabled,
        });
      },
    },
    {
      id: 'model',
      label: '模型',
      value: mainLoopModel === null ? '默认（推荐）' : mainLoopModel,
      type: 'managedEnum' as const,
      onChange: onChangeMainModelConfig,
    },
    ...(isConnectedToIde
      ? [
          {
            id: 'diffTool',
            label: '差异工具',
            value: globalConfig.diffTool ?? 'auto',
            options: ['terminal', 'auto'],
            type: 'enum' as const,
            onChange(diffTool: string) {
              saveGlobalConfig(current => ({
                ...current,
                diffTool: diffTool as GlobalConfig['diffTool'],
              }));
              setGlobalConfig({
                ...getGlobalConfig(),
                diffTool: diffTool as GlobalConfig['diffTool'],
              });

              logEvent('tengu_diff_tool_changed', {
                tool: diffTool as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                source: 'config_panel' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              });
            },
          },
        ]
      : []),
    ...(!isSupportedTerminal()
      ? [
          {
            id: 'autoConnectIde',
            label: '自动连接到 IDE（外部终端）',
            value: globalConfig.autoConnectIde ?? false,
            type: 'boolean' as const,
            onChange(autoConnectIde: boolean) {
              saveGlobalConfig(current => ({ ...current, autoConnectIde }));
              setGlobalConfig({ ...getGlobalConfig(), autoConnectIde });

              logEvent('tengu_auto_connect_ide_changed', {
                enabled: autoConnectIde,
                source: 'config_panel' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              });
            },
          },
        ]
      : []),
    ...(isSupportedTerminal()
      ? [
          {
            id: 'autoInstallIdeExtension',
            label: '自动安装 IDE 扩展',
            value: globalConfig.autoInstallIdeExtension ?? true,
            type: 'boolean' as const,
            onChange(autoInstallIdeExtension: boolean) {
              saveGlobalConfig(current => ({
                ...current,
                autoInstallIdeExtension,
              }));
              setGlobalConfig({ ...getGlobalConfig(), autoInstallIdeExtension });

              logEvent('tengu_auto_install_ide_extension_changed', {
                enabled: autoInstallIdeExtension,
                source: 'config_panel' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              });
            },
          },
        ]
      : []),
    {
      id: 'claudeInChromeDefaultEnabled',
      label: 'Chrome 中的 Claude 默认启用',
      value: globalConfig.claudeInChromeDefaultEnabled ?? true,
      type: 'boolean' as const,
      onChange(enabled: boolean) {
        saveGlobalConfig(current => ({
          ...current,
          claudeInChromeDefaultEnabled: enabled,
        }));
        setGlobalConfig({
          ...getGlobalConfig(),
          claudeInChromeDefaultEnabled: enabled,
        });
        logEvent('tengu_claude_in_chrome_setting_changed', {
          enabled,
        });
      },
    },
    // 队友模式（仅在启用代理群组时显示）
    ...(isAgentSwarmsEnabled()
      ? (() => {
          const cliOverride = getCliTeammateModeOverride();
          const label = cliOverride ? `队友模式 [已覆盖: ${cliOverride}]` : '队友模式';
          const isWindows = getPlatform() === 'windows';
          const teammateModeOptions = isWindows
            ? ['auto', 'tmux', 'windows-terminal', 'in-process']
            : ['auto', 'tmux', 'in-process'];
          return [
            {
              id: 'teammateMode',
              label,
              value: globalConfig.teammateMode ?? 'auto',
              options: teammateModeOptions,
              type: 'enum' as const,
              onChange(mode: string) {
                if (mode !== 'auto' && mode !== 'tmux' && mode !== 'windows-terminal' && mode !== 'in-process') {
                  return;
                }
                if (mode === 'windows-terminal' && !isWindows) {
                  return;
                }
                // 清除 CLI 覆盖并设置新模式（传递 mode 以避免竞争条件）
                clearCliTeammateModeOverride(mode);
                saveGlobalConfig(current => ({
                  ...current,
                  teammateMode: mode,
                }));
                setGlobalConfig({
                  ...getGlobalConfig(),
                  teammateMode: mode,
                });
                logEvent('tengu_teammate_mode_changed', {
                  mode: mode as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                });
              },
            },
            {
              id: 'teammateDefaultModel',
              label: '默认队友模型',
              value: teammateModelDisplayString(globalConfig.teammateDefaultModel),
              type: 'managedEnum' as const,
              onChange() {},
            },
          ];
        })()
      : []),
    // 启动时远程控制切换 — 门控条件：构建标志 + GrowthBook + 策略
    ...(feature('BRIDGE_MODE') && isBridgeEnabled()
      ? [
          {
            id: 'remoteControlAtStartup',
            label: '为所有会话启用远程控制',
            value:
              globalConfig.remoteControlAtStartup === undefined
                ? 'default'
                : String(globalConfig.remoteControlAtStartup),
            options: ['true', 'false', 'default'],
            type: 'enum' as const,
            onChange(selected: string) {
              if (selected === 'default') {
                // 取消设置配置键，使其回退到平台默认值
                saveGlobalConfig(current => {
                  if (current.remoteControlAtStartup === undefined) return current;
                  const next = { ...current };
                  delete next.remoteControlAtStartup;
                  return next;
                });
                setGlobalConfig({
                  ...getGlobalConfig(),
                  remoteControlAtStartup: undefined,
                });
              } else {
                const enabled = selected === 'true';
                saveGlobalConfig(current => {
                  if (current.remoteControlAtStartup === enabled) return current;
                  return { ...current, remoteControlAtStartup: enabled };
                });
                setGlobalConfig({
                  ...getGlobalConfig(),
                  remoteControlAtStartup: enabled,
                });
              }
              // 同步到 AppState，以便 useReplBridge 立即响应
              const resolved = getRemoteControlAtStartup();
              setAppState(prev => {
                if (prev.replBridgeEnabled === resolved && !prev.replBridgeOutboundOnly) return prev;
                return {
                  ...prev,
                  replBridgeEnabled: resolved,
                  replBridgeOutboundOnly: false,
                };
              });
            },
          },
        ]
      : []),
    ...(shouldShowExternalIncludesToggle
      ? [
          {
            id: 'showExternalIncludesDialog',
            label: '外部 CLAUDE.md 包含',
            value: (() => {
              const projectConfig = getCurrentProjectConfig();
              if (projectConfig.hasClaudeMdExternalIncludesApproved) {
                return 'true';
              } else {
                return 'false';
              }
            })(),
            type: 'managedEnum' as const,
            onChange() {
              // 将由 toggleSetting 函数处理
            },
          },
        ]
      : []),
    ...(process.env.ANTHROPIC_API_KEY && !isRunningOnHomespace()
      ? [
          {
            id: 'apiKey',
            label: (
              <Text>
                使用自定义 API 密钥：<Text bold>{normalizeApiKeyForConfig(process.env.ANTHROPIC_API_KEY)}</Text>
              </Text>
            ),
            searchText: '使用自定义 API 密钥',
            value: Boolean(
              process.env.ANTHROPIC_API_KEY &&
                globalConfig.customApiKeyResponses?.approved?.includes(
                  normalizeApiKeyForConfig(process.env.ANTHROPIC_API_KEY),
                ),
            ),
            type: 'boolean' as const,
            onChange(useCustomKey: boolean) {
              saveGlobalConfig(current => {
                const updated = { ...current };
                if (!updated.customApiKeyResponses) {
                  updated.customApiKeyResponses = {
                    approved: [],
                    rejected: [],
                  };
                }
                if (!updated.customApiKeyResponses.approved) {
                  updated.customApiKeyResponses = {
                    ...updated.customApiKeyResponses,
                    approved: [],
                  };
                }
                if (!updated.customApiKeyResponses.rejected) {
                  updated.customApiKeyResponses = {
                    ...updated.customApiKeyResponses,
                    rejected: [],
                  };
                }
                if (process.env.ANTHROPIC_API_KEY) {
                  const truncatedKey = normalizeApiKeyForConfig(process.env.ANTHROPIC_API_KEY);
                  if (useCustomKey) {
                    updated.customApiKeyResponses = {
                      ...updated.customApiKeyResponses,
                      approved: [
                        ...(updated.customApiKeyResponses.approved ?? []).filter(k => k !== truncatedKey),
                        truncatedKey,
                      ],
                      rejected: (updated.customApiKeyResponses.rejected ?? []).filter(k => k !== truncatedKey),
                    };
                  } else {
                    updated.customApiKeyResponses = {
                      ...updated.customApiKeyResponses,
                      approved: (updated.customApiKeyResponses.approved ?? []).filter(k => k !== truncatedKey),
                      rejected: [
                        ...(updated.customApiKeyResponses.rejected ?? []).filter(k => k !== truncatedKey),
                        truncatedKey,
                      ],
                    };
                  }
                }
                return updated;
              });
              setGlobalConfig(getGlobalConfig());
            },
          },
        ]
      : []),
  ];

  // 根据搜索查询过滤设置项
  const filteredSettingsItems = React.useMemo(() => {
    if (!searchQuery) return settingsItems;
    const lowerQuery = searchQuery.toLowerCase();
    return settingsItems.filter(setting => {
      if (setting.id.toLowerCase().includes(lowerQuery)) return true;
      const searchableText = 'searchText' in setting ? setting.searchText : setting.label;
      return searchableText.toLowerCase().includes(lowerQuery);
    });
  }, [settingsItems, searchQuery]);

  // 当过滤后的列表变小时调整选中的索引，并在 maxVisible 变化时（例如终端调整大小）保持选中项可见。
  React.useEffect(() => {
    if (selectedIndex >= filteredSettingsItems.length) {
      const newIndex = Math.max(0, filteredSettingsItems.length - 1);
      setSelectedIndex(newIndex);
      setScrollOffset(Math.max(0, newIndex - maxVisible + 1));
      return;
    }
    setScrollOffset(prev => {
      if (selectedIndex < prev) return selectedIndex;
      if (selectedIndex >= prev + maxVisible) return selectedIndex - maxVisible + 1;
      return prev;
    });
  }, [filteredSettingsItems.length, selectedIndex, maxVisible]);

  // 保持选中项在滚动窗口内可见。
  // 从导航处理程序同步调用，以避免滚动窗口外选中项的渲染帧。
  const adjustScrollOffset = useCallback(
    (newIndex: number) => {
      setScrollOffset(prev => {
        if (newIndex < prev) return newIndex;
        if (newIndex >= prev + maxVisible) return newIndex - maxVisible + 1;
        return prev;
      });
    },
    [maxVisible],
  );

  // 回车：保留所有更改（已由 onChange 处理程序持久化），使用更改摘要关闭。
  const handleSaveAndClose = useCallback(() => {
    // 子菜单处理：每个子菜单有自己的 Enter/Esc — 当子菜单打开时不要关闭整个面板。
    if (showSubmenu !== null) {
      return;
    }
    // 记录所有更改
    // TODO：将这些变为适当的消息
    const formattedChanges: string[] = Object.entries(changes).map(([key, value]) => {
      logEvent('tengu_config_changed', {
        key: key as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        value: value as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
      return `将 ${key} 设置为 ${chalk.bold(value)}`;
    });
    // 检查 API 密钥更改
    // 在 homespace 上，ANTHROPIC_API_KEY 保留在 process.env 中供子进程使用，但 Claude Code 本身忽略它（参见 auth.ts）。
    const effectiveApiKey = isRunningOnHomespace() ? undefined : process.env.ANTHROPIC_API_KEY;
    const initialUsingCustomKey = Boolean(
      effectiveApiKey &&
        initialConfig.current.customApiKeyResponses?.approved?.includes(normalizeApiKeyForConfig(effectiveApiKey)),
    );
    const currentUsingCustomKey = Boolean(
      effectiveApiKey &&
        globalConfig.customApiKeyResponses?.approved?.includes(normalizeApiKeyForConfig(effectiveApiKey)),
    );
    if (initialUsingCustomKey !== currentUsingCustomKey) {
      formattedChanges.push(`${currentUsingCustomKey ? '启用' : '禁用'}自定义 API 密钥`);
      logEvent('tengu_config_changed', {
        key: 'env.ANTHROPIC_API_KEY' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        value: currentUsingCustomKey as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
    }
    if (globalConfig.theme !== initialConfig.current.theme) {
      formattedChanges.push(`将主题设置为 ${chalk.bold(globalConfig.theme)}`);
    }
    if (globalConfig.preferredNotifChannel !== initialConfig.current.preferredNotifChannel) {
      formattedChanges.push(`将通知设置为 ${chalk.bold(globalConfig.preferredNotifChannel)}`);
    }
    if (currentOutputStyle !== initialOutputStyle.current) {
      formattedChanges.push(`将输出风格设置为 ${chalk.bold(currentOutputStyle)}`);
    }
    if (currentLanguage !== initialLanguage.current) {
      formattedChanges.push(`将回复语言设置为 ${chalk.bold(currentLanguage ?? '默认（英语）')}`);
    }
    if (globalConfig.editorMode !== initialConfig.current.editorMode) {
      formattedChanges.push(`将编辑器模式设置为 ${chalk.bold(globalConfig.editorMode || 'emacs')}`);
    }
    if (globalConfig.diffTool !== initialConfig.current.diffTool) {
      formattedChanges.push(`将差异工具设置为 ${chalk.bold(globalConfig.diffTool)}`);
    }
    if (globalConfig.autoConnectIde !== initialConfig.current.autoConnectIde) {
      formattedChanges.push(`${globalConfig.autoConnectIde ? '启用' : '禁用'}自动连接到 IDE`);
    }
    if (globalConfig.autoInstallIdeExtension !== initialConfig.current.autoInstallIdeExtension) {
      formattedChanges.push(`${globalConfig.autoInstallIdeExtension ? '启用' : '禁用'}自动安装 IDE 扩展`);
    }
    if (globalConfig.autoCompactEnabled !== initialConfig.current.autoCompactEnabled) {
      formattedChanges.push(`${globalConfig.autoCompactEnabled ? '启用' : '禁用'}自动压缩`);
    }
    if (globalConfig.respectGitignore !== initialConfig.current.respectGitignore) {
      formattedChanges.push(`${globalConfig.respectGitignore ? '启用' : '禁用'}文件选择器中遵守 .gitignore`);
    }
    if (globalConfig.copyFullResponse !== initialConfig.current.copyFullResponse) {
      formattedChanges.push(`${globalConfig.copyFullResponse ? '启用' : '禁用'}始终复制完整回复`);
    }
    if (globalConfig.copyOnSelect !== initialConfig.current.copyOnSelect) {
      formattedChanges.push(`${globalConfig.copyOnSelect ? '启用' : '禁用'}选中即复制`);
    }
    if (globalConfig.terminalProgressBarEnabled !== initialConfig.current.terminalProgressBarEnabled) {
      formattedChanges.push(`${globalConfig.terminalProgressBarEnabled ? '启用' : '禁用'}终端进度条`);
    }
    if (globalConfig.showStatusInTerminalTab !== initialConfig.current.showStatusInTerminalTab) {
      formattedChanges.push(`${globalConfig.showStatusInTerminalTab ? '启用' : '禁用'}终端标签页状态`);
    }
    if (globalConfig.showTurnDuration !== initialConfig.current.showTurnDuration) {
      formattedChanges.push(`${globalConfig.showTurnDuration ? '启用' : '禁用'}轮次耗时`);
    }
    if (globalConfig.remoteControlAtStartup !== initialConfig.current.remoteControlAtStartup) {
      const remoteLabel =
        globalConfig.remoteControlAtStartup === undefined
          ? '将远程控制重置为默认值'
          : `${globalConfig.remoteControlAtStartup ? '启用' : '禁用'}所有会话的远程控制`;
      formattedChanges.push(remoteLabel);
    }
    if (settingsData?.autoUpdatesChannel !== initialSettingsData.current?.autoUpdatesChannel) {
      formattedChanges.push(`将自动更新通道设置为 ${chalk.bold(settingsData?.autoUpdatesChannel ?? 'latest')}`);
    }
    if (formattedChanges.length > 0) {
      onClose(formattedChanges.join('\n'));
    } else {
      onClose('配置对话框已关闭', { display: 'system' });
    }
  }, [
    showSubmenu,
    changes,
    globalConfig,
    mainLoopModel,
    currentOutputStyle,
    currentLanguage,
    settingsData?.autoUpdatesChannel,
    isFastModeEnabled() ? (settingsData as Record<string, unknown> | undefined)?.fastMode : undefined,
    onClose,
  ]);

  // 将所有状态存储恢复到挂载时的快照。更改在切换时立即应用到磁盘/AppState，因此“取消”意味着主动将旧值写回。
  const revertChanges = useCallback(() => {
    // 主题：恢复 ThemeProvider React 状态。必须在全局配置覆盖之前运行，因为 setTheme 内部会调用 saveGlobalConfig 进行部分更新 — 我们希望完整快照是最后一次写入。
    if (themeSetting !== initialThemeSetting.current) {
      setTheme(initialThemeSetting.current);
    }
    // 全局配置：从快照完整覆盖。如果返回的引用等于当前，则 saveGlobalConfig 跳过（测试模式检查引用；生产环境写入磁盘但内容相同）。
    saveGlobalConfig(() => initialConfig.current);
    // 设置文件：恢复 Config 可能接触的每个键。undefined 会删除该键（updateSettingsForSource 自定义器在 settings.ts:368）。
    const il = initialLocalSettings;
    updateSettingsForSource('localSettings', {
      spinnerTipsEnabled: il?.spinnerTipsEnabled,
      prefersReducedMotion: il?.prefersReducedMotion,
      defaultView: il?.defaultView,
      outputStyle: il?.outputStyle,
    });
    const iu = initialUserSettings;
    updateSettingsForSource('userSettings', {
      alwaysThinkingEnabled: iu?.alwaysThinkingEnabled,
      fastMode: iu?.fastMode,
      promptSuggestionEnabled: iu?.promptSuggestionEnabled,
      autoUpdatesChannel: iu?.autoUpdatesChannel,
      minimumVersion: iu?.minimumVersion,
      language: iu?.language,
      ...(feature('TRANSCRIPT_CLASSIFIER')
        ? {
            useAutoModeDuringPlan: (iu as { useAutoModeDuringPlan?: boolean } | undefined)?.useAutoModeDuringPlan,
          }
        : {}),
      // ThemePicker 的 Ctrl+T 直接写入此键 — 包含它，以便磁盘状态与内存 AppState.settings 一起恢复。
      syntaxHighlightingDisabled: iu?.syntaxHighlightingDisabled,
      // permissions：上面的 defaultMode onChange（如上）将合并的 settingsData.permissions 扩展到 userSettings 中 — 项目/策略允许/拒绝数组可能泄漏到磁盘。
      // 传播完整的初始快照，以便 mergeWith 数组自定义器（settings.ts:375）替换泄漏的数组。
      // 显式包含 defaultMode，以便即使 iu.permissions 缺少该键，也会触发自定义器的删除路径。
      permissions:
        iu?.permissions === undefined ? undefined : { ...iu.permissions, defaultMode: iu.permissions.defaultMode },
    });
    // AppState：批量恢复所有可能被触及的字段。
    const ia = initialAppState;
    setAppState(prev => ({
      ...prev,
      mainLoopModel: ia.mainLoopModel,
      mainLoopModelForSession: ia.mainLoopModelForSession,
      verbose: ia.verbose,
      thinkingEnabled: ia.thinkingEnabled,
      fastMode: ia.fastMode,
      promptSuggestionEnabled: ia.promptSuggestionEnabled,
      isBriefOnly: ia.isBriefOnly,
      replBridgeEnabled: ia.replBridgeEnabled,
      replBridgeOutboundOnly: ia.replBridgeOutboundOnly,
      settings: ia.settings,
      // 在上述 useAutoModeDuringPlan 恢复后协调自动模式状态 — onChange 处理程序可能已在计划中途激活/停用自动模式。
      toolPermissionContext: transitionPlanAutoMode(prev.toolPermissionContext),
    }));
    // Bootstrap 状态：恢复 userMsgOptIn。仅由上面的 defaultView onChange 触及，因此此处不需要 feature() 防护（该路径仅在 showDefaultViewPicker 为 true 时存在）。
    if (getUserMsgOptIn() !== initialUserMsgOptIn) {
      setUserMsgOptIn(initialUserMsgOptIn);
    }
  }, [
    themeSetting,
    setTheme,
    initialLocalSettings,
    initialUserSettings,
    initialAppState,
    initialUserMsgOptIn,
    setAppState,
  ]);

  // Escape：恢复所有更改（如果有）并关闭。
  const handleEscape = useCallback(() => {
    if (showSubmenu !== null) {
      return;
    }
    if (isDirty.current) {
      revertChanges();
    }
    onClose('配置对话框已关闭', { display: 'system' });
  }, [showSubmenu, revertChanges, onClose]);

  // 当子菜单打开时禁用，以便子菜单的 Dialog 处理 ESC，并且在搜索模式下，onKeyDown 处理程序（清除然后退出搜索）获胜 — 否则搜索中的 Escape 会直接跳转到恢复+关闭。
  useKeybinding('confirm:no', handleEscape, {
    context: 'Settings',
    isActive: showSubmenu === null && !isSearchMode && !headerFocused,
  });
  // 仅在非搜索模式时按 Enter 触发保存并关闭（搜索模式下 Enter 退出搜索到列表 — 参见 handleKeyDown 中的 isSearchMode 分支）。
  useKeybinding('settings:close', handleSaveAndClose, {
    context: 'Settings',
    isActive: showSubmenu === null && !isSearchMode && !headerFocused,
  });

  // 通过可配置的快捷键进行设置导航和切换操作。
  // 仅当不在搜索模式且没有子菜单打开时激活。
  const toggleSetting = useCallback(() => {
    const setting = filteredSettingsItems[selectedIndex];
    if (!setting || !setting.onChange) {
      return;
    }

    if (setting.type === 'boolean') {
      isDirty.current = true;
      setting.onChange(!setting.value);
      if (setting.id === 'thinkingEnabled') {
        const newValue = !setting.value;
        const backToInitial = newValue === initialThinkingEnabled.current;
        if (backToInitial) {
          setShowThinkingWarning(false);
        } else if (context.messages.some(m => m.type === 'assistant')) {
          setShowThinkingWarning(true);
        }
      }
      return;
    }

    if (
      setting.id === 'theme' ||
      setting.id === 'model' ||
      setting.id === 'teammateDefaultModel' ||
      setting.id === 'showExternalIncludesDialog' ||
      setting.id === 'outputStyle' ||
      setting.id === 'language'
    ) {
      // managedEnum 项打开子菜单 — isDirty 由子菜单的完成回调设置，而不是在这里（子菜单可能被取消）。
      switch (setting.id) {
        case 'theme':
          setShowSubmenu('Theme');
          setTabsHidden(true);
          return;
        case 'model':
          setShowSubmenu('Model');
          setTabsHidden(true);
          return;
        case 'teammateDefaultModel':
          setShowSubmenu('TeammateModel');
          setTabsHidden(true);
          return;
        case 'showExternalIncludesDialog':
          setShowSubmenu('ExternalIncludes');
          setTabsHidden(true);
          return;
        case 'outputStyle':
          setShowSubmenu('OutputStyle');
          setTabsHidden(true);
          return;
        case 'language':
          setShowSubmenu('Language');
          setTabsHidden(true);
          return;
      }
    }

    if (setting.id === 'autoUpdatesChannel') {
      if (autoUpdaterDisabledReason) {
        // 自动更新已禁用 - 改为显示启用对话框
        setShowSubmenu('EnableAutoUpdates');
        setTabsHidden(true);
        return;
      }
      const currentChannel = settingsData?.autoUpdatesChannel ?? 'latest';
      if (currentChannel === 'latest') {
        // 切换到稳定版 - 显示降级对话框
        setShowSubmenu('ChannelDowngrade');
        setTabsHidden(true);
      } else {
        // 切换到最新版 - 直接执行并清除 minimumVersion
        isDirty.current = true;
        updateSettingsForSource('userSettings', {
          autoUpdatesChannel: 'latest',
          minimumVersion: undefined,
        });
        setSettingsData(prev => ({
          ...prev,
          autoUpdatesChannel: 'latest',
          minimumVersion: undefined,
        }));
        logEvent('tengu_autoupdate_channel_changed', {
          channel: 'latest' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        });
      }
      return;
    }

    if (setting.type === 'enum') {
      isDirty.current = true;
      const currentIndex = setting.options.indexOf(setting.value);
      const nextIndex = (currentIndex + 1) % setting.options.length;
      setting.onChange(setting.options[nextIndex]!);
      return;
    }
  }, [
    autoUpdaterDisabledReason,
    filteredSettingsItems,
    selectedIndex,
    settingsData?.autoUpdatesChannel,
    setTabsHidden,
  ]);

  const moveSelection = (delta: -1 | 1): void => {
    setShowThinkingWarning(false);
    const newIndex = Math.max(0, Math.min(filteredSettingsItems.length - 1, selectedIndex + delta));
    setSelectedIndex(newIndex);
    adjustScrollOffset(newIndex);
  };

  useKeybindings(
    {
      'select:previous': () => {
        if (selectedIndex === 0) {
          // ↑ 在顶部时进入搜索模式，以便用户在到达列表边界后可以通过键入来过滤。向上滚动（scroll:lineUp）会钳位 — 超出不应将焦点移开列表。
          setShowThinkingWarning(false);
          setIsSearchMode(true);
          setScrollOffset(0);
        } else {
          moveSelection(-1);
        }
      },
      'select:next': () => moveSelection(1),
      // 滚轮。当 ScrollBox 内容适合时，ScrollKeybindingHandler 的 scroll:line* 返回 false（未消耗）— 在这里内容总是适合，因为列表是分页的（切片）。
      // 事件落到此处理程序，该处理程序导航列表，在边界处钳位。
      'scroll:lineUp': () => moveSelection(-1),
      'scroll:lineDown': () => moveSelection(1),
      'select:accept': toggleSetting,
      'select:previousValue': () => toggleSetting(),
      'select:nextValue': () => toggleSetting(),
      'settings:search': () => {
        setIsSearchMode(true);
        setSearchQuery('');
      },
    },
    {
      context: 'Settings',
      isActive: showSubmenu === null && !isSearchMode && !headerFocused,
    },
  );

  // 跨搜索/列表模式的组合按键处理。分支顺序镜像原始 useInput 门控优先级：子菜单和标题优先短路（它们自己的处理程序拥有输入），然后是搜索与列表。
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (showSubmenu !== null) return;
      if (headerFocused) return;
      // 搜索模式：Esc 清除然后退出，Enter/↓ 移动到列表。
      if (isSearchMode) {
        if (e.key === 'escape') {
          e.preventDefault();
          if (searchQuery.length > 0) {
            setSearchQuery('');
          } else {
            setIsSearchMode(false);
          }
          return;
        }
        if (e.key === 'return' || e.key === 'down' || e.key === 'wheeldown') {
          e.preventDefault();
          setIsSearchMode(false);
          setSelectedIndex(0);
          setScrollOffset(0);
        }
        return;
      }
      // 列表模式：左/右/制表符循环选中选项的值。这些键过去用于切换标签页；现在只有当标签行被显式聚焦时才会这样做（参见 Settings.tsx 中的 headerFocused）。
      if (e.key === 'left' || e.key === 'right' || e.key === 'tab') {
        e.preventDefault();
        toggleSetting();
        return;
      }
      // 回退：可打印字符（绑定到操作的字符除外）进入搜索模式。剔除 j/k// — useKeybindings（仍在 useInput 路径上）通过 stopImmediatePropagation 使用这些键，但 onKeyDown 独立调度，因此我们必须显式跳过它们。
      if (e.ctrl || e.meta) return;
      if (e.key === 'j' || e.key === 'k' || e.key === '/') return;
      if (e.key.length === 1 && e.key !== ' ') {
        e.preventDefault();
        setIsSearchMode(true);
        setSearchQuery(e.key);
      }
    },
    [showSubmenu, headerFocused, isSearchMode, searchQuery, setSearchQuery, toggleSetting],
  );

  return (
    <Box flexDirection="column" width="100%" tabIndex={0} autoFocus onKeyDown={handleKeyDown}>
      {showSubmenu === 'Theme' ? (
        <>
          <ThemePicker
            onThemeSelect={setting => {
              isDirty.current = true;
              setTheme(setting);
              setShowSubmenu(null);
              setTabsHidden(false);
            }}
            onCancel={() => {
              setShowSubmenu(null);
              setTabsHidden(false);
            }}
            hideEscToCancel
            skipExitHandling={true} // 跳过退出处理，因为 Config 已经处理了
          />
          <Box>
            <Text dimColor italic>
              <Byline>
                <KeyboardShortcutHint shortcut="Enter" action="select" />
                <ConfigurableShortcutHint
                  action="confirm:no"
                  context="Confirmation"
                  fallback="Esc"
                  description="取消"
                />
              </Byline>
            </Text>
          </Box>
        </>
      ) : showSubmenu === 'Model' ? (
        <>
          <ModelPicker
            initial={mainLoopModel}
            onSelect={(model, _effort) => {
              isDirty.current = true;
              onChangeMainModelConfig(model);
              setShowSubmenu(null);
              setTabsHidden(false);
            }}
            onCancel={() => {
              setShowSubmenu(null);
              setTabsHidden(false);
            }}
            showFastModeNotice={
              isFastModeEnabled()
                ? isFastMode && isFastModeSupportedByModel(mainLoopModel) && isFastModeAvailable()
                : false
            }
          />
          <Text dimColor>
            <Byline>
              <KeyboardShortcutHint shortcut="Enter" action="confirm" />
              <ConfigurableShortcutHint action="confirm:no" context="Confirmation" fallback="Esc" description="取消" />
            </Byline>
          </Text>
        </>
      ) : showSubmenu === 'TeammateModel' ? (
        <>
          <ModelPicker
            initial={globalConfig.teammateDefaultModel ?? null}
            skipSettingsWrite
            headerText="新生成队友的默认模型。负责人可以通过工具调用的 model 参数覆盖。"
            onSelect={(model, _effort) => {
              setShowSubmenu(null);
              setTabsHidden(false);
              // 首次打开然后从未设置状态按 Enter：选择器高亮“默认”（initial=null），确认会写入 null，静默将 Opus 回退切换到跟随负责人。视为无操作。
              if (globalConfig.teammateDefaultModel === undefined && model === null) {
                return;
              }
              isDirty.current = true;
              saveGlobalConfig(current =>
                current.teammateDefaultModel === model ? current : { ...current, teammateDefaultModel: model },
              );
              setGlobalConfig({
                ...getGlobalConfig(),
                teammateDefaultModel: model,
              });
              setChanges(prev => ({
                ...prev,
                teammateDefaultModel: teammateModelDisplayString(model),
              }));
              logEvent('tengu_teammate_default_model_changed', {
                model: model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              });
            }}
            onCancel={() => {
              setShowSubmenu(null);
              setTabsHidden(false);
            }}
          />
          <Text dimColor>
            <Byline>
              <KeyboardShortcutHint shortcut="Enter" action="confirm" />
              <ConfigurableShortcutHint action="confirm:no" context="Confirmation" fallback="Esc" description="取消" />
            </Byline>
          </Text>
        </>
      ) : showSubmenu === 'ExternalIncludes' ? (
        <>
          <ClaudeMdExternalIncludesDialog
            onDone={() => {
              setShowSubmenu(null);
              setTabsHidden(false);
            }}
            externalIncludes={getExternalClaudeMdIncludes(memoryFiles as MemoryFileInfo[])}
          />
          <Text dimColor>
            <Byline>
              <KeyboardShortcutHint shortcut="Enter" action="confirm" />
              <ConfigurableShortcutHint
                action="confirm:no"
                context="Confirmation"
                fallback="Esc"
                description="禁用外部包含"
              />
            </Byline>
          </Text>
        </>
      ) : showSubmenu === 'OutputStyle' ? (
        <>
          <OutputStylePicker
            initialStyle={currentOutputStyle}
            onComplete={style => {
              isDirty.current = true;
              setCurrentOutputStyle(style ?? DEFAULT_OUTPUT_STYLE_NAME);
              setShowSubmenu(null);
              setTabsHidden(false);

              // 保存到本地设置
              updateSettingsForSource('localSettings', {
                outputStyle: style,
              });

              void logEvent('tengu_output_style_changed', {
                style: (style ??
                  DEFAULT_OUTPUT_STYLE_NAME) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                source: 'config_panel' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                settings_source: 'localSettings' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              });
            }}
            onCancel={() => {
              setShowSubmenu(null);
              setTabsHidden(false);
            }}
          />
          <Text dimColor>
            <Byline>
              <KeyboardShortcutHint shortcut="Enter" action="confirm" />
              <ConfigurableShortcutHint action="confirm:no" context="Confirmation" fallback="Esc" description="取消" />
            </Byline>
          </Text>
        </>
      ) : showSubmenu === 'Language' ? (
        <>
          <LanguagePicker
            initialLanguage={currentLanguage}
            onComplete={language => {
              isDirty.current = true;
              setCurrentLanguage(language);
              setShowSubmenu(null);
              setTabsHidden(false);

              // 保存到用户设置
              updateSettingsForSource('userSettings', {
                language,
              });

              void logEvent('tengu_language_changed', {
                language: (language ?? 'default') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                source: 'config_panel' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              });
            }}
            onCancel={() => {
              setShowSubmenu(null);
              setTabsHidden(false);
            }}
          />
          <Text dimColor>
            <Byline>
              <KeyboardShortcutHint shortcut="Enter" action="confirm" />
              <ConfigurableShortcutHint action="confirm:no" context="Settings" fallback="Esc" description="取消" />
            </Byline>
          </Text>
        </>
      ) : showSubmenu === 'EnableAutoUpdates' ? (
        <Dialog
          title="启用自动更新"
          onCancel={() => {
            setShowSubmenu(null);
            setTabsHidden(false);
          }}
          hideBorder
          hideInputGuide
        >
          {autoUpdaterDisabledReason?.type !== 'config' ? (
            <>
              <Text>
                {autoUpdaterDisabledReason?.type === 'env'
                  ? '自动更新由环境变量控制，无法在此处更改。'
                  : '自动更新在开发构建中已禁用。'}
              </Text>
              {autoUpdaterDisabledReason?.type === 'env' && (
                <Text dimColor>取消设置 {autoUpdaterDisabledReason.envVar} 以重新启用自动更新。</Text>
              )}
            </>
          ) : (
            <Select
              options={[
                {
                  label: '启用并选择最新通道',
                  value: 'latest',
                },
                {
                  label: '启用并选择稳定通道',
                  value: 'stable',
                },
              ]}
              onChange={(channel: string) => {
                isDirty.current = true;
                setShowSubmenu(null);
                setTabsHidden(false);

                saveGlobalConfig(current => ({
                  ...current,
                  autoUpdates: true,
                }));
                setGlobalConfig({ ...getGlobalConfig(), autoUpdates: true });

                updateSettingsForSource('userSettings', {
                  autoUpdatesChannel: channel as 'latest' | 'stable',
                  minimumVersion: undefined,
                });
                setSettingsData(prev => ({
                  ...prev,
                  autoUpdatesChannel: channel as 'latest' | 'stable',
                  minimumVersion: undefined,
                }));
                logEvent('tengu_autoupdate_enabled', {
                  channel: channel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                });
              }}
            />
          )}
        </Dialog>
      ) : showSubmenu === 'ChannelDowngrade' ? (
        <ChannelDowngradeDialog
          currentVersion={MACRO.VERSION}
          onChoice={(choice: ChannelDowngradeChoice) => {
            setShowSubmenu(null);
            setTabsHidden(false);

            if (choice === 'cancel') {
              // 用户取消 — 不更改任何内容
              return;
            }

            isDirty.current = true;
            // 切换到稳定通道
            const newSettings: {
              autoUpdatesChannel: 'stable';
              minimumVersion?: string;
            } = {
              autoUpdatesChannel: 'stable',
            };

            if (choice === 'stay') {
              // 用户希望在稳定版赶上之前停留在当前版本
              newSettings.minimumVersion = MACRO.VERSION;
            }

            updateSettingsForSource('userSettings', newSettings);
            setSettingsData(prev => ({
              ...prev,
              ...newSettings,
            }));
            logEvent('tengu_autoupdate_channel_changed', {
              channel: 'stable' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              minimum_version_set: choice === 'stay',
            });
          }}
        />
      ) : (
        <Box flexDirection="column" gap={1} marginY={insideModal ? undefined : 1}>
          <SearchBox
            query={searchQuery}
            isFocused={isSearchMode && !headerFocused}
            isTerminalFocused={isTerminalFocused}
            cursorOffset={searchCursorOffset}
            placeholder="搜索设置…"
          />
          <Box flexDirection="column">
            {filteredSettingsItems.length === 0 ? (
              <Text dimColor italic>
                没有与“{searchQuery}”匹配的设置
              </Text>
            ) : (
              <>
                {scrollOffset > 0 && (
                  <Text dimColor>
                    {figures.arrowUp} 上面还有 {scrollOffset} 项
                  </Text>
                )}
                {filteredSettingsItems.slice(scrollOffset, scrollOffset + maxVisible).map((setting, i) => {
                  const actualIndex = scrollOffset + i;
                  const isSelected = actualIndex === selectedIndex && !headerFocused && !isSearchMode;

                  return (
                    <React.Fragment key={setting.id}>
                      <Box width="100%">
                        <Box width={44}>
                          <Text color={isSelected ? 'suggestion' : undefined}>
                            {isSelected ? figures.pointer : ' '} {setting.label}
                          </Text>
                        </Box>
                        <Box flexGrow={1}>
                          {setting.type === 'boolean' ? (
                            <>
                              <Text color={isSelected ? 'suggestion' : undefined}>{setting.value.toString()}</Text>
                              {showThinkingWarning && setting.id === 'thinkingEnabled' && (
                                <Text color="warning"> 在对话中途更改思考模式会增加延迟并可能降低质量。</Text>
                              )}
                            </>
                          ) : setting.id === 'theme' ? (
                            <Text color={isSelected ? 'suggestion' : undefined}>
                              {THEME_LABELS[setting.value.toString()] ?? setting.value.toString()}
                            </Text>
                          ) : setting.id === 'notifChannel' ? (
                            <Text color={isSelected ? 'suggestion' : undefined}>
                              <NotifChannelLabel value={setting.value.toString()} />
                            </Text>
                          ) : setting.id === 'defaultPermissionMode' ? (
                            <Text color={isSelected ? 'suggestion' : undefined}>
                              {permissionModeShortTitle(setting.value as PermissionMode)}
                            </Text>
                          ) : setting.id === 'autoUpdatesChannel' && autoUpdaterDisabledReason ? (
                            <Box flexDirection="column">
                              <Text color={isSelected ? 'suggestion' : undefined}>已禁用</Text>
                              <Text dimColor>（{formatAutoUpdaterDisabledReason(autoUpdaterDisabledReason)}）</Text>
                            </Box>
                          ) : (
                            <Text color={isSelected ? 'suggestion' : undefined}>{setting.value.toString()}</Text>
                          )}
                        </Box>
                      </Box>
                    </React.Fragment>
                  );
                })}
                {scrollOffset + maxVisible < filteredSettingsItems.length && (
                  <Text dimColor>
                    {figures.arrowDown} 下面还有 {filteredSettingsItems.length - scrollOffset - maxVisible} 项
                  </Text>
                )}
              </>
            )}
          </Box>
          {headerFocused ? (
            <Text dimColor>
              <Byline>
                <KeyboardShortcutHint shortcut="←/→ tab" action="switch" />
                <KeyboardShortcutHint shortcut="↓" action="return" />
                <ConfigurableShortcutHint action="confirm:no" context="Settings" fallback="Esc" description="关闭" />
              </Byline>
            </Text>
          ) : isSearchMode ? (
            <Text dimColor>
              <Byline>
                <Text>键入以筛选</Text>
                <KeyboardShortcutHint shortcut="Enter/↓" action="select" />
                <KeyboardShortcutHint shortcut="↑" action="tabs" />
                <ConfigurableShortcutHint action="confirm:no" context="Settings" fallback="Esc" description="清除" />
              </Byline>
            </Text>
          ) : (
            <Text dimColor>
              <Byline>
                <ConfigurableShortcutHint
                  action="select:accept"
                  context="Settings"
                  fallback="Space"
                  description="更改"
                />
                <ConfigurableShortcutHint
                  action="settings:close"
                  context="Settings"
                  fallback="Enter"
                  description="保存"
                />
                <ConfigurableShortcutHint action="settings:search" context="Settings" fallback="/" description="搜索" />
                <ConfigurableShortcutHint action="confirm:no" context="Settings" fallback="Esc" description="取消" />
              </Byline>
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
}

function teammateModelDisplayString(value: string | null | undefined): string {
  if (value === undefined) {
    return modelDisplayString(getHardcodedTeammateModelFallback());
  }
  if (value === null) return '默认（负责人的模型）';
  return modelDisplayString(value);
}

const THEME_LABELS: Record<string, string> = {
  auto: '自动（匹配终端）',
  dark: '深色模式',
  light: '浅色模式',
  'dark-daltonized': '深色模式（色盲友好）',
  'light-daltonized': '浅色模式（色盲友好）',
  'dark-ansi': '深色模式（仅限 ANSI 颜色）',
  'light-ansi': '浅色模式（仅限 ANSI 颜色）',
};

function NotifChannelLabel({ value }: { value: string }): React.ReactNode {
  switch (value) {
    case 'auto':
      return '自动';
    case 'iterm2':
      return (
        <Text>
          iTerm2 <Text dimColor>（OSC 9）</Text>
        </Text>
      );
    case 'terminal_bell':
      return (
        <Text>
          终端响铃 <Text dimColor>（\a）</Text>
        </Text>
      );
    case 'kitty':
      return (
        <Text>
          Kitty <Text dimColor>（OSC 99）</Text>
        </Text>
      );
    case 'ghostty':
      return (
        <Text>
          Ghostty <Text dimColor>（OSC 777）</Text>
        </Text>
      );
    case 'iterm2_with_bell':
      return 'iTerm2 带响铃';
    case 'notifications_disabled':
      return '已禁用';
    default:
      return value;
  }
}
