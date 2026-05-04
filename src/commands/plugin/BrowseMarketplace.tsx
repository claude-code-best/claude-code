import figures from 'figures';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { ConfigurableShortcutHint } from '../../components/ConfigurableShortcutHint.js';
import { Box, Byline, Text } from '@anthropic/ink';
import { useKeybinding, useKeybindings } from '../../keybindings/useKeybinding.js';
import type { LoadedPlugin } from '../../types/plugin.js';
import { count } from '../../utils/array.js';
import { openBrowser } from '../../utils/browser.js';
import { logForDebugging } from '../../utils/debug.js';
import { errorMessage } from '../../utils/errors.js';
import { clearAllCaches } from '../../utils/plugins/cacheUtils.js';
import { formatInstallCount, getInstallCounts } from '../../utils/plugins/installCounts.js';
import { isPluginGloballyInstalled, isPluginInstalled } from '../../utils/plugins/installedPluginsManager.js';
import {
  createPluginId,
  formatFailureDetails,
  formatMarketplaceLoadingErrors,
  getMarketplaceSourceDisplay,
  loadMarketplacesWithGracefulDegradation,
} from '../../utils/plugins/marketplaceHelpers.js';
import { getMarketplace, loadKnownMarketplacesConfig } from '../../utils/plugins/marketplaceManager.js';
import { OFFICIAL_MARKETPLACE_NAME } from '../../utils/plugins/officialMarketplace.js';
import { installPluginFromMarketplace } from '../../utils/plugins/pluginInstallationHelpers.js';
import { isPluginBlockedByPolicy } from '../../utils/plugins/pluginPolicy.js';
import { plural } from '../../utils/stringUtils.js';
import { truncateToWidth } from '../../utils/truncate.js';
import { findPluginOptionsTarget, PluginOptionsFlow } from './PluginOptionsFlow.js';
import { PluginTrustWarning } from './PluginTrustWarning.js';
import {
  buildPluginDetailsMenuOptions,
  extractGitHubRepo,
  type InstallablePlugin,
  PluginSelectionKeyHint,
} from './pluginDetailsHelpers.js';
import type { ViewState as ParentViewState } from './types.js';
import { usePagination } from './usePagination.js';

type Props = {
  error: string | null;
  setError: (error: string | null) => void;
  result: string | null;
  setResult: (result: string | null) => void;
  setViewState: (state: ParentViewState) => void;
  onInstallComplete?: () => void | Promise<void>;
  targetMarketplace?: string;
  targetPlugin?: string;
};

type ViewState =
  | 'marketplace-list'
  | 'plugin-list'
  | 'plugin-details'
  | { type: 'plugin-options'; plugin: LoadedPlugin; pluginId: string };

type MarketplaceInfo = {
  name: string;
  totalPlugins: number;
  installedCount: number;
  source?: string;
};

export function BrowseMarketplace({
  error,
  setError,
  result: _result,
  setResult,
  setViewState: setParentViewState,
  onInstallComplete,
  targetMarketplace,
  targetPlugin,
}: Props): React.ReactNode {
  // View state
  const [viewState, setViewState] = useState<ViewState>('marketplace-list');
  const [selectedMarketplace, setSelectedMarketplace] = useState<string | null>(null);
  const [selectedPlugin, setSelectedPlugin] = useState<InstallablePlugin | null>(null);

  // Data state
  const [marketplaces, setMarketplaces] = useState<MarketplaceInfo[]>([]);
  const [availablePlugins, setAvailablePlugins] = useState<InstallablePlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [installCounts, setInstallCounts] = useState<Map<string, number> | null>(null);

  // Selection state
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedForInstall, setSelectedForInstall] = useState<Set<string>>(new Set());
  const [installingPlugins, setInstallingPlugins] = useState<Set<string>>(new Set());

  // 插件列表的分页（连续滚动）
  const pagination = usePagination<InstallablePlugin>({
    totalItems: availablePlugins.length,
    selectedIndex,
  });

  // Details view state
  const [detailsMenuIndex, setDetailsMenuIndex] = useState(0);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  // Warning state for non-critical errors (e.g., some marketplaces failed to load)
  const [warning, setWarning] = useState<string | null>(null);

  // 处理按 Esc 键返回 - 依赖于 viewState 的导航
  const handleBack = React.useCallback(() => {
    if (viewState === 'plugin-list') {
      // 如果通过 targetMarketplace 直接导航到特定市场，则
      // 返回 manage-marketplaces 并显示该市场的详情
      if (targetMarketplace) {
        setParentViewState({
          type: 'manage-marketplaces',
          targetMarketplace,
        });
      } else if (marketplaces.length === 1) {
        // If there's only one marketplace, skip the marketplace-list view
        // since we auto-navigated past it on load
        setParentViewState({ type: 'menu' });
      } else {
        setViewState('marketplace-list');
        setSelectedMarketplace(null);
        setSelectedForInstall(new Set());
      }
    } else if (viewState === 'plugin-details') {
      setViewState('plugin-list');
      setSelectedPlugin(null);
    } else {
      // At root level (marketplace-list), exit the plugin menu
      setParentViewState({ type: 'menu' });
    }
  }, [viewState, targetMarketplace, setParentViewState, marketplaces.length]);

  useKeybinding('confirm:no', handleBack, { context: 'Confirmation' });

  // 加载市场并统计已安装插件数量
  useEffect(() => {
    async function loadMarketplaceData() {
      try {
        const config = await loadKnownMarketplacesConfig();

        // Load marketplaces with graceful degradation
        const { marketplaces, failures } = await loadMarketplacesWithGracefulDegradation(config);

        const marketplaceInfos: MarketplaceInfo[] = [];
        for (const { name, config: marketplaceConfig, data: marketplace } of marketplaces) {
          if (marketplace) {
            // Count how many plugins from this marketplace are installed
            const installedFromThisMarketplace = count(marketplace.plugins, plugin =>
              isPluginInstalled(createPluginId((plugin as { name: string }).name, name)),
            );

            marketplaceInfos.push({
              name,
              totalPlugins: marketplace.plugins.length,
              installedCount: installedFromThisMarketplace,
              source: getMarketplaceSourceDisplay(marketplaceConfig.source),
            });
          }
        }

        // 排序，使 claude-plugin-directory 始终排在首位
        marketplaceInfos.sort((a, b) => {
          if (a.name === 'claude-plugin-directory') return -1;
          if (b.name === 'claude-plugin-directory') return 1;
          return 0;
        });

        setMarketplaces(marketplaceInfos);

        // Handle marketplace loading errors/warnings
        const successCount = count(marketplaces, m => m.data !== null);
        const errorResult = formatMarketplaceLoadingErrors(failures, successCount);
        if (errorResult) {
          if (errorResult.type === 'warning') {
            setWarning(errorResult.message + '. Showing available marketplaces.');
          } else {
            throw new Error(errorResult.message);
          }
        }

        // Skip marketplace selection if there's only one marketplace
        if (marketplaceInfos.length === 1 && !targetMarketplace && !targetPlugin) {
          const singleMarketplace = marketplaceInfos[0];
          if (singleMarketplace) {
            setSelectedMarketplace(singleMarketplace.name);
            setViewState('plugin-list');
          }
        }

        // 在市场加载后处理 targetMarketplace 和 targetPlugin
        if (targetPlugin) {
          // Search for the plugin across all marketplaces
          let foundPlugin: InstallablePlugin | null = null;
          let foundMarketplace: string | null = null;

          for (const [name] of Object.entries(config)) {
            const marketplace = await getMarketplace(name);
            if (marketplace) {
              const plugin = marketplace.plugins.find(p => p.name === targetPlugin);
              if (plugin) {
                const pluginId = createPluginId(plugin.name, name);
                foundPlugin = {
                  entry: plugin,
                  marketplaceName: name,
                  pluginId,
                  // isPluginGloballyInstalled：仅当用户/
                  // 托管作用域存在时阻止（无需添加）。项目/本地作用域的安装不阻
                  // 止 — 用户可能希望提升到用户作用域 (gh-29997)。
                  isInstalled: isPluginGloballyInstalled(pluginId),
                };
                foundMarketplace = name;
                break;
              }
            }
          }

          if (foundPlugin && foundMarketplace) {
            // Block only on global (user/managed) install — project/local scope
            // means the user might still want to add a user-scope entry so the
            // plugin is available in other projects (gh-29997, gh-29240, gh-29392).
            // The plugin-details view offers all three scope options; the backend
            // (installPluginOp → addInstalledPlugin) already supports multiple
            // scope entries per plugin.
            const pluginId = foundPlugin.pluginId;
            const globallyInstalled = isPluginGloballyInstalled(pluginId);

            if (globallyInstalled) {
              setError(`Plugin '${pluginId}' is already installed globally. Use '/plugin' to manage existing plugins.`);
            } else {
              // Navigate to the plugin details view
              setSelectedMarketplace(foundMarketplace);
              setSelectedPlugin(foundPlugin);
              setViewState('plugin-details');
            }
          } else {
            setError(`Plugin "${targetPlugin}" not found in any marketplace`);
          }
        } else if (targetMarketplace) {
          // Navigate directly to the specified marketplace
          const marketplaceExists = marketplaceInfos.some(m => m.name === targetMarketplace);
          if (marketplaceExists) {
            setSelectedMarketplace(targetMarketplace);
            setViewState('plugin-list');
          } else {
            setError(`Marketplace "${targetMarketplace}" not found`);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load marketplaces');
      } finally {
        setLoading(false);
      }
    }
    void loadMarketplaceData();
  }, [setError, targetMarketplace, targetPlugin]);

  // 在选择市场时加载插件
  useEffect(() => {
    if (!selectedMarketplace) return;

    let cancelled = false;

    async function loadPluginsForMarketplace(marketplaceName: string) {
      setLoading(true);
      try {
        const marketplace = await getMarketplace(marketplaceName);
        if (cancelled) return;
        if (!marketplace) {
          throw new Error(`Failed to load marketplace: ${marketplaceName}`);
        }

        // Filter out already installed plugins
        const installablePlugins: InstallablePlugin[] = [];
        for (const entry of marketplace.plugins) {
          const pluginId = createPluginId(entry.name, marketplaceName);
          if (isPluginBlockedByPolicy(pluginId)) continue;
          installablePlugins.push({
            entry,
            marketplaceName: marketplaceName,
            pluginId,
            // 仅当全局作用域（用户/托管）时标记为“已安装”。项
            // 目/本地安装不阻止——用户可通过插件详情视图添加
            // 用户作用域（gh-29997）。
            isInstalled: isPluginGloballyInstalled(pluginId),
          });
        }

        // 获取安装数量并按受欢迎程度排序
        try {
          const counts = await getInstallCounts();
          if (cancelled) return;
          setInstallCounts(counts);

          if (counts) {
            // 按安装数量（降序）排序，然后按字母顺序排序
            installablePlugins.sort((a, b) => {
              const countA = counts.get(a.pluginId) ?? 0;
              const countB = counts.get(b.pluginId) ?? 0;
              if (countA !== countB) return countB - countA;
              return a.entry.name.localeCompare(b.entry.name);
            });
          } else {
            // No counts available - sort alphabetically
            installablePlugins.sort((a, b) => a.entry.name.localeCompare(b.entry.name));
          }
        } catch (error) {
          if (cancelled) return;
          // Log the error, then gracefully degrade to alphabetical sort
          logForDebugging(`Failed to fetch install counts: ${errorMessage(error)}`);
          installablePlugins.sort((a, b) => a.entry.name.localeCompare(b.entry.name));
        }

        setAvailablePlugins(installablePlugins);
        setSelectedIndex(0);
        setSelectedForInstall(new Set());
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load plugins');
      } finally {
        setLoading(false);
      }
    }

    void loadPluginsForMarketplace(selectedMarketplace);
    return () => {
      cancelled = true;
    };
  }, [selectedMarketplace, setError]);

  // 安装所选插件
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
      // 全部成功
      const message =
        `✓ Installed ${successCount} ${plural(successCount, 'plugin')}. ` + `Run /reload-plugins to activate.`;

      setResult(message);
    } else if (successCount === 0) {
      // All failed - show error with reasons
      setError(`Failed to install: ${formatFailureDetails(newFailedPlugins, true)}`);
    } else {
      // 混合结果 - 显示部分成功
      const message =
        `✓ Installed ${successCount} of ${successCount + failureCount} plugins. ` +
        `Failed: ${formatFailureDetails(newFailedPlugins, false)}. ` +
        `Run /reload-plugins to activate successfully installed plugins.`;

      setResult(message);
    }

    // 处理完成回调和导航
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

  // 市场列表导航
  useKeybindings(
    {
      'select:previous': () => {
        if (selectedIndex > 0) {
          setSelectedIndex(selectedIndex - 1);
        }
      },
      'select:next': () => {
        if (selectedIndex < marketplaces.length - 1) {
          setSelectedIndex(selectedIndex + 1);
        }
      },
      'select:accept': () => {
        const marketplace = marketplaces[selectedIndex];
        if (marketplace) {
          setSelectedMarketplace(marketplace.name);
          setViewState('plugin-list');
        }
      },
    },
    { context: 'Select', isActive: viewState === 'marketplace-list' },
  );

  // 插件列表导航
  useKeybindings(
    {
      'select:previous': () => {
        if (selectedIndex > 0) {
          pagination.handleSelectionChange(selectedIndex - 1, setSelectedIndex);
        }
      },
      'select:next': () => {
        if (selectedIndex < availablePlugins.length - 1) {
          pagination.handleSelectionChange(selectedIndex + 1, setSelectedIndex);
        }
      },
      'select:accept': () => {
        if (selectedIndex === availablePlugins.length && selectedForInstall.size > 0) {
          void installSelectedPlugins();
        } else if (selectedIndex < availablePlugins.length) {
          const plugin = availablePlugins[selectedIndex];
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
    { context: 'Select', isActive: viewState === 'plugin-list' },
  );

  useKeybindings(
    {
      'plugin:toggle': () => {
        if (selectedIndex < availablePlugins.length) {
          const plugin = availablePlugins[selectedIndex];
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
    { context: 'Plugin', isActive: viewState === 'plugin-list' },
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

  // 市场选择视图
  if (viewState === 'marketplace-list') {
    if (marketplaces.length === 0) {
      return (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold>选择市场</Text>
          </Box>
          <Text>No marketplaces configured.</Text>
          <Text dimColor>Add a marketplace first using {"'Add marketplace'"}.</Text>
          <Box marginTop={1} paddingLeft={1}>
            <Text dimColor>
              <ConfigurableShortcutHint action="confirm:no" context="Confirmation" fallback="Esc" description="返回" />
            </Text>
          </Box>
        </Box>
      );
    }

    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>选择市场</Text>
        </Box>

        {/* 市场加载失败的警告横幅 */}
        {warning && (
          <Box marginBottom={1} flexDirection="column">
            <Text color="warning">
              {figures.warning} {warning}
            </Text>
          </Box>
        )}
        {marketplaces.map((marketplace, index) => (
          <Box key={marketplace.name} flexDirection="column" marginBottom={index < marketplaces.length - 1 ? 1 : 0}>
            <Box>
              <Text color={selectedIndex === index ? 'suggestion' : undefined}>
                {selectedIndex === index ? figures.pointer : ' '} {marketplace.name}
              </Text>
            </Box>
            <Box marginLeft={2}>
              <Text dimColor>
                {marketplace.totalPlugins} {plural(marketplace.totalPlugins, 'plugin')} available
                {marketplace.installedCount > 0 && ` · ${marketplace.installedCount} already installed`}
                {marketplace.source && ` · ${marketplace.source}`}
              </Text>
            </Box>
          </Box>
        ))}

        <Box marginTop={1}>
          <Text dimColor italic>
            <Byline>
              <ConfigurableShortcutHint action="select:accept" context="Select" fallback="Enter" description="select" />
              <ConfigurableShortcutHint action="confirm:no" context="Confirmation" fallback="Esc" description="返回" />
            </Byline>
          </Text>
        </Box>
      </Box>
    );
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

        {/* 插件元数据 */}
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>{selectedPlugin.entry.name}</Text>
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

        {/* 将要安装的内容 */}
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>将安装：</Text>
          {selectedPlugin.entry.commands && (
            <Text dimColor>
              · 命令：{' '}
              {Array.isArray(selectedPlugin.entry.commands)
                ? selectedPlugin.entry.commands.join(', ')
                : Object.keys(selectedPlugin.entry.commands).join(', ')}
            </Text>
          )}
          {selectedPlugin.entry.agents && (
            <Text dimColor>
              · 代理：{' '}
              {Array.isArray(selectedPlugin.entry.agents)
                ? selectedPlugin.entry.agents.join(', ')
                : Object.keys(selectedPlugin.entry.agents).join(', ')}
            </Text>
          )}
          {selectedPlugin.entry.hooks && (
            <Text dimColor>· Hooks: {Object.keys(selectedPlugin.entry.hooks).join(', ')}</Text>
          )}
          {selectedPlugin.entry.mcpServers && (
            <Text dimColor>
              · MCP 服务器：{' '}
              {Array.isArray(selectedPlugin.entry.mcpServers)
                ? selectedPlugin.entry.mcpServers.join(', ')
                : typeof selectedPlugin.entry.mcpServers === 'object'
                  ? Object.keys(selectedPlugin.entry.mcpServers).join(', ')
                  : 'configured'}
            </Text>
          )}
          {!selectedPlugin.entry.commands &&
            !selectedPlugin.entry.agents &&
            !selectedPlugin.entry.hooks &&
            !selectedPlugin.entry.mcpServers && (
              <>
                {typeof selectedPlugin.entry.source === 'object' &&
                'source' in selectedPlugin.entry.source &&
                (selectedPlugin.entry.source.source === 'github' ||
                  selectedPlugin.entry.source.source === 'url' ||
                  selectedPlugin.entry.source.source === 'npm' ||
                  selectedPlugin.entry.source.source === 'pip') ? (
                  <Text dimColor>· Component summary not available for remote plugin</Text>
                ) : (
                  // TODO: Actually scan local plugin directories to show real components
                  // This would require accessing the filesystem to check for:
                  // - commands/ directory and list files
                  // - agents/ directory and list files
                  // - hooks/ directory and list files
                  // - .mcp.json or mcp-servers.json files
                  <Text dimColor>· Components will be discovered at installation</Text>
                )}
              </>
            )}
        </Box>

        <PluginTrustWarning />

        {/* 错误信息 */}
        {installError && (
          <Box marginBottom={1}>
            <Text color="error">Error: {installError}</Text>
          </Box>
        )}

        {/* 菜单选项 */}
        <Box flexDirection="column">
          {menuOptions.map((option, index) => (
            <Box key={option.action}>
              {detailsMenuIndex === index && <Text>{'> '}</Text>}
              {detailsMenuIndex !== index && <Text>{'  '}</Text>}
              <Text bold={detailsMenuIndex === index}>
                {isInstalling && option.action === 'install' ? 'Installing…' : option.label}
              </Text>
            </Box>
          ))}
        </Box>

        <Box marginTop={1} paddingLeft={1}>
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

  // 插件安装视图
  if (availablePlugins.length === 0) {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>安装插件</Text>
        </Box>
        <Text dimColor>No new plugins available to install.</Text>
        <Text dimColor>All plugins from this marketplace are already installed.</Text>
        <Box marginLeft={3}>
          <Text dimColor italic>
            <ConfigurableShortcutHint action="confirm:no" context="Confirmation" fallback="Esc" description="go back" />
          </Text>
        </Box>
      </Box>
    );
  }

  // Get visible plugins from pagination
  const visiblePlugins = pagination.getVisibleItems(availablePlugins);

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>安装插件</Text>
      </Box>

      {/* 向上滚动指示器 */}
      {pagination.scrollPosition.canScrollUp && (
        <Box>
          <Text dimColor> {figures.arrowUp} 上方还有更多</Text>
        </Box>
      )}

      {/* 插件列表 */}
      {visiblePlugins.map((plugin, visibleIndex) => {
        const actualIndex = pagination.toActualIndex(visibleIndex);
        const isSelected = selectedIndex === actualIndex;
        const isSelectedForInstall = selectedForInstall.has(plugin.pluginId);
        const isInstalling = installingPlugins.has(plugin.pluginId);
        const isLast = visibleIndex === visiblePlugins.length - 1;

        return (
          <Box key={plugin.pluginId} flexDirection="column" marginBottom={isLast && !error ? 0 : 1}>
            <Box>
              <Text color={isSelected ? 'suggestion' : undefined}>{isSelected ? figures.pointer : ' '} </Text>
              <Text color={plugin.isInstalled ? 'success' : undefined}>
                {plugin.isInstalled
                  ? figures.tick
                  : isInstalling
                    ? figures.ellipsis
                    : isSelectedForInstall
                      ? figures.radioOn
                      : figures.radioOff}{' '}
                {plugin.entry.name}
                {plugin.entry.category && <Text dimColor> [{plugin.entry.category}]</Text>}
                {plugin.entry.tags?.includes('community-managed') && <Text dimColor> [Community Managed]</Text>}
                {plugin.isInstalled && <Text dimColor> (installed)</Text>}
                {installCounts && selectedMarketplace === OFFICIAL_MARKETPLACE_NAME && (
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
                {plugin.entry.version && <Text dimColor> · v{plugin.entry.version}</Text>}
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

      {/* 界面中显示的错误信息 */}
      {error && (
        <Box marginTop={1}>
          <Text color="error">
            {figures.cross} {error}
          </Text>
        </Box>
      )}

      <PluginSelectionKeyHint hasSelection={selectedForInstall.size > 0} />
    </Box>
  );
}
