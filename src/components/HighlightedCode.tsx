import * as React from 'react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '../hooks/useSettings.js';
import { Ansi, Box, type DOMElement, measureElement, NoSelect, Text, useTheme } from '@anthropic/ink';
import { isFullscreenEnvEnabled } from '../utils/fullscreen.js';
import sliceAnsi from '../utils/sliceAnsi.js';
import { countCharInString } from '../utils/stringUtils.js';
import { HighlightedCodeFallback } from './HighlightedCode/Fallback.js';
import { expectColorFile } from './StructuredDiff/colorDiff.js';
import type { ColorFile as ColorFileType } from 'color-diff-napi';

// Module-level LRU cache for ColorFile instances to avoid recreating
// them for the same (filePath, code) across component instances.
const colorFileCache = new Map<string, { colorFile: ColorFileType; code: string }>();
const COLOR_FILE_CACHE_MAX = 50;

type Props = {
  code: string;
  filePath: string;
  width?: number;
  dim?: boolean;
};

const DEFAULT_WIDTH = 80;

export const HighlightedCode = memo(function HighlightedCode({
  code,
  filePath,
  width,
  dim = false,
}: Props): React.ReactElement {
  const ref = useRef<DOMElement>(null);
  const [measuredWidth, setMeasuredWidth] = useState(width || DEFAULT_WIDTH);
  const [theme] = useTheme();
  const settings = useSettings();
  const syntaxHighlightingDisabled = settings.syntaxHighlightingDisabled ?? false;

  const colorFile = useMemo(() => {
    if (syntaxHighlightingDisabled) {
      return null;
    }
    const ColorFile = expectColorFile();
    if (!ColorFile) {
      return null;
    }
    const cacheKey = `${filePath}\0${code.length}`;
    const cached = colorFileCache.get(cacheKey);
    if (cached && cached.code === code) {
      // Move to end (most recently used)
      colorFileCache.delete(cacheKey);
      colorFileCache.set(cacheKey, cached);
      return cached.colorFile;
    }
    const instance = new ColorFile(code, filePath);
    // Evict oldest entry if cache is full
    if (colorFileCache.size >= COLOR_FILE_CACHE_MAX) {
      const oldest = colorFileCache.keys().next().value;
      if (oldest !== undefined) colorFileCache.delete(oldest);
    }
    colorFileCache.set(cacheKey, { colorFile: instance, code });
    return instance;
  }, [code, filePath, syntaxHighlightingDisabled]);

  useEffect(() => {
    if (!width && ref.current) {
      const { width: elementWidth } = measureElement(ref.current);
      if (elementWidth > 0) {
        setMeasuredWidth(elementWidth - 2);
      }
    }
  }, [width]);

  const lines = useMemo(() => {
    if (colorFile === null) {
      return null;
    }
    return colorFile.render(theme, measuredWidth, dim);
  }, [colorFile, theme, measuredWidth, dim]);

  // Gutter width matches ColorFile's layout in lib.rs: space + right-aligned
  // line number (max_digits = lineCount.toString().length) + space. No marker
  // column like the diff path. Wrap in <NoSelect> so fullscreen selection
  // yields clean code without line numbers. Only split in fullscreen mode
  // (~4× DOM nodes + sliceAnsi cost); non-fullscreen uses terminal-native
  // selection where noSelect is meaningless.
  const gutterWidth = useMemo(() => {
    if (!isFullscreenEnvEnabled()) return 0;
    const lineCount = countCharInString(code, '\n') + 1;
    return lineCount.toString().length + 2;
  }, [code]);

  return (
    <Box ref={ref}>
      {lines ? (
        <Box flexDirection="column">
          {lines.map((line, i) =>
            gutterWidth > 0 ? (
              <CodeLine key={i} line={line} gutterWidth={gutterWidth} />
            ) : (
              <Text key={i}>
                <Ansi>{line}</Ansi>
              </Text>
            ),
          )}
        </Box>
      ) : (
        <HighlightedCodeFallback code={code} filePath={filePath} dim={dim} skipColoring={syntaxHighlightingDisabled} />
      )}
    </Box>
  );
});

function CodeLine({ line, gutterWidth }: { line: string; gutterWidth: number }): React.ReactNode {
  const gutter = sliceAnsi(line, 0, gutterWidth);
  const content = sliceAnsi(line, gutterWidth);
  return (
    <Box flexDirection="row">
      <NoSelect fromLeftEdge>
        <Text>
          <Ansi>{gutter}</Ansi>
        </Text>
      </NoSelect>
      <Text>
        <Ansi>{content}</Ansi>
      </Text>
    </Box>
  );
}
