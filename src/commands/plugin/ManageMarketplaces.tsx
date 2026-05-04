import figures from 'figures';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js';
import { ConfigurableShortcutHint } from '../../components/ConfigurableShortcutHint.js';
import { Byline, KeyboardShortcutHint } from '@anthropic/ink';
// eslint-disable-next-line custom-rules/prefer-use-keybindings -- useInput needed for marketplace-specific u/r shortcuts and y/n confirmation not in keybinding schema
import { Box, Text, useInput } from '@anthropic/ink';
import { useKeybinding, useKeybindings } from '../../keybindings/useKeybinding.js';
import type { LoadedPlugin } from '../../types/plugin.js';
import { count } from '../../utils/array.js';
import { shouldSkipPluginAutoupdate } from '../../utils/config.js';
import { errorMessage } from '../../utils/errors.js';
import { clearAllCaches } from '../../utils/plugins/cacheUtils.js';
import {
  createPluginId,
  formatMarketplaceLoadingErrors,
  getMarketplaceSourceDisplay,
  loadMarketplacesWithGracefulDegradation,
} from '../../utils/plugins/marketplaceHelpers.js';
import {
  loadKnownMarketplacesConfig,
  refreshMarketplace,
  removeMarketplaceSource,
  setMarketplaceAutoUpdate,
} from '../../utils/plugins/marketplaceManager.js';
import { updatePluginsForMarketplaces } from '../../utils/plugins/pluginAutoupdate.js';
import { loadAllPlugins } from '../../utils/plugins/pluginLoader.js';
import { isMarketplaceAutoUpdate } from '../../utils/plugins/schemas.js';
import { getSettingsForSource, updateSettingsForSource } from '../../utils/settings/settings.js';
import { plural } from '../../utils/stringUtils.js';
import type { ViewState } from './types.js';

type Props = {
  setViewState: (state: ViewState) => void;
  error?: string | null;
  setError?: (error: string | null) => void;
  setResult: (result: string | null) => void;
  exitState: {
    pending: boolean;
    keyName: 'Ctrl-C' | 'Ctrl-D' | null;
  };
  onManageComplete?: () => void | Promise<void>;
  targetMarketplace?: string;
  action?: 'update' | 'remove';
};

type MarketplaceState = {
  name: string;
  source: string;
  lastUpdated?: string;
  pluginCount?: number;
  installedPlugins?: LoadedPlugin[];
  pendingUpdate?: boolean;
  pendingRemove?: boolean;
  autoUpdate?: boolean;
};

type InternalViewState = 'list' | 'details' | 'confirm-remove';

export function ManageMarketplaces({
  setViewState,
  error,
  setError,
  setResult,
  exitState,
  onManageComplete,
  targetMarketplace,
  action,
}: Props): React.ReactNode {
  const [marketplaceStates, setMarketplaceStates] = useState<MarketplaceState[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [internalView, setInternalView] = useState<InternalViewState>('list');
  const [selectedMarketplace, setSelectedMarketplace] = useState<MarketplaceState | null>(null);
  const [detailsMenuIndex, setDetailsMenuIndex] = useState(0);
  const hasAttemptedAutoAction = useRef(false);

  // 加载市场及其已安装的插件
  useEffect(() => {
    async function loadMarketplaces() {
      try {
        const config = await loadKnownMarketplacesConfig();
        const { enabled, disabled } = await loadAllPlugins();
        const allPlugins = [...enabled, ...disabled];

        // Load marketplaces with graceful degradation
        const { marketplaces, failures } = await loadMarketplacesWithGracefulDegradation(config);

        const states: MarketplaceState[] = [];
        for (const { name, config: entry, data: marketplace } of marketplaces) {
          // Get all plugins installed from this marketplace
          const installedFromMarketplace = allPlugins.filter(plugin => plugin.source.endsWith(`@${name}`));

          states.push({
            name,
            source: getMarketplaceSourceDisplay(entry.source),
            lastUpdated: entry.lastUpdated,
            pluginCount: marketplace?.plugins.length,
            installedPlugins: installedFromMarketplace,
            pendingUpdate: false,
            pendingRemove: false,
            autoUpdate: isMarketplaceAutoUpdate(name, entry),
          });
        }

        // 排序：claude-plugin-directory 优先，然后按字母顺序
        states.sort((a, b) => {
          if (a.name === 'claude-plugin-directory') return -1;
          if (b.name === 'claude-plugin-directory') return 1;
          return a.name.localeCompare(b.name);
        });
        setMarketplaceStates(states);

        // Handle marketplace loading errors/warnings
        const successCount = count(marketplaces, m => m.data !== null);
        const errorResult = formatMarketplaceLoadingErrors(failures, successCount);
        if (errorResult) {
          if (errorResult.type === 'warning') {
            setProcessError(errorResult.message);
          } else {
            throw new Error(errorResult.message);
          }
        }

        // 如果提供了目标和操作，则自动执行
        if (targetMarketplace && !hasAttemptedAutoAction.current && !error) {
          hasAttemptedAutoAction.current = true;
          const targetIndex = states.findIndex(s => s.name === targetMarketplace);
          if (targetIndex >= 0) {
            const targetState = states[targetIndex];
            if (action) {
              // Mark the action as pending and execute
              setSelectedIndex(targetIndex + 1); // +1 because "Add Marketplace" is at index 0
              const newStates = [...states];
              if (action === 'update') {
                newStates[targetIndex]!.pendingUpdate = true;
              } else if (action === 'remove') {
                newStates[targetIndex]!.pendingRemove = true;
              }
              setMarketplaceStates(newStates);
              // Apply the change immediately
              setTimeout(applyChanges, 100, newStates);
            } else if (targetState) {
              // No action - just show the details view for this marketplace
              setSelectedIndex(targetIndex + 1); // +1 because "Add Marketplace" is at index 0
              setSelectedMarketplace(targetState);
              setInternalView('details');
            }
          } else if (setError) {
            setError(`Marketplace not found: ${targetMarketplace}`);
          }
        }
      } catch (err) {
        if (setError) {
          setError(err instanceof Error ? err.message : 'Failed to load marketplaces');
        }
        setProcessError(err instanceof Error ? err.message : 'Failed to load marketplaces');
      } finally {
        setLoading(false);
      }
    }
    void loadMarketplaces();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetMarketplace, action, error]);

  // 检查是否有任何待处理的更改
  const hasPendingChanges = () => {
    return marketplaceStates.some(state => state.pendingUpdate || state.pendingRemove);
  };

  // 获取待处理操作的数量
  const getPendingCounts = () => {
    const updateCount = count(marketplaceStates, s => s.pendingUpdate);
    const removeCount = count(marketplaceStates, s => s.pendingRemove);
    return { updateCount, removeCount };
  };

  // 应用所有待处理的更改
  const applyChanges = async (states?: MarketplaceState[]) => {
    const statesToProcess = states || marketplaceStates;
    const wasInDetailsView = internalView === 'details';
    setIsProcessing(true);
    setProcessError(null);
    setSuccessMessage(null);
    setProgressMessage(null);

    try {
      const settings = getSettingsForSource('userSettings');
      let updatedCount = 0;
      let removedCount = 0;
      const refreshedMarketplaces = new Set<string>();

      for (const state of statesToProcess) {
        // 处理移除操作
        if (state.pendingRemove) {
          // 首先从此市场卸载所有插件
          if (state.installedPlugins && state.installedPlugins.length > 0) {
            const newEnabledPlugins = { ...settings?.enabledPlugins };
            for (const plugin of state.installedPlugins) {
              const pluginId = createPluginId(plugin.name, state.name);
              // Mark as disabled/uninstalled
              newEnabledPlugins[pluginId] = false;
            }
            updateSettingsForSource('userSettings', {
              enabledPlugins: newEnabledPlugins,
            });
          }

          // Then remove the marketplace
          await removeMarketplaceSource(state.name);
          removedCount++;

          logEvent('tengu_marketplace_removed', {
            marketplace_name: state.name as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            plugins_uninstalled: state.installedPlugins?.length || 0,
          });
          continue;
        }

        // 处理更新操作
        if (state.pendingUpdate) {
          // 为提升效率并报告进度，刷新单个市场
          await refreshMarketplace(state.name, (message: string) => {
            setProgressMessage(message);
          });
          updatedCount++;
          refreshedMarketplaces.add(state.name.toLowerCase());

          logEvent('tengu_marketplace_updated', {
            marketplace_name: state.name as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          });
        }
      }

      // After marketplace clones are refreshed, bump installed plugins from
      // those marketplaces to the new version. Without this, the loader's
      // cache-on-miss (copyPluginToVersionedCache) creates the new version
      // dir on the next loadAllPlugins() call, but installed_plugins.json
      // stays on the old version — so cleanupOrphanedPluginVersionsInBackground
      // stamps the NEW dir with .orphaned_at on the next startup. See #29512.
      // updatePluginOp (called inside the helper) is what actually writes
      // installed_plugins.json via updateInstallationPathOnDisk.
      let updatedPluginCount = 0;
      if (refreshedMarketplaces.size > 0) {
        const updatedPluginIds = await updatePluginsForMarketplaces(refreshedMarketplaces);
        updatedPluginCount = updatedPluginIds.length;
      }

      // Clear caches after changes
      clearAllCaches();

      // 调用完成回调
      if (onManageComplete) {
        await onManageComplete();
      }

      // Reload marketplace data to show updated timestamps
      const config = await loadKnownMarketplacesConfig();
      const { enabled, disabled } = await loadAllPlugins();
      const allPlugins = [...enabled, ...disabled];

      const { marketplaces } = await loadMarketplacesWithGracefulDegradation(config);

      const newStates: MarketplaceState[] = [];
      for (const { name, config: entry, data: marketplace } of marketplaces) {
        const installedFromMarketplace = allPlugins.filter(plugin => plugin.source.endsWith(`@${name}`));

        newStates.push({
          name,
          source: getMarketplaceSourceDisplay(entry.source),
          lastUpdated: entry.lastUpdated,
          pluginCount: marketplace?.plugins.length,
          installedPlugins: installedFromMarketplace,
          pendingUpdate: false,
          pendingRemove: false,
          autoUpdate: isMarketplaceAutoUpdate(name, entry),
        });
      }

      // 排序：claude-plugin-directory 优先，然后按字母顺序
      newStates.sort((a, b) => {
        if (a.name === 'claude-plugin-directory') return -1;
        if (b.name === 'claude-plugin-directory') return 1;
        return a.name.localeCompare(b.name);
      });
      setMarketplaceStates(newStates);

      // 使用最新数据更新选定的市场引用
      if (wasInDetailsView && selectedMarketplace) {
        const updatedMarketplace = newStates.find(s => s.name === selectedMarketplace.name);
        if (updatedMarketplace) {
          setSelectedMarketplace(updatedMarketplace);
        }
      }

      // Build success message
      const actions: string[] = [];
      if (updatedCount > 0) {
        const pluginPart =
          updatedPluginCount > 0 ? ` (${updatedPluginCount} ${plural(updatedPluginCount, 'plugin')} bumped)` : '';
        actions.push(`Updated ${updatedCount} ${plural(updatedCount, 'marketplace')}${pluginPart}`);
      }
      if (removedCount > 0) {
        actions.push(`Removed ${removedCount} ${plural(removedCount, 'marketplace')}`);
      }

      if (actions.length > 0) {
        const successMsg = `${figures.tick} ${actions.join(', ')}`;
        // If we were in details view, stay there and show success
        if (wasInDetailsView) {
          setSuccessMessage(successMsg);
        } else {
          // Otherwise show result and exit to menu
          setResult(successMsg);
          setTimeout(setViewState, 2000, { type: 'menu' as const });
        }
      } else if (!wasInDetailsView) {
        setViewState({ type: 'menu' });
      }
    } catch (err) {
      const errorMsg = errorMessage(err);
      setProcessError(errorMsg);
      if (setError) {
        setError(errorMsg);
      }
    } finally {
      setIsProcessing(false);
      setProgressMessage(null);
    }
  };

  // 处理确认移除市场
  const confirmRemove = async () => {
    if (!selectedMarketplace) return;

    // 标记为待移除并应用
    const newStates = marketplaceStates.map(state =>
      state.name === selectedMarketplace.name ? { ...state, pendingRemove: true } : state,
    );
    setMarketplaceStates(newStates);
    await applyChanges(newStates);
  };

  // 为详情视图构建菜单选项
  const buildDetailsMenuOptions = (
    marketplace: MarketplaceState | null,
  ): Array<{ label: string; secondaryLabel?: string; value: string }> => {
    if (!marketplace) return [];

    const options: Array<{
      label: string;
      secondaryLabel?: string;
      value: string;
    }> = [
      {
        label: `浏览插件 (${marketplace.pluginCount ?? 0})`,
        value: 'browse',
      },
      {
        label: '更新市场',
        secondaryLabel: marketplace.lastUpdated
          ? `（最后更新于 ${new Date(marketplace.lastUpdated).toLocaleDateString()}）`
          : undefined,
        value: 'update',
      },
    ];

    // 仅当全局未禁用自动更新时，才显示自动更新开关
    if (!shouldSkipPluginAutoupdate()) {
      options.push({
        label: marketplace.autoUpdate ? 'Disable auto-update' : 'Enable auto-update',
        value: 'toggle-auto-update',
      });
    }

    options.push({ label: 'Remove marketplace', value: 'remove' });

    return options;
  };

  // 处理切换市场的自动更新设置
  const handleToggleAutoUpdate = async (marketplace: MarketplaceState) => {
    const newAutoUpdate = !marketplace.autoUpdate;
    try {
      await setMarketplaceAutoUpdate(marketplace.name, newAutoUpdate);

      // 更新本地状态
      setMarketplaceStates(prev =>
        prev.map(state => (state.name === marketplace.name ? { ...state, autoUpdate: newAutoUpdate } : state)),
      );

      // Update selected marketplace reference
      setSelectedMarketplace(prev => (prev ? { ...prev, autoUpdate: newAutoUpdate } : prev));
    } catch (err) {
      setProcessError(err instanceof Error ? err.message : 'Failed to update setting');
    }
  };

  // 在详情视图或确认移除视图中按退出键 — 返回列表
  useKeybinding(
    'confirm:no',
    () => {
      setInternalView('list');
      setDetailsMenuIndex(0);
    },
    {
      context: 'Confirmation',
      isActive: !isProcessing && (internalView === 'details' || internalView === 'confirm-remove'),
    },
  );

  // 在列表视图中按退出键且存在待处理更改 — 清除待处理更改
  useKeybinding(
    'confirm:no',
    () => {
      setMarketplaceStates(prev =>
        prev.map(state => ({
          ...state,
          pendingUpdate: false,
          pendingRemove: false,
        })),
      );
      setSelectedIndex(0);
    },
    {
      context: 'Confirmation',
      isActive: !isProcessing && internalView === 'list' && hasPendingChanges(),
    },
  );

  // 在列表视图中按退出键且无待处理更改 — 退出到父菜单
  useKeybinding(
    'confirm:no',
    () => {
      setViewState({ type: 'menu' });
    },
    {
      context: 'Confirmation',
      isActive: !isProcessing && internalView === 'list' && !hasPendingChanges(),
    },
  );

  // 列表视图 — 导航（通过可配置的按键绑定进行上/下/回车操作）
  useKeybindings(
    {
      'select:previous': () => setSelectedIndex(prev => Math.max(0, prev - 1)),
      'select:next': () => {
        const totalItems = marketplaceStates.length + 1;
        setSelectedIndex(prev => Math.min(totalItems - 1, prev + 1));
      },
      'select:accept': () => {
        const marketplaceIndex = selectedIndex - 1;
        if (selectedIndex === 0) {
          setViewState({ type: 'add-marketplace' });
        } else if (hasPendingChanges()) {
          void applyChanges();
        } else {
          const marketplace = marketplaceStates[marketplaceIndex];
          if (marketplace) {
            setSelectedMarketplace(marketplace);
            setInternalView('details');
            setDetailsMenuIndex(0);
          }
        }
      },
    },
    { context: 'Select', isActive: !isProcessing && internalView === 'list' },
  );

  // 列表视图 — 市场特定操作（u/r 快捷键）
  useInput(
    input => {
      const marketplaceIndex = selectedIndex - 1;
      if ((input === 'u' || input === 'U') && marketplaceIndex >= 0) {
        setMarketplaceStates(prev =>
          prev.map((state, idx) =>
            idx === marketplaceIndex
              ? {
                  ...state,
                  pendingUpdate: !state.pendingUpdate,
                  pendingRemove: state.pendingUpdate ? state.pendingRemove : false,
                }
              : state,
          ),
        );
      } else if ((input === 'r' || input === 'R') && marketplaceIndex >= 0) {
        const marketplace = marketplaceStates[marketplaceIndex];
        if (marketplace) {
          setSelectedMarketplace(marketplace);
          setInternalView('confirm-remove');
        }
      }
    },
    { isActive: !isProcessing && internalView === 'list' },
  );

  // 详情视图 — 导航
  useKeybindings(
    {
      'select:previous': () => setDetailsMenuIndex(prev => Math.max(0, prev - 1)),
      'select:next': () => {
        const menuOptions = buildDetailsMenuOptions(selectedMarketplace);
        setDetailsMenuIndex(prev => Math.min(menuOptions.length - 1, prev + 1));
      },
      'select:accept': () => {
        if (!selectedMarketplace) return;
        const menuOptions = buildDetailsMenuOptions(selectedMarketplace);
        const selectedOption = menuOptions[detailsMenuIndex];
        if (selectedOption?.value === 'browse') {
          setViewState({
            type: 'browse-marketplace',
            targetMarketplace: selectedMarketplace.name,
          });
        } else if (selectedOption?.value === 'update') {
          const newStates = marketplaceStates.map(state =>
            state.name === selectedMarketplace.name ? { ...state, pendingUpdate: true } : state,
          );
          setMarketplaceStates(newStates);
          void applyChanges(newStates);
        } else if (selectedOption?.value === 'toggle-auto-update') {
          void handleToggleAutoUpdate(selectedMarketplace);
        } else if (selectedOption?.value === 'remove') {
          setInternalView('confirm-remove');
        }
      },
    },
    {
      context: 'Select',
      isActive: !isProcessing && internalView === 'details',
    },
  );

  // 确认移除视图 — y/n 输入
  useInput(
    input => {
      if (input === 'y' || input === 'Y') {
        void confirmRemove();
      } else if (input === 'n' || input === 'N') {
        setInternalView('list');
        setSelectedMarketplace(null);
      }
    },
    { isActive: !isProcessing && internalView === 'confirm-remove' },
  );

  if (loading) {
    return <Text>Loading marketplaces…</Text>;
  }

  if (marketplaceStates.length === 0) {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>管理市场</Text>
        </Box>

        {/* 添加市场选项 */}
        <Box flexDirection="row" gap={1}>
          <Text color="suggestion">{figures.pointer} +</Text>
          <Text bold color="suggestion">
            添加市场
          </Text>
        </Box>

        <Box marginLeft={3}>
          <Text dimColor italic>
            {exitState.pending ? (
              <>Press {exitState.keyName} 再次返回</>
            ) : (
              <Byline>
                <ConfigurableShortcutHint
                  action="select:accept"
                  context="Select"
                  fallback="Enter"
                  description="select"
                />
                <ConfigurableShortcutHint
                  action="confirm:no"
                  context="Confirmation"
                  fallback="Esc"
                  description="返回"
                />
              </Byline>
            )}
          </Text>
        </Box>
      </Box>
    );
  }

  // 显示确认对话框
  if (internalView === 'confirm-remove' && selectedMarketplace) {
    const pluginCount = selectedMarketplace.installedPlugins?.length || 0;
    return (
      <Box flexDirection="column">
        <Text bold color="warning">
          移除市场<Text italic>{selectedMarketplace.name}</Text>?
        </Text>
        <Box flexDirection="column">
          {pluginCount > 0 && (
            <Box marginTop={1}>
              <Text color="warning">
                This will also uninstall {pluginCount} {plural(pluginCount, 'plugin')} from this marketplace:
              </Text>
            </Box>
          )}
          {selectedMarketplace.installedPlugins && selectedMarketplace.installedPlugins.length > 0 && (
            <Box flexDirection="column" marginTop={1} marginLeft={2}>
              {selectedMarketplace.installedPlugins.map(plugin => (
                <Text key={plugin.name} dimColor>
                  • {plugin.name}
                </Text>
              ))}
            </Box>
          )}
          <Box marginTop={1}>
            <Text>
              Press <Text bold>y</Text> to confirm or <Text bold>n</Text> to cancel
            </Text>
          </Box>
        </Box>
      </Box>
    );
  }

  // 显示市场详情
  if (internalView === 'details' && selectedMarketplace) {
    // Check if this marketplace is currently being processed
    // Check pendingUpdate first so we show updating state immediately when user presses Enter
    const isUpdating = selectedMarketplace.pendingUpdate || isProcessing;

    const menuOptions = buildDetailsMenuOptions(selectedMarketplace);

    return (
      <Box flexDirection="column">
        <Text bold>{selectedMarketplace.name}</Text>
        <Text dimColor>{selectedMarketplace.source}</Text>
        <Box marginTop={1}>
          <Text>
            {selectedMarketplace.pluginCount || 0} available {plural(selectedMarketplace.pluginCount || 0, 'plugin')}
          </Text>
        </Box>

        {/* Installed plugins section */}
        {selectedMarketplace.installedPlugins && selectedMarketplace.installedPlugins.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>
              Installed plugins ({selectedMarketplace.installedPlugins.length}
              ):
            </Text>
            <Box flexDirection="column" marginLeft={1}>
              {selectedMarketplace.installedPlugins.map(plugin => (
                <Box key={plugin.name} flexDirection="row" gap={1}>
                  <Text>{figures.bullet}</Text>
                  <Box flexDirection="column">
                    <Text>{plugin.name}</Text>
                    <Text dimColor>{plugin.manifest.description}</Text>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {/* 处理指示器 */}
        {isUpdating && (
          <Box marginTop={1} flexDirection="column">
            <Text color="claude">正在更新市场…</Text>
            {progressMessage && <Text dimColor>{progressMessage}</Text>}
          </Box>
        )}

        {/* 成功消息 */}
        {!isUpdating && successMessage && (
          <Box marginTop={1}>
            <Text color="claude">{successMessage}</Text>
          </Box>
        )}

        {/* 错误消息 */}
        {!isUpdating && processError && (
          <Box marginTop={1}>
            <Text color="error">{processError}</Text>
          </Box>
        )}

        {/* 菜单选项 */}
        {!isUpdating && (
          <Box flexDirection="column" marginTop={1}>
            {menuOptions.map((option, idx) => {
              if (!option) return null;
              const isSelected = idx === detailsMenuIndex;
              return (
                <Box key={option.value}>
                  <Text color={isSelected ? 'suggestion' : undefined}>
                    {isSelected ? figures.pointer : ' '} {option.label}
                  </Text>
                  {option.secondaryLabel && <Text dimColor> {option.secondaryLabel}</Text>}
                </Box>
              );
            })}
          </Box>
        )}

        {/* Show explanatory text at the bottom when auto-update is enabled */}
        {!isUpdating && !shouldSkipPluginAutoupdate() && selectedMarketplace.autoUpdate && (
          <Box marginTop={1}>
            <Text dimColor>
              Auto-update enabled. Claude Code will automatically update this marketplace and its installed plugins.
            </Text>
          </Box>
        )}

        <Box marginLeft={3}>
          <Text dimColor italic>
            {isUpdating ? (
              <>请稍候…</>
            ) : (
              <Byline>
                <ConfigurableShortcutHint
                  action="select:accept"
                  context="Select"
                  fallback="Enter"
                  description="select"
                />
                <ConfigurableShortcutHint
                  action="confirm:no"
                  context="Confirmation"
                  fallback="Esc"
                  description="返回"
                />
              </Byline>
            )}
          </Text>
        </Box>
      </Box>
    );
  }

  // Show marketplace list
  const { updateCount, removeCount } = getPendingCounts();

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>管理市场</Text>
      </Box>

      {/* 添加市场选项 */}
      <Box flexDirection="row" gap={1} marginBottom={1}>
        <Text color={selectedIndex === 0 ? 'suggestion' : undefined}>
          {selectedIndex === 0 ? figures.pointer : ' '} +
        </Text>
        <Text bold color={selectedIndex === 0 ? 'suggestion' : undefined}>
          添加市场
        </Text>
      </Box>

      {/* 市场列表 */}
      <Box flexDirection="column">
        {marketplaceStates.map((state, idx) => {
          const isSelected = idx + 1 === selectedIndex; // +1 because Add Marketplace is at index 0

          // Build status indicators
          const indicators: string[] = [];
          if (state.pendingUpdate) indicators.push('UPDATE');
          if (state.pendingRemove) indicators.push('REMOVE');

          return (
            <Box key={state.name} flexDirection="row" gap={1} marginBottom={1}>
              <Text color={isSelected ? 'suggestion' : undefined}>
                {isSelected ? figures.pointer : ' '} {state.pendingRemove ? figures.cross : figures.bullet}
              </Text>
              <Box flexDirection="column" flexGrow={1}>
                <Box flexDirection="row" gap={1}>
                  <Text bold strikethrough={state.pendingRemove} dimColor={state.pendingRemove}>
                    {state.name === 'claude-plugins-official' && <Text color="claude">✻ </Text>}
                    {state.name}
                    {state.name === 'claude-plugins-official' && <Text color="claude"> ✻</Text>}
                  </Text>
                  {indicators.length > 0 && <Text color="warning">[{indicators.join(', ')}]</Text>}
                </Box>
                <Text dimColor>{state.source}</Text>
                <Text dimColor>
                  {state.pluginCount !== undefined && <>{state.pluginCount} available</>}
                  {state.installedPlugins && state.installedPlugins.length > 0 && (
                    <> • {state.installedPlugins.length} installed</>
                  )}
                  {state.lastUpdated && <> • Updated {new Date(state.lastUpdated).toLocaleDateString()}</>}
                </Text>
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* 待处理更改摘要 */}
      {hasPendingChanges() && (
        <Box marginTop={1} flexDirection="column">
          <Text>
            <Text bold>Pending changes:</Text> <Text dimColor>Enter to apply</Text>
          </Text>
          {updateCount > 0 && (
            <Text>
              • 更新{updateCount} {plural(updateCount, 'marketplace')}
            </Text>
          )}
          {removeCount > 0 && (
            <Text color="warning">
              • 移除{removeCount} {plural(removeCount, 'marketplace')}
            </Text>
          )}
        </Box>
      )}

      {/* 处理指示器 */}
      {isProcessing && (
        <Box marginTop={1}>
          <Text color="claude">正在处理变更…</Text>
        </Box>
      )}

      {/* 错误显示 */}
      {processError && (
        <Box marginTop={1}>
          <Text color="error">{processError}</Text>
        </Box>
      )}

      <ManageMarketplacesKeyHints exitState={exitState} hasPendingActions={hasPendingChanges()} />
    </Box>
  );
}

type ManageMarketplacesKeyHintsProps = {
  exitState: Props['exitState'];
  hasPendingActions: boolean;
};

function ManageMarketplacesKeyHints({
  exitState,
  hasPendingActions,
}: ManageMarketplacesKeyHintsProps): React.ReactNode {
  if (exitState.pending) {
    return (
      <Box marginTop={1}>
        <Text dimColor italic>
          Press {exitState.keyName} 再次操作以返回
        </Text>
      </Box>
    );
  }

  return (
    <Box marginTop={1}>
      <Text dimColor italic>
        <Byline>
          {hasPendingActions && (
            <ConfigurableShortcutHint action="select:accept" context="Select" fallback="Enter" description="应用变更" />
          )}
          {!hasPendingActions && (
            <ConfigurableShortcutHint action="select:accept" context="Select" fallback="Enter" description="select" />
          )}
          {!hasPendingActions && <KeyboardShortcutHint shortcut="u" action="update" />}
          {!hasPendingActions && <KeyboardShortcutHint shortcut="r" action="remove" />}
          <ConfigurableShortcutHint
            action="confirm:no"
            context="Confirmation"
            fallback="Esc"
            description={hasPendingActions ? 'cancel' : '返回'}
          />
        </Byline>
      </Text>
    </Box>
  );
}
