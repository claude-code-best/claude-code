/**
 * App category lookup for tiered CU permissions. Three categories land at a
 * restricted tier instead of `"full"`:
 *
 *   - **browser** → `"read"` tier — visible in screenshots, NO interaction.
 *     The model can read an already-open page but must use the Claude-in-Chrome
 *     MCP for navigation/clicking/typing.
 *   - **terminal** → `"click"` tier — visible + clickable, NO typing. The
 *     model can click a Run button or scroll test output in an IDE, but can't
 *     type into the integrated terminal. Use the Bash tool for shell work.
 *   - **trading** → `"read"` tier — same restrictions as browsers, but no
 *     CiC-MCP alternative exists. For platforms where a stray click can
 *     execute a trade or send a message to a counterparty.
 *
 * Uncategorized apps default to `"full"`. See `getDefaultTierForApp`.
 *
 * Identification is two-layered:
 *   1. Bundle ID match (macOS-only; `InstalledApp.bundleId` is a
 *      CFBundleIdentifier and meaningless on Windows). Fast, exact, the
 *      primary mechanism while CU is darwin-gated.
 *   2. Display-name substring match (cross-platform fallback). Catches
 *      unresolved requests ("Chrome" when Chrome isn't installed) AND will
 *      be the primary mechanism on Windows/Linux where there's no bundle ID.
 *      Windows-relevant names (PowerShell, cmd, Windows Terminal) are
 *      included now so they activate the moment the darwin gate lifts.
 *
 * Keep this file **import-free** (like sentinelApps.ts) — the renderer may
 * import it via a package.json subpath export, and pulling in
 * `@modelcontextprotocol/sdk` (a devDep) through the index → mcpServer chain
 * would fail module resolution in Next.js. The `CuAppPermTier` type is
 * duplicated as a string literal below rather than imported.
 */

export type DeniedCategory = 'browser' | 'terminal' | 'trading'

/**
 * Map a category to its hardcoded tier. Return-type is the string-literal
 * union inline (this file is import-free; see header comment). The
 * authoritative type is `CuAppPermTier` in types.ts — keep in sync.
 *
 * Not bijective — both `"browser"` and `"trading"` map to `"read"`. Copy
 * that differs by category (the "use CiC" hint is browser-only) must check
 * the category, not just the tier.
 */
export function categoryToTier(
  category: DeniedCategory | null,
): 'read' | 'click' | 'full' {
  if (category === 'browser' || category === 'trading') return 'read'
  if (category === 'terminal') return 'click'
  return 'full'
}

// ─── Bundle-ID deny sets (macOS) ─────────────────────────────────────────

const BROWSER_BUNDLE_IDS: ReadonlySet<string> = new Set([
  // Apple
  'com.apple.Safari',
  'com.apple.SafariTechnologyPreview',
  // Google
  'com.google.Chrome',
  'com.google.Chrome.beta',
  'com.google.Chrome.dev',
  'com.google.Chrome.canary',
  // Microsoft
  'com.microsoft.edgemac',
  'com.microsoft.edgemac.Beta',
  'com.microsoft.edgemac.Dev',
  'com.microsoft.edgemac.Canary',
  // Mozilla
  'org.mozilla.firefox',
  'org.mozilla.firefoxdeveloperedition',
  'org.mozilla.nightly',
  // Chromium-based
  'org.chromium.Chromium',
  'com.brave.Browser',
  'com.brave.Browser.beta',
  'com.brave.Browser.nightly',
  'com.operasoftware.Opera',
  'com.operasoftware.OperaGX',
  'com.operasoftware.OperaDeveloper',
  'com.vivaldi.Vivaldi',
  // The Browser Company
  'company.thebrowser.Browser', // Arc
  'company.thebrowser.dia', // Dia (agentic)
  // Privacy-focused
  'org.torproject.torbrowser',
  'com.duckduckgo.macos.browser',
  'ru.yandex.desktop.yandex-browser',
  // Agentic / AI browsers — newer entrants with LLM integrations
  'ai.perplexity.comet',
  'com.sigmaos.sigmaos.macos', // SigmaOS
  // Webkit-based misc
  'com.kagi.kagimacOS', // Orion
])

/**
 * Terminals + IDEs with integrated terminals. Supersets
 * `SHELL_ACCESS_BUNDLE_IDS` from sentinelApps.ts — terminals proceed to the
 * approval dialog at tier "click", and the sentinel warning renders
 * alongside the tier badge.
 */
const TERMINAL_BUNDLE_IDS: ReadonlySet<string> = new Set([
  // Dedicated terminals
  'com.apple.Terminal',
  'com.googlecode.iterm2',
  'dev.warp.Warp-Stable',
  'dev.warp.Warp-Beta',
  'com.github.wez.wezterm',
  'org.alacritty',
  'io.alacritty', // pre-v0.11.0 (renamed 2022-07) — kept for legacy installs
  'net.kovidgoyal.kitty',
  'co.zeit.hyper',
  'com.mitchellh.ghostty',
  'org.tabby',
  'com.termius-dmg.mac', // Termius
  // IDEs with integrated terminals — we can't distinguish "type in the
  // editor" from "type in the integrated terminal" via screenshot+click.
  //   VS Code family
  'com.microsoft.VSCode',
  'com.microsoft.VSCodeInsiders',
  'com.vscodium', // VSCodium
  'com.todesktop.230313mzl4w4u92', // Cursor
  'com.exafunction.windsurf', // Windsurf / Codeium
  'dev.zed.Zed',
  'dev.zed.Zed-Preview',
  //   JetBrains family (all have integrated terminals)
  'com.jetbrains.intellij',
  'com.jetbrains.intellij.ce',
  'com.jetbrains.pycharm',
  'com.jetbrains.pycharm.ce',
  'com.jetbrains.WebStorm',
  'com.jetbrains.CLion',
  'com.jetbrains.goland',
  'com.jetbrains.rubymine',
  'com.jetbrains.PhpStorm',
  'com.jetbrains.datagrip',
  'com.jetbrains.rider',
  'com.jetbrains.AppCode',
  'com.jetbrains.rustrover',
  'com.jetbrains.fleet',
  'com.google.android.studio', // Android Studio (JetBrains-based)
  //   Other IDEs
  'com.axosoft.gitkraken', // GitKraken has an integrated terminal panel. Also keeps the "kraken" trading-substring from miscategorizing it — bundle-ID wins.
  'com.sublimetext.4',
  'com.sublimetext.3',
  'org.vim.MacVim',
  'com.neovim.neovim',
  'org.gnu.Emacs',
  // Xcode's previous carve-out (full tier for Interface Builder / simulator)
  // was reversed — at tier "click" IB and simulator taps still work (both are
  // plain clicks) while the integrated terminal is blocked from keyboard input.
  'com.apple.dt.Xcode',
  'org.eclipse.platform.ide',
  'org.netbeans.ide',
  'com.microsoft.visual-studio', // Visual Studio for Mac
  // AppleScript/automation execution surfaces — same threat as terminals:
  // type(script) → key("cmd+r") runs arbitrary code. Added after #28011
  // removed the osascript MCP server, making CU the only tool-call route
  // to AppleScript.
  'com.apple.ScriptEditor2',
  'com.apple.Automator',
  'com.apple.shortcuts',
])

/**
 * Trading / crypto platforms — granted at tier `"read"` so the agent can see
 * balances and prices but can't click into an order, transfer, or IB chat.
 * Bundle IDs populated from Homebrew cask `uninstall.quit` stanzas as they're
 * verified; the name-substring fallback below is the primary check. Bloomberg
 * Terminal has no native macOS build per their FAQ (web/Citrix only).
 *
 * Budgeting/accounting apps (Quicken, YNAB, QuickBooks, etc.) are NOT listed
 * here — they default to tier `"full"`. The risk model for brokerage/crypto
 * (a stray click can execute a trade) doesn't apply to budgeting apps; the
 * Cowork system prompt carries the soft instruction to never execute trades
 * or transfer money on the user's behalf.
 */
const TRADING_BUNDLE_IDS: ReadonlySet<string> = new Set([
  // Verified via Homebrew quit/zap stanzas + mdls + electron-builder source.
  //   Trading
  'com.webull.desktop.v1', // Webull (direct download, Qt)
  'com.webull.trade.mac.v1', // Webull (Mac App Store)
  'com.tastytrade.desktop',
  'com.tradingview.tradingviewapp.desktop',
  'com.fidelity.activetrader', // Fidelity Trader+ (new)
  'com.fmr.activetrader', // Fidelity Active Trader Pro (legacy)
  // Interactive Brokers TWS — install4j wrapper; Homebrew quit stanza is
  // authoritative for this exact value but install4j IDs can drift across
  // major versions — name-substring "trader workstation" is the fallback.
  'com.install4j.5889-6375-8446-2021',
  //   Crypto
  'com.binance.BinanceDesktop',
  'com.electron.exodus',
  // Electrum uses PyInstaller with bundle_identifier=None → defaults to
  // org.pythonmac.unspecified.<AppName>. Confirmed in spesmilo/electrum
  // source + Homebrew zap. IntuneBrew's "org.electrum.electrum" is a fork.
  'org.pythonmac.unspecified.Electrum',
  'com.ledger.live',
  'io.trezor.TrezorSuite',
  // No native macOS app (name-substring only): Schwab, E*TRADE, TradeStation,
  // Robinhood, NinjaTrader, Coinbase, Kraken, Bloomberg. thinkorswim
  // install4j ID drifts per-install — substring safer.
])

// ─── Policy-deny (not a tier — cannot be granted at all) ─────────────────
//
// Streaming / ebook / music apps and a handful of publisher apps. These
// are auto-denied before the approval dialog — no tier can be granted.
// Rationale is copyright / content-control (the agent has no legitimate
// need to screenshot Netflix or click Play on Spotify).
//
// Sourced from the ACP CU-apps blocklist xlsx ("Full block" tab). See
// /tmp/extract_cu_blocklist.py for the extraction script.

const POLICY_DENIED_BUNDLE_IDS: ReadonlySet<string> = new Set([
  // Verified via Homebrew quit/zap + mdls /System/Applications + IntuneBrew.
  //   Apple built-ins
  'com.apple.TV',
  'com.apple.Music',
  'com.apple.iBooksX',
  'com.apple.podcasts',
  //   Music
  'com.spotify.client',
  'com.amazon.music',
  'com.tidal.desktop',
  'com.deezer.deezer-desktop',
  'com.pandora.desktop',
  'com.electron.pocket-casts', // direct-download Electron wrapper
  'au.com.shiftyjelly.PocketCasts', // Mac App Store
  //   Video
  'tv.plex.desktop',
  'tv.plex.htpc',
  'tv.plex.plexamp',
  'com.amazon.aiv.AIVApp', // Prime Video (iOS-on-Apple-Silicon)
  //   Ebooks
  'net.kovidgoyal.calibre',
  'com.amazon.Kindle', // legacy desktop, discontinued
  'com.amazon.Lassen', // current Mac App Store (iOS-on-Mac)
  'com.kobo.desktop.Kobo',
  // No native macOS app (name-substring only): Netflix, Disney+, Hulu,
  // HBO Max, Peacock, Paramount+, YouTube, Crunchyroll, Tubi, Vudu,
  // Audible, Reddit, NYTimes. Their iOS apps don't opt into iPad-on-Mac.
])

const POLICY_DENIED_NAME_SUBSTRINGS: readonly string[] = [
  // Video streaming
  'netflix',
  'disney+',
  'hulu',
  'prime video',
  'apple tv',
  'peacock',
  'paramount+',
  // "plex" is too generic — would match "Perplexity". Covered by
  // tv.plex.* bundle IDs on macOS.
  'tubi',
  'crunchyroll',
  'vudu',
  // E-readers / audiobooks
  'kindle',
  'apple books',
  'kobo',
  'play books',
  'calibre',
  'libby',
  'readium',
  'audible',
  'libro.fm',
  'speechify',
  // Music
  'spotify',
  'apple music',
  'amazon music',
  'youtube music',
  'tidal',
  'deezer',
  'pandora',
  'pocket casts',
  // Publisher / social apps (from the same blocklist tab)
  'naver',
  'reddit',
  'sony music',
  'vegas pro',
  'pitchfork',
  'economist',
  'nytimes',
  // Skipped (too generic for substring matching — need bundle ID):
  //   HBO Max / Max, YouTube (non-Music), Nook, Sony Catalyst, Wired
]

/**
 * Policy-level auto-deny. Unlike `userDeniedBundleIds` (per-user Settings
 * page), this is baked into the build. `buildAccessRequest` strips these
 * before the approval dialog with "blocked by policy" guidance; the agent
 * is told to not retry.
 */
export function isPolicyDenied(
  bundleId: string | undefined,
  displayName: string,
): boolean {
  if (bundleId && POLICY_DENIED_BUNDLE_IDS.has(bundleId)) return true
  const lower = displayName.toLowerCase()
  for (const sub of POLICY_DENIED_NAME_SUBSTRINGS) {
    if (lower.includes(sub)) return true
  }
  return false
}

export function getDeniedCategory(bundleId: string): DeniedCategory | null {
  if (BROWSER_BUNDLE_IDS.has(bundleId)) return 'browser'
  if (TERMINAL_BUNDLE_IDS.has(bundleId)) return 'terminal'
  if (TRADING_BUNDLE_IDS.has(bundleId)) return 'trading'
  return null
}

// ─── Display-name fallback (cross-platform) ──────────────────────────────

/**
 * Lowercase substrings checked against the requested display name. Catches:
 *   - Unresolved requests (app not installed, Spotlight miss)
 *   - Future Windows/Linux support where bundleId is meaningless
 *
 * Matched via `.includes()` on `name.toLowerCase()`. Entries are ordered
 * by specificity (more-specific first is irrelevant since we return on
 * first match, but groupings are by category for readability).
 */
const BROWSER_NAME_SUBSTRINGS: readonly string[] = [
  'safari',
  'chrome',
  'firefox',
  'microsoft edge',
  'brave',
  'opera',
  'vivaldi',
  'chromium',
  // Arc/Dia: the canonical display name is just "Arc"/"Dia" — too short for
  // substring matching (false-positives: "Arcade", "Diagram"). Covered by
  // bundle ID on macOS. The "... browser" entries below catch natural-language
  // phrasings ("the arc browser") but NOT the canonical short name.
  'arc browser',
  'tor browser',
  'duckduckgo',
  'yandex',
  'orion browser',
  // Agentic / AI browsers
  'comet', // Perplexity's browser — "Comet" substring risks false positives
  // but leaving for now; "comet" in an app name is rare
  'sigmaos',
  'dia browser',
]

const TERMINAL_NAME_SUBSTRINGS: readonly string[] = [
  // macOS / cross-platform terminals
  'terminal', // catches Terminal, Windows Terminal (NOT iTerm — separate entry)
  'iterm',
  'wezterm',
  'alacritty',
  'kitty',
  'ghostty',
  'tabby',
  'termius',
  // AppleScript runners — see bundle-ID comment above. "shortcuts" is too
  // generic for substring matching (many apps have "shortcuts" in the name);
  // covered by bundle ID only, like warp/hyper.
  'script editor',
  'automator',
  // NOTE: "warp" and "hyper" are too generic for substring matching —
  // they'd false-positive on "Warpaint" or "Hyperion". Covered by bundle ID
  // (dev.warp.Warp-Stable, co.zeit.hyper) for macOS; Windows exe-name
  // matching can be added when Windows CU ships.
  // Windows shells (activate when the darwin gate lifts)
  'powershell',
  'cmd.exe',
  'command prompt',
  'git bash',
  'conemu',
  'cmder',
  // IDEs (VS Code family)
  'visual studio code',
  'visual studio', // catches VS for Mac + Windows
  'vscode',
  'vs code',
  'vscodium',
  'cursor', // Cursor IDE — "cursor" is generic but IDE is the only common app
  'windsurf',
  // Zed: display name is just "Zed" — too short for substring matching
  // (false-positives). Covered by bundle ID (dev.zed.Zed) on macOS.
  // IDEs (JetBrains family)
  'intellij',
  'pycharm',
  'webstorm',
  'clion',
  'goland',
  'rubymine',
  'phpstorm',
  'datagrip',
  'rider',
  'appcode',
  'rustrover',
  'fleet',
  'android studio',
  // Other IDEs
  'sublime text',
  'macvim',
  'neovim',
  'emacs',
  'xcode',
  'eclipse',
  'netbeans',
]

const TRADING_NAME_SUBSTRINGS: readonly string[] = [
  // Trading — brokerage apps. Sourced from the ACP CU-apps blocklist xlsx
  // ("Read Only" tab). Name-substring safe for proper nouns below; generic
  // names (IG, Delta, HTX) are skipped and need bundle-ID matching once
  // verified.
  'bloomberg',
  'ameritrade',
  'thinkorswim',
  'schwab',
  'fidelity',
  'e*trade',
  'interactive brokers',
  'trader workstation', // Interactive Brokers TWS
  'tradestation',
  'webull',
  'robinhood',
  'tastytrade',
  'ninjatrader',
  'tradingview',
  'moomoo',
  'tradezero',
  'prorealtime',
  'plus500',
  'saxotrader',
  'oanda',
  'metatrader',
  'forex.com',
  'avaoptions',
  'ctrader',
  'jforex',
  'iq option',
  'olymp trade',
  'binomo',
  'pocket option',
  'raceoption',
  'expertoption',
  'quotex',
  'naga',
  'morgan stanley',
  'ubs neo',
  'eikon', // Thomson Reuters / LSEG Workspace
  // Crypto — exchanges, wallets, portfolio trackers
  'coinbase',
  'kraken',
  'binance',
  'okx',
  'bybit',
  // "gate.io" is too generic — the ".io" TLD suffix is common in app names
  // (e.g., "Draw.io"). Needs bundle-ID matching once verified.
  'phemex',
  'stormgain',
  'crypto.com',
  // "exodus" is too generic — it's a common noun and would match unrelated
  // apps/games. Needs bundle-ID matching once verified.
  'electrum',
  'ledger live',
  'trezor',
  'guarda',
  'atomic wallet',
  'bitpay',
  'bisq',
  'koinly',
  'cointracker',
  'blockfi',
  'stripe cli',
  // Crypto games / metaverse (same trade-execution risk model)
  'decentraland',
  'axie infinity',
  'gods unchained',
]

/**
 * Display-name substring match. Called when bundle-ID resolution returned
 * nothing (`resolved === undefined`) or when no bundle-ID deny-list entry
 * matched. Returns the category for the first matching substring, or null.
 *
 * Case-insensitive, substring — so `"Google Chrome"`, `"chrome"`, and
 * `"Chrome Canary"` all match the `"chrome"` entry.
 */
export function getDeniedCategoryByDisplayName(
  name: string,
): DeniedCategory | null {
  const lower = name.toLowerCase()
  // Trading first — proper-noun-only set, most specific. "Bloomberg Terminal"
  // contains "terminal" and would miscategorize if TERMINAL_NAME_SUBSTRINGS
  // ran first.
  for (const sub of TRADING_NAME_SUBSTRINGS) {
    if (lower.includes(sub)) return 'trading'
  }
  for (const sub of BROWSER_NAME_SUBSTRINGS) {
    if (lower.includes(sub)) return 'browser'
  }
  for (const sub of TERMINAL_NAME_SUBSTRINGS) {
    if (lower.includes(sub)) return 'terminal'
  }
  return null
}

/**
 * Combined check — bundle ID first (exact, fast), then display-name
 * fallback. This is the function tool-call handlers should use.
 *
 * `bundleId` may be undefined (unresolved request — model asked for an app
 * that isn't installed or Spotlight didn't find). In that case only the
 * display-name check runs.
 */
export function getDeniedCategoryForApp(
  bundleId: string | undefined,
  displayName: string,
): DeniedCategory | null {
  if (bundleId) {
    const byId = getDeniedCategory(bundleId)
    if (byId) return byId
  }
  return getDeniedCategoryByDisplayName(displayName)
}

/**
 * Default tier for an app at grant time. Wraps `getDeniedCategoryForApp` +
 * `categoryToTier`. Browsers → `"read"`, terminals/IDEs → `"click"`,
 * everything else → `"full"`.
 *
 * Called by `buildAccessRequest` to populate `ResolvedAppRequest.proposedTier`
 * before the approval dialog shows.
 */
export function getDefaultTierForApp(
  bundleId: string | undefined,
  displayName: string,
): 'read' | 'click' | 'full' {
  return categoryToTier(getDeniedCategoryForApp(bundleId, displayName))
}

export const _test = {
  BROWSER_BUNDLE_IDS,
  TERMINAL_BUNDLE_IDS,
  TRADING_BUNDLE_IDS,
  POLICY_DENIED_BUNDLE_IDS,
  BROWSER_NAME_SUBSTRINGS,
  TERMINAL_NAME_SUBSTRINGS,
  TRADING_NAME_SUBSTRINGS,
  POLICY_DENIED_NAME_SUBSTRINGS,
}
