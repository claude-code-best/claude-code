import chalk from 'chalk'
import figures from 'figures'
import Fuse from 'fuse.js'
import React from 'react'
import { getOriginalCwd, getSessionId } from '../bootstrap/state.js'
import { useExitOnCtrlCDWithKeybindings } from '../hooks/useExitOnCtrlCDWithKeybindings.js'
import { useSearchInput } from '../hooks/useSearchInput.js'
import { useTerminalSize } from '../hooks/useTerminalSize.js'
import { applyColor } from '../ink/colorize.js'
import type { Color } from '../ink/styles.js'
import { Box, Text, useInput, useTerminalFocus, useTheme } from '../ink.js'
import { useKeybinding } from '../keybindings/useKeybinding.js'
import { logEvent } from '../services/analytics/index.js'
import type { LogOption, SerializedMessage } from '../types/logs.js'
import { formatLogMetadata, truncateToWidth } from '../utils/format.js'
import { getWorktreePaths } from '../utils/getWorktreePaths.js'
import { getBranch } from '../utils/git.js'
import { getLogDisplayTitle } from '../utils/log.js'
import {
  getFirstMeaningfulUserMessageTextContent,
  getSessionIdFromLog,
  isCustomTitleEnabled,
  saveCustomTitle,
} from '../utils/sessionStorage.js'
import { getTheme } from '../utils/theme.js'
import { ConfigurableShortcutHint } from './ConfigurableShortcutHint.js'
import { Select } from './CustomSelect/select.js'
import { Byline } from './design-system/Byline.js'
import { Divider } from './design-system/Divider.js'
import { KeyboardShortcutHint } from './design-system/KeyboardShortcutHint.js'
import { SearchBox } from './SearchBox.js'
import { SessionPreview } from './SessionPreview.js'
import { Spinner } from './Spinner.js'
import { TagTabs } from './TagTabs.js'
import TextInput from './TextInput.js'
import { type TreeNode, TreeSelect } from './ui/TreeSelect.js'

type AgenticSearchState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'results'; results: LogOption[]; query: string }
  | { status: 'error'; message: string }

export type LogSelectorProps = {
  logs: LogOption[]
  maxHeight?: number
  forceWidth?: number
  onCancel?: () => void
  onSelect: (log: LogOption) => void
  onLogsChanged?: () => void
  onLoadMore?: (count: number) => void
  initialSearchQuery?: string
  showAllProjects?: boolean
  onToggleAllProjects?: () => void
  onAgenticSearch?: (
    query: string,
    logs: LogOption[],
    signal?: AbortSignal,
  ) => Promise<LogOption[]>
}

type LogTreeNode = TreeNode<{ log: LogOption; indexInFiltered: number }>

function normalizeAndTruncateToWidth(text: string, maxWidth: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  return truncateToWidth(normalized, maxWidth)
}

// Width of prefixes that TreeSelect will add
const PARENT_PREFIX_WIDTH = 2 // '▼ ' or '▶ '
const CHILD_PREFIX_WIDTH = 4 // '  ▸ '

// Deep search constants
const DEEP_SEARCH_MAX_MESSAGES = 2000
const DEEP_SEARCH_CROP_SIZE = 1000
const DEEP_SEARCH_MAX_TEXT_LENGTH = 50000 // Cap searchable text per session
const FUSE_THRESHOLD = 0.3
const DATE_TIE_THRESHOLD_MS = 60 * 1000 // 1 minute - use relevance as tie-breaker within this window
const SNIPPET_CONTEXT_CHARS = 50 // Characters to show before/after match

type Snippet = { before: string; match: string; after: string }

function formatSnippet(
  { before, match, after }: Snippet,
  highlightColor: (text: string) => string,
): string {
  return chalk.dim(before) + highlightColor(match) + chalk.dim(after)
}

function extractSnippet(
  text: string,
  query: string,
  contextChars: number,
): Snippet | null {
  // Find exact query occurrence (case-insensitive).
  // Note: Fuse does fuzzy matching, so this may miss some fuzzy matches.
  // This is acceptable for now - in the future we could use Fuse's includeMatches
  // option and work with the match indices directly.
  const matchIndex = text.toLowerCase().indexOf(query.toLowerCase())
  if (matchIndex === -1) return null

  const matchEnd = matchIndex + query.length
  const snippetStart = Math.max(0, matchIndex - contextChars)
  const snippetEnd = Math.min(text.length, matchEnd + contextChars)

  const beforeRaw = text.slice(snippetStart, matchIndex)
  const matchText = text.slice(matchIndex, matchEnd)
  const afterRaw = text.slice(matchEnd, snippetEnd)

  return {
    before:
      (snippetStart > 0 ? '…' : '') +
      beforeRaw.replace(/\s+/g, ' ').trimStart(),
    match: matchText.trim(),
    after:
      afterRaw.replace(/\s+/g, ' ').trimEnd() +
      (snippetEnd < text.length ? '…' : ''),
  }
}

function buildLogLabel(
  log: LogOption,
  maxLabelWidth: number,
  options?: {
    isGroupHeader?: boolean
    isChild?: boolean
    forkCount?: number
  },
): string {
  const {
    isGroupHeader = false,
    isChild = false,
    forkCount = 0,
  } = options || {}

  // TreeSelect will add the prefix, so we just need to account for its width
  const prefixWidth =
    isGroupHeader && forkCount > 0
      ? PARENT_PREFIX_WIDTH
      : isChild
        ? CHILD_PREFIX_WIDTH
        : 0

  const sessionCountSuffix =
    isGroupHeader && forkCount > 0
      ? ` (+${forkCount} other ${forkCount === 1 ? 'session' : 'sessions'})`
      : ''

  const sidechainSuffix = log.isSidechain ? ' (sidechain)' : ''

  const maxSummaryWidth =
    maxLabelWidth -
    prefixWidth -
    sidechainSuffix.length -
    sessionCountSuffix.length
  const truncatedSummary = normalizeAndTruncateToWidth(
    getLogDisplayTitle(log),
    maxSummaryWidth,
  )
  return `${truncatedSummary}${sidechainSuffix}${sessionCountSuffix}`
}

function buildLogMetadata(
  log: LogOption,
  options?: { isChild?: boolean; showProjectPath?: boolean },
): string {
  const { isChild = false, showProjectPath = false } = options || {}
  // Match the child prefix width for proper alignment
  const childPadding = isChild ? '    ' : '' // 4 spaces to match '  ▸ '
  const baseMetadata = formatLogMetadata(log)
  const projectSuffix =
    showProjectPath && log.projectPath ? ` · ${log.projectPath}` : ''
  return childPadding + baseMetadata + projectSuffix
}

export function LogSelector({
  logs,
  maxHeight = Infinity,
  forceWidth,
  onCancel,
  onSelect,
  onLogsChanged,
  onLoadMore,
  initialSearchQuery,
  showAllProjects = false,
  onToggleAllProjects,
  onAgenticSearch,
}: LogSelectorProps): React.ReactNode {
  const terminalSize = useTerminalSize()
  const columns = forceWidth === undefined ? terminalSize.columns : forceWidth
  const exitState = useExitOnCtrlCDWithKeybindings(onCancel)
  const isTerminalFocused = useTerminalFocus()
  const isResumeWithRenameEnabled = isCustomTitleEnabled()
  const isDeepSearchEnabled = process.env.USER_TYPE === 'ant'
  const [themeName] = useTheme()
  const theme = getTheme(themeName)
  const highlightColor = React.useMemo(
    () => (text: string) => applyColor(text, theme.warning as Color),
    [theme.warning],
  )
  const isAgenticSearchEnabled = process.env.USER_TYPE === 'ant'

  const [currentBranch, setCurrentBranch] = React.useState<string | null>(null)
  const [branchFilterEnabled, setBranchFilterEnabled] = React.useState(false)
  const [showAllWorktrees, setShowAllWorktrees] = React.useState(false)
  const [hasMultipleWorktrees, setHasMultipleWorktrees] = React.useState(false)
  const currentCwd = React.useMemo(() => getOriginalCwd(), [])
  const [renameValue, setRenameValue] = React.useState('')
  const [renameCursorOffset, setRenameCursorOffset] = React.useState(0)
  const [expandedGroupSessionIds, setExpandedGroupSessionIds] = React.useState<
    Set<string>
  >(new Set())
  const [focusedNode, setFocusedNode] = React.useState<LogTreeNode | null>(null)
  // Track focused index for scroll position display in title
  const [focusedIndex, setFocusedIndex] = React.useState(1)
  const [viewMode, setViewMode] = React.useState<
    'list' | 'preview' | 'rename' | 'search'
  >('list')
  const [previewLog, setPreviewLog] = React.useState<LogOption | null>(null)
  const prevFocusedIdRef = React.useRef<string | null>(null)
  const [selectedTagIndex, setSelectedTagIndex] = React.useState(0)

  // Agentic search state
  const [agenticSearchState, setAgenticSearchState] =
    React.useState<AgenticSearchState>({ status: 'idle' })
  // Track if the "Search deeply using Claude" option is focused
  const [isAgenticSearchOptionFocused, setIsAgenticSearchOptionFocused] =
    React.useState(false)
  // AbortController for cancelling agentic search
  const agenticSearchAbortRef = React.useRef<AbortController | null>(null)

  const {
    query: searchQuery,
    setQuery: setSearchQuery,
    cursorOffset: searchCursorOffset,
  } = useSearchInput({
    isActive:
      viewMode === 'search' && agenticSearchState.status !== 'searching',
    onExit: () => {
      setViewMode('list')
      logEvent('tengu_session_search_toggled', { enabled: false })
    },
    onExitUp: () => {
      setViewMode('list')
      logEvent('tengu_session_search_toggled', { enabled: false })
    },
    passthroughCtrlKeys: ['n'],
    initialQuery: initialSearchQuery || '',
  })

  // Debounce transcript search for performance (title search is instant)
  const deferredSearchQuery = React.useDeferredValue(searchQuery)

  // Additional debounce for deep search - wait 300ms after typing stops
  const [debouncedDeepSearchQuery, setDebouncedDeepSearchQuery] =
    React.useState('')
  React.useEffect(() => {
    if (!deferredSearchQuery) {
      setDebouncedDeepSearchQuery('')
      return
    }
    const timeoutId = setTimeout(
      setDebouncedDeepSearchQuery,
      300,
      deferredSearchQuery,
    )
    return () => clearTimeout(timeoutId)
  }, [deferredSearchQuery])

  // State for async deep search results
  const [deepSearchResults, setDeepSearchResults] = React.useState<{
    results: Array<{ log: LogOption; score?: number; searchableText: string }>
    query: string
  } | null>(null)
  const [isSearching, setIsSearching] = React.useState(false)

  React.useEffect(() => {
    void getBranch().then(branch => setCurrentBranch(branch))
    void getWorktreePaths(currentCwd).then(paths => {
      setHasMultipleWorktrees(paths.length > 1)
    })
  }, [currentCwd])

  // Memoize searchable text extraction - only recompute when logs change
  const searchableTextByLog = React.useMemo(
    () => new Map(logs.map(log => [log, buildSearchableText(log)])),
    [logs],
  )

  // Pre-build Fuse index once when logs change (not on every search query)
  const fuseIndex = React.useMemo(() => {
    if (!isDeepSearchEnabled) return null

    const logsWithText = logs
      .map(log => ({
        log,
        searchableText: searchableTextByLog.get(log) ?? '',
      }))
      .filter(item => item.searchableText)

    return new Fuse(logsWithText, {
      keys: ['searchableText'],
      threshold: FUSE_THRESHOLD,
      ignoreLocation: true,
      includeScore: true,
    })
  }, [logs, searchableTextByLog, isDeepSearchEnabled])

  // Compute unique tags from logs (before any filtering)
  const uniqueTags = React.useMemo(() => getUniqueTags(logs), [logs])
  const hasTags = uniqueTags.length > 0
  const tagTabs = React.useMemo(
    () => (hasTags ? ['All', ...uniqueTags] : []),
    [hasTags, uniqueTags],
  )

  // Clamp out-of-bounds index (e.g., after logs change) without an extra render
  const effectiveTagIndex =
    tagTabs.length > 0 && selectedTagIndex < tagTabs.length
      ? selectedTagIndex
      : 0
  const selectedTab = tagTabs[effectiveTagIndex]
  const tagFilter = selectedTab === 'All' ? undefined : selectedTab

  // Tag tabs are now a single line with horizontal scrolling
  const tagTabsLines = hasTags ? 1 : 0

  // Base filtering (instant) - applies tag, branch, and resume filters
  const baseFilteredLogs = React.useMemo(() => {
    let filtered = logs
    if (isResumeWithRenameEnabled) {
      filtered = logs.filter(log => {
        const currentSessionId = getSessionId()
        const logSessionId = getSessionIdFromLog(log)
        const isCurrentSession =
          currentSessionId && logSessionId === currentSessionId
        // Always show current session
        if (isCurrentSession) {
          return true
        }
        // Always show sessions with custom titles (e.g., loop mode sessions)
        if (log.customTitle) {
          return true
        }
        // For full logs, check messages array
        const fromMessages = getFirstMeaningfulUserMessageTextContent(
          log.messages,
        )
        if (fromMessages) {
          return true
        }
        // All logs reaching this component are enriched — include if
        // they have a prompt or custom title
        if (log.firstPrompt || log.customTitle) {
          return true
        }
        return false
      })
    }

    // Apply tag filter if specified
    if (tagFilter !== undefined) {
      filtered = filtered.filter(log => log.tag === tagFilter)
    }

    if (branchFilterEnabled && currentBranch) {
      filtered = filtered.filter(log => log.gitBranch === currentBranch)
    }

    if (hasMultipleWorktrees && !showAllWorktrees) {
      filtered = filtered.filter(log => log.projectPath === currentCwd)
    }

    return filtered
  }, [
    logs,
    isResumeWithRenameEnabled,
    tagFilter,
    branchFilterEnabled,
    currentBranch,
    hasMultipleWorktrees,
    showAllWorktrees,
    currentCwd,
  ])

  // Instant title/branch/tag/PR filtering (runs on every keystroke, but is fast)
  const titleFilteredLogs = React.useMemo(() => {
    if (!searchQuery) {
      return baseFilteredLogs
    }
    const query = searchQuery.toLowerCase()
    return baseFilteredLogs.filter(log => {
      const displayedTitle = getLogDisplayTitle(log).toLowerCase()
      const branch = (log.gitBranch || '').toLowerCase()
      const tag = (log.tag || '').toLowerCase()
      const prInfo = log.prNumber
        ? `pr #${log.prNumber} ${log.prRepository || ''}`.toLowerCase()
        : ''
      return (
        displayedTitle.includes(query) ||
        branch.includes(query) ||
        tag.includes(query) ||
        prInfo.includes(query)
      )
    })
  }, [baseFilteredLogs, searchQuery])

  // Show searching indicator when query is pending debounce
  React.useEffect(() => {
    if (
      isDeepSearchEnabled &&
      deferredSearchQuery &&
      deferredSearchQuery !== debouncedDeepSearchQuery
    ) {
      setIsSearching(true)
    }
  }, [deferredSearchQuery, debouncedDeepSearchQuery, isDeepSearchEnabled])

  // Async deep search effect - runs after 300ms debounce
  React.useEffect(() => {
    if (!isDeepSearchEnabled || !debouncedDeepSearchQuery || !fuseIndex) {
      setDeepSearchResults(null)
      setIsSearching(false)
      return
    }

    // Use setTimeout(0) to yield to the event loop - prevents UI freeze
    const timeoutId = setTimeout(
      (
        fuseIndex,
        debouncedDeepSearchQuery,
        setDeepSearchResults,
        setIsSearching,
      ) => {
        const results = fuseIndex.search(debouncedDeepSearchQuery)

        // Sort by date (newest first), with relevance as tie-breaker within same minute
        results.sort((a, b) => {
          const aTime = new Date(a.item.log.modified).getTime()
          const bTime = new Date(b.item.log.modified).getTime()
          const timeDiff = bTime - aTime
          if (Math.abs(timeDiff) > DATE_TIE_THRESHOLD_MS) {
            return timeDiff
          }
          // Within same minute window, use relevance score (lower is better)
          return (a.score ?? 1) - (b.score ?? 1)
        })

        setDeepSearchResults({
          results: results.map(r => ({
            log: r.item.log,
            score: r.score,
            searchableText: r.item.searchableText,
          })),
          query: debouncedDeepSearchQuery,
        })
        setIsSearching(false)
      },
      0,
      fuseIndex,
      debouncedDeepSearchQuery,
      setDeepSearchResults,
      setIsSearching,
    )

    return () => {
      clearTimeout(timeoutId)
    }
  }, [debouncedDeepSearchQuery, fuseIndex, isDeepSearchEnabled])

  // Merge title matches with async deep search results
  const { filteredLogs, snippets } = React.useMemo(() => {
    const snippetMap = new Map<LogOption, Snippet>()

    // Start with instant title matches
    let filtered = titleFilteredLogs

    // Merge in deep search results if available and query matches
    if (
      deepSearchResults &&
      debouncedDeepSearchQuery &&
      deepSearchResults.query === debouncedDeepSearchQuery
    ) {
      // Extract snippets from deep search results
      for (const result of deepSearchResults.results) {
        if (result.searchableText) {
          const snippet = extractSnippet(
            result.searchableText,
            debouncedDeepSearchQuery,
            SNIPPET_CONTEXT_CHARS,
          )
          if (snippet) {
            snippetMap.set(result.log, snippet)
          }
        }
      }

      // Add transcript-only matches (not already in title matches)
      const titleMatchIds = new Set(filtered.map(log => log.messages[0]?.uuid))
      const transcriptOnlyMatches = deepSearchResults.results
        .map(r => r.log)
        .filter(log => !titleMatchIds.has(log.messages[0]?.uuid))
      filtered = [...filtered, ...transcriptOnlyMatches]
    }

    return { filteredLogs: filtered, snippets: snippetMap }
  }, [titleFilteredLogs, deepSearchResults, debouncedDeepSearchQuery])

  // Use agentic search results when available and non-empty, otherwise use regular filtered logs
  const displayedLogs = React.useMemo(() => {
    if (
      agenticSearchState.status === 'results' &&
      agenticSearchState.results.length > 0
    ) {
      return agenticSearchState.results
    }
    return filteredLogs
  }, [agenticSearchState, filteredLogs])

  // Calculate available width for the summary text
  const maxLabelWidth = Math.max(30, columns - 4)

  // Build tree nodes for grouped view
  const treeNodes = React.useMemo<LogTreeNode[]>(() => {
    if (!isResumeWithRenameEnabled) {
      return []
    }

    const sessionGroups = groupLogsBySessionId(displayedLogs)

    return Array.from(sessionGroups.entries()).map(
      ([sessionId, groupLogs]): LogTreeNode => {
        const latestLog = groupLogs[0]!
        const indexInFiltered = displayedLogs.indexOf(latestLog)
        const snippet = snippets.get(latestLog)
        const snippetStr = snippet
          ? formatSnippet(snippet, highlightColor)
          : null

        if (groupLogs.length === 1) {
          // Single log - no children
          const metadata = buildLogMetadata(latestLog, {
            showProjectPath: showAllProjects,
          })
          return {
            id: `log:${sessionId}:0`,
            value: { log: latestLog, indexInFiltered },
            label: buildLogLabel(latestLog, maxLabelWidth),
            description: snippetStr ? `${metadata}\n  ${snippetStr}` : metadata,
            dimDescription: true,
          }
        }

        // Multiple logs - parent with children
        const forkCount = groupLogs.length - 1
        const children: LogTreeNode[] = groupLogs.slice(1).map((log, index) => {
          const childIndexInFiltered = displayedLogs.indexOf(log)
          const childSnippet = snippets.get(log)
          const childSnippetStr = childSnippet
            ? formatSnippet(childSnippet, highlightColor)
            : null
          const childMetadata = buildLogMetadata(log, {
            isChild: true,
            showProjectPath: showAllProjects,
          })
          return {
            id: `log:${sessionId}:${index + 1}`,
            value: { log, indexInFiltered: childIndexInFiltered },
            label: buildLogLabel(log, maxLabelWidth, { isChild: true }),
            description: childSnippetStr
              ? `${childMetadata}\n      ${childSnippetStr}`
              : childMetadata,
            dimDescription: true,
          }
        })

        const parentMetadata = buildLogMetadata(latestLog, {
          showProjectPath: showAllProjects,
        })
        return {
          id: `group:${sessionId}`,
          value: { log: latestLog, indexInFiltered },
          label: buildLogLabel(latestLog, maxLabelWidth, {
            isGroupHeader: true,
            forkCount,
          }),
          description: snippetStr
            ? `${parentMetadata}\n  ${snippetStr}`
            : parentMetadata,
          dimDescription: true,
          children,
        }
      },
    )
  }, [
    isResumeWithRenameEnabled,
    displayedLogs,
    maxLabelWidth,
    showAllProjects,
    snippets,
    highlightColor,
  ])

  // Build options for old flat list view
  const flatOptions = React.useMemo(() => {
    if (isResumeWithRenameEnabled) {
      return []
    }

    return displayedLogs.map((log, index) => {
      const rawSummary = getLogDisplayTitle(log)
      const summaryWithSidechain =
        rawSummary + (log.isSidechain ? ' (sidechain)' : '')
      const summary = normalizeAndTruncateToWidth(
        summaryWithSidechain,
        maxLabelWidth,
      )

      const baseDescription = formatLogMetadata(log)
      const projectSuffix =
        showAllProjects && log.projectPath ? ` · ${log.projectPath}` : ''
      const snippet = snippets.get(log)
      const snippetStr = snippet ? formatSnippet(snippet, highlightColor) : null

      return {
        label: summary,
        description: snippetStr
          ? `${baseDescription}${projectSuffix}\n  ${snippetStr}`
          : baseDescription + projectSuffix,
        dimDescription: true,
        value: index.toString(),
      }
    })
  }, [
    isResumeWithRenameEnabled,
    displayedLogs,
    highlightColor,
    maxLabelWidth,
    showAllProjects,
    snippets,
  ])

  // Derive the focused log from focusedNode
  const focusedLog = focusedNode?.value.log ?? null

  const getExpandCollapseHint = (): string => {
    if (!isResumeWithRenameEnabled || !focusedLog) return ''
    const sessionId = getSessionIdFromLog(focusedLog)
    if (!sessionId) return ''

    const sessionLogs = displayedLogs.filter(
      log => getSessionIdFromLog(log) === sessionId,
    )
    const hasMultipleLogs = sessionLogs.length > 1

    if (!hasMultipleLogs) return ''

    const isExpanded = expandedGroupSessionIds.has(sessionId)
    const isChildNode = sessionLogs.indexOf(focusedLog) > 0

    if (isChildNode) {
      return '← to collapse'
    }

    return isExpanded ? '← to collapse' : '→ to expand'
  }

  const handleRenameSubmit = React.useCallback(async () => {
    const sessionId = focusedLog ? getSessionIdFromLog(focusedLog) : undefined
    if (!focusedLog || !sessionId) {
      setViewMode('list')
      setRenameValue('')
      return
    }

    if (renameValue.trim()) {
      // Pass fullPath for cross-project sessions (different worktrees)
      await saveCustomTitle(sessionId, renameValue.trim(), focusedLog.fullPath)
      if (isResumeWithRenameEnabled && onLogsChanged) {
        onLogsChanged()
      }
    }
    setViewMode('list')
    setRenameValue('')
  }, [focusedLog, renameValue, onLogsChanged, isResumeWithRenameEnabled])

  const exitSearchMode = React.useCallback(() => {
    setViewMode('list')
    logEvent('tengu_session_search_toggled', { enabled: false })
  }, [])

  const enterSearchMode = React.useCallback(() => {
    setViewMode('search')
    logEvent('tengu_session_search_toggled', { enabled: true })
  }, [])

  // Handler for triggering agentic search
  const handleAgenticSearch = React.useCallback(async () => {
    if (!searchQuery.trim() || !onAgenticSearch || !isAgenticSearchEnabled) {
      return
    }

    // Abort any previous search
    agenticSearchAbortRef.current?.abort()
    const abortController = new AbortController()
    agenticSearchAbortRef.current = abortController

    setAgenticSearchState({ status: 'searching' })
    logEvent('tengu_agentic_search_started', {
      query_length: searchQuery.length,
    })

    try {
      const results = await onAgenticSearch(
        searchQuery,
        logs,
        abortController.signal,
      )
      // Check if aborted before updating state
      if (abortController.signal.aborted) {
        return
      }
      setAgenticSearchState({ status: 'results', results, query: searchQuery })
      logEvent('tengu_agentic_search_completed', {
        query_length: searchQuery.length,
        results_count: results.length,
      })
    } catch (error) {
      // Don't show error for aborted requests
      if (abortController.signal.aborted) {
        return
      }
      setAgenticSearchState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Search failed',
      })
      logEvent('tengu_agentic_search_error', {
        query_length: searchQuery.length,
      })
    }
  }, [searchQuery, onAgenticSearch, isAgenticSearchEnabled, logs])

  // Clear agentic search results/error when query changes
  React.useEffect(() => {
    if (
      agenticSearchState.status !== 'idle' &&
      agenticSearchState.status !== 'searching'
    ) {
      // Clear if the query has changed from the one used for results/error
      if (
        (agenticSearchState.status === 'results' &&
          agenticSearchState.query !== searchQuery) ||
        agenticSearchState.status === 'error'
      ) {
        setAgenticSearchState({ status: 'idle' })
      }
    }
  }, [searchQuery, agenticSearchState])

  // Cleanup: abort any in-progress agentic search on unmount
  React.useEffect(() => {
    return () => {
      agenticSearchAbortRef.current?.abort()
    }
  }, [])

  // Focus first item when agentic search completes with results
  const prevAgenticStatusRef = React.useRef(agenticSearchState.status)
  React.useEffect(() => {
    const prevStatus = prevAgenticStatusRef.current
    prevAgenticStatusRef.current = agenticSearchState.status

    // When search just completed, focus the first item in the list
    if (prevStatus === 'searching' && agenticSearchState.status === 'results') {
      if (isResumeWithRenameEnabled && treeNodes.length > 0) {
        setFocusedNode(treeNodes[0]!)
      } else if (!isResumeWithRenameEnabled && displayedLogs.length > 0) {
        const firstLog = displayedLogs[0]!
        setFocusedNode({
          id: '0',
          value: { log: firstLog, indexInFiltered: 0 },
          label: '',
        })
      }
    }
  }, [
    agenticSearchState.status,
    isResumeWithRenameEnabled,
    treeNodes,
    displayedLogs,
  ])

  const handleFlatOptionsSelectFocus = React.useCallback(
    (value: string) => {
      const index = parseInt(value, 10)
      const log = displayedLogs[index]
      if (!log || prevFocusedIdRef.current === index.toString()) {
        return
      }
      prevFocusedIdRef.current = index.toString()
      setFocusedNode({
        id: index.toString(),
        value: { log, indexInFiltered: index },
        label: '',
      })
      setFocusedIndex(index + 1)
    },
    [displayedLogs],
  )

  const handleTreeSelectFocus = React.useCallback(
    (node: LogTreeNode) => {
      setFocusedNode(node)
      // Update focused index for scroll position display
      const index = displayedLogs.findIndex(
        log => getSessionIdFromLog(log) === getSessionIdFromLog(node.value.log),
      )
      if (index >= 0) {
        setFocusedIndex(index + 1)
      }
    },
    [displayedLogs],
  )

  // Escape to abort agentic search in progress
  useKeybinding(
    'confirm:no',
    () => {
      agenticSearchAbortRef.current?.abort()
      setAgenticSearchState({ status: 'idle' })
      logEvent('tengu_agentic_search_cancelled', {})
    },
    {
      context: 'Confirmation',
      isActive:
        viewMode !== 'preview' && agenticSearchState.status === 'searching',
    },
  )

  // Escape in rename mode - exit rename mode
  // Use Settings context so 'n' key doesn't exit (allows typing 'n' in rename input)
  useKeybinding(
    'confirm:no',
    () => {
      setViewMode('list')
      setRenameValue('')
    },
    {
      context: 'Settings',
      isActive:
        viewMode === 'rename' && agenticSearchState.status !== 'searching',
    },
  )

  // Escape when agentic search option focused - clear and cancel
  useKeybinding(
    'confirm:no',
    () => {
      setSearchQuery('')
      setIsAgenticSearchOptionFocused(false)
      onCancel?.()
    },
    {
      context: 'Confirmation',
      isActive:
        viewMode !== 'preview' &&
        viewMode !== 'rename' &&
        viewMode !== 'search' &&
        isAgenticSearchOptionFocused &&
        agenticSearchState.status !== 'searching',
    },
  )

  // Handle non-escape input
  useInput(
    (input, key) => {
      if (viewMode === 'preview') {
        // Preview mode handles its own input
        return
      }

      // Agentic search abort is now handled via keybinding
      if (agenticSearchState.status === 'searching') {
        return
      }

      if (viewMode === 'rename') {
        // Rename mode escape is now handled via keybinding
        // This branch only handles non-escape input in rename mode (via TextInput)
      } else if (viewMode === 'search') {
        // Text input is handled by useSearchInput hook
        if (input.toLowerCase() === 'n' && key.ctrl) {
          exitSearchMode()
        } else if (key.return || key.downArrow) {
          // Focus agentic search option if applicable
          if (
            searchQuery.trim() &&
            onAgenticSearch &&
            isAgenticSearchEnabled &&
            agenticSearchState.status !== 'results'
          ) {
            setIsAgenticSearchOptionFocused(true)
          }
        }
      } else {
        // Handle agentic search option when focused (escape handled via keybinding)
        if (isAgenticSearchOptionFocused) {
          if (key.return) {
            // Trigger agentic search
            void handleAgenticSearch()
            setIsAgenticSearchOptionFocused(false)
            return
          } else if (key.downArrow) {
            // Move focus to the session list
            setIsAgenticSearchOptionFocused(false)
            return
          } else if (key.upArrow) {
            // Go back to search mode
            setViewMode('search')
            setIsAgenticSearchOptionFocused(false)
            return
          }
        }

        // Handle tab cycling for tag tabs
        if (hasTags && key.tab) {
          const offset = key.shift ? -1 : 1
          setSelectedTagIndex(prev => {
            const current = prev < tagTabs.length ? prev : 0
            const newIndex =
              (current + tagTabs.length + offset) % tagTabs.length
            const newTab = tagTabs[newIndex]
            logEvent('tengu_session_tag_filter_changed', {
              is_all: newTab === 'All',
              tag_count: uniqueTags.length,
            })
            return newIndex
          })
          return
        }

        const keyIsNotCtrlOrMeta = !key.ctrl && !key.meta
        const lowerInput = input.toLowerCase()
        // Ctrl+letter shortcuts for actions (freeing up plain letters for type-to-search)
        if (lowerInput === 'a' && key.ctrl && onToggleAllProjects) {
          onToggleAllProjects()
          logEvent('tengu_session_all_projects_toggled', {
            enabled: !showAllProjects,
          })
        } else if (lowerInput === 'b' && key.ctrl) {
          const newEnabled = !branchFilterEnabled
          setBranchFilterEnabled(newEnabled)
          logEvent('tengu_session_branch_filter_toggled', {
            enabled: newEnabled,
          })
        } else if (lowerInput === 'w' && key.ctrl && hasMultipleWorktrees) {
          const newValue = !showAllWorktrees
          setShowAllWorktrees(newValue)
          logEvent('tengu_session_worktree_filter_toggled', {
            enabled: newValue,
          })
        } else if (lowerInput === '/' && keyIsNotCtrlOrMeta) {
          setViewMode('search')
          logEvent('tengu_session_search_toggled', { enabled: true })
        } else if (lowerInput === 'r' && key.ctrl && focusedLog) {
          setViewMode('rename')
          setRenameValue('')
          logEvent('tengu_session_rename_started', {})
        } else if (lowerInput === 'v' && key.ctrl && focusedLog) {
          setPreviewLog(focusedLog)
          setViewMode('preview')
          logEvent('tengu_session_preview_opened', {
            messageCount: focusedLog.messageCount,
          })
        } else if (
          focusedLog &&
          keyIsNotCtrlOrMeta &&
          input.length > 0 &&
          !/^\s+$/.test(input)
        ) {
          // Any printable character enters search mode and starts typing
          setViewMode('search')
          setSearchQuery(input)
          logEvent('tengu_session_search_toggled', { enabled: true })
        }
      }
    },
    { isActive: true },
  )

  const filterIndicators = []
  if (branchFilterEnabled && currentBranch) {
    filterIndicators.push(currentBranch)
  }
  if (hasMultipleWorktrees && !showAllWorktrees) {
    filterIndicators.push('current worktree')
  }

  const showAdditionalFilterLine =
    filterIndicators.length > 0 && viewMode !== 'search'

  // Search box takes 3 lines (border top, content, border bottom)
  const searchBoxLines = 3
  const headerLines =
    5 + searchBoxLines + (showAdditionalFilterLine ? 1 : 0) + tagTabsLines
  const footerLines = 2
  const visibleCount = Math.max(
    1,
    Math.floor((maxHeight - headerLines - footerLines) / 3),
  )

  // Progressive loading: request more logs when user scrolls near the end
  React.useEffect(() => {
    if (!onLoadMore) return
    const buffer = visibleCount * 2
    if (focusedIndex + buffer >= displayedLogs.length) {
      onLoadMore(visibleCount * 3)
    }
  }, [focusedIndex, visibleCount, displayedLogs.length, onLoadMore])

  // Early return if no logs
  if (logs.length === 0) {
    return null
  }

  // Show preview mode if active
  if (viewMode === 'preview' && previewLog && isResumeWithRenameEnabled) {
    return (
      <SessionPreview
        log={previewLog}
        onExit={() => {
          setViewMode('list')
          setPreviewLog(null)
        }}
        onSelect={onSelect}
      />
    )
  }

  return (
    <Box flexDirection="column" height={maxHeight - 1}>
      <Box flexShrink={0}>
        <Divider color="suggestion" />
      </Box>
      <Box flexShrink={0}>
        <Text> </Text>
      </Box>

      {hasTags ? (
        <TagTabs
          tabs={tagTabs}
          selectedIndex={effectiveTagIndex}
          availableWidth={columns}
          showAllProjects={showAllProjects}
        />
      ) : (
        <Box flexShrink={0}>
          <Text bold color="suggestion">
            Resume Session
            {viewMode === 'list' && displayedLogs.length > visibleCount && (
              <Text dimColor>
                {' '}
                ({focusedIndex} of {displayedLogs.length})
              </Text>
            )}
          </Text>
        </Box>
      )}
      <SearchBox
        query={searchQuery}
        isFocused={viewMode === 'search'}
        isTerminalFocused={isTerminalFocused}
        cursorOffset={searchCursorOffset}
      />
      {filterIndicators.length > 0 && viewMode !== 'search' && (
        <Box flexShrink={0} paddingLeft={2}>
          <Text dimColor>
            <Byline>{filterIndicators}</Byline>
          </Text>
        </Box>
      )}
      <Box flexShrink={0}>
        <Text> </Text>
      </Box>

      {/* Agentic search loading state */}
      {agenticSearchState.status === 'searching' && (
        <Box paddingLeft={1} flexShrink={0}>
          <Spinner />
          <Text> Searching…</Text>
        </Box>
      )}

      {/* Results header when agentic search completed with results */}
      {agenticSearchState.status === 'results' &&
        agenticSearchState.results.length > 0 && (
          <Box paddingLeft={1} marginBottom={1} flexShrink={0}>
            <Text dimColor italic>
              Claude found these results:
            </Text>
          </Box>
        )}

      {/* Fallback message when agentic search found no results and deep search also has nothing */}
      {agenticSearchState.status === 'results' &&
        agenticSearchState.results.length === 0 &&
        filteredLogs.length === 0 && (
          <Box paddingLeft={1} marginBottom={1} flexShrink={0}>
            <Text dimColor italic>
              No matching sessions found.
            </Text>
          </Box>
        )}

      {/* Error message when agentic search failed and deep search also has nothing */}
      {agenticSearchState.status === 'error' && filteredLogs.length === 0 && (
        <Box paddingLeft={1} marginBottom={1} flexShrink={0}>
          <Text dimColor italic>
            No matching sessions found.
          </Text>
        </Box>
      )}

      {/* Agentic search option - first item in list when searching */}
      {Boolean(searchQuery.trim()) &&
        onAgenticSearch &&
        isAgenticSearchEnabled &&
        agenticSearchState.status !== 'searching' &&
        agenticSearchState.status !== 'results' &&
        agenticSearchState.status !== 'error' && (
          <Box flexShrink={0} flexDirection="column">
            <Box flexDirection="row" gap={1}>
              <Text
                color={isAgenticSearchOptionFocused ? 'suggestion' : undefined}
              >
                {isAgenticSearchOptionFocused ? figures.pointer : ' '}
              </Text>
              <Text
                color={isAgenticSearchOptionFocused ? 'suggestion' : undefined}
                bold={isAgenticSearchOptionFocused}
              >
                Search deeply using Claude →
              </Text>
            </Box>
            <Box height={1} />
          </Box>
        )}

      {/* Hide session list when agentic search is in progress */}
      {agenticSearchState.status === 'searching' ? null : viewMode ===
          'rename' && focusedLog ? (
        <Box paddingLeft={2} flexDirection="column">
          <Text bold>Rename session:</Text>
          <Box paddingTop={1}>
            <TextInput
              value={renameValue}
              onChange={setRenameValue}
              onSubmit={handleRenameSubmit}
              placeholder={getLogDisplayTitle(
                focusedLog!,
                'Enter new session name',
              )}
              columns={columns}
              cursorOffset={renameCursorOffset}
              onChangeCursorOffset={setRenameCursorOffset}
              showCursor={true}
            />
          </Box>
        </Box>
      ) : isResumeWithRenameEnabled ? (
        <TreeSelect
          nodes={treeNodes}
          onSelect={node => {
            onSelect(node.value.log)
          }}
          onFocus={handleTreeSelectFocus}
          onCancel={onCancel}
          focusNodeId={focusedNode?.id}
          visibleOptionCount={visibleCount}
          layout="expanded"
          isDisabled={viewMode === 'search' || isAgenticSearchOptionFocused}
          hideIndexes={false}
          isNodeExpanded={nodeId => {
            // Always expand if in search or branch filter mode
            if (viewMode === 'search' || branchFilterEnabled) {
              return true
            }
            // Extract sessionId from node ID (format: "group:sessionId")
            const sessionId =
              typeof nodeId === 'string' && nodeId.startsWith('group:')
                ? nodeId.substring(6)
                : null
            return sessionId ? expandedGroupSessionIds.has(sessionId) : false
          }}
          onExpand={nodeId => {
            const sessionId =
              typeof nodeId === 'string' && nodeId.startsWith('group:')
                ? nodeId.substring(6)
                : null
            if (sessionId) {
              setExpandedGroupSessionIds(prev => new Set(prev).add(sessionId))
              logEvent('tengu_session_group_expanded', {})
            }
          }}
          onCollapse={nodeId => {
            const sessionId =
              typeof nodeId === 'string' && nodeId.startsWith('group:')
                ? nodeId.substring(6)
                : null
            if (sessionId) {
              setExpandedGroupSessionIds(prev => {
                const newSet = new Set(prev)
                newSet.delete(sessionId)
                return newSet
              })
            }
          }}
          onUpFromFirstItem={enterSearchMode}
        />
      ) : (
        <Select
          options={flatOptions}
          onChange={value => {
            // Old flat list mode - index directly maps to displayedLogs
            const itemIndex = parseInt(value, 10)
            const log = displayedLogs[itemIndex]
            if (log) {
              onSelect(log)
            }
          }}
          visibleOptionCount={visibleCount}
          onCancel={onCancel}
          onFocus={handleFlatOptionsSelectFocus}
          defaultFocusValue={focusedNode?.id.toString()}
          layout="expanded"
          isDisabled={viewMode === 'search' || isAgenticSearchOptionFocused}
          onUpFromFirstItem={enterSearchMode}
        />
      )}
      <Box paddingLeft={2}>
        {exitState.pending ? (
          <Text dimColor>Press {exitState.keyName} again to exit</Text>
        ) : viewMode === 'rename' ? (
          <Text dimColor>
            <Byline>
              <KeyboardShortcutHint shortcut="Enter" action="save" />
              <ConfigurableShortcutHint
                action="confirm:no"
                context="Confirmation"
                fallback="Esc"
                description="cancel"
              />
            </Byline>
          </Text>
        ) : agenticSearchState.status === 'searching' ? (
          <Text dimColor>
            <Byline>
              <Text>Searching with Claude…</Text>
              <ConfigurableShortcutHint
                action="confirm:no"
                context="Confirmation"
                fallback="Esc"
                description="cancel"
              />
            </Byline>
          </Text>
        ) : isAgenticSearchOptionFocused ? (
          <Text dimColor>
            <Byline>
              <KeyboardShortcutHint shortcut="Enter" action="search" />
              <KeyboardShortcutHint shortcut="↓" action="skip" />
              <ConfigurableShortcutHint
                action="confirm:no"
                context="Confirmation"
                fallback="Esc"
                description="cancel"
              />
            </Byline>
          </Text>
        ) : viewMode === 'search' ? (
          <Text dimColor>
            <Byline>
              <Text>
                {isSearching && isDeepSearchEnabled
                  ? 'Searching…'
                  : 'Type to Search'}
              </Text>
              <KeyboardShortcutHint shortcut="Enter" action="select" />
              <ConfigurableShortcutHint
                action="confirm:no"
                context="Confirmation"
                fallback="Esc"
                description="clear"
              />
            </Byline>
          </Text>
        ) : (
          <Text dimColor>
            <Byline>
              {onToggleAllProjects && (
                <KeyboardShortcutHint
                  shortcut="Ctrl+A"
                  action={`show ${showAllProjects ? 'current dir' : 'all projects'}`}
                />
              )}
              {currentBranch && (
                <KeyboardShortcutHint
                  shortcut="Ctrl+B"
                  action="toggle branch"
                />
              )}
              {hasMultipleWorktrees && (
                <KeyboardShortcutHint
                  shortcut="Ctrl+W"
                  action={`show ${showAllWorktrees ? 'current worktree' : 'all worktrees'}`}
                />
              )}
              <KeyboardShortcutHint shortcut="Ctrl+V" action="preview" />
              <KeyboardShortcutHint shortcut="Ctrl+R" action="rename" />
              <Text>Type to search</Text>
              <ConfigurableShortcutHint
                action="confirm:no"
                context="Confirmation"
                fallback="Esc"
                description="cancel"
              />
              {getExpandCollapseHint() && (
                <Text>{getExpandCollapseHint()}</Text>
              )}
            </Byline>
          </Text>
        )}
      </Box>
    </Box>
  )
}

/**
 * Extracts searchable text content from a message.
 * Handles both string content and structured content blocks.
 */
function extractSearchableText(message: SerializedMessage): string {
  // Only extract from user and assistant messages that have content
  if (message.type !== 'user' && message.type !== 'assistant') {
    return ''
  }

  const content = 'message' in message ? message.message?.content : undefined
  if (!content) return ''

  // Handle string content (simple messages)
  if (typeof content === 'string') {
    return content
  }

  // Handle array of content blocks
  if (Array.isArray(content)) {
    return content
      .map(block => {
        if (typeof block === 'string') return block
        if ('text' in block && typeof block.text === 'string') return block.text
        return ''
        // we don't return thinking blocks and tool names here;
        // they're not useful for search, as they can add noise to the fuzzy matching
      })
      .filter(Boolean)
      .join(' ')
  }

  return ''
}

/**
 * Builds searchable text for a log including messages, titles, summaries, and metadata.
 * Crops long transcripts to first/last N messages for performance.
 */
function buildSearchableText(log: LogOption): string {
  const searchableMessages =
    log.messages.length <= DEEP_SEARCH_MAX_MESSAGES
      ? log.messages
      : [
          ...log.messages.slice(0, DEEP_SEARCH_CROP_SIZE),
          ...log.messages.slice(-DEEP_SEARCH_CROP_SIZE),
        ]
  const messageText = searchableMessages
    .map(extractSearchableText)
    .filter(Boolean)
    .join(' ')

  const metadata = [
    log.customTitle,
    log.summary,
    log.firstPrompt,
    log.gitBranch,
    log.tag,
    log.prNumber ? `PR #${log.prNumber}` : undefined,
    log.prRepository,
  ]
    .filter(Boolean)
    .join(' ')

  const fullText = `${metadata} ${messageText}`.trim()
  return fullText.length > DEEP_SEARCH_MAX_TEXT_LENGTH
    ? fullText.slice(0, DEEP_SEARCH_MAX_TEXT_LENGTH)
    : fullText
}

function groupLogsBySessionId(
  filteredLogs: LogOption[],
): Map<string, LogOption[]> {
  const groups = new Map<string, LogOption[]>()

  for (const log of filteredLogs) {
    const sessionId = getSessionIdFromLog(log)
    if (sessionId) {
      const existing = groups.get(sessionId)
      if (existing) {
        existing.push(log)
      } else {
        groups.set(sessionId, [log])
      }
    }
  }

  // Sort logs within each group by modified date (newest first)
  groups.forEach(logs =>
    logs.sort(
      (a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime(),
    ),
  )

  return groups
}

/**
 * Get unique tags from a list of logs, sorted alphabetically
 */
function getUniqueTags(logs: LogOption[]): string[] {
  const tags = new Set<string>()
  for (const log of logs) {
    if (log.tag) {
      tags.add(log.tag)
    }
  }
  return Array.from(tags).sort((a, b) => a.localeCompare(b))
}
