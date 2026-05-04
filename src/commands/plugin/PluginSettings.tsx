import figures from 'figures';
import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ConfigurableShortcutHint } from '../../components/ConfigurableShortcutHint.js';
import { Byline, Pane, Tab, Tabs } from '@anthropic/ink';
import { useExitOnCtrlCDWithKeybindings } from '../../hooks/useExitOnCtrlCDWithKeybindings.js';
import { Box, Text } from '@anthropic/ink';
import { useKeybinding, useKeybindings } from '../../keybindings/useKeybinding.js';
import { useAppState, useSetAppState } from '../../state/AppState.js';
import type { PluginError } from '../../types/plugin.js';
import { errorMessage } from '../../utils/errors.js';
import { clearAllCaches } from '../../utils/plugins/cacheUtils.js';
import { loadMarketplacesWithGracefulDegradation } from '../../utils/plugins/marketplaceHelpers.js';
import { loadKnownMarketplacesConfig, removeMarketplaceSource } from '../../utils/plugins/marketplaceManager.js';
import { getPluginEditableScopes } from '../../utils/plugins/pluginStartupCheck.js';
import type { EditableSettingSource } from '../../utils/settings/constants.js';
import { getSettingsForSource, updateSettingsForSource } from '../../utils/settings/settings.js';
import { AddMarketplace } from './AddMarketplace.js';
import { BrowseMarketplace } from './BrowseMarketplace.js';
import { DiscoverPlugins } from './DiscoverPlugins.js';
import { ManageMarketplaces } from './ManageMarketplaces.js';
import { ManagePlugins } from './ManagePlugins.js';
import { formatErrorMessage, getErrorGuidance } from './PluginErrors.js';
import { type ParsedCommand, parsePluginArgs } from './parseArgs.js';
import type { PluginSettingsProps, ViewState } from './types.js';
import { ValidatePlugin } from './ValidatePlugin.js';

type TabId = 'discover' | 'installed' | 'marketplaces' | 'errors';

function MarketplaceList({ onComplete }: { onComplete: (result?: string) => void }): React.ReactNode {
  useEffect(() => {
    async function loadList() {
      try {
        const config = await loadKnownMarketplacesConfig();
        const names = Object.keys(config);

        if (names.length === 0) {
          onComplete('No marketplaces configured');
        } else {
          onComplete(`Configured marketplaces:\n${names.map(n => `  • ${n}`).join('\n')}`);
        }
      } catch (err) {
        onComplete(`Error loading marketplaces: ${errorMessage(err)}`);
      }
    }

    void loadList();
  }, [onComplete]);

  return <Text>Loading marketplaces...</Text>;
}

function McpRedirectBanner(): React.ReactNode {
  if ((process.env.USER_TYPE as string) !== 'ant') {
    return null;
  }

  return (
    <Box
      flexDirection="row"
      alignItems="flex-start"
      paddingLeft={1}
      marginTop={1}
      borderLeft
      borderRight={false}
      borderTop={false}
      borderBottom={false}
      borderColor="permission"
      borderStyle="single"
    >
      <Box flexShrink={0}>
        <Text bold italic color="permission">
          i{' '}
        </Text>
      </Box>
      <Text>[ANT-ONLY] MCP servers are now managed in /plugins. Use /mcp no-redirect to test old UI</Text>
    </Box>
  );
}

type ErrorRowAction =
  | { kind: 'navigate'; tab: TabId; viewState: ViewState }
  | {
      kind: 'remove-extra-marketplace';
      name: string;
      sources: Array<{ source: EditableSettingSource; scope: string }>;
    }
  | { kind: 'remove-installed-marketplace'; name: string }
  | { kind: 'managed-only'; name: string }
  | { kind: 'none' };

type ErrorRow = {
  label: string;
  message: string;
  guidance?: string | null;
  action: ErrorRowAction;
  scope?: string;
};

/** 确定哪些设置源定义了 extraKnownMarketplace 条目。
返回可编辑的源（用户/项目/本地）以及策略是否也包含它。 */
function getExtraMarketplaceSourceInfo(name: string): {
  editableSources: Array<{ source: EditableSettingSource; scope: string }>;
  isInPolicy: boolean;
} {
  const editableSources: Array<{
    source: EditableSettingSource;
    scope: string;
  }> = [];

  const sourcesToCheck = [
    { source: 'userSettings' as const, scope: 'user' },
    { source: 'projectSettings' as const, scope: 'project' },
    { source: 'localSettings' as const, scope: 'local' },
  ];

  for (const { source, scope } of sourcesToCheck) {
    const settings = getSettingsForSource(source);
    if (settings?.extraKnownMarketplaces?.[name]) {
      editableSources.push({ source, scope });
    }
  }

  const policySettings = getSettingsForSource('policySettings');
  const isInPolicy = Boolean(policySettings?.extraKnownMarketplaces?.[name]);

  return { editableSources, isInPolicy };
}

function buildMarketplaceAction(name: string): ErrorRowAction {
  const { editableSources, isInPolicy } = getExtraMarketplaceSourceInfo(name);

  if (editableSources.length > 0) {
    return {
      kind: 'remove-extra-marketplace',
      name,
      sources: editableSources,
    };
  }

  if (isInPolicy) {
    return { kind: 'managed-only', name };
  }

  // 市场位于 known_marketplaces.json 中但不在 extraKnownMarket
  // places 中（例如，之前手动安装）—— 路由到 ManageMarketplaces
  return {
    kind: 'navigate',
    tab: 'marketplaces',
    viewState: {
      type: 'manage-marketplaces',
      targetMarketplace: name,
      action: 'remove',
    },
  };
}

function buildPluginAction(pluginName: string): ErrorRowAction {
  return {
    kind: 'navigate',
    tab: 'installed',
    viewState: {
      type: 'manage-plugins',
      targetPlugin: pluginName,
      action: 'uninstall',
    },
  };
}

const TRANSIENT_ERROR_TYPES = new Set(['git-auth-failed', 'git-timeout', 'network-error']);

function isTransientError(error: PluginError): boolean {
  return TRANSIENT_ERROR_TYPES.has(error.type);
}

/** 从 PluginError 中提取插件名称，首先检查显式字段，
然后回退到 source 字段（格式："pluginName@marketplace"）。 */
function getPluginNameFromError(error: PluginError): string | undefined {
  if ('pluginId' in error && error.pluginId) return error.pluginId;
  if ('plugin' in error && error.plugin) return error.plugin;
  // Fallback: source often contains "pluginName@marketplace"
  if (error.source.includes('@')) return error.source.split('@')[0];
  return undefined;
}

function buildErrorRows(
  failedMarketplaces: Array<{ name: string; error?: string }>,
  extraMarketplaceErrors: PluginError[],
  pluginLoadingErrors: PluginError[],
  otherErrors: PluginError[],
  brokenInstalledMarketplaces: Array<{ name: string; error: string }>,
  transientErrors: PluginError[],
  pluginScopes: Map<string, string>,
): ErrorRow[] {
  const rows: ErrorRow[] = [];

  // --- 顶部为暂时性错误（重启以重试） ---
  for (const error of transientErrors) {
    const pluginName = 'pluginId' in error ? error.pluginId : 'plugin' in error ? error.plugin : undefined;
    rows.push({
      label: pluginName ?? error.source,
      message: formatErrorMessage(error),
      guidance: '重启以重试加载插件',
      action: { kind: 'none' },
    });
  }

  // --- Marketplace errors ---
  // Track shown marketplace names to avoid duplicates across sources
  const shownMarketplaceNames = new Set<string>();

  for (const m of failedMarketplaces) {
    shownMarketplaceNames.add(m.name);
    const action = buildMarketplaceAction(m.name);
    const sourceInfo = getExtraMarketplaceSourceInfo(m.name);
    const scope = sourceInfo.isInPolicy ? 'managed' : sourceInfo.editableSources[0]?.scope;
    rows.push({
      label: m.name,
      message: m.error ?? 'Installation failed',
      guidance: action.kind === 'managed-only' ? 'Managed by your organization — contact your admin' : undefined,
      action,
      scope,
    });
  }

  for (const e of extraMarketplaceErrors) {
    const marketplace = 'marketplace' in e ? e.marketplace : e.source;
    if (shownMarketplaceNames.has(marketplace)) continue;
    shownMarketplaceNames.add(marketplace);
    const action = buildMarketplaceAction(marketplace);
    const sourceInfo = getExtraMarketplaceSourceInfo(marketplace);
    const scope = sourceInfo.isInPolicy ? 'managed' : sourceInfo.editableSources[0]?.scope;
    rows.push({
      label: marketplace,
      message: formatErrorMessage(e),
      guidance:
        action.kind === 'managed-only' ? 'Managed by your organization — contact your admin' : getErrorGuidance(e),
      action,
      scope,
    });
  }

  // 已安装但未能加载数据的市场（来自 known_marketplaces.json）
  for (const m of brokenInstalledMarketplaces) {
    if (shownMarketplaceNames.has(m.name)) continue;
    shownMarketplaceNames.add(m.name);
    rows.push({
      label: m.name,
      message: m.error,
      action: { kind: 'remove-installed-marketplace', name: m.name },
    });
  }

  // --- Plugin errors ---
  const shownPluginNames = new Set<string>();
  for (const error of pluginLoadingErrors) {
    const pluginName = getPluginNameFromError(error);
    if (pluginName && shownPluginNames.has(pluginName)) continue;
    if (pluginName) shownPluginNames.add(pluginName);

    const marketplace = 'marketplace' in error ? error.marketplace : undefined;
    // Try pluginId@marketplace format first, then just pluginName
    const scope = pluginName ? (pluginScopes.get(error.source) ?? pluginScopes.get(pluginName)) : undefined;
    rows.push({
      label: pluginName ? (marketplace ? `${pluginName} @ ${marketplace}` : pluginName) : error.source,
      message: formatErrorMessage(error),
      guidance: getErrorGuidance(error),
      action: pluginName ? buildPluginAction(pluginName) : { kind: 'none' },
      scope,
    });
  }

  // --- 其他错误（非市场、非插件特定） ---
  for (const error of otherErrors) {
    rows.push({
      label: error.source,
      message: formatErrorMessage(error),
      guidance: getErrorGuidance(error),
      action: { kind: 'none' },
    });
  }

  return rows;
}

/**
 * Remove a marketplace from extraKnownMarketplaces in the given settings sources,
 * and also remove any associated enabled plugins.
 */
function removeExtraMarketplace(name: string, sources: Array<{ source: EditableSettingSource }>): void {
  for (const { source } of sources) {
    const settings = getSettingsForSource(source);
    if (!settings) continue;

    const updates: Record<string, unknown> = {};

    // 从 extraKnownMarketplaces 中移除
    if (settings.extraKnownMarketplaces?.[name]) {
      updates.extraKnownMarketplaces = {
        ...settings.extraKnownMarketplaces,
        [name]: undefined,
      };
    }

    // 移除关联的已启用插件（格式："plugin@marketplace"）
    if (settings.enabledPlugins) {
      const suffix = `@${name}`;
      let removedPlugins = false;
      const updatedPlugins = { ...settings.enabledPlugins };
      for (const pluginId in updatedPlugins) {
        if (pluginId.endsWith(suffix)) {
          updatedPlugins[pluginId] = undefined;
          removedPlugins = true;
        }
      }
      if (removedPlugins) {
        updates.enabledPlugins = updatedPlugins;
      }
    }

    if (Object.keys(updates).length > 0) {
      updateSettingsForSource(source, updates);
    }
  }
}

function ErrorsTabContent({
  setViewState,
  setActiveTab,
  markPluginsChanged,
}: {
  setViewState: (state: ViewState) => void;
  setActiveTab: (tab: TabId) => void;
  markPluginsChanged: () => void;
}): React.ReactNode {
  const errors = useAppState(s => s.plugins.errors);
  const installationStatus = useAppState(s => s.plugins.installationStatus);
  const setAppState = useSetAppState();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [marketplaceLoadFailures, setMarketplaceLoadFailures] = useState<Array<{ name: string; error: string }>>([]);

  // 检测已安装但未能加载其数据的市场
  useEffect(() => {
    void (async () => {
      try {
        const config = await loadKnownMarketplacesConfig();
        const { failures } = await loadMarketplacesWithGracefulDegradation(config);
        setMarketplaceLoadFailures(failures);
      } catch {
        // 忽略 — 如果我们无法加载配置，其他标签页会处理
      }
    })();
  }, []);

  const failedMarketplaces = installationStatus.marketplaces.filter(m => m.status === 'failed');
  const failedMarketplaceNames = new Set(failedMarketplaces.map(m => m.name));

  // Transient errors (git/network) — show at top with "restart to retry"
  const transientErrors = errors.filter(isTransientError);

  // 未被安装失败覆盖的、与市场相关的加载错误
  const extraMarketplaceErrors = errors.filter(
    e =>
      (e.type === 'marketplace-not-found' ||
        e.type === 'marketplace-load-failed' ||
        e.type === 'marketplace-blocked-by-policy') &&
      !failedMarketplaceNames.has(e.marketplace),
  );

  // 插件特定的加载错误
  const pluginLoadingErrors = errors.filter(e => {
    if (isTransientError(e)) return false;
    if (
      e.type === 'marketplace-not-found' ||
      e.type === 'marketplace-load-failed' ||
      e.type === 'marketplace-blocked-by-policy'
    ) {
      return false;
    }
    return getPluginNameFromError(e) !== undefined;
  });

  // 其余无插件关联的错误
  const otherErrors = errors.filter(e => {
    if (isTransientError(e)) return false;
    if (
      e.type === 'marketplace-not-found' ||
      e.type === 'marketplace-load-failed' ||
      e.type === 'marketplace-blocked-by-policy'
    ) {
      return false;
    }
    return getPluginNameFromError(e) === undefined;
  });

  const pluginScopes = getPluginEditableScopes();
  const rows = buildErrorRows(
    failedMarketplaces,
    extraMarketplaceErrors,
    pluginLoadingErrors,
    otherErrors,
    marketplaceLoadFailures,
    transientErrors,
    pluginScopes,
  );

  // 处理 Escape 键以退出插件菜单
  useKeybinding(
    'confirm:no',
    () => {
      setViewState({ type: 'menu' });
    },
    { context: 'Confirmation' },
  );

  const handleSelect = () => {
    const row = rows[selectedIndex];
    if (!row) return;
    const { action } = row;
    switch (action.kind) {
      case 'navigate':
        setActiveTab(action.tab);
        setViewState(action.viewState);
        break;
      case 'remove-extra-marketplace': {
        const scopes = action.sources.map(s => s.scope).join(', ');
        removeExtraMarketplace(action.name, action.sources);
        clearAllCaches();
        // Synchronously clear all stale state for this marketplace so the UI
        // updates glitch-free. markPluginsChanged only sets needsRefresh —
        // it does not refresh plugins.errors, so this is the authoritative
        // cleanup until the user runs /reload-plugins.
        setAppState(prev => ({
          ...prev,
          plugins: {
            ...prev.plugins,
            errors: prev.plugins.errors.filter(e => !('marketplace' in e && e.marketplace === action.name)),
            installationStatus: {
              ...prev.plugins.installationStatus,
              marketplaces: prev.plugins.installationStatus.marketplaces.filter(m => m.name !== action.name),
            },
          },
        }));
        setActionMessage(`${figures.tick} Removed "${action.name}" from ${scopes} settings`);
        markPluginsChanged();
        break;
      }
      case 'remove-installed-marketplace': {
        void (async () => {
          try {
            await removeMarketplaceSource(action.name);
            clearAllCaches();
            setMarketplaceLoadFailures(prev => prev.filter(f => f.name !== action.name));
            setActionMessage(`${figures.tick} Removed marketplace "${action.name}"`);
            markPluginsChanged();
          } catch (err) {
            setActionMessage(`Failed to remove "${action.name}": ${err instanceof Error ? err.message : String(err)}`);
          }
        })();
        break;
      }
      case 'managed-only':
        // No action available — guidance text already shown
        break;
      case 'none':
        break;
    }
  };

  useKeybindings(
    {
      'select:previous': () => setSelectedIndex(prev => Math.max(0, prev - 1)),
      'select:next': () => setSelectedIndex(prev => Math.min(rows.length - 1, prev + 1)),
      'select:accept': handleSelect,
    },
    { context: 'Select', isActive: rows.length > 0 },
  );

  // Clamp selectedIndex when rows shrink (e.g. after removal)
  const clampedIndex = Math.min(selectedIndex, Math.max(0, rows.length - 1));
  if (clampedIndex !== selectedIndex) {
    setSelectedIndex(clampedIndex);
  }

  const selectedAction = rows[clampedIndex]?.action;
  const hasAction = selectedAction && selectedAction.kind !== 'none' && selectedAction.kind !== 'managed-only';

  if (rows.length === 0) {
    return (
      <Box flexDirection="column">
        <Box marginLeft={1}>
          <Text dimColor>无插件错误</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor italic>
            <ConfigurableShortcutHint action="confirm:no" context="Confirmation" fallback="Esc" description="back" />
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {rows.map((row, idx) => {
        const isSelected = idx === clampedIndex;
        return (
          <Box key={idx} marginLeft={1} flexDirection="column" marginBottom={1}>
            <Text>
              <Text color={isSelected ? 'suggestion' : 'error'}>{isSelected ? figures.pointer : figures.cross} </Text>
              <Text bold={isSelected}>{row.label}</Text>
              {row.scope && <Text dimColor> ({row.scope})</Text>}
            </Text>
            <Box marginLeft={3}>
              <Text color="error">{row.message}</Text>
            </Box>
            {row.guidance && (
              <Box marginLeft={3}>
                <Text dimColor italic>
                  {row.guidance}
                </Text>
              </Box>
            )}
          </Box>
        );
      })}

      {actionMessage && (
        <Box marginTop={1} marginLeft={1}>
          <Text color="claude">{actionMessage}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor italic>
          <Byline>
            <ConfigurableShortcutHint action="select:previous" context="Select" fallback="↑" description="navigate" />
            {hasAction && (
              <ConfigurableShortcutHint
                action="select:accept"
                context="Select"
                fallback="Enter"
                description="resolve"
              />
            )}
            <ConfigurableShortcutHint action="confirm:no" context="Confirmation" fallback="Esc" description="back" />
          </Byline>
        </Text>
      </Box>
    </Box>
  );
}

function getInitialViewState(parsedCommand: ParsedCommand): ViewState {
  switch (parsedCommand.type) {
    case 'help':
      return { type: 'help' };
    case 'validate':
      return { type: 'validate', path: parsedCommand.path };
    case 'install':
      if (parsedCommand.marketplace) {
        return {
          type: 'browse-marketplace',
          targetMarketplace: parsedCommand.marketplace,
          targetPlugin: parsedCommand.plugin,
        };
      }
      if (parsedCommand.plugin) {
        return {
          type: 'discover-plugins',
          targetPlugin: parsedCommand.plugin,
        };
      }
      return { type: 'discover-plugins' };
    case 'manage':
      return { type: 'manage-plugins' };
    case 'uninstall':
      return {
        type: 'manage-plugins',
        targetPlugin: parsedCommand.plugin,
        action: 'uninstall',
      };
    case 'enable':
      return {
        type: 'manage-plugins',
        targetPlugin: parsedCommand.plugin,
        action: 'enable',
      };
    case 'disable':
      return {
        type: 'manage-plugins',
        targetPlugin: parsedCommand.plugin,
        action: 'disable',
      };
    case 'marketplace':
      if (parsedCommand.action === 'list') {
        return { type: 'marketplace-list' };
      }
      if (parsedCommand.action === 'add') {
        return {
          type: 'add-marketplace',
          initialValue: parsedCommand.target,
        };
      }
      if (parsedCommand.action === 'remove') {
        return {
          type: 'manage-marketplaces',
          targetMarketplace: parsedCommand.target,
          action: 'remove',
        };
      }
      if (parsedCommand.action === 'update') {
        return {
          type: 'manage-marketplaces',
          targetMarketplace: parsedCommand.target,
          action: 'update',
        };
      }
      return { type: 'marketplace-menu' };
    case 'menu':
    default:
      // Default to discover view showing all plugins
      return { type: 'discover-plugins' };
  }
}

function getInitialTab(viewState: ViewState): TabId {
  if (viewState.type === 'manage-plugins') return 'installed';
  if (viewState.type === 'manage-marketplaces') return 'marketplaces';
  return 'discover';
}

export function PluginSettings({ onComplete, args, showMcpRedirectMessage }: PluginSettingsProps): React.ReactNode {
  const parsedCommand = parsePluginArgs(args);
  const initialViewState = getInitialViewState(parsedCommand);
  const [viewState, setViewState] = useState<ViewState>(initialViewState);
  const [activeTab, setActiveTab] = useState<TabId>(getInitialTab(initialViewState));
  const [inputValue, setInputValue] = useState(
    viewState.type === 'add-marketplace' ? viewState.initialValue || '' : '',
  );
  const [cursorOffset, setCursorOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [childSearchActive, setChildSearchActive] = useState(false);
  const setAppState = useSetAppState();

  // 错误选项卡徽章的错误计数 — 统计加载器错误 + 后
  // 台市场安装失败。不统计磁盘上市场的加载失败（这些需
  // 要 I/O 操作，并在选项卡打开时惰性发现）。当一个市
  // 场同时存在加载器错误和安装失败状态时，可能比显示的行
  // 数略有高估（buildErrorRows 会去重）。
  const pluginErrorCount = useAppState(s => {
    let count = s.plugins.errors.length;
    for (const m of s.plugins.installationStatus.marketplaces) {
      if (m.status === 'failed') count++;
    }
    return count;
  });
  const errorsTabTitle = pluginErrorCount > 0 ? `Errors (${pluginErrorCount})` : 'Errors';

  const exitState = useExitOnCtrlCDWithKeybindings();

  /**
   * CLI mode is active when the user provides a complete command with all required arguments.
   * In this mode, the operation executes immediately without interactive prompts.
   * Interactive mode is used when arguments are missing, allowing the user to input them.
   */
  const cliMode =
    parsedCommand.type === 'marketplace' && parsedCommand.action === 'add' && parsedCommand.target !== undefined;

  // 发出信号，表明插件状态已在磁盘上（第 2 层）发生变化，且活动组件（
  // 第 3 层）已过时。用户运行 /reload-plugins 来应用。
  // 以前这是 updatePluginState()，它执行部分刷新（仅命
  // 令 — 代理/钩子/MCP 被静默跳过）。现在所有第 3 层刷新都通
  // 过 /reload-plugins 经由统一的 refreshAc
  // tivePlugins() 原语进行，提供一个一致的心智模型：插件变
  // 更需要 /reload-plugins。
  const markPluginsChanged = useCallback(() => {
    setAppState(prev =>
      prev.plugins.needsRefresh ? prev : { ...prev, plugins: { ...prev.plugins, needsRefresh: true } },
    );
  }, [setAppState]);

  // 处理选项卡切换（由 Tabs 组件调用）
  const handleTabChange = useCallback((tabId: string) => {
    const tab = tabId as TabId;
    setActiveTab(tab);
    setError(null);
    switch (tab) {
      case 'discover':
        setViewState({ type: 'discover-plugins' });
        break;
      case 'installed':
        setViewState({ type: 'manage-plugins' });
        break;
      case 'marketplaces':
        setViewState({ type: 'manage-marketplaces' });
        break;
      case 'errors':
        // No viewState change needed — ErrorsTabContent renders inside <Tab id="errors">
        break;
    }
  }, []);

  // 处理子组件将 viewState 设置为 'menu'
  // 时的退出。子组件通常同时设置 setResult(msg) 和 s
  // etParentViewState ({type:'menu'})
  // — 两个效果在同一渲染中触发。仅当没有结果时通过此路径关闭，否则结
  // 果效果（下方）会处理关闭并将消息传递到记录中。
  useEffect(() => {
    if (viewState.type === 'menu' && !result) {
      onComplete();
    }
  }, [viewState.type, result, onComplete]);

  // 当 viewState 更改为其他选项卡的内容时，同步 activeTab。这处理了
  // 诸如 AddMarketplace 导航到 browse-marketplace 的情况。
  useEffect(() => {
    if (viewState.type === 'browse-marketplace' && activeTab !== 'discover') {
      setActiveTab('discover');
    }
  }, [viewState.type, activeTab]);

  // 仅处理 add-marketplace 模
  // 式的退出键。其他选项卡视图在其各自组件中处理退出键。
  const handleAddMarketplaceEscape = useCallback(() => {
    setActiveTab('marketplaces');
    setViewState({ type: 'manage-marketplaces' });
    setInputValue('');
    setError(null);
  }, []);

  useKeybinding('confirm:no', handleAddMarketplaceEscape, {
    context: 'Settings',
    isActive: viewState.type === 'add-marketplace',
  });

  useEffect(() => {
    if (result) {
      onComplete(result);
    }
  }, [result, onComplete]);

  // 处理帮助视图完成
  useEffect(() => {
    if (viewState.type === 'help') {
      onComplete();
    }
  }, [viewState.type, onComplete]);

  // 根据状态渲染不同视图
  if (viewState.type === 'help') {
    return (
      <Box flexDirection="column">
        <Text bold>插件命令用法：</Text>
        <Text> </Text>
        <Text dimColor>Installation:</Text>
        <Text> /plugin install - Browse and install plugins</Text>
        <Text> /plugin install &lt;marketplace&gt; - Install from specific marketplace</Text>
        <Text> /plugin install &lt;plugin&gt; - Install specific plugin</Text>
        <Text> /plugin install &lt;plugin&gt;@&lt;market&gt; - Install plugin from marketplace</Text>
        <Text> </Text>
        <Text dimColor>Management:</Text>
        <Text> /plugin manage - 管理已安装插件</Text>
        <Text> /plugin enable &lt;plugin&gt; - 启用插件</Text>
        <Text> /plugin disable &lt;plugin&gt; - 禁用插件</Text>
        <Text> /plugin uninstall &lt;plugin&gt; - 卸载插件</Text>
        <Text> </Text>
        <Text dimColor>Marketplaces:</Text>
        <Text> /plugin marketplace - Marketplace management menu</Text>
        <Text> /plugin marketplace add - Add a marketplace</Text>
        <Text> /plugin marketplace add &lt;path/url&gt; - Add marketplace directly</Text>
        <Text> /plugin marketplace update - Update marketplaces</Text>
        <Text> /plugin marketplace update &lt;name&gt; - Update specific marketplace</Text>
        <Text> /plugin marketplace remove - Remove a marketplace</Text>
        <Text> /plugin marketplace remove &lt;name&gt; - Remove specific marketplace</Text>
        <Text> /plugin marketplace list - List all marketplaces</Text>
        <Text> </Text>
        <Text dimColor>Validation:</Text>
        <Text> /plugin validate &lt;path&gt; - Validate a manifest file or directory</Text>
        <Text> </Text>
        <Text dimColor>Other:</Text>
        <Text> /plugin - 主插件菜单</Text>
        <Text> /plugin help - 显示此帮助信息</Text>
        <Text> /plugins - /plugin 的别名</Text>
      </Box>
    );
  }

  if (viewState.type === 'validate') {
    return <ValidatePlugin onComplete={onComplete} path={viewState.path} />;
  }

  if (viewState.type === 'marketplace-menu') {
    // Show a simple menu for marketplace operations
    setViewState({ type: 'menu' });
    return null;
  }

  if (viewState.type === 'marketplace-list') {
    return <MarketplaceList onComplete={onComplete} />;
  }

  if (viewState.type === 'add-marketplace') {
    return (
      <AddMarketplace
        inputValue={inputValue}
        setInputValue={setInputValue}
        cursorOffset={cursorOffset}
        setCursorOffset={setCursorOffset}
        error={error}
        setError={setError}
        result={result}
        setResult={setResult}
        setViewState={setViewState}
        onAddComplete={markPluginsChanged}
        cliMode={cliMode}
      />
    );
  }
  // 使用设计系统的 Tabs 组件渲染选项卡式界面
  return (
    <Pane color="suggestion">
      <Tabs
        title="Plugins"
        selectedTab={activeTab}
        onTabChange={handleTabChange}
        color="suggestion"
        disableNavigation={childSearchActive}
        banner={showMcpRedirectMessage && activeTab === 'installed' ? <McpRedirectBanner /> : undefined}
      >
        <Tab id="discover" title="Discover">
          {viewState.type === 'browse-marketplace' ? (
            <BrowseMarketplace
              error={error}
              setError={setError}
              result={result}
              setResult={setResult}
              setViewState={setViewState}
              onInstallComplete={markPluginsChanged}
              targetMarketplace={viewState.targetMarketplace}
              targetPlugin={viewState.targetPlugin}
            />
          ) : (
            <DiscoverPlugins
              error={error}
              setError={setError}
              result={result}
              setResult={setResult}
              setViewState={setViewState}
              onInstallComplete={markPluginsChanged}
              onSearchModeChange={setChildSearchActive}
              targetPlugin={viewState.type === 'discover-plugins' ? viewState.targetPlugin : undefined}
            />
          )}
        </Tab>
        <Tab id="installed" title="Installed">
          <ManagePlugins
            setViewState={setViewState}
            setResult={setResult}
            onManageComplete={markPluginsChanged}
            onSearchModeChange={setChildSearchActive}
            targetPlugin={viewState.type === 'manage-plugins' ? viewState.targetPlugin : undefined}
            targetMarketplace={viewState.type === 'manage-plugins' ? viewState.targetMarketplace : undefined}
            action={viewState.type === 'manage-plugins' ? viewState.action : undefined}
          />
        </Tab>
        <Tab id="marketplaces" title="Marketplaces">
          <ManageMarketplaces
            setViewState={setViewState}
            error={error}
            setError={setError}
            setResult={setResult}
            exitState={exitState}
            onManageComplete={markPluginsChanged}
            targetMarketplace={viewState.type === 'manage-marketplaces' ? viewState.targetMarketplace : undefined}
            action={viewState.type === 'manage-marketplaces' ? viewState.action : undefined}
          />
        </Tab>
        <Tab id="errors" title={errorsTabTitle}>
          <ErrorsTabContent
            setViewState={setViewState}
            setActiveTab={setActiveTab}
            markPluginsChanged={markPluginsChanged}
          />
        </Tab>
      </Tabs>
    </Pane>
  );
}
