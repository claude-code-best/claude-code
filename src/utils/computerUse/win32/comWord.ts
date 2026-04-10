/**
 * Word COM automation module for Windows.
 * Uses PowerShell to drive Word.Application COM object — fully headless (Visible=false).
 * Each function builds a PowerShell script, runs it via Bun.spawnSync, and parses JSON output.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WordParagraph {
  text: string
  bold?: boolean
  italic?: boolean
  fontSize?: number
}

export interface WordTable {
  rows: number
  cols: number
  data: string[][]
}

export interface WordDocInfo {
  text: string
  paragraphs: WordParagraph[]
  tables: WordTable[]
  wordCount: number
  pageCount: number
}

export interface AppendTextOptions {
  bold?: boolean
  italic?: boolean
  fontSize?: number
  fontName?: string
}

// ---------------------------------------------------------------------------
// PowerShell runner
// ---------------------------------------------------------------------------

function runPs(script: string): string {
  const result = Bun.spawnSync({
    cmd: ['powershell', '-NoProfile', '-NonInteractive', '-Command', script],
    stdout: 'pipe',
    stderr: 'pipe',
  })
  return new TextDecoder().decode(result.stdout).trim()
}

function parseJsonOutput<T>(raw: string, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** Escape a string for safe embedding inside a PowerShell single-quoted string. */
function psEscape(s: string): string {
  return s.replace(/'/g, "''")
}

// ---------------------------------------------------------------------------
// Word COM wrapper template
// ---------------------------------------------------------------------------

/**
 * Wraps a Word COM script body with standard open/cleanup boilerplate.
 * The body receives $word and $doc variables.
 * If `openPath` is provided the document is opened; otherwise a new doc is created.
 */
function wrapWordScript(body: string, openPath?: string): string {
  const openCmd = openPath
    ? `$doc = $word.Documents.Open('${psEscape(openPath)}')`
    : '$doc = $word.Documents.Add()'

  return `
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
    ${openCmd}
    ${body}
} finally {
    if ($doc -ne $null) { $doc.Close($false); }
    if ($word -ne $null) { $word.Quit(); }
    if ($word -ne $null) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null }
}
`
}

/**
 * Same as wrapWordScript but the body is responsible for saving before close.
 * After body runs, $doc.Save() is called automatically.
 */
function wrapWordScriptWithSave(body: string, openPath: string): string {
  return `
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
    $doc = $word.Documents.Open('${psEscape(openPath)}')
    ${body}
    $doc.Save()
    Write-Output '{"ok":true}'
} catch {
    Write-Output ('{"ok":false,"error":"' + ($_.Exception.Message -replace '"','\\"') + '"}')
} finally {
    if ($doc -ne $null) { $doc.Close($false); }
    if ($word -ne $null) { $word.Quit(); }
    if ($word -ne $null) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null }
}
`
}

// ---------------------------------------------------------------------------
// 1. openWord
// ---------------------------------------------------------------------------

export async function openWord(filePath: string): Promise<WordDocInfo> {
  const script = wrapWordScript(
    `
    # Paragraphs (limit 500)
    $paras = @()
    $paraCount = $doc.Paragraphs.Count
    $limit = [Math]::Min($paraCount, 500)
    for ($i = 1; $i -le $limit; $i++) {
        $p = $doc.Paragraphs.Item($i)
        $r = $p.Range
        $paras += @{
            text    = $r.Text -replace '\\r$',''
            bold    = [bool]($r.Font.Bold -eq -1)
            italic  = [bool]($r.Font.Italic -eq -1)
            fontSize = $r.Font.Size
        }
    }

    # Tables
    $tables = @()
    foreach ($table in $doc.Tables) {
        $rows = $table.Rows.Count
        $cols = $table.Columns.Count
        $data = @()
        for ($r = 1; $r -le $rows; $r++) {
            $row = @()
            for ($c = 1; $c -le $cols; $c++) {
                try {
                    $cellText = $table.Cell($r, $c).Range.Text
                    # Trim trailing \\r\\a that Word adds to cell text
                    $cellText = $cellText -replace '[\\r\\n\\a]+$',''
                    $row += $cellText
                } catch {
                    $row += ''
                }
            }
            $data += ,@($row)
        }
        $tables += @{ rows = $rows; cols = $cols; data = $data }
    }

    # Counts: wdStatisticWords=0, wdStatisticPages=2
    $wordCount = $doc.ComputeStatistics(0)
    $pageCount = $doc.ComputeStatistics(2)

    $result = @{
        text       = $doc.Content.Text
        paragraphs = $paras
        tables     = $tables
        wordCount  = $wordCount
        pageCount  = $pageCount
    }
    Write-Output (ConvertTo-Json $result -Depth 5 -Compress)
`,
    filePath,
  )

  const raw = runPs(script)
  return parseJsonOutput<WordDocInfo>(raw, {
    text: '',
    paragraphs: [],
    tables: [],
    wordCount: 0,
    pageCount: 0,
  })
}

// ---------------------------------------------------------------------------
// 2. readText
// ---------------------------------------------------------------------------

export async function readText(filePath: string): Promise<string> {
  const script = wrapWordScript(`Write-Output $doc.Content.Text`, filePath)
  return runPs(script)
}

// ---------------------------------------------------------------------------
// 3. appendText
// ---------------------------------------------------------------------------

export async function appendText(
  filePath: string,
  text: string,
  opts?: AppendTextOptions,
): Promise<boolean> {
  const fontSetup = opts
    ? [
        opts.bold !== undefined
          ? `$sel.Font.Bold = ${opts.bold ? '-1' : '0'}`
          : '',
        opts.italic !== undefined
          ? `$sel.Font.Italic = ${opts.italic ? '-1' : '0'}`
          : '',
        opts.fontSize !== undefined ? `$sel.Font.Size = ${opts.fontSize}` : '',
        opts.fontName ? `$sel.Font.Name = '${psEscape(opts.fontName)}'` : '',
      ]
        .filter(Boolean)
        .join('\n    ')
    : ''

  const body = `
    $sel = $word.Selection
    $sel.EndKey(6) | Out-Null
    ${fontSetup}
    $sel.TypeText('${psEscape(text)}')
`

  const script = wrapWordScriptWithSave(body, filePath)
  const raw = runPs(script)
  return parseJsonOutput<{ ok: boolean }>(raw, { ok: false }).ok
}

// ---------------------------------------------------------------------------
// 4. insertText
// ---------------------------------------------------------------------------

export async function insertText(
  filePath: string,
  paraIndex: number,
  text: string,
): Promise<boolean> {
  const body = `
    $doc.Paragraphs.Item(${paraIndex}).Range.InsertBefore('${psEscape(text)}')
`
  const script = wrapWordScriptWithSave(body, filePath)
  const raw = runPs(script)
  return parseJsonOutput<{ ok: boolean }>(raw, { ok: false }).ok
}

// ---------------------------------------------------------------------------
// 5. findReplace
// ---------------------------------------------------------------------------

export async function findReplace(
  filePath: string,
  find: string,
  replace: string,
  replaceAll?: boolean,
): Promise<number> {
  // wdReplaceAll=2, wdReplaceOne=1
  const replaceConst = replaceAll !== false ? 2 : 1

  const body = `
    $content = $doc.Content
    $findObj = $content.Find
    $findObj.ClearFormatting()
    $findObj.Replacement.ClearFormatting()

    # Count replacements by iterating
    $count = 0
    $findObj.Text = '${psEscape(find)}'
    $findObj.Replacement.Text = '${psEscape(replace)}'
    $findObj.Forward = $true
    $findObj.Wrap = 0
    $findObj.Format = $false
    $findObj.MatchCase = $false
    $findObj.MatchWholeWord = $false
    $findObj.MatchWildcards = $false

    if (${replaceConst} -eq 2) {
        # Count occurrences first using a clone of content
        $range2 = $doc.Content.Duplicate
        while ($range2.Find.Execute('${psEscape(find)}')) { $count++ }
        # Now do the actual replace
        $findObj.Execute('${psEscape(find)}', $false, $false, $false, $false, $false, $true, 0, $false, '${psEscape(replace)}', 2)
    } else {
        $found = $findObj.Execute('${psEscape(find)}', $false, $false, $false, $false, $false, $true, 0, $false, '${psEscape(replace)}', 1)
        if ($found) { $count = 1 }
    }
`

  const script = `
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
    $doc = $word.Documents.Open('${psEscape(filePath)}')
    ${body}
    $doc.Save()
    Write-Output ('{"count":' + $count + '}')
} catch {
    Write-Output '{"count":0}'
} finally {
    if ($doc -ne $null) { $doc.Close($false); }
    if ($word -ne $null) { $word.Quit(); }
    if ($word -ne $null) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null }
}
`

  const raw = runPs(script)
  return parseJsonOutput<{ count: number }>(raw, { count: 0 }).count
}

// ---------------------------------------------------------------------------
// 6. insertTable
// ---------------------------------------------------------------------------

export async function insertTable(
  filePath: string,
  rows: number,
  cols: number,
  data: string[][],
): Promise<boolean> {
  // Build PowerShell array literal for the data
  const psData = data
    .map(row => ',@(' + row.map(cell => `'${psEscape(cell)}'`).join(',') + ')')
    .join('\n    ')

  const body = `
    $sel = $word.Selection
    $sel.EndKey(6) | Out-Null
    $table = $doc.Tables.Add($sel.Range, ${rows}, ${cols})
    $data = @(${psData})
    for ($r = 0; $r -lt $data.Count; $r++) {
        for ($c = 0; $c -lt $data[$r].Count; $c++) {
            $table.Cell($r + 1, $c + 1).Range.Text = $data[$r][$c]
        }
    }
`

  const script = wrapWordScriptWithSave(body, filePath)
  const raw = runPs(script)
  return parseJsonOutput<{ ok: boolean }>(raw, { ok: false }).ok
}

// ---------------------------------------------------------------------------
// 7. saveWord
// ---------------------------------------------------------------------------

export async function saveWord(
  filePath: string,
  savePath?: string,
): Promise<boolean> {
  if (!savePath || savePath === filePath) {
    const script = wrapWordScriptWithSave('', filePath)
    const raw = runPs(script)
    return parseJsonOutput<{ ok: boolean }>(raw, { ok: false }).ok
  }

  const body = `$doc.SaveAs('${psEscape(savePath)}')`
  const script = `
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
    $doc = $word.Documents.Open('${psEscape(filePath)}')
    ${body}
    Write-Output '{"ok":true}'
} catch {
    Write-Output ('{"ok":false,"error":"' + ($_.Exception.Message -replace '"','\\"') + '"}')
} finally {
    if ($doc -ne $null) { $doc.Close($false); }
    if ($word -ne $null) { $word.Quit(); }
    if ($word -ne $null) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null }
}
`
  const raw = runPs(script)
  return parseJsonOutput<{ ok: boolean }>(raw, { ok: false }).ok
}

// ---------------------------------------------------------------------------
// 8. saveAsPdf
// ---------------------------------------------------------------------------

export async function saveAsPdf(
  filePath: string,
  pdfPath: string,
): Promise<boolean> {
  // wdFormatPDF = 17
  const body = `$doc.SaveAs2('${psEscape(pdfPath)}', 17)`

  const script = `
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
    $doc = $word.Documents.Open('${psEscape(filePath)}')
    ${body}
    Write-Output '{"ok":true}'
} catch {
    Write-Output ('{"ok":false,"error":"' + ($_.Exception.Message -replace '"','\\"') + '"}')
} finally {
    if ($doc -ne $null) { $doc.Close($false); }
    if ($word -ne $null) { $word.Quit(); }
    if ($word -ne $null) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null }
}
`
  const raw = runPs(script)
  return parseJsonOutput<{ ok: boolean }>(raw, { ok: false }).ok
}

// ---------------------------------------------------------------------------
// 9. createWord
// ---------------------------------------------------------------------------

export async function createWord(savePath: string): Promise<boolean> {
  const script = `
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
    $doc = $word.Documents.Add()
    $doc.SaveAs('${psEscape(savePath)}')
    Write-Output '{"ok":true}'
} catch {
    Write-Output ('{"ok":false,"error":"' + ($_.Exception.Message -replace '"','\\"') + '"}')
} finally {
    if ($doc -ne $null) { $doc.Close($false); }
    if ($word -ne $null) { $word.Quit(); }
    if ($word -ne $null) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null }
}
`
  const raw = runPs(script)
  return parseJsonOutput<{ ok: boolean }>(raw, { ok: false }).ok
}

// ---------------------------------------------------------------------------
// 10. closeWord (no-op)
// ---------------------------------------------------------------------------

/**
 * closeWord is a no-op since each operation opens and closes its own COM instance.
 */
export function closeWord(_filePath: string): void {
  // No-op: each function manages its own Word lifecycle
}
