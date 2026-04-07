import * as path from 'path'
import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { useRegisterOverlay } from '../context/overlayContext.js'
import { generateFileSuggestions } from '../hooks/fileSuggestions.js'
import { useTerminalSize } from '../hooks/useTerminalSize.js'
import { Text } from '@anthropic/ink'
import { logEvent } from '../services/analytics/index.js'
import { getCwd } from '../utils/cwd.js'
import { openFileInExternalEditor } from '../utils/editor.js'
import { truncatePathMiddle, truncateToWidth } from '../utils/format.js'
import { highlightMatch } from '../utils/highlightMatch.js'
import { readFileInRange } from '../utils/readFileInRange.js'
import { FuzzyPicker, LoadingState } from '@anthropic/ink'

type Props = {
  onDone: () => void
  onInsert: (text: string) => void
}

const VISIBLE_RESULTS = 8
const PREVIEW_LINES = 20

/**
 * Quick Open dialog (ctrl+shift+p / cmd+shift+p).
 * Fuzzy file finder with a syntax-highlighted preview of the focused file.
 */
export function QuickOpenDialog({ onDone, onInsert }: Props): React.ReactNode {
  useRegisterOverlay('quick-open')
  const { columns, rows } = useTerminalSize()
  // Chrome (title + search + hints + pane border + gaps) eats ~14 rows.
  // Shrink the list on short terminals so the dialog doesn't clip.
  const visibleResults = Math.min(VISIBLE_RESULTS, Math.max(4, rows - 14))

  const [results, setResults] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [focusedPath, setFocusedPath] = useState<string | undefined>(undefined)
  const [preview, setPreview] = useState<{
    path: string
    content: string
  } | null>(null)
  const queryGenRef = useRef(0)
  useEffect(() => () => void queryGenRef.current++, [])

  const previewOnRight = columns >= 120
  // Side preview sits in a fixed-height row alongside the list (visibleCount
  // rows), so overflowing that height garbles the layout — cap to fit, minus
  // one for the path header line.
  const effectivePreviewLines = previewOnRight
    ? VISIBLE_RESULTS - 1
    : PREVIEW_LINES

  // A generation counter invalidates stale results if the user types faster
  // than the index can respond.
  const handleQueryChange = (q: string) => {
    setQuery(q)
    const gen = ++queryGenRef.current
    if (!q.trim()) {
      // generateFileSuggestions('') returns raw readdir() of cwd (designed for
      // @-mentions). For Quick Open that's just noise — show the empty state.
      setResults([])
      return
    }
    void generateFileSuggestions(q, true).then(items => {
      if (gen !== queryGenRef.current) return
      // Filter out directory entries — they come back with a trailing path.sep
      // from getTopLevelPaths() and would cause readFileInRange to throw EISDIR,
      // leaving the preview pane stuck on "Loading preview…".
      // Normalize separators to '/' so truncatePathMiddle (which uses
      // lastIndexOf('/')) can find the filename on Windows too.
      const paths = items
        .filter(i => i.id.startsWith('file-'))
        .map(i => i.displayText)
        .filter(p => !p.endsWith(path.sep))
        .map(p => p.split(path.sep).join('/'))
      setResults(paths)
    })
  }

  // Load a short preview of the focused file. Each navigation aborts the
  // previous read so holding ↓ doesn't pile up whole-file reads and so a
  // slow early read can't overwrite a faster later one. The stale preview
  // stays visible until the new one arrives — renderPreview overlays a dim
  // loading indicator rather than blanking the pane.
  useEffect(() => {
    if (!focusedPath) {
      // No results — clear so the empty-state renders instead of a stale
      // preview from a previous query.
      setPreview(null)
      return
    }
    const controller = new AbortController()
    const absolute = path.resolve(getCwd(), focusedPath)
    void readFileInRange(
      absolute,
      0,
      effectivePreviewLines,
      undefined,
      controller.signal,
    )
      .then(r => {
        if (controller.signal.aborted) return
        setPreview({ path: focusedPath, content: r.content })
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setPreview({ path: focusedPath, content: '(preview unavailable)' })
      })
    return () => controller.abort()
  }, [focusedPath, effectivePreviewLines])

  const maxPathWidth = previewOnRight
    ? Math.max(20, Math.floor((columns - 10) * 0.4))
    : Math.max(20, columns - 8)
  const previewWidth = previewOnRight
    ? Math.max(40, columns - maxPathWidth - 14)
    : columns - 6

  const handleOpen = (p: string) => {
    const opened = openFileInExternalEditor(path.resolve(getCwd(), p))
    logEvent('tengu_quick_open_select', {
      result_count: results.length,
      opened_editor: opened,
    })
    onDone()
  }

  const handleInsert = (p: string, mention: boolean) => {
    onInsert(mention ? `@${p} ` : `${p} `)
    logEvent('tengu_quick_open_insert', {
      result_count: results.length,
      mention,
    })
    onDone()
  }

  return (
    <FuzzyPicker
      title="Quick Open"
      placeholder="Type to search files…"
      items={results}
      getKey={p => p}
      visibleCount={visibleResults}
      direction="up"
      previewPosition={previewOnRight ? 'right' : 'bottom'}
      onQueryChange={handleQueryChange}
      onFocus={setFocusedPath}
      onSelect={handleOpen}
      onTab={{ action: 'mention', handler: p => handleInsert(p, true) }}
      onShiftTab={{
        action: 'insert path',
        handler: p => handleInsert(p, false),
      }}
      onCancel={onDone}
      emptyMessage={q => (q ? 'No matching files' : 'Start typing to search…')}
      selectAction="open in editor"
      renderItem={(p, isFocused) => (
        <Text color={isFocused ? 'suggestion' : undefined}>
          {truncatePathMiddle(p, maxPathWidth)}
        </Text>
      )}
      renderPreview={p =>
        preview ? (
          <>
            <Text dimColor>
              {truncatePathMiddle(p, previewWidth)}
              {preview.path !== p ? ' · loading…' : ''}
            </Text>
            {preview.content.split('\n').map((line, i) => (
              <Text key={i}>
                {highlightMatch(truncateToWidth(line, previewWidth), query)}
              </Text>
            ))}
          </>
        ) : (
          <LoadingState message="Loading preview…" dimColor />
        )
      }
    />
  )
}
