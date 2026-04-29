import { type StructuredPatchHunk, structuredPatch } from 'diff'
import { logError } from 'src/utils/log.js'
import { expandPath } from 'src/utils/path.js'
import { countCharInString } from 'src/utils/stringUtils.js'
import {
  DIFF_TIMEOUT_MS,
  getPatchForDisplay,
  getPatchFromContents,
} from 'src/utils/diff.js'
import { errorMessage, isENOENT } from 'src/utils/errors.js'
import {
  addLineNumbers,
  convertLeadingTabsToSpaces,
  readFileSyncCached,
} from 'src/utils/file.js'
import type { EditInput, FileEdit } from './types.js'

// Claude 无法输出花引号，因此我们在此将其定义为常量，供 Claud
// e 在代码中使用。我们这样做是因为在应用编辑时，我们会将花引号
// 规范化为直引号。
export const LEFT_SINGLE_CURLY_QUOTE = '‘'
export const RIGHT_SINGLE_CURLY_QUOTE = '’'
export const LEFT_DOUBLE_CURLY_QUOTE = '“'
export const RIGHT_DOUBLE_CURLY_QUOTE = '”'

/** 通过将花引号转换为直引号来规范化字符串中的引号
@param str 要规范化的字符串
@returns 所有花引号被替换为直引号后的字符串 */
export function normalizeQuotes(str: string): string {
  return str
    .replaceAll(LEFT_SINGLE_CURLY_QUOTE, "'")
    .replaceAll(RIGHT_SINGLE_CURLY_QUOTE, "'")
    .replaceAll(LEFT_DOUBLE_CURLY_QUOTE, '"')
    .replaceAll(RIGHT_DOUBLE_CURLY_QUOTE, '"')
}

/** 去除字符串中每行的尾部空白字符，同时保留行尾符
@param str 要处理的字符串
@returns 每行尾部空白字符被移除后的字符串 */
export function stripTrailingWhitespace(str: string): string {
  // 处理不同的行尾符：CRLF、LF、C
  // R。使用一个匹配行尾符并捕获它们的正则表达式
  const lines = str.split(/(\r\n|\n|\r)/)

  let result = ''
  for (let i = 0; i < lines.length; i++) {
    const part = lines[i]
    if (part !== undefined) {
      if (i % 2 === 0) {
        // 偶数索引是行内容
        result += part.replace(/\s+$/, '')
      } else {
        // 奇数索引是行尾符
        result += part
      }
    }
  }

  return result
}

/**
 * Normalizes whitespace for fuzzy matching by converting tabs to spaces
 * and collapsing leading whitespace on each line to a canonical form.
 * This handles the case where Read tool output renders tabs as spaces,
 * so users copy spaces from the output but the file actually has tabs.
 */
function normalizeWhitespace(str: string): string {
  return str.replace(/\t/g, '    ')
}

/**
 * Finds the actual string in the file content that matches the search string,
 * accounting for quote normalization and tab/space differences.
 *
 * Matching cascade:
 * 1. Exact match
 * 2. Quote normalization (curly → straight quotes)
 * 3. Tab/space normalization (tabs ↔ spaces in leading whitespace)
 * 4. Quote + tab/space normalization combined
 *
 * @param fileContent The file content to search in
 * @param searchString The string to search for
 * @returns The actual string found in the file, or null if not found
 */
export function findActualString(
  fileContent: string,
  searchString: string,
): string | null {
  // 首先尝试精确匹配
  if (fileContent.includes(searchString)) {
    return searchString
  }

  // 尝试使用规范化后的引号进行匹配
  const normalizedSearch = normalizeQuotes(searchString)
  const normalizedFile = normalizeQuotes(fileContent)

  const searchIndex = normalizedFile.indexOf(normalizedSearch)
  if (searchIndex !== -1) {
    // 在文件中查找匹配的实际字符串
    return fileContent.substring(searchIndex, searchIndex + searchString.length)
  }

  // Try with tab/space normalization — handles the case where Read output
  // renders tabs as spaces and the user copies the rendered version
  const wsNormalizedFile = normalizeWhitespace(fileContent)
  const wsNormalizedSearch = normalizeWhitespace(searchString)

  const wsSearchIndex = wsNormalizedFile.indexOf(wsNormalizedSearch)
  if (wsSearchIndex !== -1) {
    // Map the match position back to the original file content.
    // We need to find the corresponding range in the original string.
    return mapNormalizedMatchBackToFile(fileContent, wsNormalizedFile, wsSearchIndex, wsNormalizedSearch.length)
  }

  // Try combined: quote normalization + tab/space normalization
  const combinedFile = normalizeWhitespace(normalizedFile)
  const combinedSearch = normalizeWhitespace(normalizedSearch)

  const combinedIndex = combinedFile.indexOf(combinedSearch)
  if (combinedIndex !== -1) {
    return mapNormalizedMatchBackToFile(fileContent, combinedFile, combinedIndex, combinedSearch.length)
  }

  return null
}

/**
 * Given a match found in a normalized version of fileContent, map the match
 * position back to the original fileContent and extract the corresponding
 * substring.
 *
 * Strategy: walk through both strings character by character, building a
 * mapping from normalized offset to original offset. When a tab is expanded
 * to 4 spaces in the normalized version, the normalized offset advances by 4
 * while the original offset advances by 1.
 */
function mapNormalizedMatchBackToFile(
  fileContent: string,
  normalizedFile: string,
  normalizedStart: number,
  normalizedLength: number,
): string {
  // Build a sparse mapping from normalized position → original position.
  // We only need to map the range [normalizedStart, normalizedStart + normalizedLength].
  let normPos = 0
  let origPos = 0
  let origStart = -1
  let origEnd = -1

  while (origPos < fileContent.length && normPos <= normalizedStart + normalizedLength) {
    if (normPos === normalizedStart) {
      origStart = origPos
    }
    if (normPos === normalizedStart + normalizedLength) {
      origEnd = origPos
      break
    }

    const origChar = fileContent[origPos]!
    if (origChar === '\t') {
      // Tab expands to 4 spaces in normalized version
      const nextNormPos = normPos + 4
      // If normalizedStart falls within this expanded tab, snap to origPos
      if (normPos < normalizedStart && nextNormPos > normalizedStart && origStart === -1) {
        origStart = origPos
      }
      if (normPos < normalizedStart + normalizedLength && nextNormPos > normalizedStart + normalizedLength && origEnd === -1) {
        origEnd = origPos + 1
      }
      normPos = nextNormPos
      origPos++
    } else {
      normPos++
      origPos++
    }
  }

  // Fallback: if we couldn't map precisely, use character-count heuristic
  if (origStart === -1) origStart = 0
  if (origEnd === -1) {
    // Approximate: use the ratio of original to normalized length
    const ratio = fileContent.length / normalizedFile.length
    origEnd = Math.round(origStart + normalizedLength * ratio)
  }

  return fileContent.substring(origStart, origEnd)
}

/**
 * When old_string matched via quote normalization (curly quotes in file,
 * straight quotes from model), apply the same curly quote style to new_string
 * so the edit preserves the file's typography.
 *
 * Uses a simple open/close heuristic: a quote character preceded by whitespace,
 * start of string, or opening punctuation is treated as an opening quote;
 * otherwise it's a closing quote.
 */
export function preserveQuoteStyle(
  oldString: string,
  actualOldString: string,
  newString: string,
): string {
  // 如果它们相同，则未发生规范化
  if (oldString === actualOldString) {
    return newString
  }

  // 检测文件中存在的花引号类型
  const hasDoubleQuotes =
    actualOldString.includes(LEFT_DOUBLE_CURLY_QUOTE) ||
    actualOldString.includes(RIGHT_DOUBLE_CURLY_QUOTE)
  const hasSingleQuotes =
    actualOldString.includes(LEFT_SINGLE_CURLY_QUOTE) ||
    actualOldString.includes(RIGHT_SINGLE_CURLY_QUOTE)

  if (!hasDoubleQuotes && !hasSingleQuotes) {
    return newString
  }

  let result = newString

  if (hasDoubleQuotes) {
    result = applyCurlyDoubleQuotes(result)
  }
  if (hasSingleQuotes) {
    result = applyCurlySingleQuotes(result)
  }

  return result
}

function isOpeningContext(chars: string[], index: number): boolean {
  if (index === 0) {
    return true
  }
  const prev = chars[index - 1]
  return (
    prev === ' ' ||
    prev === '\t' ||
    prev === '\n' ||
    prev === '\r' ||
    prev === '(' ||
    prev === '[' ||
    prev === '{' ||
    prev === '\u2014' || // 长破折号
    prev === '\u2013' // 短破折号
  )
}

function applyCurlyDoubleQuotes(str: string): string {
  const chars = [...str]
  const result: string[] = []
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === '"') {
      result.push(
        isOpeningContext(chars, i)
          ? LEFT_DOUBLE_CURLY_QUOTE
          : RIGHT_DOUBLE_CURLY_QUOTE,
      )
    } else {
      result.push(chars[i]!)
    }
  }
  return result.join('')
}

function applyCurlySingleQuotes(str: string): string {
  const chars = [...str]
  const result: string[] = []
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === "'") {
      // 不要转换缩略词中的撇号（例如 "don't"、"i
      // t's"）。两个字母之间的撇号是缩略符，不是引号
      const prev = i > 0 ? chars[i - 1] : undefined
      const next = i < chars.length - 1 ? chars[i + 1] : undefined
      const prevIsLetter = prev !== undefined && /\p{L}/u.test(prev)
      const nextIsLetter = next !== undefined && /\p{L}/u.test(next)
      if (prevIsLetter && nextIsLetter) {
        // 缩略词中的撇号 — 使用右单花引号
        result.push(RIGHT_SINGLE_CURLY_QUOTE)
      } else {
        result.push(
          isOpeningContext(chars, i)
            ? LEFT_SINGLE_CURLY_QUOTE
            : RIGHT_SINGLE_CURLY_QUOTE,
        )
      }
    } else {
      result.push(chars[i]!)
    }
  }
  return result.join('')
}

/** 转换编辑操作以确保 replace_all 始终具有布尔值
@param edits 包含可选 replace_all 的编辑数组
@returns 保证 replace_all 为布尔值的编辑数组 */
export function applyEditToFile(
  originalContent: string,
  oldString: string,
  newString: string,
  replaceAll: boolean = false,
): string {
  const f = replaceAll
    ? (content: string, search: string, replace: string) =>
        content.replaceAll(search, () => replace)
    : (content: string, search: string, replace: string) =>
        content.replace(search, () => replace)

  if (newString !== '') {
    return f(originalContent, oldString, newString)
  }

  const stripTrailingNewline =
    !oldString.endsWith('\n') && originalContent.includes(oldString + '\n')

  return stripTrailingNewline
    ? f(originalContent, oldString + '\n', newString)
    : f(originalContent, oldString, newString)
}

/** 将编辑应用于文件并返回补丁和更新后的文件。
不会将文件写入磁盘。 */
export function getPatchForEdit({
  filePath,
  fileContents,
  oldString,
  newString,
  replaceAll = false,
}: {
  filePath: string
  fileContents: string
  oldString: string
  newString: string
  replaceAll?: boolean
}): { patch: StructuredPatchHunk[]; updatedFile: string } {
  return getPatchForEdits({
    filePath,
    fileContents,
    edits: [
      { old_string: oldString, new_string: newString, replace_all: replaceAll },
    ],
  })
}

/** 将一系列编辑应用于文件并返回补丁和更新后的文件。
不会将文件写入磁盘。

注意：返回的补丁仅用于显示目的 - 它使用空格代替制表符 */
export function getPatchForEdits({
  filePath,
  fileContents,
  edits,
}: {
  filePath: string
  fileContents: string
  edits: FileEdit[]
}): { patch: StructuredPatchHunk[]; updatedFile: string } {
  let updatedFile = fileContents
  const appliedNewStrings: string[] = []

  // 空文件的特殊情况。
  if (
    !fileContents &&
    edits.length === 1 &&
    edits[0] &&
    edits[0].old_string === '' &&
    edits[0].new_string === ''
  ) {
    const patch = getPatchForDisplay({
      filePath,
      fileContents,
      edits: [
        {
          old_string: fileContents,
          new_string: updatedFile,
          replace_all: false,
        },
      ],
    })
    return { patch, updatedFile: '' }
  }

  // 应用每个编辑并检查它是否实际更改了文件
  for (const edit of edits) {
    // 在检查前去除 old_string 的尾部换行符
    const oldStringToCheck = edit.old_string.replace(/\n+$/, '')

    // 检查 old_string 是否是任何先前应用的 new_string 的子字符串
    for (const previousNewString of appliedNewStrings) {
      if (
        oldStringToCheck !== '' &&
        previousNewString.includes(oldStringToCheck)
      ) {
        throw new Error(
          '无法编辑文件：old_string 是先前编辑的 new_string 的子字符串。',
        )
      }
    }

    const previousContent = updatedFile
    updatedFile =
      edit.old_string === ''
        ? edit.new_string
        : applyEditToFile(
            updatedFile,
            edit.old_string,
            edit.new_string,
            edit.replace_all,
          )

    // 如果此编辑未更改任何内容，则抛出错误
    if (updatedFile === previousContent) {
      throw new Error('在文件中未找到字符串。应用编辑失败。')
    }

    // 跟踪已应用的新字符串
    appliedNewStrings.push(edit.new_string)
  }

  if (updatedFile === fileContents) {
    throw new Error(
      '原始文件和编辑后的文件完全匹配。应用编辑失败。',
    )
  }

  // 我们已经有了修改前/后的内容，因此直接调用 getPatchFromContents。之前这是通过 get
  // PatchForDisplay 并传入 edits=[{old:fileContents,new:updatedFile}] 来处理的
  // ，这会导致 fileContents 被转换两次（一次作为 preparedFileContents，另一次作为 reduce
  // 内部的 escapedOldString）并运行一个无操作的全内容 .replace()。这为大型文件节省了约 20% 的开销。
  const patch = getPatchFromContents({
    filePath,
    oldContent: convertLeadingTabsToSpaces(fileContents),
    newContent: convertLeadingTabsToSpaces(updatedFile),
  })

  return { patch, updatedFile }
}

// 对 edited_text_file 附件片段设置上限。之前保存时
// 格式化大文件会每轮注入整个文件（观察到最大 16.1KB，约 1
// 4K 令牌/会话）。8KB 能在保留有意义上下文的同时限制最坏情况。
const DIFF_SNIPPET_MAX_BYTES = 8192

/** 用于附件，在文件变更时显示片段。

TODO：将此逻辑与其他片段逻辑统一。 */
export function getSnippetForTwoFileDiff(
  fileAContents: string,
  fileBContents: string,
): string {
  const patch = structuredPatch(
    'file.txt',
    'file.txt',
    fileAContents,
    fileBContents,
    undefined,
    undefined,
    {
      context: 8,
      timeout: DIFF_TIMEOUT_MS,
    },
  )

  if (!patch) {
    return ''
  }

  const full = patch.hunks
    .map(_ => ({
      startLine: _.oldStart,
      content: _.lines
        // 过滤掉已删除的行和差异元数据行
        .filter(_ => !_.startsWith('-') && !_.startsWith('\\'))
        .map(_ => _.slice(1))
        .join('\n'),
    }))
    .map(addLineNumbers)
    .join('\n...\n')

  if (full.length <= DIFF_SNIPPET_MAX_BYTES) {
    return full
  }

  // 在符合上限的最后一个行边界处截断。标记格式与 Bas
  // hTool/utils.ts 匹配。
  const cutoff = full.lastIndexOf('\n', DIFF_SNIPPET_MAX_BYTES)
  const kept =
    cutoff > 0 ? full.slice(0, cutoff) : full.slice(0, DIFF_SNIPPET_MAX_BYTES)
  const remaining = countCharInString(full, '\n', kept.length) + 1
  return `${kept}

... [${remaining} 行被截断] ...`
}

const CONTEXT_LINES = 4

/** 从文件中获取一个片段，显示补丁周围带行号的上下文。
@param originalFile 应用补丁前的原始文件内容
@param patch 用于确定片段位置的差异块
@param newFile 应用补丁后的文件内容
@returns 带行号的片段文本及起始行号 */
export function getSnippetForPatch(
  patch: StructuredPatchHunk[],
  newFile: string,
): { formattedSnippet: string; startLine: number } {
  if (patch.length === 0) {
    // 无更改，返回空片段
    return { formattedSnippet: '', startLine: 1 }
  }

  // 查找所有差异块中的第一个和最后一个更改行
  let minLine = Infinity
  let maxLine = -Infinity

  for (const hunk of patch) {
    if (hunk.oldStart < minLine) {
      minLine = hunk.oldStart
    }
    // 对于结束行，我们需要考虑新行数，因为我们显示的是新文件
    const hunkEnd = hunk.oldStart + (hunk.newLines || 0) - 1
    if (hunkEnd > maxLine) {
      maxLine = hunkEnd
    }
  }

  // 计算带上下文的范围
  const startLine = Math.max(1, minLine - CONTEXT_LINES)
  const endLine = maxLine + CONTEXT_LINES

  // 将新文件拆分为行并获取片段
  const fileLines = newFile.split(/\r?\n/)
  const snippetLines = fileLines.slice(startLine - 1, endLine)
  const snippet = snippetLines.join('\n')

  // 添加行号
  const formattedSnippet = addLineNumbers({
    content: snippet,
    startLine,
  })

  return { formattedSnippet, startLine }
}

/** 从文件中获取一个片段，显示单个编辑周围的上下文。
这是一个使用原始算法的便捷函数。
@param originalFile 原始文件内容
@param oldString 要替换的文本
@param newString 用于替换的文本
@param contextLines 在更改前后显示的行数
@returns 片段及起始行号 */
export function getSnippet(
  originalFile: string,
  oldString: string,
  newString: string,
  contextLines: number = 4,
): { snippet: string; startLine: number } {
  // 使用 FileEditTool.tsx 中的原始算法
  const before = originalFile.split(oldString)[0] ?? ''
  const replacementLine = before.split(/\r?\n/).length - 1
  const newFileLines = applyEditToFile(
    originalFile,
    oldString,
    newString,
  ).split(/\r?\n/)

  // 计算片段的起始和结束行号
  const startLine = Math.max(0, replacementLine - contextLines)
  const endLine =
    replacementLine + contextLines + newString.split(/\r?\n/).length

  // 获取片段
  const snippetLines = newFileLines.slice(startLine, endLine)
  const snippet = snippetLines.join('\n')

  return { snippet, startLine: startLine + 1 }
}

export function getEditsForPatch(patch: StructuredPatchHunk[]): FileEdit[] {
  return patch.map(hunk => {
    // 从此差异块中提取更改
    const contextLines: string[] = []
    const oldLines: string[] = []
    const newLines: string[] = []

    // 解析每一行并分类
    for (const line of hunk.lines) {
      if (line.startsWith(' ')) {
        // 上下文行 - 在两个版本中都出现
        contextLines.push(line.slice(1))
        oldLines.push(line.slice(1))
        newLines.push(line.slice(1))
      } else if (line.startsWith('-')) {
        // 已删除行 - 仅出现在旧版本中
        oldLines.push(line.slice(1))
      } else if (line.startsWith('+')) {
        // 新增行 - 仅出现在新版本中
        newLines.push(line.slice(1))
      }
    }

    return {
      old_string: oldLines.join('\n'),
      new_string: newLines.join('\n'),
      replace_all: false,
    }
  })
}

/** 包含用于对 Claude 的字符串进行去消毒的替换
由于 Claude 无法看到这些字符串（在 API 中已消毒）
它会在编辑响应中输出消毒后的版本 */
const DESANITIZATIONS: Record<string, string> = {
  '<fnr>': '<function_results>',
  '<n>': '<name>',
  '</n>': '</name>',
  '<o>': '<output>',
  '</o>': '</output>',
  '<e>': '<error>',
  '</e>': '</error>',
  '<s>': '<system>',
  '</s>': '</system>',
  '<r>': '<result>',
  '</r>': '</result>',
  '< META_START >': '<META_START>',
  '< META_END >': '<META_END>',
  '< EOT >': '<EOT>',
  '< META >': '<META>',
  '< SOS >': '<SOS>',
  '\n\nH:': '\n\nHuman:',
  '\n\nA:': '\n\nAssistant:',
}

/** 通过应用特定替换来规范化匹配字符串
这有助于处理因格式差异导致精确匹配失败的情况
@returns 规范化后的字符串以及应用了哪些替换 */
function desanitizeMatchString(matchString: string): {
  result: string
  appliedReplacements: Array<{ from: string; to: string }>
} {
  let result = matchString
  const appliedReplacements: Array<{ from: string; to: string }> = []

  for (const [from, to] of Object.entries(DESANITIZATIONS)) {
    const beforeReplace = result
    result = result.replaceAll(from, to)

    if (beforeReplace !== result) {
      appliedReplacements.push({ from, to })
    }
  }

  return { result, appliedReplacements }
}

/** 为 FileEditTool 规范化输入
如果文件中未找到要替换的字符串，则尝试使用规范化版本
如果成功则返回规范化输入，否则返回原始输入 */
export function normalizeFileEditInput({
  file_path,
  edits,
}: {
  file_path: string
  edits: EditInput[]
}): {
  file_path: string
  edits: EditInput[]
} {
  if (edits.length === 0) {
    return { file_path, edits }
  }

  // Markdown 使用两个尾随空格作为硬换行符——去除会静默改变语义。对于 .
  // md/.mdx 文件跳过 stripTrailingWhitespace。
  const isMarkdown = /\.(md|mdx)$/i.test(file_path)

  try {
    const fullPath = expandPath(file_path)

    // 使用缓存文件读取以避免冗余 I/O 操作。如果文件不存在
    // ，readFileSyncCached 会抛出 ENOENT 错误，由
    // 下方的 catch 块处理并返回原始输入（无需 TOCTOU 预检查）。
    const fileContent = readFileSyncCached(fullPath)

    return {
      file_path,
      edits: edits.map(({ old_string, new_string, replace_all }) => {
        const normalizedNewString = isMarkdown
          ? new_string
          : stripTrailingWhitespace(new_string)

        // 如果精确字符串匹配有效，则保持原样
        if (fileContent.includes(old_string)) {
          return {
            old_string,
            new_string: normalizedNewString,
            replace_all,
          }
        }

        // 如果精确匹配失败，则尝试对字符串进行去清理操作
        const { result: desanitizedOldString, appliedReplacements } =
          desanitizeMatchString(old_string)

        if (fileContent.includes(desanitizedOldString)) {
          // 对 new_string 应用相同的精确替换
          let desanitizedNewString = normalizedNewString
          for (const { from, to } of appliedReplacements) {
            desanitizedNewString = desanitizedNewString.replaceAll(from, to)
          }

          return {
            old_string: desanitizedOldString,
            new_string: desanitizedNewString,
            replace_all,
          }
        }

        return {
          old_string,
          new_string: normalizedNewString,
          replace_all,
        }
      }),
    }
  } catch (error) {
    // 如果读取文件时出现任何错误，直接返回原始输入。当文件尚
    // 不存在时（例如新文件），预期会出现 ENOENT 错误。
    if (!isENOENT(error)) {
      logError(error)
    }
  }

  return { file_path, edits }
}

/** 通过将两组编辑应用到原始内容并比较结果，来判断它们是否等效。这处理了编辑可能不同但产生相同结果的情况。 */
export function areFileEditsEquivalent(
  edits1: FileEdit[],
  edits2: FileEdit[],
  originalContent: string,
): boolean {
  // 快速路径：检查编辑是否字面意义上完全相同
  if (
    edits1.length === edits2.length &&
    edits1.every((edit1, index) => {
      const edit2 = edits2[index]
      return (
        edit2 !== undefined &&
        edit1.old_string === edit2.old_string &&
        edit1.new_string === edit2.new_string &&
        edit1.replace_all === edit2.replace_all
      )
    })
  ) {
    return true
  }

  // 尝试应用两组编辑
  let result1: { patch: StructuredPatchHunk[]; updatedFile: string } | null =
    null
  let error1: string | null = null
  let result2: { patch: StructuredPatchHunk[]; updatedFile: string } | null =
    null
  let error2: string | null = null

  try {
    result1 = getPatchForEdits({
      filePath: 'temp',
      fileContents: originalContent,
      edits: edits1,
    })
  } catch (e) {
    error1 = errorMessage(e)
  }

  try {
    result2 = getPatchForEdits({
      filePath: 'temp',
      fileContents: originalContent,
      edits: edits2,
    })
  } catch (e) {
    error2 = errorMessage(e)
  }

  // 如果两者都抛出错误，则仅当错误相同时它们才相等
  if (error1 !== null && error2 !== null) {
    // 为比较而规范化错误信息
    return error1 === error2
  }

  // 如果一个抛出错误而另一个没有，则它们不相等
  if (error1 !== null || error2 !== null) {
    return false
  }

  // 两者都成功 - 比较结果
  return result1!.updatedFile === result2!.updatedFile
}

/** 用于检查两个文件编辑输入是否等效的统一函数。处理文件编辑（FileEditTool）。 */
export function areFileEditsInputsEquivalent(
  input1: {
    file_path: string
    edits: FileEdit[]
  },
  input2: {
    file_path: string
    edits: FileEdit[]
  },
): boolean {
  // 快速路径：不同文件
  if (input1.file_path !== input2.file_path) {
    return false
  }

  // 快速路径：字面相等
  if (
    input1.edits.length === input2.edits.length &&
    input1.edits.every((edit1, index) => {
      const edit2 = input2.edits[index]
      return (
        edit2 !== undefined &&
        edit1.old_string === edit2.old_string &&
        edit1.new_string === edit2.new_string &&
        edit1.replace_all === edit2.replace_all
      )
    })
  ) {
    return true
  }

  // 语义比较（需要读取文件）。如果文件不存在，则与空内容
  // 进行比较（无需 TOCTOU 预检查）。
  let fileContent = ''
  try {
    fileContent = readFileSyncCached(input1.file_path)
  } catch (error) {
    if (!isENOENT(error)) {
      throw error
    }
  }

  return areFileEditsEquivalent(input1.edits, input2.edits, fileContent)
}