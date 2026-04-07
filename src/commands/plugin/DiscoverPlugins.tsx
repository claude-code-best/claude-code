import figures from 'figures'
import * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ConfigurableShortcutHint } from '../../components/ConfigurableShortcutHint.js'
import { SearchBox } from '../../components/SearchBox.js'
import { Byline } from '@anthropic/ink'
import { useSearchInput } from '../../hooks/useSearchInput.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
// eslint-disable-next-line custom-rules/prefer-use-keybindings -- useInput needed for raw search mode text input
import { Box, Text, useInput, useTerminalFocus } from '@anthropic/ink'
import {
  useKeybinding,
  useKeybindings,
} from '../../keybindings/useKeybinding.js'
import type { LoadedPlugin } from '../../types/plugin.js'
import { count } from '../../utils/array.js'
import { openBrowser } from '../../utils/browser.js'
import { logForDebugging } from '../../utils/debug.js'
import { errorMessage } from '../../utils/errors.js'
import { clearAllCaches } from '../../utils/plugins/cacheUtils.js'
import {
  formatInstallCount,
  getInstallCounts,
} from '../../utils/plugins/installCounts.js'
import { isPluginGloballyInstalled } from '../../utils/plugins/installedPluginsManager.js'
import {
  createPluginId,
  detectEmptyMarketplaceReason,
  type EmptyMarketplaceReason,
  formatFailureDetails,
  formatMarketplaceLoadingErrors,
  loadMarketplacesWithGracefulDegradation,
} from '../../utils/plugins/marketplaceHelpers.js'
import { loadKnownMarketplacesConfig } from '../../utils/plugins/marketplaceManager.js'
import { OFFICIAL_MARKETPLACE_NAME } from '../../utils/plugins/officialMarketplace.js'
import { installPluginFromMarketplace } from '../../utils/plugins/pluginInstallationHelpers.js'
import { isPluginBlockedByPolicy } from '../../utils/plugins/pluginPolicy.js'
import { plural } from '../../utils/stringUtils.js'
import { truncateToWidth } from '../../utils/truncate.js'
import {
  findPluginOptionsTarget,
  PluginOptionsFlow,
} from './PluginOptionsFlow.js'
import { PluginTrustWarning } from './PluginTrustWarning.js'
import {
  buildPluginDetailsMenuOptions,
  extractGitHubRepo,
  type InstallablePlugin,
} from './pluginDetailsHelpers.js'
import type { ViewState as ParentViewState } from './types.js'
import { usePagination } from './usePagination.js'

type Props = {
  error: string | null
  setError: (error: string | null) => void
  result: string | null
  setResult: (result: string | null) => void
  setViewState: (state: ParentViewState) => void
  onInstallComplete?: () => void | Promise<void>
  onSearchModeChange?: (isActive: boolean) => void
  targetPlugin?: string
}

type ViewState =
  | 'plugin-list'
  | 'plugin-details'
  | { type: 'plugin-options'; plugin: LoadedPlugin; pluginId: string }

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
  const [viewState, setViewState] = useState<ViewState>('plugin-list')
  const [selectedPlugin, setSelectedPlugin] =
    useState<InstallablePlugin | null>(null)

  // Data state
  const [availablePlugins, setAvailablePlugins] = useState<InstallablePlugin[]>(
    [],
  )
  const [loading, setLoading] = useState(true)
  const [installCounts, setInstallCounts] = useState<Map<
    string,
    number
  > | null>(null)

  // Search state
  const [isSearchMode, setIsSearchModeRaw] = useState(false)
  const setIsSearchMode = useCallback(
    (active: boolean) => {
      setIsSearchModeRaw(active)
      onSearchModeChange?.(active)
    },
    [onSearchModeChange],
  )
  const {
    query: searchQuery,
    setQuery: setSearchQuery,
    cursorOffset: searchCursorOffset,
  } = useSearchInput({
    isActive: viewState === 'plugin-list' && isSearchMode && !loading,
    onExit: () => {
      setIsSearchMode(false)
    },
  })
  const isTerminalFocused = useTerminalFocus()
  const { columns: terminalWidth } = useTerminalSize()

  // Filter plugins based on search query
  const filteredPlugins = useMemo(() => {
    if (!searchQuery) return availablePlugins
    const lowerQuery = searchQuery.toLowerCase()
    return availablePlugins.filter(
      plugin =>
        plugin.entry.name.toLowerCase().includes(lowerQuery) ||
        plugin.entry.description?.toLowerCase().includes(lowerQuery) ||
        plugin.marketplaceName.toLowerCase().includes(lowerQuery),
    )
  }, [availablePlugins, searchQuery])

  // Selection state
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [selectedForInstall, setSelectedForInstall] = useState<Set<string>>(
    new Set(),
  )
  const [installingPlugins, setInstallingPlugins] = useState<Set<string>>(
    new Set(),
  )

  // Pagination for plugin list (continuous scrolling)
  const pagination = usePagination<InstallablePlugin>({
    totalItems: filteredPlugins.length,
    selectedIndex,
  })

  // Reset selection when search query changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [searchQuery])

  // Details view state
  const [detailsMenuIndex, setDetailsMenuIndex] = useState(0)
  const [isInstalling, setIsInstalling] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)

  // Warning state for non-critical errors
  const [warning, setWarning] = useState<string | null>(null)

  // Empty state reason
  const [emptyReason, setEmptyReason] = useState<EmptyMarketplaceReason | null>(
    null,
  )

  // Load all plugins from all marketplaces
  useEffect(() => {
    async function loadAllPlugins() {
      try {
        const config = await loadKnownMarketplacesConfig()

        // Load marketplaces with graceful degradation
        const { marketplaces, failures } =
          await loadMarketplacesWithGracefulDegradation(config)

        // Collect all plugins from all marketplaces
        const allPlugins: InstallablePlugin[] = []

        for (const { name, data: marketplace } of marketplaces) {
          if (marketplace) {
            for (const entry of marketplace.plugins) {
              const pluginId = createPluginId(entry.name, name)
              allPlugins.push({
                entry,
                marketplaceName: name,
                pluginId,
                // Only block when globally installed (user/managed scope).
                // Project/local-scope installs don't block — user may want to
                // promote to user scope so it's available everywhere (gh-29997).
                isInstalled: isPluginGloballyInstalled(pluginId),
              })
            }
          }
        }

        // Filter out installed and policy-blocked plugins
        const uninstalledPlugins = allPlugins.filter(
          p => !p.isInstalled && !isPluginBlockedByPolicy(p.pluginId),
        )

        // Fetch install counts and sort by popularity
        try {
          const counts = await getInstallCounts()
          setInstallCounts(counts)

          if (counts) {
            // Sort by install count (descending), then alphabetically
            uninstalledPlugins.sort((a, b) => {
              const countA = counts.get(a.pluginId) ?? 0
              const countB = counts.get(b.pluginId) ?? 0
              if (countA !== countB) return countB - countA
              return a.entry.name.localeCompare(b.entry.name)
            })
          } else {
            // No counts available - sort alphabetically
            uninstalledPlugins.sort((a, b) =>
              a.entry.name.localeCompare(b.entry.name),
            )
          }
        } catch (error) {
          // Log the error, then gracefully degrade to alphabetical sort
          logForDebugging(
            `Failed to fetch install counts: ${errorMessage(error)}`,
          )
          uninstalledPlugins.sort((a, b) =>
            a.entry.name.localeCompare(b.entry.name),
          )
        }

        setAvailablePlugins(uninstalledPlugins)

        // Detect empty reason if no plugins available
        const configuredCount = Object.keys(config).length
        if (uninstalledPlugins.length === 0) {
          const reason = await detectEmptyMarketplaceReason({
            configuredMarketplaceCount: configuredCount,
            failedMarketplaceCount: failures.length,
          })
          setEmptyReason(reason)
        }

        // Handle marketplace loading errors/warnings
        const successCount = count(marketplaces, m => m.data !== null)
        const errorResult = formatMarketplaceLoadingErrors(
          failures,
          successCount,
        )
        if (errorResult) {
          if (errorResult.type === 'warning') {
            setWarning(errorResult.message + '. Showing available plugins.')
          } else {
            throw new Error(errorResult.message)
          }
        }

        // Handle targetPlugin - navigate directly to plugin details
        // Search in allPlugins (before filtering) to handle installed plugins gracefully
        if (targetPlugin) {
          const foundPlugin = allPlugins.find(
            p => p.entry.name === targetPlugin,
          )

          if (foundPlugin) {
            if (foundPlugin.isInstalled) {
              setError(
                `Plugin '${foundPlugin.pluginId}' is already installed. Use '/plugin' to manage existing plugins.`,
              )
            } else {
              setSelectedPlugin(foundPlugin)
              setViewState('plugin-details')
            }
          } else {
            setError(`Plugin "${targetPlugin}" not found in any marketplace`)
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load plugins')
      } finally {
        setLoading(false)
      }
    }
    void loadAllPlugins()
  }, [setError, targetPlugin])

  // Install selected plugins
  const installSelectedPlugins = async () => {
    if (selectedForInstall.size === 0) return

    const pluginsToInstall = availablePlugins.filter(p =>
      selectedForInstall.has(p.pluginId),
    )

    setInstallingPlugins(new Set(pluginsToInstall.map(p => p.pluginId)))

    let successCount = 0
    let failureCount = 0
    const newFailedPlugins: Array<{ name: string; reason: string }> = []

    for (const plugin of pluginsToInstall) {
      const result = await installPluginFromMarketplace({
        pluginId: plugin.pluginId,
        entry: plugin.entry,
        marketplaceName: plugin.marketplaceName,
        scope: 'user',
      })

      if (result.success) {
        successCount++
      } else {
        failureCount++
        newFailedPlugins.push({
          name: plugin.entry.name,
          reason: result.error,
        })
      }
    }

    setInstallingPlugins(new Set())
    setSelectedForInstall(new Set())
    clearAllCaches()

    // Handle installation results
    if (failureCount === 0) {
      const message =
        `✓ Installed ${successCount} ${plural(successCount, 'plugin')}. ` +
        `Run /reload-plugins to activate.`
      setResult(message)
    } else if (successCount === 0) {
      setError(
        `Failed to install: ${formatFailureDetails(newFailedPlugins, true)}`,
      )
    } else {
      const message =
        `✓ Installed ${successCount} of ${successCount + failureCount} plugins. ` +
        `Failed: ${formatFailureDetails(newFailedPlugins, false)}. ` +
        `Run /reload-plugins to activate successfully installed plugins.`
      setResult(message)
    }

    if (successCount > 0) {
      if (onInstallComplete) {
        await onInstallComplete()
      }
    }

    setParentViewState({ type: 'menu' })
  }

  // Install single plugin from details view
  const handleSinglePluginInstall = async (
    plugin: InstallablePlugin,
    scope: 'user' | 'project' | 'local' = 'user',
  ) => {
    setIsInstalling(true)
    setInstallError(null)

    const result = await installPluginFromMarketplace({
      pluginId: plugin.pluginId,
      entry: plugin.entry,
      marketplaceName: plugin.marketplaceName,
      scope,
    })

    if (result.success) {
      const loaded = await findPluginOptionsTarget(plugin.pluginId)
      if (loaded) {
        setIsInstalling(false)
        setViewState({
          type: 'plugin-options',
          plugin: loaded,
          pluginId: plugin.pluginId,
        })
        return
      }
      setResult(result.message)
      if (onInstallComplete) {
        await onInstallComplete()
      }
      setParentViewState({ type: 'menu' })
    } else {
      setIsInstalling(false)
      setInstallError(result.error)
    }
  }

  // Handle error state
  useEffect(() => {
    if (error) {
      setResult(error)
    }
  }, [error, setResult])

  // Escape in plugin-details view - go back to plugin-list
  useKeybinding(
    'confirm:no',
    () => {
      setViewState('plugin-list')
      setSelectedPlugin(null)
    },
    {
      context: 'Confirmation',
      isActive: viewState === 'plugin-details',
    },
  )

  // Escape in plugin-list view (not search mode) - exit to parent menu
  useKeybinding(
    'confirm:no',
    () => {
      setParentViewState({ type: 'menu' })
    },
    {
      context: 'Confirmation',
      isActive: viewState === 'plugin-list' && !isSearchMode,
    },
  )

  // Handle entering search mode (non-escape keys)
  useInput(
    (input, _key) => {
      const keyIsNotCtrlOrMeta = !_key.ctrl && !_key.meta
      if (!isSearchMode) {
        // Enter search mode with '/' or any printable character
        if (input === '/' && keyIsNotCtrlOrMeta) {
          setIsSearchMode(true)
          setSearchQuery('')
        } else if (
          keyIsNotCtrlOrMeta &&
          input.length > 0 &&
          !/^\s+$/.test(input) &&
          // Don't enter search mode for navigation keys
          input !== 'j' &&
          input !== 'k' &&
          input !== 'i'
        ) {
          setIsSearchMode(true)
          setSearchQuery(input)
        }
      }
    },
    { isActive: viewState === 'plugin-list' && !loading },
  )

  // Plugin-list navigation (non-search mode)
  useKeybindings(
    {
      'select:previous': () => {
        if (selectedIndex === 0) {
          setIsSearchMode(true)
        } else {
          pagination.handleSelectionChange(selectedIndex - 1, setSelectedIndex)
        }
      },
      'select:next': () => {
        if (selectedIndex < filteredPlugins.length - 1) {
          pagination.handleSelectionChange(selectedIndex + 1, setSelectedIndex)
        }
      },
      'select:accept': () => {
        if (
          selectedIndex === filteredPlugins.length &&
          selectedForInstall.size > 0
        ) {
          void installSelectedPlugins()
        } else if (selectedIndex < filteredPlugins.length) {
          const plugin = filteredPlugins[selectedIndex]
          if (plugin) {
            if (plugin.isInstalled) {
              setParentViewState({
                type: 'manage-plugins',
                targetPlugin: plugin.entry.name,
                targetMarketplace: plugin.marketplaceName,
              })
            } else {
              setSelectedPlugin(plugin)
              setViewState('plugin-details')
              setDetailsMenuIndex(0)
              setInstallError(null)
            }
          }
        }
      },
    },
    {
      context: 'Select',
      isActive: viewState === 'plugin-list' && !isSearchMode,
    },
  )

  useKeybindings(
    {
      'plugin:toggle': () => {
        if (selectedIndex < filteredPlugins.length) {
          const plugin = filteredPlugins[selectedIndex]
          if (plugin && !plugin.isInstalled) {
            const newSelection = new Set(selectedForInstall)
            if (newSelection.has(plugin.pluginId)) {
              newSelection.delete(plugin.pluginId)
            } else {
              newSelection.add(plugin.pluginId)
            }
            setSelectedForInstall(newSelection)
          }
        }
      },
      'plugin:install': () => {
        if (selectedForInstall.size > 0) {
          void installSelectedPlugins()
        }
      },
    },
    {
      context: 'Plugin',
      isActive: viewState === 'plugin-list' && !isSearchMode,
    },
  )

  // Plugin-details navigation
  const detailsMenuOptions = React.useMemo(() => {
    if (!selectedPlugin) return []
    const hasHomepage = selectedPlugin.entry.homepage
    const githubRepo = extractGitHubRepo(selectedPlugin)
    return buildPluginDetailsMenuOptions(hasHomepage, githubRepo)
  }, [selectedPlugin])

  useKeybindings(
    {
      'select:previous': () => {
        if (detailsMenuIndex > 0) {
          setDetailsMenuIndex(detailsMenuIndex - 1)
        }
      },
      'select:next': () => {
        if (detailsMenuIndex < detailsMenuOptions.length - 1) {
          setDetailsMenuIndex(detailsMenuIndex + 1)
        }
      },
      'select:accept': () => {
        if (!selectedPlugin) return
        const action = detailsMenuOptions[detailsMenuIndex]?.action
        const hasHomepage = selectedPlugin.entry.homepage
        const githubRepo = extractGitHubRepo(selectedPlugin)
        if (action === 'install-user') {
          void handleSinglePluginInstall(selectedPlugin, 'user')
        } else if (action === 'install-project') {
          void handleSinglePluginInstall(selectedPlugin, 'project')
        } else if (action === 'install-local') {
          void handleSinglePluginInstall(selectedPlugin, 'local')
        } else if (action === 'homepage' && hasHomepage) {
          void openBrowser(hasHomepage)
        } else if (action === 'github' && githubRepo) {
          void openBrowser(`https://github.com/${githubRepo}`)
        } else if (action === 'back') {
          setViewState('plugin-list')
          setSelectedPlugin(null)
        }
      },
    },
    {
      context: 'Select',
      isActive: viewState === 'plugin-details' && !!selectedPlugin,
    },
  )

  if (typeof viewState === 'object' && viewState.type === 'plugin-options') {
    const { plugin, pluginId } = viewState
    function finish(msg: string): void {
      setResult(msg)
      if (onInstallComplete) {
        void onInstallComplete()
      }
      setParentViewState({ type: 'menu' })
    }
    return (
      <PluginOptionsFlow
        plugin={plugin}
        pluginId={pluginId}
        onDone={(outcome, detail) => {
          switch (outcome) {
            case 'configured':
              finish(
                `✓ Installed and configured ${plugin.name}. Run /reload-plugins to apply.`,
              )
              break
            case 'skipped':
              finish(
                `✓ Installed ${plugin.name}. Run /reload-plugins to apply.`,
              )
              break
            case 'error':
              finish(`Installed but failed to save config: ${detail}`)
              break
          }
        }}
      />
    )
  }

  // Loading state
  if (loading) {
    return <Text>Loading…</Text>
  }

  // Error state
  if (error) {
    return <Text color="error">{error}</Text>
  }

  // Plugin details view
  if (viewState === 'plugin-details' && selectedPlugin) {
    const hasHomepage = selectedPlugin.entry.homepage
    const githubRepo = extractGitHubRepo(selectedPlugin)

    const menuOptions = buildPluginDetailsMenuOptions(hasHomepage, githubRepo)

    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>Plugin details</Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Text bold>{selectedPlugin.entry.name}</Text>
          <Text dimColor>from {selectedPlugin.marketplaceName}</Text>
          {selectedPlugin.entry.version && (
            <Text dimColor>Version: {selectedPlugin.entry.version}</Text>
          )}
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
                {isInstalling && option.action.startsWith('install-')
                  ? 'Installing…'
                  : option.label}
              </Text>
            </Box>
          ))}
        </Box>

        <Box marginTop={1}>
          <Text dimColor>
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
                description="back"
              />
            </Byline>
          </Text>
        </Box>
      </Box>
    )
  }

  // Empty state
  if (availablePlugins.length === 0) {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>Discover plugins</Text>
        </Box>
        <EmptyStateMessage reason={emptyReason} />
        <Box marginTop={1}>
          <Text dimColor italic>
            Esc to go back
          </Text>
        </Box>
      </Box>
    )
  }

  // Get visible plugins from pagination
  const visiblePlugins = pagination.getVisibleItems(filteredPlugins)

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>Discover plugins</Text>
        {pagination.needsPagination && (
          <Text dimColor>
            {' '}
            ({pagination.scrollPosition.current}/
            {pagination.scrollPosition.total})
          </Text>
        )}
      </Box>

      {/* Search box */}
      <Box marginBottom={1}>
        <SearchBox
          query={searchQuery}
          isFocused={isSearchMode}
          isTerminalFocused={isTerminalFocused}
          width={terminalWidth - 4}
          cursorOffset={searchCursorOffset}
        />
      </Box>

      {/* Warning banner */}
      {warning && (
        <Box marginBottom={1}>
          <Text color="warning">
            {figures.warning} {warning}
          </Text>
        </Box>
      )}

      {/* No search results */}
      {filteredPlugins.length === 0 && searchQuery && (
        <Box marginBottom={1}>
          <Text dimColor>No plugins match &quot;{searchQuery}&quot;</Text>
        </Box>
      )}

      {/* Scroll up indicator */}
      {pagination.scrollPosition.canScrollUp && (
        <Box>
          <Text dimColor> {figures.arrowUp} more above</Text>
        </Box>
      )}

      {/* Plugin list - use startIndex in key to force re-render on scroll */}
      {visiblePlugins.map((plugin, visibleIndex) => {
        const actualIndex = pagination.toActualIndex(visibleIndex)
        const isSelected = selectedIndex === actualIndex
        const isSelectedForInstall = selectedForInstall.has(plugin.pluginId)
        const isInstallingThis = installingPlugins.has(plugin.pluginId)
        const isLast = visibleIndex === visiblePlugins.length - 1

        return (
          <Box
            key={`${pagination.startIndex}-${plugin.pluginId}`}
            flexDirection="column"
            marginBottom={isLast && !error ? 0 : 1}
          >
            <Box>
              <Text
                color={isSelected && !isSearchMode ? 'suggestion' : undefined}
              >
                {isSelected && !isSearchMode ? figures.pointer : ' '}{' '}
              </Text>
              <Text>
                {isInstallingThis
                  ? figures.ellipsis
                  : isSelectedForInstall
                    ? figures.radioOn
                    : figures.radioOff}{' '}
                {plugin.entry.name}
                <Text dimColor> · {plugin.marketplaceName}</Text>
                {plugin.entry.tags?.includes('community-managed') && (
                  <Text dimColor> [Community Managed]</Text>
                )}
                {installCounts &&
                  plugin.marketplaceName === OFFICIAL_MARKETPLACE_NAME && (
                    <Text dimColor>
                      {' · '}
                      {formatInstallCount(
                        installCounts.get(plugin.pluginId) ?? 0,
                      )}{' '}
                      installs
                    </Text>
                  )}
              </Text>
            </Box>
            {plugin.entry.description && (
              <Box marginLeft={4}>
                <Text dimColor>
                  {truncateToWidth(plugin.entry.description, 60)}
                </Text>
              </Box>
            )}
          </Box>
        )
      })}

      {/* Scroll down indicator */}
      {pagination.scrollPosition.canScrollDown && (
        <Box>
          <Text dimColor> {figures.arrowDown} more below</Text>
        </Box>
      )}

      {/* Error messages */}
      {error && (
        <Box marginTop={1}>
          <Text color="error">
            {figures.cross} {error}
          </Text>
        </Box>
      )}

      <DiscoverPluginsKeyHint
        hasSelection={selectedForInstall.size > 0}
        canToggle={
          selectedIndex < filteredPlugins.length &&
          !filteredPlugins[selectedIndex]?.isInstalled
        }
      />
    </Box>
  )
}

function DiscoverPluginsKeyHint({
  hasSelection,
  canToggle,
}: {
  hasSelection: boolean
  canToggle: boolean
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
          <Text>type to search</Text>
          {canToggle && (
            <ConfigurableShortcutHint
              action="plugin:toggle"
              context="Plugin"
              fallback="Space"
              description="toggle"
            />
          )}
          <ConfigurableShortcutHint
            action="select:accept"
            context="Select"
            fallback="Enter"
            description="details"
          />
          <ConfigurableShortcutHint
            action="confirm:no"
            context="Confirmation"
            fallback="Esc"
            description="back"
          />
        </Byline>
      </Text>
    </Box>
  )
}

/**
 * Context-aware empty state message for the Discover screen
 */
function EmptyStateMessage({
  reason,
}: {
  reason: EmptyMarketplaceReason | null
}): React.ReactNode {
  switch (reason) {
    case 'git-not-installed':
      return (
        <>
          <Text dimColor>Git is required to install marketplaces.</Text>
          <Text dimColor>Please install git and restart Claude Code.</Text>
        </>
      )
    case 'all-blocked-by-policy':
      return (
        <>
          <Text dimColor>
            Your organization policy does not allow any external marketplaces.
          </Text>
          <Text dimColor>Contact your administrator.</Text>
        </>
      )
    case 'policy-restricts-sources':
      return (
        <>
          <Text dimColor>
            Your organization restricts which marketplaces can be added.
          </Text>
          <Text dimColor>
            Switch to the Marketplaces tab to view allowed sources.
          </Text>
        </>
      )
    case 'all-marketplaces-failed':
      return (
        <>
          <Text dimColor>Failed to load marketplace data.</Text>
          <Text dimColor>Check your network connection.</Text>
        </>
      )
    case 'all-plugins-installed':
      return (
        <>
          <Text dimColor>All available plugins are already installed.</Text>
          <Text dimColor>
            Check for new plugins later or add more marketplaces.
          </Text>
        </>
      )
    case 'no-marketplaces-configured':
    default:
      return (
        <>
          <Text dimColor>No plugins available.</Text>
          <Text dimColor>
            Add a marketplace first using the Marketplaces tab.
          </Text>
        </>
      )
  }
}
