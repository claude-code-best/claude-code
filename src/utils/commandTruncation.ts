/**
 * Head+tail truncation for commands shown to Claude
 * (official 2.1.330 changelog L1530):
 *
 * > Changed background command notifications and TaskStop results to show
 * > Claude only the start and end of a command over 1,000 characters, which
 * > saves context.
 *
 * Only the text handed to Claude is truncated — a command this long is
 * context noise, not signal. Applied at construction time in the background
 * command notification summary (LocalShellTask) and the TaskStop tool result.
 */

/** Commands at or below this length pass through untouched. */
export const COMMAND_TRUNCATION_THRESHOLD = 1000

/**
 * Characters kept from each end of an over-threshold command. No official
 * evidence for the exact split — 450/450 leaves room for the infix marker
 * and total-length note while staying under the ~1000-char budget net of
 * overhead. TODO(official): pin to the exact value if it is ever observed.
 */
const COMMAND_HEAD_CHARS = 450
const COMMAND_TAIL_CHARS = 450

/**
 * Truncate `command` to head + tail (with an infix ellipsis and the original
 * length) when it exceeds {@link COMMAND_TRUNCATION_THRESHOLD}; shorter
 * commands pass through unchanged.
 */
export function truncateCommandForClaude(command: string): string {
  if (command.length <= COMMAND_TRUNCATION_THRESHOLD) {
    return command
  }
  const head = command.slice(0, COMMAND_HEAD_CHARS)
  const tail = command.slice(-COMMAND_TAIL_CHARS)
  return `${head}…[${command.length} characters total]…${tail}`
}
