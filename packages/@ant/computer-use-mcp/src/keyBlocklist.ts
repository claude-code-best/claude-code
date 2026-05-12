/**
 * Key combos that cross app boundaries or terminate processes. Gated behind
 * the `systemKeyCombos` grant flag. When that flag is off, the `key` tool
 * rejects these and returns a tool error telling the model to request the
 * flag; all other combos work normally.
 *
 * Matching is canonicalized: every modifier alias the Rust executor accepts
 * collapses to one canonical name. Without this, `command+q` / `meta+q` /
 * `cmd+alt+escape` bypass the gate — see keyBlocklist.test.ts for the three
 * bypass forms and the Rust parity check that catches future alias drift.
 */

/**
 * Every modifier alias enigo_wrap.rs accepts (two copies: :351-359, :564-572),
 * mapped to one canonical per Key:: variant. Left/right variants collapse —
 * the blocklist doesn't distinguish which Ctrl.
 *
 * Canonical names are Rust's own variant names lowercased. Blocklist entries
 * below use ONLY these. "meta" reads odd for Cmd+Q but it's honest: Rust
 * sends Key::Meta, which is Cmd on darwin and Win on win32.
 */
const CANONICAL_MODIFIER: Readonly<Record<string, string>> = {
  // Key::Meta — "meta"|"super"|"command"|"cmd"|"windows"|"win"
  meta: 'meta',
  super: 'meta',
  command: 'meta',
  cmd: 'meta',
  windows: 'meta',
  win: 'meta',
  // Key::Control + LControl + RControl
  ctrl: 'ctrl',
  control: 'ctrl',
  lctrl: 'ctrl',
  lcontrol: 'ctrl',
  rctrl: 'ctrl',
  rcontrol: 'ctrl',
  // Key::Shift + LShift + RShift
  shift: 'shift',
  lshift: 'shift',
  rshift: 'shift',
  // Key::Alt and Key::Option — distinct Rust variants but same keycode on
  // darwin (kVK_Option). Collapse: cmd+alt+escape and cmd+option+escape
  // both Force Quit.
  alt: 'alt',
  option: 'alt',
}

/** Sort order for canonicals. ctrl < alt < shift < meta. */
const MODIFIER_ORDER = ['ctrl', 'alt', 'shift', 'meta']

/**
 * Canonical-form entries only. Every modifier must be a CANONICAL_MODIFIER
 * *value* (not key), modifiers must be in MODIFIER_ORDER, non-modifier last.
 * The self-consistency test enforces this.
 */
const BLOCKED_DARWIN = new Set([
  'meta+q', // Cmd+Q — quit frontmost app
  'shift+meta+q', // Cmd+Shift+Q — log out
  'alt+meta+escape', // Cmd+Option+Esc — Force Quit dialog
  'meta+tab', // Cmd+Tab — app switcher
  'meta+space', // Cmd+Space — Spotlight
  'ctrl+meta+q', // Ctrl+Cmd+Q — lock screen
])

const BLOCKED_WIN32 = new Set([
  'ctrl+alt+delete', // Secure Attention Sequence
  'alt+f4', // close window
  'alt+tab', // window switcher
  'meta+l', // Win+L — lock
  'meta+d', // Win+D — show desktop
])

/**
 * Partition into sorted-canonical modifiers and non-modifier keys.
 * Shared by normalizeKeySequence (join for display) and isSystemKeyCombo
 * (check mods+each-key to catch the cmd+q+a suffix bypass).
 */
function partitionKeys(seq: string): { mods: string[]; keys: string[] } {
  const parts = seq
    .toLowerCase()
    .split('+')
    .map(p => p.trim())
    .filter(Boolean)
  const mods: string[] = []
  const keys: string[] = []
  for (const p of parts) {
    const canonical = CANONICAL_MODIFIER[p]
    if (canonical !== undefined) {
      mods.push(canonical)
    } else {
      keys.push(p)
    }
  }
  // Dedupe: "cmd+command+q" → "meta+q", not "meta+meta+q".
  const uniqueMods = [...new Set(mods)]
  uniqueMods.sort(
    (a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b),
  )
  return { mods: uniqueMods, keys }
}

/**
 * Normalize "Cmd + Shift + Q" → "shift+meta+q": lowercase, trim, alias →
 * canonical, dedupe, sort modifiers, non-modifiers last.
 */
export function normalizeKeySequence(seq: string): string {
  const { mods, keys } = partitionKeys(seq)
  return [...mods, ...keys].join('+')
}

/**
 * True if the sequence would fire a blocked OS shortcut.
 *
 * Checks mods + EACH non-modifier key individually, not just the full
 * joined string. `cmd+q+a` → Rust presses Cmd, then Q (Cmd+Q fires here),
 * then A. Exact-match against "meta+q+a" misses; checking "meta+q" and
 * "meta+a" separately catches the Q.
 *
 * Modifiers-only sequences ("cmd+shift") are checked as-is — no key to
 * pair with, and no blocklist entry is modifier-only, so this is a no-op
 * that falls through to false. Covers the click-modifier case where
 * `left_click(text="cmd")` is legitimate.
 */
export function isSystemKeyCombo(
  seq: string,
  platform: 'darwin' | 'win32',
): boolean {
  const blocklist = platform === 'darwin' ? BLOCKED_DARWIN : BLOCKED_WIN32
  const { mods, keys } = partitionKeys(seq)
  const prefix = mods.length > 0 ? mods.join('+') + '+' : ''

  // No non-modifier keys (e.g. "cmd+shift" as click-modifiers) — check the
  // whole thing. Never matches (no blocklist entry is modifier-only) but
  // keeps the contract simple: every call reaches a .has().
  if (keys.length === 0) {
    return blocklist.has(mods.join('+'))
  }

  // mods + each key. Any hit blocks the whole sequence.
  for (const key of keys) {
    if (blocklist.has(prefix + key)) {
      return true
    }
  }
  return false
}

export const _test = {
  CANONICAL_MODIFIER,
  BLOCKED_DARWIN,
  BLOCKED_WIN32,
  MODIFIER_ORDER,
}
