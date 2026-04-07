import { extname } from 'path'
import React, { Suspense, use, useMemo } from 'react'
import { Ansi, Text } from '@anthropic/ink'
import { getCliHighlightPromise } from '../../utils/cliHighlight.js'
import { logForDebugging } from '../../utils/debug.js'
import { convertLeadingTabsToSpaces } from '../../utils/file.js'
import { hashPair } from '../../utils/hash.js'

type Props = {
  code: string
  filePath: string
  dim?: boolean
  skipColoring?: boolean
}

// Module-level highlight cache — hl.highlight() is the hot cost on virtual-
// scroll remounts. useMemo doesn't survive unmount→remount. Keyed by hash
// of code+language to avoid retaining full source strings (#24180 RSS fix).
const HL_CACHE_MAX = 500
const hlCache = new Map<string, string>()
function cachedHighlight(
  hl: NonNullable<Awaited<ReturnType<typeof getCliHighlightPromise>>>,
  code: string,
  language: string,
): string {
  const key = hashPair(language, code)
  const hit = hlCache.get(key)
  if (hit !== undefined) {
    hlCache.delete(key)
    hlCache.set(key, hit)
    return hit
  }
  const out = hl.highlight(code, { language })
  if (hlCache.size >= HL_CACHE_MAX) {
    const first = hlCache.keys().next().value
    if (first !== undefined) hlCache.delete(first)
  }
  hlCache.set(key, out)
  return out
}

export function HighlightedCodeFallback({
  code,
  filePath,
  dim = false,
  skipColoring = false,
}: Props): React.ReactElement {
  const codeWithSpaces = convertLeadingTabsToSpaces(code)
  if (skipColoring) {
    return (
      <Text dimColor={dim}>
        <Ansi>{codeWithSpaces}</Ansi>
      </Text>
    )
  }
  const language = extname(filePath).slice(1)
  return (
    <Text dimColor={dim}>
      <Suspense fallback={<Ansi>{codeWithSpaces}</Ansi>}>
        <Highlighted codeWithSpaces={codeWithSpaces} language={language} />
      </Suspense>
    </Text>
  )
}

function Highlighted({
  codeWithSpaces,
  language,
}: {
  codeWithSpaces: string
  language: string
}): React.ReactElement {
  const hl = use(getCliHighlightPromise())
  const out = useMemo(() => {
    if (!hl) return codeWithSpaces
    let highlightLang = 'markdown'
    if (language) {
      if (hl.supportsLanguage(language)) {
        highlightLang = language
      } else {
        logForDebugging(
          `Language not supported while highlighting code, falling back to markdown: ${language}`,
        )
      }
    }
    try {
      return cachedHighlight(hl, codeWithSpaces, highlightLang)
    } catch (e) {
      if (e instanceof Error && e.message.includes('Unknown language')) {
        logForDebugging(
          `Language not supported while highlighting code, falling back to markdown: ${e}`,
        )
        return cachedHighlight(hl, codeWithSpaces, 'markdown')
      }
      return codeWithSpaces
    }
  }, [codeWithSpaces, language, hl])
  return <Ansi>{out}</Ansi>
}
