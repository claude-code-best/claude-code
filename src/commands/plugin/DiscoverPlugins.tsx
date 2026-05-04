import figures from 'figures';
import * as React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConfigurableShortcutHint } from '../../components/ConfigurableShortcutHint.js';
import { SearchBox } from '../../components/SearchBox.js';
import { Byline } from '@anthropic/ink';
import { useSearchInput } from '../../hooks/useSearchInput.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
// eslint-disable-next-line custom-rules/prefer-use-keybindings -- useInput needed for raw search mode text input
import { Box, Text, useInput, useTerminalFocus } from '@anthropic/ink';
import { useKeybinding, useKeybindings } from '../../keybindings/useKeybinding.js';
import type { LoadedPlugin } from '../../types/plugin.js';
import { count } from '../../utils/array.js';
import { openBrowser } from '../../utils/browser.js';
import { logForDebugging } from '../../utils/debug.js';
import { errorMessage } from '../../utils/errors.js';
import { clearAllCaches } from '../../utils/plugins/cacheUtils.js';
import { formatInstallCount, getInstallCounts } from '../../utils/plugins/installCounts.js';
import { isPluginGloballyInstalled } from '../../utils/plugins/installedPluginsManager.js';
import {
  createPluginId,
  detectEmptyMarketplaceReason,
  type EmptyMarketplaceReason,
  formatFailureDetails,
  formatMarketplaceLoadingErrors,
  loadMarketplacesWithGracefulDegradation,
} from '../../utils/plugins/marketplaceHelpers.js';
import { loadKnownMarketplacesConfig } from '../../utils/plugins/marketplaceManager.js';
import { OFFICIAL_MARKETPLACE_NAME } from '../../utils/plugins/officialMarketplace.js';
import { installPluginFromMarketplace } from '../../utils/plugins/pluginInstallationHelpers.js';
import { isPluginBlockedByPolicy } from '../../utils/plugins/pluginPolicy.js';
import { plural } from '../../utils/stringUtils.js';
import { truncateToWidth } from '../../utils/truncate.js';
import { findPluginOptionsTarget, PluginOptionsFlow } from './PluginOptionsFlow.js';
import { PluginTrustWarning } from './PluginTrustWarning.js';
import { buildPluginDetailsMenuOptions, extractGitHubRepo, type InstallablePlugin } from './pluginDetailsHelpers.js';
import type { ViewState as ParentViewState } from './types.js';
import { usePagination } from './usePagination.js';

type Props = {
  error: string | null;
  setError: (error: string | null) => void;
  result: string | null;
  setResult: (result: string | null) => void;
  setViewState: (state: ParentViewState) => void;
  onInstallComplete?: () => void | Promise<void>;
  onSearchModeChange?: (isActive: boolean) => void;
  targetPlugin?: string;
};

type ViewState = 'plugin-list' | 'plugin-details' | { type: 'plugin-options'; plugin: LoadedPlugin; pluginId: string };

export function DiscoverPlugins({
  error,
  setError,
  result: _result,
  setResult,
  setViewState: setParentViewState,
  onInstallComplete,
  onSearchModeChange,
  targetPlugin,
}: Props): React.ReactNode {
  // View state
  const [viewState, setViewState] = useState<ViewState>('plugin-list');
  const [selectedPlugin, setSelectedPlugin] = useState<InstallablePlugin | null>(null);

  // Data state
  const [availablePlugins, setAvailablePlugins] = useState<InstallablePlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [installCounts, setInstallCounts] = useState<Map<string, number> | null>(null);

  // Search state
  const [isSearchMode, setIsSearchModeRaw] = useState(false);
  const setIsSearchMode = useCallback(
    (active: boolean) => {
      setIsSearchModeRaw(active);
      onSearchModeChange?.(active);
    },
    [onSearchModeChange],
  );
  const {
    query: searchQuery,
    setQuery: setSearchQuery,
    cursorOffset: searchCursorOffset,
  } = useSearchInput({
    isActive: viewState === 'plugin-list' && isSearchMode && !loading,
    onExit: () => {
      setIsSearchMode(false);
    },
  });
  const isTerminalFocused = useTerminalFocus();
  const { columns: terminalWidth } = useTerminalSize();

  // 根据搜索查询筛选插件
  const filteredPlugins = useMemo(() => {
    if (!searchQuery) return availablePlugins;
    const lowerQuery = searchQuery.toLowerCase();
    return availablePlugins.filter(
      plugin =>
        plugin.entry.name.toLowerCase().includes(lowerQuery) ||
        plugin.entry.description?.toLowerCase().includes(lowerQuery) ||
        plugin.marketplaceName.toLowerCase().includes(lowerQuery),
    );
  }, [availablePlugins, searchQuery]);

  // Selection state
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedForInstall, setSelectedForInstall] = useState<Set<string>>(new Set());
  const [installingPlugins, setInstallingPlugins] = useState<Set<string>>(new Set());

  // 插件列表的分页（连续滚动）
  const pagination = usePagination<InstallablePlugin>({
    totalItems: filteredPlugins.length,
    selectedIndex,
  });

  // 搜索查询变化时重置选择
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  // Details view state
  const [detailsMenuIndex, setDetailsMenuIndex] = useState(0);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  // Warning state for non-critical errors
  const [warning, setWarning] = useState<string | null>(null);

  // Empty state reason
  const [emptyReason, setEmptyReason] = useState<EmptyMarketplaceReason | null>(null);

  // 从所有市场加载所有插件
  useEffect(() => {
    async function loadAllPlugins() {
      try {
        const config = await loadKnownMarketplacesConfig();

        // Load marketplaces with graceful degradation
        const { marketplaces, failures } = await loadMarketplacesWithGracefulDegradation(config);

        // Collect all plugins from all marketplaces
        const allPlugins: InstallablePlugin[] = [];

        for (const { name, data: marketplace } of marketplaces) {
          if (marketplace) {
            for (const entry of marketplace.plugins) {
              const pluginId = createPluginId(entry.name, name);
              allPlugins.push({
                entry,
                marketplaceName: name,
                pluginId,
                // 仅当全局安装（用户/托管作用域）时阻止。项目
                // /本地作用域的安装不阻止 —— 用户可能希望提
                // 升到用户作用域，以便随处可用（gh-29997）。
                isInstalled: isPluginGloballyInstalled(pluginId),
              });
            }
          }
        }

        // Filter out installed and policy-blocked plugins
        const uninstalledPlugins = allPlugins.filter(p => !p.isInstalled && !isPluginBlockedByPolicy(p.pluginId));

        // 获取安装数量并按受欢迎程度排序
        try {
          const counts = await getInstallCounts();
          setInstallCounts(counts);

          if (counts) {
            // 按安装数量（降序）排序，然后按字母顺序
            uninstalledPlugins.sort((a, b) => {
              const countA = counts.get(a.pluginId) ?? 0;
              const countB = counts.get(b.pluginId) ?? 0;
              if (countA !== countB) return countB - countA;
              return a.entry.name.localeCompare(b.entry.name);
            });
          } else {
            // No counts available - sort alphabetically
            uninstalledPlugins.sort((a, b) => a.entry.name.localeCompare(b.entry.name));
          }
        } catch (error) {
          // Log the error, then gracefully degrade to alphabetical sort
          logForDebugging(`Failed to fetch install counts: ${errorMessage(error)}`);
          uninstalledPlugins.sort((a, b) => a.entry.name.localeCompare(b.entry.name));
        }

        setAvailablePlugins(uninstalledPlugins);

        // Detect empty reason if no plugins available
        const configuredCount = Object.keys(config).length;
        if (uninstalledPlugins.length === 0) {
          const reason = await detectEmptyMarketplaceReason({
            configuredMarketplaceCount: configuredCount,
            failedMarketplaceCount: failures.length,
          });
          setEmptyReason(reason);
        }

        // Handle marketplace loading errors/warnings
        const successCount = count(marketplaces, m => m.data !== null);
        const errorResult = formatMarketplaceLoadingErrors(failures, successCount);
        if (errorResult) {
          if (errorResult.type === 'warning') {
            setWarning(errorResult.message + '. Showing available plugins.');
          } else {
            throw new Error(errorResult.message);
          }
        }

        // 处理 targetPlugin - 直接导航
        // 到插件详情 在所有插件中搜索（筛选前）以优雅处理已安装插件
        if (targetPlugin) {
          const foundPlugin = allPlugins.find(p => p.entry.name === targetPlugin);

          if (foundPlugin) {
            if (foundPlugin.isInstalled) {
              setError(
                `Plugin '${foundPlugin.pluginId}' is already installed. Use '/plugin' to manage existing plugins.`,
              );
            } else {
              setSelectedPlugin(foundPlugin);
              setViewState('plugin-details');
            }
          } else {
            setError(`Plugin "${targetPlugin}" not found in any marketplace`);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load plugins');
      } finally {
        setLoading(false);
      }
    }
    void loadAllPlugins();
  }, [setError, targetPlugin]);

  // 安装选中的插件
  const installSelectedPlugins = async () => {
    if (selectedForInstall.size === 0) return;

    const pluginsToInstall = availablePlugins.filter(p => selectedForInstall.has(p.pluginId));

    setInstallingPlugins(new Set(pluginsToInstall.map(p => p.pluginId)));

    let successCount = 0;
    let failureCount = 0;
    const newFailedPlugins: Array<{ name: string; reason: string }> = [];

    for (const plugin of pluginsToInstall) {
      const result = await installPluginFromMarketplace({
        pluginId: plugin.pluginId,
        entry: plugin.entry,
        marketplaceName: plugin.marketplaceName,
        scope: 'user',
      });

      if (result.success) {
        successCount++;
      } else {
        failureCount++;
        newFailedPlugins.push({
          name: plugin.entry.name,
          reason: (result as { success: false; error: string }).error,
        });
      }
    }

    setInstallingPlugins(new Set());
    setSelectedForInstall(new Set());
    clearAllCaches();

    // 处理安装结果
    if (failureCount === 0) {
      const message =
        `✓ Installed ${successCount} ${plural(successCount, 'plugin')}. ` + `Run /reload-plugins to activate.`;
      setResult(message);
    } else if (successCount === 0) {
      setError(`Failed to install: ${formatFailureDetails(newFailedPlugins, true)}`);
    } else {
      const message =
        `✓ Installed ${successCount} of ${successCount + failureCount} plugins. ` +
        `Failed: ${formatFailureDetails(newFailedPlugins, false)}. ` +
        `Run /reload-plugins to activate successfully installed plugins.`;
      setResult(message);
    }

    if (successCount > 0) {
      if (onInstallComplete) {
        await onInstallComplete();
      }
    }

    setParentViewState({ type: 'menu' });
  };

  // Install single plugin from details view
  const handleSinglePluginInstall = async (plugin: InstallablePlugin, scope: 'user' | 'project' | 'local' = 'user') => {
    setIsInstalling(true);
    setInstallError(null);

    const result = await installPluginFromMarketplace({
      pluginId: plugin.pluginId,
      entry: plugin.entry,
      marketplaceName: plugin.marketplaceName,
      scope,
    });

    if (result.success) {
      const loaded = await findPluginOptionsTarget(plugin.pluginId);
      if (loaded) {
        setIsInstalling(false);
        setViewState({
          type: 'plugin-options',
          plugin: loaded,
          pluginId: plugin.pluginId,
        });
        return;
      }
      setResult(result.message);
      if (onInstallComplete) {
        await onInstallComplete();
      }
      setParentViewState({ type: 'menu' });
    } else {
      setIsInstalling(false);
      setInstallError((result as { success: false; error: string }).error);
    }
  };

  // 处理错误状态
  useEffect(() => {
    if (error) {
      setResult(error);
    }
  }, [error, setResult]);

  // 在插件详情视图中按 Esc - 返回插件列表
  useKeybinding(
    'confirm:no',
    () => {
      setViewState('plugin-list');
      setSelectedPlugin(null);
    },
    {
      context: 'Confirmation',
      isActive: viewState === 'plugin-details',
    },
  );

  // 在插件列表视图中按 Esc（非搜索模式）- 退出到上级菜单
  useKeybinding(
    'confirm:no',
    () => {
      setParentViewState({ type: 'menu' });
    },
    {
      context: 'Confirmation',
      isActive: viewState === 'plugin-list' && !isSearchMode,
    },
  );

  // 处理进入搜索模式（非 Esc 键）
  useInput(
    (input, _key) => {
      const keyIsNotCtrlOrMeta = !_key.ctrl && !_key.meta;
      if (!isSearchMode) {
        // 使用 '/' 或任何可打印字符进入搜索模式
        if (input === '/' && keyIsNotCtrlOrMeta) {
          setIsSearchMode(true);
          setSearchQuery('');
        } else if (
          keyIsNotCtrlOrMeta &&
          input.length > 0 &&
          !/^\s+$/.test(input) &&
          // 导航键不进入搜索模式
          input !== 'j' &&
          input !== 'k' &&
          input !== 'i'
        ) {
          setIsSearchMode(true);
          setSearchQuery(input);
        }
      }
    },
    { isActive: viewState === 'plugin-list' && !loading },
  );

  // 插件列表导航（非搜索模式）
  useKeybindings(
    {
      'select:previous': () => {
        if (selectedIndex === 0) {
          setIsSearchMode(true);
        } else {
          pagination.handleSelectionChange(selectedIndex - 1, setSelectedIndex);
        }
      },
      'select:next': () => {
        if (selectedIndex < filteredPlugins.length - 1) {
          pagination.handleSelectionChange(selectedIndex + 1, setSelectedIndex);
        }
      },
      'select:accept': () => {
        if (selectedIndex === filteredPlugins.length && selectedForInstall.size > 0) {
          void installSelectedPlugins();
        } else if (selectedIndex < filteredPlugins.length) {
          const plugin = filteredPlugins[selectedIndex];
          if (plugin) {
            if (plugin.isInstalled) {
              setParentViewState({
                type: 'manage-plugins',
                targetPlugin: plugin.entry.name,
                targetMarketplace: plugin.marketplaceName,
              });
            } else {
              setSelectedPlugin(plugin);
              setViewState('plugin-details');
              setDetailsMenuIndex(0);
              setInstallError(null);
            }
          }
        }
      },
    },
    {
      context: 'Select',
      isActive: viewState === 'plugin-list' && !isSearchMode,
    },
  );

  useKeybindings(
    {
      'plugin:toggle': () => {
        if (selectedIndex < filteredPlugins.length) {
          const plugin = filteredPlugins[selectedIndex];
          if (plugin && !plugin.isInstalled) {
            const newSelection = new Set(selectedForInstall);
            if (newSelection.has(plugin.pluginId)) {
              newSelection.delete(plugin.pluginId);
            } else {
              newSelection.add(plugin.pluginId);
            }
            setSelectedForInstall(newSelection);
          }
        }
      },
      'plugin:install': () => {
        if (selectedForInstall.size > 0) {
          void installSelectedPlugins();
        }
      },
    },
    {
      context: 'Plugin',
      isActive: viewState === 'plugin-list' && !isSearchMode,
    },
  );

  // 插件详情导航
  const detailsMenuOptions = React.useMemo(() => {
    if (!selectedPlugin) return [];
    const hasHomepage = selectedPlugin.entry.homepage;
    const githubRepo = extractGitHubRepo(selectedPlugin);
    return buildPluginDetailsMenuOptions(hasHomepage, githubRepo);
  }, [selectedPlugin]);

  useKeybindings(
    {
      'select:previous': () => {
        if (detailsMenuIndex > 0) {
          setDetailsMenuIndex(detailsMenuIndex - 1);
        }
      },
      'select:next': () => {
        if (detailsMenuIndex < detailsMenuOptions.length - 1) {
          setDetailsMenuIndex(detailsMenuIndex + 1);
        }
      },
      'select:accept': () => {
        if (!selectedPlugin) return;
        const action = detailsMenuOptions[detailsMenuIndex]?.action;
        const hasHomepage = selectedPlugin.entry.homepage;
        const githubRepo = extractGitHubRepo(selectedPlugin);
        if (action === 'install-user') {
          void handleSinglePluginInstall(selectedPlugin, 'user');
        } else if (action === 'install-project') {
          void handleSinglePluginInstall(selectedPlugin, 'project');
        } else if (action === 'install-local') {
          void handleSinglePluginInstall(selectedPlugin, 'local');
        } else if (action === 'homepage' && hasHomepage) {
          void openBrowser(hasHomepage);
        } else if (action === 'github' && githubRepo) {
          void openBrowser(`https://github.com/${githubRepo}`);
        } else if (action === 'back') {
          setViewState('plugin-list');
          setSelectedPlugin(null);
        }
      },
    },
    {
      context: 'Select',
      isActive: viewState === 'plugin-details' && !!selectedPlugin,
    },
  );

  if (typeof viewState === 'object' && viewState.type === 'plugin-options') {
    const { plugin, pluginId } = viewState;
    function finish(msg: string): void {
      setResult(msg);
      if (onInstallComplete) {
        void onInstallComplete();
      }
      setParentViewState({ type: 'menu' });
    }
    return (
      <PluginOptionsFlow
        plugin={plugin}
        pluginId={pluginId}
        onDone={(outcome, detail) => {
          switch (outcome) {
            case 'configured':
              finish(`✓ Installed and configured ${plugin.name}. Run /reload-plugins to apply.`);
              break;
            case 'skipped':
              finish(`✓ Installed ${plugin.name}. Run /reload-plugins to apply.`);
              break;
            case 'error':
              finish(`Installed but failed to save config: ${detail}`);
              break;
          }
        }}
      />
    );
  }

  // 加载状态
  if (loading) {
    return <Text>Loading…</Text>;
  }

  // 错误状态
  if (error) {
    return <Text color="error">{error}</Text>;
  }

  // 插件详情视图
  if (viewState === 'plugin-details' && selectedPlugin) {
    const hasHomepage = selectedPlugin.entry.homepage;
    const githubRepo = extractGitHubRepo(selectedPlugin);

    const menuOptions = buildPluginDetailsMenuOptions(hasHomepage, githubRepo);

    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>插件详情</Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Text bold>{selectedPlugin.entry.name}</Text>
          <Text dimColor>from {selectedPlugin.marketplaceName}</Text>
          {selectedPlugin.entry.version && <Text dimColor>Version: {selectedPlugin.entry.version}</Text>}
          {selectedPlugin.entry.description && (
            <Box marginTop={1}>
              <Text>{selectedPlugin.entry.description}</Text>
            </Box>
          )}
          {selectedPlugin.entry.author && (
            <Box marginTop={1}>
              <Text dimColor>
                By:{' '}
                {typeof selectedPlugin.entry.author === 'string'
                  ? selectedPlugin.entry.author
                  : selectedPlugin.entry.author.name}
              </Text>
            </Box>
          )}
        </Box>

        <PluginTrustWarning />

        {installError && (
          <Box marginBottom={1}>
            <Text color="error">Error: {installError}</Text>
          </Box>
        )}

        <Box flexDirection="column">
          {menuOptions.map((option, index) => (
            <Box key={option.action}>
              {detailsMenuIndex === index && <Text>{'> '}</Text>}
              {detailsMenuIndex !== index && <Text>{'  '}</Text>}
              <Text bold={detailsMenuIndex === index}>
                {isInstalling && option.action.startsWith('install-') ? 'Installing…' : option.label}
              </Text>
            </Box>
          ))}
        </Box>

        <Box marginTop={1}>
          <Text dimColor>
            <Byline>
              <ConfigurableShortcutHint action="select:accept" context="Select" fallback="Enter" description="select" />
              <ConfigurableShortcutHint action="confirm:no" context="Confirmation" fallback="Esc" description="back" />
            </Byline>
          </Text>
        </Box>
      </Box>
    );
  }

  // 空状态
  if (availablePlugins.length === 0) {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>发现插件</Text>
        </Box>
        <EmptyStateMessage reason={emptyReason} />
        <Box marginTop={1}>
          <Text dimColor italic>
            按 Esc 返回
          </Text>
        </Box>
      </Box>
    );
  }

  // Get visible plugins from pagination
  const visiblePlugins = pagination.getVisibleItems(filteredPlugins);

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>发现插件</Text>
        {pagination.needsPagination && (
          <Text dimColor>
            {' '}
            ({pagination.scrollPosition.current}/{pagination.scrollPosition.total})
          </Text>
        )}
      </Box>

      {/* 搜索框 */}
      <Box marginBottom={1}>
        <SearchBox
          query={searchQuery}
          isFocused={isSearchMode}
          isTerminalFocused={isTerminalFocused}
          width={terminalWidth - 4}
          cursorOffset={searchCursorOffset}
        />
      </Box>

      {/* 警告横幅 */}
      {warning && (
        <Box marginBottom={1}>
          <Text color="warning">
            {figures.warning} {warning}
          </Text>
        </Box>
      )}

      {/* 无搜索结果 */}
      {filteredPlugins.length === 0 && searchQuery && (
        <Box marginBottom={1}>
          <Text dimColor>没有匹配的插件{searchQuery}&quot;</Text>
        </Box>
      )}

      {/* 向上滚动指示器 */}
      {pagination.scrollPosition.canScrollUp && (
        <Box>
          <Text dimColor> {figures.arrowUp} 上方还有更多</Text>
        </Box>
      )}

      {/* 插件列表 - 在 key 中使用 startIndex 以在滚动时强制重新渲染 */}
      {visiblePlugins.map((plugin, visibleIndex) => {
        const actualIndex = pagination.toActualIndex(visibleIndex);
        const isSelected = selectedIndex === actualIndex;
        const isSelectedForInstall = selectedForInstall.has(plugin.pluginId);
        const isInstallingThis = installingPlugins.has(plugin.pluginId);
        const isLast = visibleIndex === visiblePlugins.length - 1;

        return (
          <Box
            key={`${pagination.startIndex}-${plugin.pluginId}`}
            flexDirection="column"
            marginBottom={isLast && !error ? 0 : 1}
          >
            <Box>
              <Text color={isSelected && !isSearchMode ? 'suggestion' : undefined}>
                {isSelected && !isSearchMode ? figures.pointer : ' '}{' '}
              </Text>
              <Text>
                {isInstallingThis ? figures.ellipsis : isSelectedForInstall ? figures.radioOn : figures.radioOff}{' '}
                {plugin.entry.name}
                <Text dimColor> · {plugin.marketplaceName}</Text>
                {plugin.entry.tags?.includes('community-managed') && <Text dimColor> [Community Managed]</Text>}
                {installCounts && plugin.marketplaceName === OFFICIAL_MARKETPLACE_NAME && (
                  <Text dimColor>
                    {' · '}
                    {formatInstallCount(installCounts.get(plugin.pluginId) ?? 0)} installs
                  </Text>
                )}
              </Text>
            </Box>
            {plugin.entry.description && (
              <Box marginLeft={4}>
                <Text dimColor>{truncateToWidth(plugin.entry.description, 60)}</Text>
              </Box>
            )}
          </Box>
        );
      })}

      {/* 向下滚动指示器 */}
      {pagination.scrollPosition.canScrollDown && (
        <Box>
          <Text dimColor> {figures.arrowDown} 下方还有更多</Text>
        </Box>
      )}

      {/* 错误信息 */}
      {error && (
        <Box marginTop={1}>
          <Text color="error">
            {figures.cross} {error}
          </Text>
        </Box>
      )}

      <DiscoverPluginsKeyHint
        hasSelection={selectedForInstall.size > 0}
        canToggle={selectedIndex < filteredPlugins.length && !filteredPlugins[selectedIndex]?.isInstalled}
      />
    </Box>
  );
}

function DiscoverPluginsKeyHint({
  hasSelection,
  canToggle,
}: {
  hasSelection: boolean;
  canToggle: boolean;
}): React.ReactNode {
  return (
    <Box marginTop={1}>
      <Text dimColor italic>
        <Byline>
          {hasSelection && (
            <ConfigurableShortcutHint
              action="plugin:install"
              context="Plugin"
              fallback="i"
              description="install"
              bold
            />
          )}
          <Text>输入以搜索</Text>
          {canToggle && (
            <ConfigurableShortcutHint action="plugin:toggle" context="Plugin" fallback="Space" description="toggle" />
          )}
          <ConfigurableShortcutHint action="select:accept" context="Select" fallback="Enter" description="details" />
          <ConfigurableShortcutHint action="confirm:no" context="Confirmation" fallback="Esc" description="back" />
        </Byline>
      </Text>
    </Box>
  );
}

/**
 * Context-aware empty state message for the Discover screen
 */
function EmptyStateMessage({ reason }: { reason: EmptyMarketplaceReason | null }): React.ReactNode {
  switch (reason) {
    case 'git-not-installed':
      return (
        <>
          <Text dimColor>安装市场需要 Git。</Text>
          <Text dimColor>请安装 Git 并重启 Claude Code。</Text>
        </>
      );
    case 'all-blocked-by-policy':
      return (
        <>
          <Text dimColor>Your organization policy does not allow any external marketplaces.</Text>
          <Text dimColor>Contact your administrator.</Text>
        </>
      );
    case 'policy-restricts-sources':
      return (
        <>
          <Text dimColor>Your organization restricts which marketplaces can be added.</Text>
          <Text dimColor>Switch to the Marketplaces tab to view allowed sources.</Text>
        </>
      );
    case 'all-marketplaces-failed':
      return (
        <>
          <Text dimColor>加载市场数据失败。</Text>
          <Text dimColor>请检查您的网络连接。</Text>
        </>
      );
    case 'all-plugins-installed':
      return (
        <>
          <Text dimColor>All available plugins are already installed.</Text>
          <Text dimColor>Check for new plugins later or add more marketplaces.</Text>
        </>
      );
    case 'no-marketplaces-configured':
    default:
      return (
        <>
          <Text dimColor>No plugins available.</Text>
          <Text dimColor>Add a marketplace first using the Marketplaces tab.</Text>
        </>
      );
  }
}
