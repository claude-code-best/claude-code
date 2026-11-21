/**
 * If the first line of a bash command is a `# comment` (not a `#!` shebang),
 * return the comment text stripped of the `#` prefix. Otherwise undefined.
 *
 * Under fullscreen mode this is the non-verbose tool-use label AND the
 * collapse-group ⎿ hint — it's what Claude wrote for the human to read.
 *
 * Two extra guards, aligned with the official CLI (2.1.330 `tZo`):
 *
 * 1. `restHasRealContent` — when the command continues after the comment
 *    line with any non-blank, non-comment line, no label is extracted. A
 *    leading comment followed by real commands is shell documentation, not
 *    a note written for the human; showing it as the label would hide the
 *    actual command from the collapsed row.
 * 2. `containsControlChars` — a label containing control characters (C0
 *    below 0x20, or C1 in 0x7F–0x9F) is rejected so escape sequences can't
 *    smuggle invisible characters into the transcript row.
 */
export function extractBashCommentLabel(command: string): string | undefined {
  const nl = command.indexOf('\n')
  const firstLine = (nl === -1 ? command : command.slice(0, nl)).trim()
  if (!firstLine.startsWith('#') || firstLine.startsWith('#!')) return undefined
  if (nl !== -1 && restHasRealContent(command.slice(nl + 1))) return undefined
  const label = firstLine.replace(/^#+\s*/, '')
  if (!label || containsControlChars(label)) return undefined
  return label
}

/** True when any line after the first is non-blank and not itself a comment. */
function restHasRealContent(rest: string): boolean {
  for (const line of rest.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    if (trimmed.startsWith('#')) continue
    return true
  }
  return false
}

/** True for C0 control chars (< 0x20) or C1 range (0x7F–0x9F). */
function containsControlChars(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code < 32 || (code >= 127 && code <= 159)) return true
  }
  return false
}
