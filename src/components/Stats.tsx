import { feature } from 'bun:bundle'
import { plot as asciichart } from 'asciichart'
import chalk from 'chalk'
import figures from 'figures'
import React, {
  Suspense,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import stripAnsi from 'strip-ansi'
import type { CommandResultDisplay } from '../commands.js'
import { useTerminalSize } from '../hooks/useTerminalSize.js'
// eslint-disable-next-line custom-rules/prefer-use-keybindings -- raw j/k/arrow stats navigation
import { Ansi, applyColor, Box, Text, useInput, stringWidth as getStringWidth, type Color, Pane, Tab, Tabs, useTabHeaderFocus } from '@anthropic/ink'
import { useKeybinding } from '../keybindings/useKeybinding.js'
import { getGlobalConfig } from '../utils/config.js'
import { formatDuration, formatNumber } from '../utils/format.js'
import { generateHeatmap } from '../utils/heatmap.js'
import { renderModelName } from '../utils/model/model.js'
import { copyAnsiToClipboard } from '../utils/screenshotClipboard.js'
import {
  aggregateClaudeCodeStatsForRange,
  type ClaudeCodeStats,
  type DailyModelTokens,
  type StatsDateRange,
} from '../utils/stats.js'
import { resolveThemeSetting } from '../utils/systemTheme.js'
import { getTheme, themeColorToAnsi } from '../utils/theme.js'
import { Spinner } from './Spinner.js'

function formatPeakDay(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

type Props = {
  onClose: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
}

type StatsResult =
  | { type: 'success'; data: ClaudeCodeStats }
  | { type: 'error'; message: string }
  | { type: 'empty' }

const DATE_RANGE_LABELS: Record<StatsDateRange, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  all: 'All time',
}

const DATE_RANGE_ORDER: StatsDateRange[] = ['all', '7d', '30d']

function getNextDateRange(current: StatsDateRange): StatsDateRange {
  const currentIndex = DATE_RANGE_ORDER.indexOf(current)
  return DATE_RANGE_ORDER[(currentIndex + 1) % DATE_RANGE_ORDER.length]!
}

/**
 * Creates a stats loading promise that never rejects.
 * Always loads all-time stats for the heatmap.
 */
function createAllTimeStatsPromise(): Promise<StatsResult> {
  return aggregateClaudeCodeStatsForRange('all')
    .then((data): StatsResult => {
      if (!data || data.totalSessions === 0) {
        return { type: 'empty' }
      }
      return { type: 'success', data }
    })
    .catch((err): StatsResult => {
      const message =
        err instanceof Error ? err.message : 'Failed to load stats'
      return { type: 'error', message }
    })
}

export function Stats({ onClose }: Props): React.ReactNode {
  // Always load all-time stats first (for heatmap)
  const allTimePromise = useMemo(() => createAllTimeStatsPromise(), [])

  return (
    <Suspense
      fallback={
        <Box marginTop={1}>
          <Spinner />
          <Text> Loading your Claude Code stats…</Text>
        </Box>
      }
    >
      <StatsContent allTimePromise={allTimePromise} onClose={onClose} />
    </Suspense>
  )
}

type StatsContentProps = {
  allTimePromise: Promise<StatsResult>
  onClose: Props['onClose']
}

/**
 * Inner component that uses React 19's use() to read the stats promise.
 * Suspends while loading all-time stats, then handles date range changes without suspending.
 */
function StatsContent({
  allTimePromise,
  onClose,
}: StatsContentProps): React.ReactNode {
  const allTimeResult = use(allTimePromise)
  const [dateRange, setDateRange] = useState<StatsDateRange>('all')
  const [statsCache, setStatsCache] = useState<
    Partial<Record<StatsDateRange, ClaudeCodeStats>>
  >({})
  const [isLoadingFiltered, setIsLoadingFiltered] = useState(false)
  const [activeTab, setActiveTab] = useState<'Overview' | 'Models'>('Overview')
  const [copyStatus, setCopyStatus] = useState<string | null>(null)

  // Load filtered stats when date range changes (with caching)
  useEffect(() => {
    if (dateRange === 'all') {
      return
    }

    // Already cached
    if (statsCache[dateRange]) {
      return
    }

    let cancelled = false
    setIsLoadingFiltered(true)

    aggregateClaudeCodeStatsForRange(dateRange)
      .then(data => {
        if (!cancelled) {
          setStatsCache(prev => ({ ...prev, [dateRange]: data }))
          setIsLoadingFiltered(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsLoadingFiltered(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [dateRange, statsCache])

  // Use cached stats for current range
  const displayStats =
    dateRange === 'all'
      ? allTimeResult.type === 'success'
        ? allTimeResult.data
        : null
      : (statsCache[dateRange] ??
        (allTimeResult.type === 'success' ? allTimeResult.data : null))

  // All-time stats for the heatmap (always use all-time)
  const allTimeStats =
    allTimeResult.type === 'success' ? allTimeResult.data : null

  const handleClose = useCallback(() => {
    onClose('Stats dialog dismissed', { display: 'system' })
  }, [onClose])

  useKeybinding('confirm:no', handleClose, { context: 'Confirmation' })

  useInput((input, key) => {
    // Handle ctrl+c and ctrl+d for closing
    if (key.ctrl && (input === 'c' || input === 'd')) {
      onClose('Stats dialog dismissed', { display: 'system' })
    }
    // Track tab changes
    if (key.tab) {
      setActiveTab(prev => (prev === 'Overview' ? 'Models' : 'Overview'))
    }
    // r to cycle date range
    if (input === 'r' && !key.ctrl && !key.meta) {
      setDateRange(getNextDateRange(dateRange))
    }
    // Ctrl+S to copy screenshot to clipboard
    if (key.ctrl && input === 's' && displayStats) {
      void handleScreenshot(displayStats, activeTab, setCopyStatus)
    }
  })

  if (allTimeResult.type === 'error') {
    return (
      <Box marginTop={1}>
        <Text color="error">Failed to load stats: {allTimeResult.message}</Text>
      </Box>
    )
  }

  if (allTimeResult.type === 'empty') {
    return (
      <Box marginTop={1}>
        <Text color="warning">
          No stats available yet. Start using Claude Code!
        </Text>
      </Box>
    )
  }

  if (!displayStats || !allTimeStats) {
    return (
      <Box marginTop={1}>
        <Spinner />
        <Text> Loading stats…</Text>
      </Box>
    )
  }

  return (
    <Pane color="claude">
      <Box flexDirection="row" gap={1} marginBottom={1}>
        <Tabs title="" color="claude" defaultTab="Overview">
          <Tab title="Overview">
            <OverviewTab
              stats={displayStats}
              allTimeStats={allTimeStats}
              dateRange={dateRange}
              isLoading={isLoadingFiltered}
            />
          </Tab>
          <Tab title="Models">
            <ModelsTab
              stats={displayStats}
              dateRange={dateRange}
              isLoading={isLoadingFiltered}
            />
          </Tab>
        </Tabs>
      </Box>
      <Box paddingLeft={2}>
        <Text dimColor>
          Esc to cancel · r to cycle dates · ctrl+s to copy
          {copyStatus ? ` · ${copyStatus}` : ''}
        </Text>
      </Box>
    </Pane>
  )
}

function DateRangeSelector({
  dateRange,
  isLoading,
}: {
  dateRange: StatsDateRange
  isLoading: boolean
}): React.ReactNode {
  return (
    <Box marginBottom={1} gap={1}>
      <Box>
        {DATE_RANGE_ORDER.map((range, i) => (
          <Text key={range}>
            {i > 0 && <Text dimColor> · </Text>}
            {range === dateRange ? (
              <Text bold color="claude">
                {DATE_RANGE_LABELS[range]}
              </Text>
            ) : (
              <Text dimColor>{DATE_RANGE_LABELS[range]}</Text>
            )}
          </Text>
        ))}
      </Box>
      {isLoading && <Spinner />}
    </Box>
  )
}

function OverviewTab({
  stats,
  allTimeStats,
  dateRange,
  isLoading,
}: {
  stats: ClaudeCodeStats
  allTimeStats: ClaudeCodeStats
  dateRange: StatsDateRange
  isLoading: boolean
}): React.ReactNode {
  const { columns: terminalWidth } = useTerminalSize()

  // Calculate favorite model and total tokens
  const modelEntries = Object.entries(stats.modelUsage).sort(
    ([, a], [, b]) =>
      b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens),
  )
  const favoriteModel = modelEntries[0]
  const totalTokens = modelEntries.reduce(
    (sum, [, usage]) => sum + usage.inputTokens + usage.outputTokens,
    0,
  )

  // Memoize the factoid so it doesn't change when switching tabs
  const factoid = useMemo(
    () => generateFunFactoid(stats, totalTokens),
    [stats, totalTokens],
  )

  // Calculate range days based on selected date range
  const rangeDays =
    dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : stats.totalDays

  // Compute shot stats data (ant-only, gated by feature flag)
  let shotStatsData: {
    avgShots: string
    buckets: { label: string; count: number; pct: number }[]
  } | null = null
  if (feature('SHOT_STATS') && stats.shotDistribution) {
    const dist = stats.shotDistribution
    const total = Object.values(dist).reduce((s, n) => s + n, 0)
    if (total > 0) {
      const totalShots = Object.entries(dist).reduce(
        (s, [count, sessions]) => s + parseInt(count, 10) * sessions,
        0,
      )
      const bucket = (min: number, max?: number) =>
        Object.entries(dist)
          .filter(([k]) => {
            const n = parseInt(k, 10)
            return n >= min && (max === undefined || n <= max)
          })
          .reduce((s, [, v]) => s + v, 0)
      const pct = (n: number) => Math.round((n / total) * 100)
      const b1 = bucket(1, 1)
      const b2_5 = bucket(2, 5)
      const b6_10 = bucket(6, 10)
      const b11 = bucket(11)
      shotStatsData = {
        avgShots: (totalShots / total).toFixed(1),
        buckets: [
          { label: '1-shot', count: b1, pct: pct(b1) },
          { label: '2\u20135 shot', count: b2_5, pct: pct(b2_5) },
          { label: '6\u201310 shot', count: b6_10, pct: pct(b6_10) },
          { label: '11+ shot', count: b11, pct: pct(b11) },
        ],
      }
    }
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Activity Heatmap - always shows all-time data */}
      {allTimeStats.dailyActivity.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Ansi>
            {generateHeatmap(allTimeStats.dailyActivity, { terminalWidth })}
          </Ansi>
        </Box>
      )}

      {/* Date range selector */}
      <DateRangeSelector dateRange={dateRange} isLoading={isLoading} />

      {/* Section 1: Usage */}
      <Box flexDirection="row" gap={4} marginBottom={1}>
        <Box flexDirection="column" width={28}>
          {favoriteModel && (
            <Text wrap="truncate">
              Favorite model:{' '}
              <Text color="claude" bold>
                {renderModelName(favoriteModel[0])}
              </Text>
            </Text>
          )}
        </Box>
        <Box flexDirection="column" width={28}>
          <Text wrap="truncate">
            Total tokens:{' '}
            <Text color="claude">{formatNumber(totalTokens)}</Text>
          </Text>
        </Box>
      </Box>

      {/* Section 2: Activity - Row 1: Sessions | Longest session */}
      <Box flexDirection="row" gap={4}>
        <Box flexDirection="column" width={28}>
          <Text wrap="truncate">
            Sessions:{' '}
            <Text color="claude">{formatNumber(stats.totalSessions)}</Text>
          </Text>
        </Box>
        <Box flexDirection="column" width={28}>
          {stats.longestSession && (
            <Text wrap="truncate">
              Longest session:{' '}
              <Text color="claude">
                {formatDuration(stats.longestSession.duration)}
              </Text>
            </Text>
          )}
        </Box>
      </Box>

      {/* Row 2: Active days | Longest streak */}
      <Box flexDirection="row" gap={4}>
        <Box flexDirection="column" width={28}>
          <Text wrap="truncate">
            Active days: <Text color="claude">{stats.activeDays}</Text>
            <Text color="subtle">/{rangeDays}</Text>
          </Text>
        </Box>
        <Box flexDirection="column" width={28}>
          <Text wrap="truncate">
            Longest streak:{' '}
            <Text color="claude" bold>
              {stats.streaks.longestStreak}
            </Text>{' '}
            {stats.streaks.longestStreak === 1 ? 'day' : 'days'}
          </Text>
        </Box>
      </Box>

      {/* Row 3: Most active day | Current streak */}
      <Box flexDirection="row" gap={4}>
        <Box flexDirection="column" width={28}>
          {stats.peakActivityDay && (
            <Text wrap="truncate">
              Most active day:{' '}
              <Text color="claude">{formatPeakDay(stats.peakActivityDay)}</Text>
            </Text>
          )}
        </Box>
        <Box flexDirection="column" width={28}>
          <Text wrap="truncate">
            Current streak:{' '}
            <Text color="claude" bold>
              {allTimeStats.streaks.currentStreak}
            </Text>{' '}
            {allTimeStats.streaks.currentStreak === 1 ? 'day' : 'days'}
          </Text>
        </Box>
      </Box>

      {/* Speculation time saved (ant-only) */}
      {process.env.USER_TYPE === 'ant' &&
        stats.totalSpeculationTimeSavedMs > 0 && (
          <Box flexDirection="row" gap={4}>
            <Box flexDirection="column" width={28}>
              <Text wrap="truncate">
                Speculation saved:{' '}
                <Text color="claude">
                  {formatDuration(stats.totalSpeculationTimeSavedMs)}
                </Text>
              </Text>
            </Box>
          </Box>
        )}

      {/* Shot stats (ant-only) */}
      {shotStatsData && (
        <>
          <Box marginTop={1}>
            <Text>Shot distribution</Text>
          </Box>
          <Box flexDirection="row" gap={4}>
            <Box flexDirection="column" width={28}>
              <Text wrap="truncate">
                {shotStatsData.buckets[0]!.label}:{' '}
                <Text color="claude">{shotStatsData.buckets[0]!.count}</Text>
                <Text color="subtle"> ({shotStatsData.buckets[0]!.pct}%)</Text>
              </Text>
            </Box>
            <Box flexDirection="column" width={28}>
              <Text wrap="truncate">
                {shotStatsData.buckets[1]!.label}:{' '}
                <Text color="claude">{shotStatsData.buckets[1]!.count}</Text>
                <Text color="subtle"> ({shotStatsData.buckets[1]!.pct}%)</Text>
              </Text>
            </Box>
          </Box>
          <Box flexDirection="row" gap={4}>
            <Box flexDirection="column" width={28}>
              <Text wrap="truncate">
                {shotStatsData.buckets[2]!.label}:{' '}
                <Text color="claude">{shotStatsData.buckets[2]!.count}</Text>
                <Text color="subtle"> ({shotStatsData.buckets[2]!.pct}%)</Text>
              </Text>
            </Box>
            <Box flexDirection="column" width={28}>
              <Text wrap="truncate">
                {shotStatsData.buckets[3]!.label}:{' '}
                <Text color="claude">{shotStatsData.buckets[3]!.count}</Text>
                <Text color="subtle"> ({shotStatsData.buckets[3]!.pct}%)</Text>
              </Text>
            </Box>
          </Box>
          <Box flexDirection="row" gap={4}>
            <Box flexDirection="column" width={28}>
              <Text wrap="truncate">
                Avg/session:{' '}
                <Text color="claude">{shotStatsData.avgShots}</Text>
              </Text>
            </Box>
          </Box>
        </>
      )}

      {/* Fun factoid */}
      {factoid && (
        <Box marginTop={1}>
          <Text color="suggestion">{factoid}</Text>
        </Box>
      )}
    </Box>
  )
}

// Famous books and their approximate token counts (words * ~1.3)
// Sorted by tokens ascending for comparison logic
const BOOK_COMPARISONS = [
  { name: 'The Little Prince', tokens: 22000 },
  { name: 'The Old Man and the Sea', tokens: 35000 },
  { name: 'A Christmas Carol', tokens: 37000 },
  { name: 'Animal Farm', tokens: 39000 },
  { name: 'Fahrenheit 451', tokens: 60000 },
  { name: 'The Great Gatsby', tokens: 62000 },
  { name: 'Slaughterhouse-Five', tokens: 64000 },
  { name: 'Brave New World', tokens: 83000 },
  { name: 'The Catcher in the Rye', tokens: 95000 },
  { name: "Harry Potter and the Philosopher's Stone", tokens: 103000 },
  { name: 'The Hobbit', tokens: 123000 },
  { name: '1984', tokens: 123000 },
  { name: 'To Kill a Mockingbird', tokens: 130000 },
  { name: 'Pride and Prejudice', tokens: 156000 },
  { name: 'Dune', tokens: 244000 },
  { name: 'Moby-Dick', tokens: 268000 },
  { name: 'Crime and Punishment', tokens: 274000 },
  { name: 'A Game of Thrones', tokens: 381000 },
  { name: 'Anna Karenina', tokens: 468000 },
  { name: 'Don Quixote', tokens: 520000 },
  { name: 'The Lord of the Rings', tokens: 576000 },
  { name: 'The Count of Monte Cristo', tokens: 603000 },
  { name: 'Les Misérables', tokens: 689000 },
  { name: 'War and Peace', tokens: 730000 },
]

// Time equivalents for session durations
const TIME_COMPARISONS = [
  { name: 'a TED talk', minutes: 18 },
  { name: 'an episode of The Office', minutes: 22 },
  { name: 'listening to Abbey Road', minutes: 47 },
  { name: 'a yoga class', minutes: 60 },
  { name: 'a World Cup soccer match', minutes: 90 },
  { name: 'a half marathon (average time)', minutes: 120 },
  { name: 'the movie Inception', minutes: 148 },
  { name: 'watching Titanic', minutes: 195 },
  { name: 'a transatlantic flight', minutes: 420 },
  { name: 'a full night of sleep', minutes: 480 },
]

function generateFunFactoid(
  stats: ClaudeCodeStats,
  totalTokens: number,
): string {
  const factoids: string[] = []

  if (totalTokens > 0) {
    const matchingBooks = BOOK_COMPARISONS.filter(
      book => totalTokens >= book.tokens,
    )

    for (const book of matchingBooks) {
      const times = totalTokens / book.tokens
      if (times >= 2) {
        factoids.push(
          `You've used ~${Math.floor(times)}x more tokens than ${book.name}`,
        )
      } else {
        factoids.push(`You've used the same number of tokens as ${book.name}`)
      }
    }
  }

  if (stats.longestSession) {
    const sessionMinutes = stats.longestSession.duration / (1000 * 60)
    for (const comparison of TIME_COMPARISONS) {
      const ratio = sessionMinutes / comparison.minutes
      if (ratio >= 2) {
        factoids.push(
          `Your longest session is ~${Math.floor(ratio)}x longer than ${comparison.name}`,
        )
      }
    }
  }

  if (factoids.length === 0) {
    return ''
  }
  const randomIndex = Math.floor(Math.random() * factoids.length)
  return factoids[randomIndex]!
}

function ModelsTab({
  stats,
  dateRange,
  isLoading,
}: {
  stats: ClaudeCodeStats
  dateRange: StatsDateRange
  isLoading: boolean
}): React.ReactNode {
  const { headerFocused, focusHeader } = useTabHeaderFocus()
  const [scrollOffset, setScrollOffset] = useState(0)
  const { columns: terminalWidth } = useTerminalSize()
  const VISIBLE_MODELS = 4 // Show 4 models at a time (2 per column)

  const modelEntries = Object.entries(stats.modelUsage).sort(
    ([, a], [, b]) =>
      b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens),
  )

  // Handle scrolling with arrow keys
  useInput(
    (_input, key) => {
      if (
        key.downArrow &&
        scrollOffset < modelEntries.length - VISIBLE_MODELS
      ) {
        setScrollOffset(prev =>
          Math.min(prev + 2, modelEntries.length - VISIBLE_MODELS),
        )
      }
      if (key.upArrow) {
        if (scrollOffset > 0) {
          setScrollOffset(prev => Math.max(prev - 2, 0))
        } else {
          focusHeader()
        }
      }
    },
    { isActive: !headerFocused },
  )

  if (modelEntries.length === 0) {
    return (
      <Box>
        <Text color="subtle">No model usage data available</Text>
      </Box>
    )
  }

  const totalTokens = modelEntries.reduce(
    (sum, [, usage]) => sum + usage.inputTokens + usage.outputTokens,
    0,
  )

  // Generate token usage chart - use terminal width for responsive sizing
  const chartOutput = generateTokenChart(
    stats.dailyModelTokens,
    modelEntries.map(([model]) => model),
    terminalWidth,
  )

  // Get visible models and split into two columns
  const visibleModels = modelEntries.slice(
    scrollOffset,
    scrollOffset + VISIBLE_MODELS,
  )
  const midpoint = Math.ceil(visibleModels.length / 2)
  const leftModels = visibleModels.slice(0, midpoint)
  const rightModels = visibleModels.slice(midpoint)

  const canScrollUp = scrollOffset > 0
  const canScrollDown = scrollOffset < modelEntries.length - VISIBLE_MODELS
  const showScrollHint = modelEntries.length > VISIBLE_MODELS

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Token usage chart */}
      {chartOutput && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>Tokens per Day</Text>
          <Ansi>{chartOutput.chart}</Ansi>
          <Text color="subtle">{chartOutput.xAxisLabels}</Text>
          <Box>
            {chartOutput.legend.map((item, i) => (
              <Text key={item.model}>
                {i > 0 ? ' · ' : ''}
                <Ansi>{item.coloredBullet}</Ansi> {item.model}
              </Text>
            ))}
          </Box>
        </Box>
      )}

      {/* Date range selector */}
      <DateRangeSelector dateRange={dateRange} isLoading={isLoading} />

      {/* Model breakdown - two columns with fixed width */}
      <Box flexDirection="row" gap={4}>
        <Box flexDirection="column" width={36}>
          {leftModels.map(([model, usage]) => (
            <ModelEntry
              key={model}
              model={model}
              usage={usage}
              totalTokens={totalTokens}
            />
          ))}
        </Box>
        <Box flexDirection="column" width={36}>
          {rightModels.map(([model, usage]) => (
            <ModelEntry
              key={model}
              model={model}
              usage={usage}
              totalTokens={totalTokens}
            />
          ))}
        </Box>
      </Box>

      {/* Scroll hint */}
      {showScrollHint && (
        <Box marginTop={1}>
          <Text color="subtle">
            {canScrollUp ? figures.arrowUp : ' '}{' '}
            {canScrollDown ? figures.arrowDown : ' '} {scrollOffset + 1}-
            {Math.min(scrollOffset + VISIBLE_MODELS, modelEntries.length)} of{' '}
            {modelEntries.length} models (↑↓ to scroll)
          </Text>
        </Box>
      )}
    </Box>
  )
}

type ModelEntryProps = {
  model: string
  usage: {
    inputTokens: number
    outputTokens: number
    cacheReadInputTokens: number
  }
  totalTokens: number
}

function ModelEntry({
  model,
  usage,
  totalTokens,
}: ModelEntryProps): React.ReactNode {
  const modelTokens = usage.inputTokens + usage.outputTokens
  const percentage = ((modelTokens / totalTokens) * 100).toFixed(1)

  return (
    <Box flexDirection="column">
      <Text>
        {figures.bullet} <Text bold>{renderModelName(model)}</Text>{' '}
        <Text color="subtle">({percentage}%)</Text>
      </Text>
      <Text color="subtle">
        {'  '}In: {formatNumber(usage.inputTokens)} · Out:{' '}
        {formatNumber(usage.outputTokens)}
      </Text>
    </Box>
  )
}

type ChartLegend = {
  model: string
  coloredBullet: string // Pre-colored bullet using chalk
}

type ChartOutput = {
  chart: string
  legend: ChartLegend[]
  xAxisLabels: string
}

function generateTokenChart(
  dailyTokens: DailyModelTokens[],
  models: string[],
  terminalWidth: number,
): ChartOutput | null {
  if (dailyTokens.length < 2 || models.length === 0) {
    return null
  }

  // Y-axis labels take about 6 characters, plus some padding
  // Cap at ~52 to align with heatmap width (1 year of data)
  const yAxisWidth = 7
  const availableWidth = terminalWidth - yAxisWidth
  const chartWidth = Math.min(52, Math.max(20, availableWidth))

  // Distribute data across the available chart width
  let recentData: DailyModelTokens[]
  if (dailyTokens.length >= chartWidth) {
    // More data than space: take most recent N days
    recentData = dailyTokens.slice(-chartWidth)
  } else {
    // Less data than space: expand by repeating each point
    const repeatCount = Math.floor(chartWidth / dailyTokens.length)
    recentData = []
    for (const day of dailyTokens) {
      for (let i = 0; i < repeatCount; i++) {
        recentData.push(day)
      }
    }
  }

  // Color palette for different models - use theme colors
  const theme = getTheme(resolveThemeSetting(getGlobalConfig().theme))
  const colors = [
    themeColorToAnsi(theme.suggestion),
    themeColorToAnsi(theme.success),
    themeColorToAnsi(theme.warning),
  ]

  // Prepare series data for each model
  const series: number[][] = []
  const legend: ChartLegend[] = []

  // Only show top 3 models to keep chart readable
  const topModels = models.slice(0, 3)

  for (let i = 0; i < topModels.length; i++) {
    const model = topModels[i]!
    const data = recentData.map(day => day.tokensByModel[model] || 0)

    // Only include if there's actual data
    if (data.some(v => v > 0)) {
      series.push(data)
      // Use theme colors that match the chart
      const bulletColors = [theme.suggestion, theme.success, theme.warning]
      legend.push({
        model: renderModelName(model),
        coloredBullet: applyColor(
          figures.bullet,
          bulletColors[i % bulletColors.length] as Color,
        ),
      })
    }
  }

  if (series.length === 0) {
    return null
  }

  const chart = asciichart(series, {
    height: 8,
    colors: colors.slice(0, series.length),
    format: (x: number) => {
      let label: string
      if (x >= 1_000_000) {
        label = (x / 1_000_000).toFixed(1) + 'M'
      } else if (x >= 1_000) {
        label = (x / 1_000).toFixed(0) + 'k'
      } else {
        label = x.toFixed(0)
      }
      return label.padStart(6)
    },
  })

  // Generate x-axis labels with dates
  const xAxisLabels = generateXAxisLabels(
    recentData,
    recentData.length,
    yAxisWidth,
  )

  return { chart, legend, xAxisLabels }
}

function generateXAxisLabels(
  data: DailyModelTokens[],
  _chartWidth: number,
  yAxisOffset: number,
): string {
  if (data.length === 0) return ''

  // Show 3-4 date labels evenly spaced, but leave room for last label
  const numLabels = Math.min(4, Math.max(2, Math.floor(data.length / 8)))
  // Don't use the very last position - leave room for the label text
  const usableLength = data.length - 6 // Reserve ~6 chars for last label (e.g., "Dec 7")
  const step = Math.floor(usableLength / (numLabels - 1)) || 1

  const labelPositions: { pos: number; label: string }[] = []

  for (let i = 0; i < numLabels; i++) {
    const idx = Math.min(i * step, data.length - 1)
    const date = new Date(data[idx]!.date)
    const label = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
    labelPositions.push({ pos: idx, label })
  }

  // Build the label string with proper spacing
  let result = ' '.repeat(yAxisOffset)
  let currentPos = 0

  for (const { pos, label } of labelPositions) {
    const spaces = Math.max(1, pos - currentPos)
    result += ' '.repeat(spaces) + label
    currentPos = pos + label.length
  }

  return result
}

// Screenshot functionality
async function handleScreenshot(
  stats: ClaudeCodeStats,
  activeTab: 'Overview' | 'Models',
  setStatus: (status: string | null) => void,
): Promise<void> {
  setStatus('copying…')

  const ansiText = renderStatsToAnsi(stats, activeTab)
  const result = await copyAnsiToClipboard(ansiText)

  setStatus(result.success ? 'copied!' : 'copy failed')

  // Clear status after 2 seconds
  setTimeout(setStatus, 2000, null)
}

function renderStatsToAnsi(
  stats: ClaudeCodeStats,
  activeTab: 'Overview' | 'Models',
): string {
  const lines: string[] = []

  if (activeTab === 'Overview') {
    lines.push(...renderOverviewToAnsi(stats))
  } else {
    lines.push(...renderModelsToAnsi(stats))
  }

  // Trim trailing empty lines
  while (
    lines.length > 0 &&
    stripAnsi(lines[lines.length - 1]!).trim() === ''
  ) {
    lines.pop()
  }

  // Add "/stats" right-aligned on the last line
  if (lines.length > 0) {
    const lastLine = lines[lines.length - 1]!
    const lastLineLen = getStringWidth(lastLine)
    // Use known content widths based on layout:
    // Overview: two-column stats = COL2_START(40) + COL2_LABEL_WIDTH(18) + max_value(~12) = 70
    // Models: chart width = 80
    const contentWidth = activeTab === 'Overview' ? 70 : 80
    const statsLabel = '/stats'
    const padding = Math.max(2, contentWidth - lastLineLen - statsLabel.length)
    lines[lines.length - 1] =
      lastLine + ' '.repeat(padding) + chalk.gray(statsLabel)
  }

  return lines.join('\n')
}

function renderOverviewToAnsi(stats: ClaudeCodeStats): string[] {
  const lines: string[] = []
  const theme = getTheme(resolveThemeSetting(getGlobalConfig().theme))
  const h = (text: string) => applyColor(text, theme.claude as Color)

  // Two-column helper with fixed spacing
  // Column 1: label (18 chars) + value + padding to reach col 2
  // Column 2 starts at character position 40
  const COL1_LABEL_WIDTH = 18
  const COL2_START = 40
  const COL2_LABEL_WIDTH = 18

  const row = (l1: string, v1: string, l2: string, v2: string): string => {
    // Build column 1: label + value
    const label1 = (l1 + ':').padEnd(COL1_LABEL_WIDTH)
    const col1PlainLen = label1.length + v1.length

    // Calculate spaces needed between col1 value and col2 label
    const spaceBetween = Math.max(2, COL2_START - col1PlainLen)

    // Build column 2: label + value
    const label2 = (l2 + ':').padEnd(COL2_LABEL_WIDTH)

    // Assemble with colors applied to values only
    return label1 + h(v1) + ' '.repeat(spaceBetween) + label2 + h(v2)
  }

  // Heatmap - use fixed width for screenshot (56 = 52 weeks + 4 for day labels)
  if (stats.dailyActivity.length > 0) {
    lines.push(generateHeatmap(stats.dailyActivity, { terminalWidth: 56 }))
    lines.push('')
  }

  // Calculate values
  const modelEntries = Object.entries(stats.modelUsage).sort(
    ([, a], [, b]) =>
      b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens),
  )
  const favoriteModel = modelEntries[0]
  const totalTokens = modelEntries.reduce(
    (sum, [, usage]) => sum + usage.inputTokens + usage.outputTokens,
    0,
  )

  // Row 1: Favorite model | Total tokens
  if (favoriteModel) {
    lines.push(
      row(
        'Favorite model',
        renderModelName(favoriteModel[0]),
        'Total tokens',
        formatNumber(totalTokens),
      ),
    )
  }
  lines.push('')

  // Row 2: Sessions | Longest session
  lines.push(
    row(
      'Sessions',
      formatNumber(stats.totalSessions),
      'Longest session',
      stats.longestSession
        ? formatDuration(stats.longestSession.duration)
        : 'N/A',
    ),
  )

  // Row 3: Current streak | Longest streak
  const currentStreakVal = `${stats.streaks.currentStreak} ${stats.streaks.currentStreak === 1 ? 'day' : 'days'}`
  const longestStreakVal = `${stats.streaks.longestStreak} ${stats.streaks.longestStreak === 1 ? 'day' : 'days'}`
  lines.push(
    row('Current streak', currentStreakVal, 'Longest streak', longestStreakVal),
  )

  // Row 4: Active days | Peak hour
  const activeDaysVal = `${stats.activeDays}/${stats.totalDays}`
  const peakHourVal =
    stats.peakActivityHour !== null
      ? `${stats.peakActivityHour}:00-${stats.peakActivityHour + 1}:00`
      : 'N/A'
  lines.push(row('Active days', activeDaysVal, 'Peak hour', peakHourVal))

  // Speculation time saved (ant-only)
  if (
    process.env.USER_TYPE === 'ant' &&
    stats.totalSpeculationTimeSavedMs > 0
  ) {
    const label = 'Speculation saved:'.padEnd(COL1_LABEL_WIDTH)
    lines.push(label + h(formatDuration(stats.totalSpeculationTimeSavedMs)))
  }

  // Shot stats (ant-only)
  if (feature('SHOT_STATS') && stats.shotDistribution) {
    const dist = stats.shotDistribution
    const totalWithShots = Object.values(dist).reduce((s, n) => s + n, 0)
    if (totalWithShots > 0) {
      const totalShots = Object.entries(dist).reduce(
        (s, [count, sessions]) => s + parseInt(count, 10) * sessions,
        0,
      )
      const avgShots = (totalShots / totalWithShots).toFixed(1)
      const bucket = (min: number, max?: number) =>
        Object.entries(dist)
          .filter(([k]) => {
            const n = parseInt(k, 10)
            return n >= min && (max === undefined || n <= max)
          })
          .reduce((s, [, v]) => s + v, 0)
      const pct = (n: number) => Math.round((n / totalWithShots) * 100)
      const fmtBucket = (count: number, p: number) => `${count} (${p}%)`
      const b1 = bucket(1, 1)
      const b2_5 = bucket(2, 5)
      const b6_10 = bucket(6, 10)
      const b11 = bucket(11)
      lines.push('')
      lines.push('Shot distribution')
      lines.push(
        row(
          '1-shot',
          fmtBucket(b1, pct(b1)),
          '2\u20135 shot',
          fmtBucket(b2_5, pct(b2_5)),
        ),
      )
      lines.push(
        row(
          '6\u201310 shot',
          fmtBucket(b6_10, pct(b6_10)),
          '11+ shot',
          fmtBucket(b11, pct(b11)),
        ),
      )
      lines.push(`${'Avg/session:'.padEnd(COL1_LABEL_WIDTH)}${h(avgShots)}`)
    }
  }

  lines.push('')

  // Fun factoid
  const factoid = generateFunFactoid(stats, totalTokens)
  lines.push(h(factoid))
  lines.push(chalk.gray(`Stats from the last ${stats.totalDays} days`))

  return lines
}

function renderModelsToAnsi(stats: ClaudeCodeStats): string[] {
  const lines: string[] = []

  const modelEntries = Object.entries(stats.modelUsage).sort(
    ([, a], [, b]) =>
      b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens),
  )

  if (modelEntries.length === 0) {
    lines.push(chalk.gray('No model usage data available'))
    return lines
  }

  const favoriteModel = modelEntries[0]
  const totalTokens = modelEntries.reduce(
    (sum, [, usage]) => sum + usage.inputTokens + usage.outputTokens,
    0,
  )

  // Generate chart if we have data - use fixed width for screenshot
  const chartOutput = generateTokenChart(
    stats.dailyModelTokens,
    modelEntries.map(([model]) => model),
    80, // Fixed width for screenshot
  )

  if (chartOutput) {
    lines.push(chalk.bold('Tokens per Day'))
    lines.push(chartOutput.chart)
    lines.push(chalk.gray(chartOutput.xAxisLabels))
    // Legend - use pre-colored bullets from chart output
    const legendLine = chartOutput.legend
      .map(item => `${item.coloredBullet} ${item.model}`)
      .join(' · ')
    lines.push(legendLine)
    lines.push('')
  }

  // Summary
  lines.push(
    `${figures.star} Favorite: ${chalk.magenta.bold(renderModelName(favoriteModel?.[0] || ''))} · ${figures.circle} Total: ${chalk.magenta(formatNumber(totalTokens))} tokens`,
  )
  lines.push('')

  // Model breakdown - only show top 3 for screenshot
  const topModels = modelEntries.slice(0, 3)
  for (const [model, usage] of topModels) {
    const modelTokens = usage.inputTokens + usage.outputTokens
    const percentage = ((modelTokens / totalTokens) * 100).toFixed(1)
    lines.push(
      `${figures.bullet} ${chalk.bold(renderModelName(model))} ${chalk.gray(`(${percentage}%)`)}`,
    )
    lines.push(
      chalk.dim(
        `  In: ${formatNumber(usage.inputTokens)} · Out: ${formatNumber(usage.outputTokens)}`,
      ),
    )
  }

  return lines
}
