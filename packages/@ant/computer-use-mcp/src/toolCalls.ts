/**
 * Tool dispatch. Every security decision from plan §2 is enforced HERE,
 * before any executor method is called.
 *
 * Enforcement order, every call:
 *   1. Kill switch (`adapter.isDisabled()`).
 *   2. TCC gate (`adapter.ensureOsPermissions()`). `request_access` is
 *      exempted — it threads the ungranted state to the renderer so the
 *      user can grant TCC perms from inside the approval dialog.
 *   3. Tool-specific gates (see dispatch table) — ANY exception in a gate
 *      returns a tool error, executor never called.
 *   4. Executor call.
 *
 * For input actions (click/type/key/scroll/drag/move_mouse) the tool-specific
 * gates are, in order:
 *   a. `prepareForAction` — hide every non-allowlisted app, then defocus us
 *      (battle-tested pre-action sequence from the Vercept acquisition).
 *      Sub-gated via `hideBeforeAction`. After this runs the screenshot is
 *      TRUE (what the
 *      model sees IS what's at each pixel) and we are not keyboard-focused.
 *   b. Frontmost gate — branched by actionKind:
 *        mouse:    frontmost ∈ allowlist ∪ {hostBundleId, Finder} → pass.
 *                  hostBundleId passes because the executor's
 *                  `withClickThrough` bracket makes us click-through.
 *        keyboard: frontmost ∈ allowlist ∪ {Finder} → pass.
 *                  hostBundleId → ERROR (safety net — defocus should have
 *                  moved us off; if it didn't, typing would go into our
 *                  own chat box).
 *      After step (a) this gate fires RARELY — only when something popped
 *      up between prepare and action, or the 5-try hide loop gave up.
 *      Checked FRESH on every call, not cached across calls.
 *
 * For click variants only, AFTER the above gates but BEFORE the executor call:
 *   c. Pixel-validation staleness check (sub-gated).
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";

import { getDefaultTierForApp, getDeniedCategoryForApp, isPolicyDenied } from "./deniedApps.js";
import type {
  ComputerExecutor,
  DisplayGeometry,
  InstalledApp,
  ScreenshotResult,
} from "./executor.js";
import { isSystemKeyCombo } from "./keyBlocklist.js";
import { validateClickTarget } from "./pixelCompare.js";
import { SENTINEL_BUNDLE_IDS } from "./sentinelApps.js";
import type {
  AppGrant,
  ComputerUseHostAdapter,
  ComputerUseOverrides,
  CoordinateMode,
  CuAppPermTier,
  CuGrantFlags,
  CuPermissionRequest,
  CuSubGates,
  CuTeachPermissionRequest,
  Logger,
  ResolvedAppRequest,
  TeachStepRequest,
} from "./types.js";

/**
 * Finder is never hidden by the hide loop (hiding Finder kills the Desktop),
 * so it's always a valid frontmost.
 */
const FINDER_BUNDLE_ID = "com.apple.finder";

/**
 * Categorical error classes for the cu_tool_call telemetry event. Never
 * free text — error messages may contain file paths / app content (PII).
 */
export type CuErrorKind =
  | "allowlist_empty"
  | "tcc_not_granted"
  | "cu_lock_held"
  | "teach_mode_conflict"
  | "teach_mode_not_active"
  | "executor_threw"
  | "capture_failed"
  | "app_denied" // no longer emitted (tiered model replaced hard-deny); kept for schema compat
  | "bad_args" // malformed tool args (type/shape/range/unknown value)
  | "app_not_granted" // target app not in session allowlist (distinct from allowlist_empty)
  | "tier_insufficient" // app in allowlist but at a tier too low for the action
  | "feature_unavailable" // tool callable but session not wired for it
  | "state_conflict" // wrong state for action (call sequence, mouse already held)
  | "grant_flag_required" // action needs a grant flag (systemKeyCombos, clipboard*) from request_access
  | "display_error" // display enumeration failed (platform)
  | "launch_failed" // failed to launch an external process (e.g. terminal)
  | "element_not_found" // UI element not found (e.g. window, automation element)
  | "other";

/**
 * Telemetry payload piggybacked on the result — populated by handlers,
 * consumed and stripped by the host wrapper (serverDef.ts) before the
 * result goes to the SDK. Same pattern as `screenshot`.
 */
export interface CuCallTelemetry {
  /** request_access / request_teach_access: apps NEWLY granted in THIS call
   *  (does NOT include idempotent re-grants of already-allowed apps). */
  granted_count?: number;
  /** request_access / request_teach_access: apps denied in THIS call */
  denied_count?: number;
  /** request_access / request_teach_access: apps safety-denied (browser) this call */
  denied_browser_count?: number;
  /** request_access / request_teach_access: apps safety-denied (terminal) this call */
  denied_terminal_count?: number;
  /** Categorical error class (only set when isError) */
  error_kind?: CuErrorKind;
}

/**
 * `CallToolResult` augmented with the screenshot payload. `bindSessionContext`
 * reads `result.screenshot` after a `screenshot` tool call and stashes it in a
 * closure cell for the next pixel-validation. MCP clients never see this
 * field — the host wrapper strips it before returning to the SDK.
 */
export type CuCallToolResult = CallToolResult & {
  screenshot?: ScreenshotResult;
  /** Piggybacked telemetry — stripped by the host wrapper before SDK return. */
  telemetry?: CuCallTelemetry;
};

// ---------------------------------------------------------------------------
// Small result helpers (mirror of chrome-mcp's inline `{content, isError}`)
// ---------------------------------------------------------------------------

function errorResult(text: string, errorKind?: CuErrorKind): CuCallToolResult {
  return {
    content: [{ type: "text", text }],
    isError: true,
    telemetry: errorKind ? { error_kind: errorKind } : undefined,
  };
}

function okText(text: string): CuCallToolResult {
  return { content: [{ type: "text", text }] };
}

function okJson(obj: unknown, telemetry?: CuCallTelemetry): CuCallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(obj) }],
    telemetry,
  };
}

// ---------------------------------------------------------------------------
// Arg validation — lightweight, no zod (mirrors chrome-mcp's cast-and-check)
// ---------------------------------------------------------------------------

function asRecord(args: unknown): Record<string, unknown> {
  if (typeof args === "object" && args !== null) {
    return args as Record<string, unknown>;
  }
  return {};
}

function requireNumber(
  args: Record<string, unknown>,
  key: string,
): number | Error {
  const v = args[key];
  if (typeof v !== "number" || !Number.isFinite(v)) {
    return new Error(`"${key}" must be a finite number.`);
  }
  return v;
}

function requireString(
  args: Record<string, unknown>,
  key: string,
): string | Error {
  const v = args[key];
  if (typeof v !== "string") {
    return new Error(`"${key}" must be a string.`);
  }
  return v;
}

/**
 * Extract (x, y) from `coordinate: [x, y]` tuple.
 * array of length 2, both non-negative numbers.
 */
function extractCoordinate(
  args: Record<string, unknown>,
  paramName: string = "coordinate",
): [number, number] | Error {
  const coord = args[paramName];
  if (coord === undefined) {
    return new Error(`${paramName} is required`);
  }
  if (!Array.isArray(coord) || coord.length !== 2) {
    return new Error(`${paramName} must be an array of length 2`);
  }
  const [x, y] = coord;
  if (typeof x !== "number" || typeof y !== "number" || x < 0 || y < 0) {
    return new Error(`${paramName} must be a tuple of non-negative numbers`);
  }
  return [x, y];
}

// ---------------------------------------------------------------------------
// Coordinate scaling
// ---------------------------------------------------------------------------

/**
 * Convert model-space coordinates to the logical points that enigo expects.
 *
 *   - `normalized_0_100`: (x / 100) * display.width. `display` is fetched
 *     fresh per tool call — never cached across calls —
 *     so a mid-session display-settings change doesn't leave us stale.
 *   - `pixels`: the model sent image-space pixel coords (it read them off the
 *     last screenshot). With the 1568-px long-edge downsample, the
 *     screenshot-px → logical-pt ratio is `displayWidth / screenshotWidth`,
 *     NOT `1/scaleFactor`. Uses the display geometry stashed at CAPTURE time
 *     (`lastScreenshot.displayWidth`), not fresh — so the transform matches
 *     what the model actually saw even if the user changed display settings
 *     since. (Chrome's ScreenshotContext pattern — CDPService.ts:1486-1493.)
 */
function scaleCoord(
  rawX: number,
  rawY: number,
  mode: CoordinateMode,
  display: DisplayGeometry,
  lastScreenshot: ScreenshotResult | undefined,
  logger: Logger,
): { x: number; y: number } {
  if (mode === "normalized_0_100") {
    // Origin offset targets the selected display in virtual-screen space.
    return {
      x: Math.round((rawX / 100) * display.width) + display.originX,
      y: Math.round((rawY / 100) * display.height) + display.originY,
    };
  }

  // mode === "pixels": model sent image-space pixel coords.
  if (lastScreenshot) {
    // The transform. Chrome coordinateScaling.ts:22-34 + claude-in-a-box
    // ComputerTool.swift:70-80 — two independent convergent impls.
    // Uses the display geometry stashed AT CAPTURE TIME, not fresh.
    // Origin from the same snapshot keeps clicks coherent with the captured display.
    return {
      x:
        Math.round(
          rawX * (lastScreenshot.displayWidth / lastScreenshot.width),
        ) + lastScreenshot.originX,
      y:
        Math.round(
          rawY * (lastScreenshot.displayHeight / lastScreenshot.height),
        ) + lastScreenshot.originY,
    };
  }

  // Cold start: model sent pixel coords without having taken a screenshot.
  // Degenerate — fall back to the old /sf behavior and warn.
  logger.warn(
    "[computer-use] pixels-mode coordinate received with no prior screenshot; " +
      "falling back to /scaleFactor. Click may be off if downsample is active.",
  );
  return {
    x: Math.round(rawX / display.scaleFactor) + display.originX,
    y: Math.round(rawY / display.scaleFactor) + display.originY,
  };
}

/**
 * Convert model-space coordinates to the 0–100 percentage that
 * pixelCompare.ts works in. The staleness check operates in screenshot-image
 * space; comparing by percentage lets us crop both last and fresh screenshots
 * at the same relative location without caring about their absolute dims.
 *
 * With the 1568-px downsample, `screenshot.width != display.width * sf`, so
 * the old `rawX / (display.width * sf)` formula is wrong. The correct
 * denominator is just `lastScreenshot.width` — the model's raw pixel coord is
 * already in that image's coordinate space. `DisplayGeometry` is no longer
 * consumed at all.
 */
function coordToPercentageForPixelCompare(
  rawX: number,
  rawY: number,
  mode: CoordinateMode,
  lastScreenshot: ScreenshotResult | undefined,
): { xPct: number; yPct: number } {
  if (mode === "normalized_0_100") {
    // Unchanged — already a percentage.
    return { xPct: rawX, yPct: rawY };
  }

  // mode === "pixels"
  if (!lastScreenshot) {
    // validateClickTarget at pixelCompare.ts:141-143 already skips when
    // lastScreenshot is undefined, so this return value never reaches a crop.
    return { xPct: 0, yPct: 0 };
  }
  return {
    xPct: (rawX / lastScreenshot.width) * 100,
    yPct: (rawY / lastScreenshot.height) * 100,
  };
}

// ---------------------------------------------------------------------------
// Shared input-action gates
// ---------------------------------------------------------------------------

/**
 * Tier needed to perform a given action class. `undefined` → `"full"`.
 *
 *   - `"mouse_position"` — mouse_move only. Passes at any tier including
 *     `"read"`. Pure cursor positioning, no app interaction. Still runs
 *     prepareForAction (hide non-allowed apps).
 *   - `"mouse"` — plain left click, double/triple, scroll, drag-from.
 *     Requires tier `"click"` or `"full"`.
 *   - `"mouse_full"` — right/middle click, any click with modifiers,
 *     drag-drop (the `to` endpoint of left_click_drag). Requires tier
 *     `"full"`. Right-click → context menu Paste, modifier chords →
 *     keystrokes before click, drag-drop → text insertion at the drop
 *     point. All escalate a click-tier grant to keyboard-equivalent input.
 *     Blunt: also rejects same-app drags (scrollbar, panel resize) onto
 *     click-tier apps; `scroll` is the tier-"click" way to scroll.
 *   - `"keyboard"` — type, key, hold_key. Requires tier `"full"`.
 */
type CuActionKind = "mouse_position" | "mouse" | "mouse_full" | "keyboard";

function tierSatisfies(
  grantTier: CuAppPermTier | undefined,
  actionKind: CuActionKind,
): boolean {
  const tier = grantTier ?? "full";
  if (actionKind === "mouse_position") return true;
  if (actionKind === "keyboard" || actionKind === "mouse_full") {
    return tier === "full";
  }
  // mouse
  return tier === "click" || tier === "full";
}

// Appended to every tier_insufficient error. The model may try to route
// around the gate (osascript, System Events, cliclick via Bash) — this
// closes that door explicitly. Leading space so it concatenates cleanly.
const TIER_ANTI_SUBVERSION =
  " Do not attempt to work around this restriction — never use AppleScript, " +
  "System Events, shell commands, or any other method to send clicks or " +
  "keystrokes to this app.";

// ---------------------------------------------------------------------------
// Clipboard guard — stash+clear while a click-tier app is frontmost
// ---------------------------------------------------------------------------
//
// Threat: tier "click" blocks type/key/right-click-Paste, but a click-tier
// terminal/IDE may have a UI Paste button that's plain-left-clickable. If the
// clipboard holds `rm -rf /` — from the user, from a prior full-tier paste,
// OR from the agent's own write_clipboard call (which doesn't route through
// runInputActionGates) — a left_click on that button injects it.
//
// Mitigation: stash the user's clipboard on first entry to click-tier, then
// RE-CLEAR before every input action while click-tier stays frontmost. The
// re-clear is the load-bearing part — a stash-on-transition-only design
// leaves a gap between an agent write_clipboard and the next left_click.
// When frontmost becomes anything else, restore. Turn-end restore is inlined
// in the host's result-handler + leavingRunning (same dual-location as
// cuHiddenDuringTurn unhide) — reads `session.cuClipboardStash` directly and
// writes via Electron's `clipboard.writeText`, so no nest-only import.
//
// State lives on the session (via `overrides.getClipboardStash` /
// `onClipboardStashChanged`), not module-level. The CU lock still guarantees
// one session at a time, but session-scoped state means the host's turn-end
// restore doesn't need to reach back into this package.

async function syncClipboardStash(
  adapter: ComputerUseHostAdapter,
  overrides: ComputerUseOverrides,
  frontmostIsClickTier: boolean,
): Promise<void> {
  const current = overrides.getClipboardStash?.();
  if (!frontmostIsClickTier) {
    // Restore + clear. Idempotent — if nothing is stashed, no-op.
    if (current === undefined) return;
    try {
      await adapter.executor.writeClipboard(current);
      // Clear only after a successful write — a transient pasteboard
      // failure must not irrecoverably drop the stash.
      overrides.onClipboardStashChanged?.(undefined);
    } catch {
      // Best effort — stash held, next non-click action retries.
    }
    return;
  }
  // Stash the user's clipboard on FIRST entry to click-tier only.
  if (current === undefined) {
    try {
      const read = await adapter.executor.readClipboard();
      overrides.onClipboardStashChanged?.(read);
    } catch {
      // readClipboard failed — use empty sentinel so we don't retry the stash
      // on the next action; restore becomes a harmless writeClipboard("").
      overrides.onClipboardStashChanged?.("");
    }
  }
  // Re-clear on EVERY click-tier action, not just the first. Defeats the
  // bypass where the agent calls write_clipboard (which doesn't route
  // through runInputActionGates) between stash and a left_click on a UI
  // Paste button — the next action's clear clobbers the agent's write
  // before the click lands.
  try {
    await adapter.executor.writeClipboard("");
  } catch {
    // Transient pasteboard failure. The tier-"click" right-click/modifier
    // block still holds; this is a net, not a promise.
  }
}

/** Every click/type/key/scroll/drag/move_mouse runs through this before
 * touching the executor. Returns null on pass, error-result on block.
 * Any throw inside → caught by handleToolCall's outer try → tool error. */
async function runInputActionGates(
  adapter: ComputerUseHostAdapter,
  overrides: ComputerUseOverrides,
  subGates: CuSubGates,
  actionKind: CuActionKind,
): Promise<CuCallToolResult | null> {
  // Step A+B — hide non-allowlisted apps + defocus us. Sub-gated. After this
  // runs, the frontmost gate below becomes a rare edge-case detector (something
  // popped up between prepare and action) rather than a normal-path blocker.
  // ALL grant tiers stay visible — visibility is the baseline (tier "read").
  if (subGates.hideBeforeAction) {
    const hidden = await adapter.executor.prepareForAction(
      overrides.allowedApps.map((a) => a.bundleId),
      overrides.selectedDisplayId,
    );
    // Empty-check so we don't spam the callback on every action when nothing
    // was hidden (the common case after the first action of a turn).
    if (hidden.length > 0) {
      overrides.onAppsHidden?.(hidden);
    }
  }

  // Windows/Linux: operations go through SendMessage (HWND-bound) or platform
  // abstraction, not global input to the foreground. The frontmost gate is a
  // macOS safety net for global CGEvent input — on other platforms, skip it
  // when the platform's screenshotFiltering is 'none' (no per-app filtering,
  // meaning no hide/defocus, meaning frontmost is meaningless).
  if (adapter.executor.capabilities.screenshotFiltering === 'none') {
    return null; // pass — non-macOS platform, frontmost irrelevant
  }

  // Frontmost gate. Check FRESH on every call.
  const frontmost = await adapter.executor.getFrontmostApp();

  const tierByBundleId = new Map(
    overrides.allowedApps.map((a) => [a.bundleId, a.tier] as const),
  );

  // After handleToolCall's tier backfill, every grant has a concrete tier —
  // .get() returning undefined means the app is not in the allowlist at all.
  const frontmostTier = frontmost
    ? tierByBundleId.get(frontmost.bundleId)
    : undefined;

  // Clipboard guard. Per-action, not per-tool-call — runs for every sub-action
  // inside computer_batch and teach_step/teach_batch, so clicking into a
  // click-tier app mid-batch stashes+clears before the next click lands.
  // Lives here (not in handleToolCall) so deferAcquire tools (request_access,
  // list_granted_applications), `wait`, and the teach_step blocking-dialog
  // phase don't trigger a sync — only input actions do.
  if (subGates.clipboardGuard) {
    await syncClipboardStash(adapter, overrides, frontmostTier === "click");
  }

  if (!frontmost) {
    // No frontmost app (rare — login window?). Let it through; the click
    // will land somewhere and PixelCompare catches staleness.
    return null;
  }

  const { hostBundleId } = adapter.executor.capabilities;

  if (frontmostTier !== undefined) {
    if (tierSatisfies(frontmostTier, actionKind)) return null;
    // In the allowlist but tier doesn't cover this action. Tailor the
    // guidance to the actual tier — at "read", suggesting left_click or Bash
    // is wrong (nothing is allowed; use Chrome MCP). At "click", the
    // mouse_full/keyboard-specific messages apply.
    if (frontmostTier === "read") {
      // tier "read" is not category-unique (browser AND trading map to it) —
      // re-look-up so the CiC hint only shows for actual browsers.
      const isBrowser =
        getDeniedCategoryForApp(frontmost.bundleId, frontmost.displayName) ===
        "browser";
      return errorResult(
        `"${frontmost.displayName}" is granted at tier "read" — ` +
          `visible in screenshots only, no clicks or typing.` +
          (isBrowser
            ? " Use the Claude-in-Chrome MCP for browser interaction (tools " +
              "named `mcp__Claude_in_Chrome__*`; load via ToolSearch if " +
              "deferred)."
            : " No interaction is permitted; ask the user to take any " +
              "actions in this app themselves.") +
          TIER_ANTI_SUBVERSION,
        "tier_insufficient",
      );
    }
    // frontmostTier === "click" (tier === "full" would have passed tierSatisfies)
    if (actionKind === "keyboard") {
      return errorResult(
        `"${frontmost.displayName}" is granted at tier "click" — ` +
          `typing, key presses, and paste require tier "full". The keys ` +
          `would go to this app's text fields or integrated terminal. To ` +
          `type into a different app, click it first to bring it forward. ` +
          `For shell commands, use the Bash tool.` + TIER_ANTI_SUBVERSION,
        "tier_insufficient",
      );
    }
    // actionKind === "mouse_full" ("mouse" and "mouse_position" pass at "click")
    return errorResult(
      `"${frontmost.displayName}" is granted at tier "click" — ` +
        `right-click, middle-click, and clicks with modifier keys require ` +
        `tier "full". Right-click opens a context menu with Paste/Cut, and ` +
        `modifier chords fire as keystrokes before the click. Plain ` +
        `left_click is allowed here.` + TIER_ANTI_SUBVERSION,
      "tier_insufficient",
    );
  }
  // Finder is never-hide, always allowed.
  if (frontmost.bundleId === FINDER_BUNDLE_ID) return null;

  if (frontmost.bundleId === hostBundleId) {
    if (actionKind !== "keyboard") {
      // mouse and mouse_full are both click events — click-through works.
      // We're click-through (executor's withClickThrough). Pass.
      return null;
    }
    // Keyboard safety net — defocus (prepareForAction step B) should have
    // moved us off. If we're still here, typing would go to our chat box.
    return errorResult(
      "Claude's own window still has keyboard focus. This should not happen " +
        "after the pre-action defocus. Click on the target application first.",
      "state_conflict",
    );
  }

  // Non-allowlisted, non-us, non-Finder. RARE after the hide loop — means
  // something popped up between prepare and action, or the 5-try loop gave up.
  return errorResult(
    `"${frontmost.displayName}" is not in the allowed applications and is ` +
      `currently in front. Take a new screenshot — it may have appeared ` +
      `since your last one.`,
    "app_not_granted",
  );
}

/**
 * Hit-test gate: reject a mouse action if the window under (x, y) belongs
 * to an app whose tier doesn't cover mouse input. Closes the gap where a
 * tier-"full" app is frontmost but the click lands on a tier-"read" window
 * overlapping it — `runInputActionGates` passes (frontmost is fine), but the
 * click actually goes to the read-tier app.
 *
 * Runs AFTER `scaleCoord` (needs global coords) and BEFORE the executor call.
 * Returns null on pass (target is tier-"click"/"full", or desktop/Finder/us),
 * error-result on block.
 *
 * When `appUnderPoint` returns null (desktop, or platform without hit-test),
 * falls through — the frontmost check in `runInputActionGates` already ran.
 */
async function runHitTestGate(
  adapter: ComputerUseHostAdapter,
  overrides: ComputerUseOverrides,
  subGates: CuSubGates,
  x: number,
  y: number,
  actionKind: CuActionKind,
): Promise<CuCallToolResult | null> {
  // Non-macOS: HWND-bound mode — clicks go to the bound window via
  // SendMessage with window-relative coordinates. Hit-test against the
  // real screen is meaningless.
  if (adapter.executor.capabilities.screenshotFiltering === 'none') {
    return null;
  }

  const target = await adapter.executor.appUnderPoint(x, y);
  if (!target) return null; // desktop / nothing under point / platform no-op

  // Finder (desktop, file dialogs) is always clickable — same exemption as
  // runInputActionGates. Our own overlay is filtered by Swift (pid != self).
  if (target.bundleId === FINDER_BUNDLE_ID) return null;

  const tierByBundleId = new Map(
    overrides.allowedApps.map((a) => [a.bundleId, a.tier] as const),
  );

  if (!tierByBundleId.has(target.bundleId)) {
    // Not in the allowlist at all. The frontmost check would catch this if
    // the target were frontmost, but here a different app is in front. This
    // is the "something popped up" edge case — a new window appeared between
    // screenshot and click, or a background app's window overlaps the target.
    return errorResult(
      `Click at these coordinates would land on "${target.displayName}", ` +
        `which is not in the allowed applications. Take a fresh screenshot ` +
        `to see the current window layout.`,
      "app_not_granted",
    );
  }

  const targetTier = tierByBundleId.get(target.bundleId);

  // Frontmost-based sync (runInputActionGates) misses the case where
  // the click lands on a NON-FRONTMOST click-tier window. Re-sync by
  // the hit-test target's tier — if target is click-tier, stash+clear
  // before the click lands, regardless of what's frontmost.
  if (subGates.clipboardGuard && targetTier === "click") {
    await syncClipboardStash(adapter, overrides, true);
  }

  if (tierSatisfies(targetTier, actionKind)) return null;

  // Target is in the allowlist but tier doesn't cover this action.
  // runHitTestGate is only called with mouse/mouse_full (keyboard routes to
  // frontmost, not window-under-cursor). The branch above catches
  // mouse_full ∧ click; the only remaining fall-through is tier "read".
  if (actionKind === "mouse_full" && targetTier === "click") {
    return errorResult(
      `Click at these coordinates would land on "${target.displayName}", ` +
        `which is granted at tier "click" — right-click, middle-click, and ` +
        `clicks with modifier keys require tier "full" (they can Paste via ` +
        `the context menu or fire modifier-chord keystrokes). Plain ` +
        `left_click is allowed here.` + TIER_ANTI_SUBVERSION,
      "tier_insufficient",
    );
  }
  const isBrowser =
    getDeniedCategoryForApp(target.bundleId, target.displayName) === "browser";
  return errorResult(
    `Click at these coordinates would land on "${target.displayName}", ` +
      `which is granted at tier "read" (screenshots only, no interaction). ` +
      (isBrowser
        ? "Use the Claude-in-Chrome MCP for browser interaction."
        : "Ask the user to take any actions in this app themselves.") +
      TIER_ANTI_SUBVERSION,
    "tier_insufficient",
  );
}

// ---------------------------------------------------------------------------
// Screenshot helpers
// ---------------------------------------------------------------------------

/**
 * §6 item 9 — screenshot retry on implausibly-small buffer. Battle-tested
 * threshold (1024 bytes). We retry exactly once.
 */
const MIN_SCREENSHOT_BYTES = 1024;

function decodedByteLength(base64: string): number {
  // 3 bytes per 4 chars, minus padding. Good enough for a threshold check.
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

async function takeScreenshotWithRetry(
  executor: ComputerExecutor,
  allowedBundleIds: string[],
  logger: ComputerUseHostAdapter["logger"],
  displayId?: number,
): Promise<ScreenshotResult> {
  let shot = await executor.screenshot({ allowedBundleIds, displayId });
  if (decodedByteLength(shot.base64) < MIN_SCREENSHOT_BYTES) {
    logger.warn(
      `[computer-use] screenshot implausibly small (${decodedByteLength(shot.base64)} bytes decoded), retrying once`,
    );
    shot = await executor.screenshot({ allowedBundleIds, displayId });
  }
  return shot;
}

// ---------------------------------------------------------------------------
// Grapheme iteration — §6 item 7, ported from the Vercept acquisition
// ---------------------------------------------------------------------------

const INTER_GRAPHEME_SLEEP_MS = 8; // §6 item 4 — 125 Hz USB polling

function segmentGraphemes(text: string): string[] {
  try {
    // Node 18+ has Intl.Segmenter; the try is defence against a stripped-
    // -down runtime (falls back to code points).
    const Segmenter = (
      Intl as typeof Intl & {
        Segmenter?: new (
          locale?: string,
          options?: { granularity: "grapheme" | "word" | "sentence" },
        ) => { segment: (s: string) => Iterable<{ segment: string }> };
      }
    ).Segmenter;
    if (typeof Segmenter === "function") {
      const seg = new Segmenter(undefined, { granularity: "grapheme" });
      return Array.from(seg.segment(text), (s) => s.segment);
    }
  } catch {
    // fall through
  }
  // Code-point iteration. Keeps surrogate pairs together but splits ZWJ.
  return Array.from(text);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Split a chord string like "ctrl+shift" into individual key names.
 * Same parsing as `key` tool / executor.key / keyBlocklist.normalizeKeySequence.
 */
function parseKeyChord(text: string): string[] {
  return text
    .split("+")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// left_mouse_down / left_mouse_up held-state tracking
// ---------------------------------------------------------------------------

/**
 * Errors on double-down but not on up-without-down. Module-level, but
 * reset on every lock acquire (handleToolCall → acquireCuLock branch) so
 * a session interrupted mid-drag (overlay stop during left_mouse_down)
 * doesn't leave the flag true for the next lock holder.
 *
 * Still scoped wrong within a single lock cycle if sessions could interleave
 * tool calls, but the lock enforces at-most-one-session-uses-CU so they
 * can't. The per-turn reset is the correctness boundary.
 */
let mouseButtonHeld = false;
/** Whether mouse_move occurred between left_mouse_down and left_mouse_up.
 *  When false at mouseUp, the decomposed sequence is a click-release (not a
 *  drop) — hit-test at "mouse", not "mouse_full". */
let mouseMoved = false;

/** Clears the cross-call drag flags. Called from Gate-3 on lock-acquire and
 *  from `bindSessionContext` in mcpServer.ts — a fresh lock holder must not
 *  inherit a prior session's mid-drag state. */
export function resetMouseButtonHeld(): void {
  mouseButtonHeld = false;
  mouseMoved = false;
}

/** If a left_mouse_down set the OS button without a matching left_mouse_up
 *  ever getting its turn, release it now. Same release-before-return as
 *  handleClick. No-op when not held — callers don't need to check. */
async function releaseHeldMouse(
  adapter: ComputerUseHostAdapter,
): Promise<void> {
  if (!mouseButtonHeld) return;
  await adapter.executor.mouseUp();
  mouseButtonHeld = false;
  mouseMoved = false;
}

/**
 * Tools that check the lock but don't acquire it. `request_access` and
 * `list_granted_applications` hit the CHECK (so a blocked session doesn't
 * show an approval dialog for access it can't use) but defer ACQUIRE — the
 * enter-CU notification/overlay only fires on the first action tool.
 *
 * `request_teach_access` is NOT here: approving teach mode hides the main
 * window, and the lock must be held before that. See Gate-3 block in
 * `handleToolCall` for the full explanation.
 *
 * Exported for `bindSessionContext` in mcpServer.ts so the async lock gate
 * uses the same set as the sync one.
 */
export function defersLockAcquire(toolName: string): boolean {
  return (
    toolName === "request_access" ||
    toolName === "list_granted_applications"
  );
}

// ---------------------------------------------------------------------------
// request_access helpers
// ---------------------------------------------------------------------------

/** Reverse-DNS-ish: contains at least one dot, no spaces, no slashes. Lets
 * raw bundle IDs pass through resolution. */
const REVERSE_DNS_RE = /^[A-Za-z0-9][\w.-]*\.[A-Za-z0-9][\w.-]*$/;

function looksLikeBundleId(s: string): boolean {
  return REVERSE_DNS_RE.test(s) && !s.includes(" ");
}

function resolveRequestedApps(
  requestedNames: string[],
  installed: InstalledApp[],
  alreadyGrantedBundleIds: ReadonlySet<string>,
): ResolvedAppRequest[] {
  const byLowerDisplayName = new Map<string, InstalledApp>();
  const byBundleId = new Map<string, InstalledApp>();
  for (const app of installed) {
    byBundleId.set(app.bundleId, app);
    // Last write wins on collisions. Ambiguous-name handling (multiple
    // candidates in the dialog) is plan-documented but deferred — the
    // InstalledApps enumerator dedupes by bundle ID, so true display-name
    // collisions are rare. TODO(chicago, post-P1): surface all candidates.
    byLowerDisplayName.set(app.displayName.toLowerCase(), app);
  }

  return requestedNames.map((requested): ResolvedAppRequest => {
    let resolved: InstalledApp | undefined;
    if (looksLikeBundleId(requested)) {
      resolved = byBundleId.get(requested);
    }
    if (!resolved) {
      resolved = byLowerDisplayName.get(requested.toLowerCase());
    }
    // Windows fuzzy matching: strip .exe suffix, try substring match
    if (!resolved) {
      const clean = requested.toLowerCase().replace(/\.exe$/, '').trim();
      // Try: "chrome" matches "Google Chrome", "notepad" matches "Notepad"
      for (const [name, app] of byLowerDisplayName) {
        if (name.includes(clean) || clean.includes(name)) {
          resolved = app;
          break;
        }
      }
    }
    const bundleId = resolved?.bundleId;
    // When unresolved AND the requested string looks like a bundle ID, use it
    // directly for tier lookup (e.g. "company.thebrowser.Browser" with Arc not
    // installed — the reverse-DNS string won't match any display-name substring).
    const bundleIdCandidate =
      bundleId ?? (looksLikeBundleId(requested) ? requested : undefined);
    return {
      requestedName: requested,
      resolved,
      isSentinel: bundleId ? SENTINEL_BUNDLE_IDS.has(bundleId) : false,
      alreadyGranted: bundleId ? alreadyGrantedBundleIds.has(bundleId) : false,
      proposedTier: getDefaultTierForApp(
        bundleIdCandidate,
        resolved?.displayName ?? requested,
      ),
    };
  });
}

// ---------------------------------------------------------------------------
// Individual tool handlers
// ---------------------------------------------------------------------------

async function handleRequestAccess(
  adapter: ComputerUseHostAdapter,
  args: Record<string, unknown>,
  overrides: ComputerUseOverrides,
  tccState: { accessibility: boolean; screenRecording: boolean } | undefined,
): Promise<CuCallToolResult> {
  if (!overrides.onPermissionRequest) {
    return errorResult(
      "This session was not wired with a permission handler. Computer control is not available here.",
      "feature_unavailable",
    );
  }

  // Teach mode hides the main window; permission dialogs render in that
  // window. Without this, handleToolPermission blocks on an invisible
  // prompt and the overlay spins forever. Tell the model to exit teach
  // mode, request access, then re-enter.
  if (overrides.getTeachModeActive?.()) {
    return errorResult(
      "Cannot request additional permissions during teach mode — the permission dialog would be hidden. End teach mode (finish the tour or let the turn complete), then call request_access, then start a new tour.",
      "teach_mode_conflict",
    );
  }

  const reason = requireString(args, "reason");
  if (reason instanceof Error) return errorResult(reason.message, "bad_args");

  // TCC-ungranted branch. The renderer shows a toggle panel INSTEAD OF the
  // app list when `tccState` is present on the request, so we skip app
  // resolution entirely (listInstalledApps() may fail without Screen
  // Recording anyway). The user grants the OS perms from inside the dialog,
  // then clicks "Ask again" — both buttons resolve with deny by design
  // (ComputerUseApproval.tsx) so the model re-calls request_access and
  // gets the app list on the next call.
  if (tccState) {
    const req: CuPermissionRequest = {
      requestId: randomUUID(),
      reason,
      apps: [],
      requestedFlags: {},
      screenshotFiltering: adapter.executor.capabilities.screenshotFiltering,
      tccState,
    };
    await overrides.onPermissionRequest(req);

    // Re-check: the user may have granted in System Settings while the
    // dialog was up. The `tccState` arg is a pre-dialog snapshot — reading
    // it here would tell the model "not yet granted" even after the user
    // granted, and the model waits for confirmation instead of retrying.
    // The renderer's TCC panel already live-polls (computerUseTccStore);
    // this is the same re-check on the tool-result side.
    const recheck = await adapter.ensureOsPermissions();
    if (recheck.granted) {
      return errorResult(
        "macOS Accessibility and Screen Recording are now both granted. " +
          "Call request_access again immediately — the next call will show " +
          "the app selection list.",
      );
    }

    const perms = recheck as { granted: false; accessibility: boolean; screenRecording: boolean };
    const missing: string[] = [];
    if (!perms.accessibility) missing.push("Accessibility");
    if (!perms.screenRecording) missing.push("Screen Recording");
    return errorResult(
      `macOS ${missing.join(" and ")} permission(s) not yet granted. ` +
        `The permission panel has been shown. Once the user grants the ` +
        `missing permission(s), call request_access again.`,
      "tcc_not_granted",
    );
  }

  const rawApps = args.apps;
  if (!Array.isArray(rawApps) || !rawApps.every((a) => typeof a === "string")) {
    return errorResult('"apps" must be an array of strings.', "bad_args");
  }
  const apps = rawApps as string[];

  const requestedFlags: Partial<CuGrantFlags> = {};
  if (typeof args.clipboardRead === "boolean") {
    requestedFlags.clipboardRead = args.clipboardRead;
  }
  if (typeof args.clipboardWrite === "boolean") {
    requestedFlags.clipboardWrite = args.clipboardWrite;
  }
  if (typeof args.systemKeyCombos === "boolean") {
    requestedFlags.systemKeyCombos = args.systemKeyCombos;
  }

  const {
    needDialog,
    skipDialogGrants,
    willHide,
    tieredApps,
    userDenied,
    policyDenied,
  } = await buildAccessRequest(
    adapter,
    apps,
    overrides.allowedApps,
    new Set(overrides.userDeniedBundleIds),
    overrides.selectedDisplayId,
  );

  let dialogGranted: AppGrant[] = [];
  let dialogDenied: Array<{
    bundleId: string;
    reason: "user_denied" | "not_installed";
  }> = [];
  let dialogFlags: CuGrantFlags = overrides.grantFlags;

  if (needDialog.length > 0 || Object.keys(requestedFlags).length > 0) {
    const req: CuPermissionRequest = {
      requestId: randomUUID(),
      reason,
      apps: needDialog,
      requestedFlags,
      screenshotFiltering: adapter.executor.capabilities.screenshotFiltering,
      // Undefined when empty so the renderer skips the section cleanly.
      ...(willHide.length > 0 && {
        willHide,
        autoUnhideEnabled: adapter.getAutoUnhideEnabled(),
      }),
    };
    const response = await overrides.onPermissionRequest(req);
    dialogGranted = response.granted;
    dialogDenied = response.denied;
    dialogFlags = response.flags;
  }

  // Do NOT return display geometry or coordinateMode. See COORDINATES.md
  // ("Never give the model a number that invites rescaling"). scaleCoord
  // already transforms server-side; the coordinate convention is baked into
  // the tool param descriptions at server-construction time.
  const allGranted = [...skipDialogGrants, ...dialogGranted];
  // Filter tieredApps to what was actually granted — if the user unchecked
  // Chrome in the dialog, don't explain Chrome's tier.
  const grantedBundleIds = new Set(allGranted.map((g) => g.bundleId));
  const grantedTieredApps = tieredApps.filter((t) =>
    grantedBundleIds.has(t.bundleId),
  );
  // Best-effort — grants are already persisted by wrappedPermissionHandler;
  // a listDisplays/findWindowDisplays failure (monitor hot-unplug, NAPI
  // error) must not tank the grant response. Same discipline as
  // buildMonitorNote's listDisplays try/catch.
  let windowLocations: Awaited<ReturnType<typeof buildWindowLocations>> = [];
  try {
    windowLocations = await buildWindowLocations(adapter, allGranted);
  } catch (e) {
    adapter.logger.warn(
      `[computer-use] buildWindowLocations failed: ${String(e)}`,
    );
  }
  return okJson(
    {
      granted: allGranted,
      denied: dialogDenied,
      // Policy blocklist — precedes userDenied in precedence and response
      // order. No escape hatch; the agent is told to find another approach.
      ...(policyDenied.length > 0 && {
        policyDenied: {
          apps: policyDenied,
          guidance: buildPolicyDeniedGuidance(policyDenied),
        },
      }),
      // User-configured auto-deny — stripped before the dialog; this is the
      // agent's only signal that these apps exist but are user-blocked.
      ...(userDenied.length > 0 && {
        userDenied: {
          apps: userDenied,
          guidance: buildUserDeniedGuidance(userDenied),
        },
      }),
      // Upfront guidance so the model knows what each tier allows BEFORE
      // hitting the gate. Only included when something was tier-restricted.
      ...(grantedTieredApps.length > 0 && {
        tierGuidance: buildTierGuidanceMessage(grantedTieredApps),
      }),
      screenshotFiltering: adapter.executor.capabilities.screenshotFiltering,
      // Where each granted app currently has open windows, across monitors.
      // Omitted when the app isn't running or has no normal windows.
      ...(windowLocations.length > 0 ? { windowLocations } : {}),
    },
    {
      // dialogGranted only — skipDialogGrants are idempotent re-grants of
      // apps already in the allowlist (no user action, dialog skips them).
      // Matching denied_count's this-call-only semantics.
      granted_count: dialogGranted.length,
      denied_count: dialogDenied.length,
      ...tierAssignmentTelemetry(grantedTieredApps),
    },
  );
}

/**
 * For each granted app with open windows, which displays those windows are
 * on. Single-monitor setups return an empty array (no multi-monitor signal
 * to give). Apps not running, or running with no normal windows, are omitted.
 */
async function buildWindowLocations(
  adapter: ComputerUseHostAdapter,
  granted: AppGrant[],
): Promise<
  Array<{
    bundleId: string;
    displayName: string;
    displays: Array<{ id: number; label?: string; isPrimary?: boolean }>;
  }>
> {
  if (granted.length === 0) return [];

  const displays = await adapter.executor.listDisplays();
  if (displays.length <= 1) return [];

  const grantedBundleIds = granted.map((g) => g.bundleId);
  const windowLocs = await adapter.executor.findWindowDisplays(grantedBundleIds);
  const displayById = new Map(displays.map((d) => [d.displayId, d]));
  const idsByBundle = new Map(windowLocs.map((w) => [w.bundleId, w.displayIds]));

  const out = [];
  for (const g of granted) {
    const displayIds = idsByBundle.get(g.bundleId);
    if (!displayIds || displayIds.length === 0) continue;
    out.push({
      bundleId: g.bundleId,
      displayName: g.displayName,
      displays: displayIds.map((id) => {
        const d = displayById.get(id);
        return { id, label: d?.label, isPrimary: d?.isPrimary };
      }),
    });
  }
  return out;
}

/**
 * Shared app-resolution + partition + hide-preview pipeline. Extracted from
 * `handleRequestAccess` so `handleRequestTeachAccess` can call the same path.
 *
 * Does the full app-name→InstalledApp resolution, assigns each a tier
 * (browser→"read", terminal/IDE→"click", else "full" — see deniedApps.ts),
 * splits into already-granted (skip the dialog, preserve grantedAt+tier) vs
 * need-dialog, and computes the willHide preview. Unlike the previous
 * hard-deny model, ALL apps proceed to the dialog; the tier just constrains
 * what actions are allowed once granted.
 */
/** An app assigned a restricted tier (not `"full"`). Used to build the
 *  guidance message telling the model what it can/can't do. */
interface TieredApp {
  bundleId: string;
  displayName: string;
  /** Never `"full"` — only restricted tiers are collected. */
  tier: "read" | "click";
}

interface AccessRequestParts {
  needDialog: ResolvedAppRequest[];
  skipDialogGrants: AppGrant[];
  willHide: Array<{ bundleId: string; displayName: string }>;
  /** Resolved apps with `proposedTier !== "full"` — for the guidance text.
   *  Unresolved apps are omitted (they go to `denied` with `not_installed`).  */
  tieredApps: TieredApp[];
  /** Apps stripped by the user's Settings auto-deny list. Surfaced in the
   *  response with guidance; never reach the dialog. */
  userDenied: Array<{ requestedName: string; displayName: string }>;
  /** Apps stripped by the baked-in policy blocklist (streaming/music/ebooks,
   *  etc. — `deniedApps.isPolicyDenied`). Precedence over userDenied. */
  policyDenied: Array<{ requestedName: string; displayName: string }>;
}

async function buildAccessRequest(
  adapter: ComputerUseHostAdapter,
  apps: string[],
  allowedApps: AppGrant[],
  userDeniedBundleIds: ReadonlySet<string>,
  selectedDisplayId?: number,
): Promise<AccessRequestParts> {
  const alreadyGranted = new Set(allowedApps.map((g) => g.bundleId));
  const installed = await adapter.executor.listInstalledApps();
  const resolved = resolveRequestedApps(apps, installed, alreadyGranted);

  // Policy-level auto-deny (baked-in, not user-configurable). Stripped
  // before userDenied — checks bundle ID AND display name (covers
  // unresolved requests). Precedence: policy > user setting > tier.
  const policyDenied: Array<{ requestedName: string; displayName: string }> =
    [];
  const afterPolicy: typeof resolved = [];
  for (const r of resolved) {
    const displayName = r.resolved?.displayName ?? r.requestedName;
    if (isPolicyDenied(r.resolved?.bundleId, displayName)) {
      policyDenied.push({ requestedName: r.requestedName, displayName });
    } else {
      afterPolicy.push(r);
    }
  }

  // User-configured auto-deny (Settings → Desktop app → Computer Use).
  // Stripped BEFORE
  // tier assignment — these never reach the dialog regardless of category.
  // Bundle-ID match only (the Settings UI picks from installed apps, which
  // always have a bundle ID). Unresolved requests pass through to the tier
  // system; the user can't preemptively deny an app that isn't installed.
  const userDenied: Array<{ requestedName: string; displayName: string }> = [];
  const surviving: typeof afterPolicy = [];
  for (const r of afterPolicy) {
    if (r.resolved && userDeniedBundleIds.has(r.resolved.bundleId)) {
      userDenied.push({
        requestedName: r.requestedName,
        displayName: r.resolved.displayName,
      });
    } else {
      surviving.push(r);
    }
  }

  // Collect resolved apps with a restricted tier for the guidance message.
  // Unresolved apps with a restricted tier (e.g. model asks for "Chrome" but
  // it's not installed) are omitted — they'll end up in the `denied` list
  // with reason "not_installed" and the model will see that instead.
  const tieredApps: TieredApp[] = [];
  for (const r of surviving) {
    if (r.proposedTier === "full" || !r.resolved) continue;
    tieredApps.push({
      bundleId: r.resolved.bundleId,
      displayName: r.resolved.displayName,
      tier: r.proposedTier,
    });
  }

  // Idempotence: apps that are already granted skip the dialog and are
  // merged into the `granted` response. Existing grants keep their tier
  // (which may differ from the current proposedTier if policy changed).
  const skipDialog = surviving.filter((r) => r.alreadyGranted);
  const needDialog = surviving.filter((r) => !r.alreadyGranted);

  // Populate icons only for what the dialog will actually show. Sequential
  // awaits are fine — the Swift module is cached (listInstalledApps above
  // loaded it), each N-API call is synchronous, and the darwin executor
  // memoizes by path. Failures leave iconDataUrl undefined; renderer falls
  // back to a grey box.
  for (const r of needDialog) {
    if (!r.resolved) continue;
    try {
      r.resolved.iconDataUrl = await adapter.executor.getAppIcon(
        r.resolved.path,
      );
    } catch {
      // leave undefined
    }
  }

  const now = Date.now();
  const skipDialogGrants: AppGrant[] = skipDialog
    .filter((r) => r.resolved)
    .map((r) => {
      // Reuse the existing grant (preserving grantedAt + tier) rather than
      // synthesizing a new one — keeps Settings-page "Granted 3m ago" honest.
      const existing = allowedApps.find(
        (g) => g.bundleId === r.resolved!.bundleId,
      );
      return (
        existing ?? {
          bundleId: r.resolved!.bundleId,
          displayName: r.resolved!.displayName,
          grantedAt: now,
          tier: r.proposedTier,
        }
      );
    });

  // Preview what will be hidden if the user approves exactly the requested
  // set plus what they already have. All tiers are visible, so everything
  // resolved goes in the exempt set.
  const exemptForPreview = [
    ...allowedApps.map((a) => a.bundleId),
    ...surviving.filter((r) => r.resolved).map((r) => r.resolved!.bundleId),
  ];
  const willHide = await adapter.executor.previewHideSet(
    exemptForPreview,
    selectedDisplayId,
  );

  return {
    needDialog,
    skipDialogGrants,
    willHide,
    tieredApps,
    userDenied,
    policyDenied,
  };
}

/**
 * Build guidance text for apps granted at a restricted tier. Returned
 * inline in the okJson response so the model knows upfront what it can
 * do with each app, instead of learning by hitting the tier gate.
 */
function buildTierGuidanceMessage(tiered: TieredApp[]): string {
  // tier "read" is not category-unique — split so browsers get the CiC hint
  // and trading platforms get "ask the user" instead.
  const readBrowsers = tiered.filter(
    (t) =>
      t.tier === "read" &&
      getDeniedCategoryForApp(t.bundleId, t.displayName) === "browser",
  );
  const readOther = tiered.filter(
    (t) =>
      t.tier === "read" &&
      getDeniedCategoryForApp(t.bundleId, t.displayName) !== "browser",
  );
  const clickTier = tiered.filter((t) => t.tier === "click");

  const parts: string[] = [];

  if (readBrowsers.length > 0) {
    const names = readBrowsers.map((b) => `"${b.displayName}"`).join(", ");
    parts.push(
      `${names} ${readBrowsers.length === 1 ? "is a browser" : "are browsers"} — ` +
        `granted at tier "read" (visible in screenshots only; no clicks or ` +
        `typing). You can read what's on screen but cannot navigate, click, ` +
        `or type into ${readBrowsers.length === 1 ? "it" : "them"}. For browser ` +
        `interaction, use the Claude-in-Chrome MCP (tools named ` +
        `\`mcp__Claude_in_Chrome__*\`; load via ToolSearch if deferred).`,
    );
  }

  if (readOther.length > 0) {
    const names = readOther.map((t) => `"${t.displayName}"`).join(", ");
    parts.push(
      `${names} ${readOther.length === 1 ? "is" : "are"} granted at tier ` +
        `"read" (visible in screenshots only; no clicks or typing). You can ` +
        `read what's on screen but cannot interact. Ask the user to take any ` +
        `actions in ${readOther.length === 1 ? "this app" : "these apps"} ` +
        `themselves.`,
    );
  }

  if (clickTier.length > 0) {
    const names = clickTier.map((t) => `"${t.displayName}"`).join(", ");
    parts.push(
      `${names} ${clickTier.length === 1 ? "has" : "have"} terminal or IDE ` +
        `capabilities — granted at tier "click" (visible + plain left-click ` +
        `only; NO typing, key presses, right-click, modifier-clicks, or ` +
        `drag-drop). You can click buttons and scroll output, but ` +
        `${clickTier.length === 1 ? "its" : "their"} integrated terminal and ` +
        `editor are off-limits to keyboard input. Right-click (context-menu ` +
        `Paste) and dragging text onto ${clickTier.length === 1 ? "it" : "them"} ` +
        `require tier "full". For shell commands, use the Bash tool.`,
    );
  }

  if (parts.length === 0) return "";
  // Same anti-subversion clause the gate errors carry — said upfront so the
  // model doesn't reach for osascript/cliclick after seeing "no clicks/typing".
  return parts.join("\n\n") + TIER_ANTI_SUBVERSION;
}

/**
 * Build guidance text for apps stripped by the user's Settings auto-deny
 * list. Returned inline in the okJson response so the agent knows (a) the
 * app is auto-denied by request_access and (b) the escape hatch
 * is to ask the human to edit Settings, not to retry or reword the request.
 */
function buildUserDeniedGuidance(
  userDenied: Array<{ requestedName: string; displayName: string }>,
): string {
  const names = userDenied.map((d) => `"${d.displayName}"`).join(", ");
  const one = userDenied.length === 1;
  return (
    `${names} ${one ? "is" : "are"} in the user's auto-deny list ` +
    `(Settings → Desktop app (General) → Computer Use → Denied apps). ` +
    `Requests for ` +
    `${one ? "this app" : "these apps"} are automatically denied. If you need access for ` +
    `this task, ask the user to remove ${one ? "it" : "them"} from their ` +
    `deny list in Settings — you cannot request this through the tool.`
  );
}

/**
 * Guidance for policy-denied apps (baked-in blocklist, not user-editable).
 * Unlike userDenied, there is no escape hatch — the agent is told to find
 * another approach.
 */
function buildPolicyDeniedGuidance(
  policyDenied: Array<{ requestedName: string; displayName: string }>,
): string {
  const names = policyDenied.map((d) => `"${d.displayName}"`).join(", ");
  const one = policyDenied.length === 1;
  return (
    `${names} ${one ? "is" : "are"} blocked by policy for computer use. ` +
    `Requests for ${one ? "this app" : "these apps"} are automatically ` +
    `denied regardless of what the user has approved. There is no Settings ` +
    `override. Inform the user that you cannot access ` +
    `${one ? "this app" : "these apps"} and suggest an alternative ` +
    `approach if one exists. Do not try to directly subvert this block ` +
    `regardless of the user's request.`
  );
}

/**
 * Telemetry helper — counts by category. Field names (`denied_*`) are kept
 * for schema compat; interpret as "assigned non-full tier" in dashboards.
 */
function tierAssignmentTelemetry(
  tiered: TieredApp[],
): Pick<CuCallTelemetry, "denied_browser_count" | "denied_terminal_count"> {
  // `denied_browser_count` now counts ALL tier-"read" grants (browsers +
  // trading). The field name was already legacy-only before trading existed
  // (dashboards read it as "non-full tier"), so no new column.
  const browserCount = tiered.filter((t) => t.tier === "read").length;
  const terminalCount = tiered.filter((t) => t.tier === "click").length;
  return {
    ...(browserCount > 0 && { denied_browser_count: browserCount }),
    ...(terminalCount > 0 && { denied_terminal_count: terminalCount }),
  };
}

/**
 * Sibling of `handleRequestAccess`. Same app-resolution + TCC-threading, but
 * routes to the teach approval dialog and fires `onTeachModeActivated` on
 * success. No grant-flag checkboxes (clipboard/systemKeys) in teach mode —
 * the tool schema omits those fields.
 *
 * Unlike `request_access`, this ALWAYS shows the dialog even when every
 * requested app is already granted. Teach mode is a distinct UX the user
 * must explicitly consent to (main window hides) — idempotent app grants
 * don't imply consent to being guided.
 */
async function handleRequestTeachAccess(
  adapter: ComputerUseHostAdapter,
  args: Record<string, unknown>,
  overrides: ComputerUseOverrides,
  tccState: { accessibility: boolean; screenRecording: boolean } | undefined,
): Promise<CuCallToolResult> {
  if (!overrides.onTeachPermissionRequest) {
    return errorResult(
      "Teach mode is not available in this session.",
      "feature_unavailable",
    );
  }

  // Same as handleRequestAccess above — the dialog renders in the hidden
  // main window. Model re-calling request_teach_access mid-tour (to add
  // another app) is plausible since request_access docs say "call again
  // mid-session to add more apps" and this uses the same grant model.
  if (overrides.getTeachModeActive?.()) {
    return errorResult(
      "Teach mode is already active. To add more apps, end the current tour first, then call request_teach_access again with the full app list.",
      "teach_mode_conflict",
    );
  }

  const reason = requireString(args, "reason");
  if (reason instanceof Error) return errorResult(reason.message, "bad_args");

  // TCC-ungranted branch — identical to handleRequestAccess's. The renderer
  // shows the same TCC toggle panel regardless of which request tool got here.
  if (tccState) {
    const req: CuTeachPermissionRequest = {
      requestId: randomUUID(),
      reason,
      apps: [],
      screenshotFiltering: adapter.executor.capabilities.screenshotFiltering,
      tccState,
    };
    await overrides.onTeachPermissionRequest(req);

    // Same re-check as handleRequestAccess — user may have granted while the
    // dialog was up, and the pre-dialog snapshot would mislead the model.
    const recheck = await adapter.ensureOsPermissions();
    if (recheck.granted) {
      return errorResult(
        "macOS Accessibility and Screen Recording are now both granted. " +
          "Call request_teach_access again immediately — the next call will " +
          "show the app selection list.",
      );
    }

    const perms = recheck as { granted: false; accessibility: boolean; screenRecording: boolean };
    const missing: string[] = [];
    if (!perms.accessibility) missing.push("Accessibility");
    if (!perms.screenRecording) missing.push("Screen Recording");
    return errorResult(
      `macOS ${missing.join(" and ")} permission(s) not yet granted. ` +
        `The permission panel has been shown. Once the user grants the ` +
        `missing permission(s), call request_teach_access again.`,
      "tcc_not_granted",
    );
  }

  const rawApps = args.apps;
  if (!Array.isArray(rawApps) || !rawApps.every((a) => typeof a === "string")) {
    return errorResult('"apps" must be an array of strings.', "bad_args");
  }
  const apps = rawApps as string[];

  const {
    needDialog,
    skipDialogGrants,
    willHide,
    tieredApps,
    userDenied,
    policyDenied,
  } = await buildAccessRequest(
    adapter,
    apps,
    overrides.allowedApps,
    new Set(overrides.userDeniedBundleIds),
    overrides.selectedDisplayId,
  );

  // All requested apps were user-denied (or unresolvable) and none pre-granted
  // — skip the dialog entirely. Without this, onTeachPermissionRequest fires
  // with apps:[] and the user sees an empty approval dialog where Allow and
  // Deny produce the same result (granted=[] → teachModeActive stays false).
  // handleRequestAccess has the equivalent guard at the needDialog.length
  // check; teach didn't need one before user-deny because needDialog=[]
  // previously implied skipDialogGrants.length > 0 (all-already-granted).
  if (needDialog.length === 0 && skipDialogGrants.length === 0) {
    return okJson(
      {
        granted: [],
        denied: [],
        ...(policyDenied.length > 0 && {
          policyDenied: {
            apps: policyDenied,
            guidance: buildPolicyDeniedGuidance(policyDenied),
          },
        }),
        ...(userDenied.length > 0 && {
          userDenied: {
            apps: userDenied,
            guidance: buildUserDeniedGuidance(userDenied),
          },
        }),
        teachModeActive: false,
        screenshotFiltering: adapter.executor.capabilities.screenshotFiltering,
      },
      { granted_count: 0, denied_count: 0 },
    );
  }

  const req: CuTeachPermissionRequest = {
    requestId: randomUUID(),
    reason,
    apps: needDialog,
    screenshotFiltering: adapter.executor.capabilities.screenshotFiltering,
    ...(willHide.length > 0 && {
      willHide,
      autoUnhideEnabled: adapter.getAutoUnhideEnabled(),
    }),
  };
  const response = await overrides.onTeachPermissionRequest(req);

  const granted = [...skipDialogGrants, ...response.granted];
  // Gate on explicit dialog consent, NOT on merged grant length.
  // skipDialogGrants are pre-existing idempotent app grants — they don't
  // imply the user said yes to THIS dialog. Without the userConsented
  // check, Deny would still activate teach mode whenever any requested
  // app was previously granted (worst case: needDialog=[] → Allow and
  // Deny payloads are structurally identical).
  const teachModeActive = response.userConsented === true && granted.length > 0;
  if (teachModeActive) {
    overrides.onTeachModeActivated?.();
  }

  const grantedBundleIds = new Set(granted.map((g) => g.bundleId));
  const grantedTieredApps = tieredApps.filter((t) =>
    grantedBundleIds.has(t.bundleId),
  );

  return okJson(
    {
      granted,
      denied: response.denied,
      ...(policyDenied.length > 0 && {
        policyDenied: {
          apps: policyDenied,
          guidance: buildPolicyDeniedGuidance(policyDenied),
        },
      }),
      ...(userDenied.length > 0 && {
        userDenied: {
          apps: userDenied,
          guidance: buildUserDeniedGuidance(userDenied),
        },
      }),
      ...(grantedTieredApps.length > 0 && {
        tierGuidance: buildTierGuidanceMessage(grantedTieredApps),
      }),
      teachModeActive,
      screenshotFiltering: adapter.executor.capabilities.screenshotFiltering,
    },
    {
      // response.granted only — skipDialogGrants are idempotent re-grants.
      // See handleRequestAccess's parallel comment.
      granted_count: response.granted.length,
      denied_count: response.denied.length,
      ...tierAssignmentTelemetry(grantedTieredApps),
    },
  );
}

// ---------------------------------------------------------------------------
// teach_step + teach_batch — shared step primitives
// ---------------------------------------------------------------------------

/** A fully-validated teach step, anchor already scaled to logical points. */
interface ValidatedTeachStep {
  explanation: string;
  nextPreview: string;
  anchorLogical: TeachStepRequest["anchorLogical"];
  actions: Array<Record<string, unknown>>;
}

/**
 * Validate one raw step record and scale its anchor. `label` is prefixed to
 * error messages so teach_batch can say `steps[2].actions[0]` instead of
 * just `actions[0]`.
 *
 * The anchor transform is the whole coordinate story: model sends image-pixel
 * coords (same space as click coords, per COORDINATES.md), `scaleCoord` turns
 * them into logical points against `overrides.lastScreenshot`. For
 * teach_batch, lastScreenshot stays at its pre-call value for the entire
 * batch — same invariant as computer_batch's "coordinates refer to the
 * PRE-BATCH screenshot". Anchors for step 2+ must therefore target elements
 * the model can predict will be at those coordinates after step 1's actions.
 */
async function validateTeachStepArgs(
  raw: Record<string, unknown>,
  adapter: ComputerUseHostAdapter,
  overrides: ComputerUseOverrides,
  label: string,
): Promise<ValidatedTeachStep | Error> {
  const explanation = requireString(raw, "explanation");
  if (explanation instanceof Error) {
    return new Error(`${label}: ${explanation.message}`);
  }
  const nextPreview = requireString(raw, "next_preview");
  if (nextPreview instanceof Error) {
    return new Error(`${label}: ${nextPreview.message}`);
  }

  const actions = raw.actions;
  if (!Array.isArray(actions)) {
    return new Error(
      `${label}: "actions" must be an array (empty is allowed).`,
    );
  }
  for (const [i, act] of actions.entries()) {
    if (typeof act !== "object" || act === null) {
      return new Error(`${label}: actions[${i}] must be an object`);
    }
    const action = (act as Record<string, unknown>).action;
    if (typeof action !== "string") {
      return new Error(`${label}: actions[${i}].action must be a string`);
    }
    if (!BATCHABLE_ACTIONS.has(action)) {
      return new Error(
        `${label}: actions[${i}].action="${action}" is not allowed. ` +
          `Allowed: ${[...BATCHABLE_ACTIONS].join(", ")}.`,
      );
    }
  }

  let anchorLogical: TeachStepRequest["anchorLogical"];
  if (raw.anchor !== undefined) {
    const anchor = raw.anchor;
    if (
      !Array.isArray(anchor) ||
      anchor.length !== 2 ||
      typeof anchor[0] !== "number" ||
      typeof anchor[1] !== "number" ||
      !Number.isFinite(anchor[0]) ||
      !Number.isFinite(anchor[1])
    ) {
      return new Error(
        `${label}: "anchor" must be a [x, y] number tuple or omitted.`,
      );
    }
    const display = await adapter.executor.getDisplaySize(
      overrides.selectedDisplayId,
    );
    anchorLogical = scaleCoord(
      anchor[0],
      anchor[1],
      overrides.coordinateMode,
      display,
      overrides.lastScreenshot,
      adapter.logger,
    );
  }

  return {
    explanation,
    nextPreview,
    anchorLogical,
    actions: actions as Array<Record<string, unknown>>,
  };
}

/** Outcome of showing one tooltip + running its actions. */
type TeachStepOutcome =
  | { kind: "exit" }
  | { kind: "ok"; results: BatchActionResult[] }
  | {
      kind: "action_error";
      executed: number;
      failed: BatchActionResult;
      remaining: number;
      /** The inner action's telemetry (error_kind), forwarded so the
       *  caller can pass it to okJson and keep cu_tool_call accurate
       *  when the failure happened inside a batch. */
      telemetry: CuCallTelemetry | undefined;
    };

/**
 * Show the tooltip, block for Next/Exit, run actions on Next.
 *
 * Action execution is a straight lift from `handleComputerBatch`:
 * prepareForAction ONCE per step (the user clicked Next — they consented to
 * that step's sequence), pixelValidation OFF (committed sequence), frontmost
 * gate still per-action, stop-on-first-error with partial results.
 *
 * Empty `actions` is valid — "read this, click Next to continue" steps.
 * Assumes `overrides.onTeachStep` is set (caller guards).
 */
async function executeTeachStep(
  step: ValidatedTeachStep,
  adapter: ComputerUseHostAdapter,
  overrides: ComputerUseOverrides,
  subGates: CuSubGates,
): Promise<TeachStepOutcome> {
  // Block until Next or Exit. Same pending-promise pattern as
  // onPermissionRequest — host stores the resolver, overlay IPC fires it.
  // `!` is safe: both callers guard on overrides.onTeachStep before reaching here.
  const stepResult = await overrides.onTeachStep!({
    explanation: step.explanation,
    nextPreview: step.nextPreview,
    anchorLogical: step.anchorLogical,
  });

  if (stepResult.action === "exit") {
    // The host's Exit handler also calls stopSession, so the turn is
    // already unwinding. Caller decides what to return for the transcript.
    // A PREVIOUS step's left_mouse_down may have left the OS button held.
    await releaseHeldMouse(adapter);
    return { kind: "exit" };
  }

  // Next clicked. Flip overlay to spinner before we start driving.
  overrides.onTeachWorking?.();

  if (step.actions.length === 0) {
    return { kind: "ok", results: [] };
  }

  if (subGates.hideBeforeAction) {
    const hidden = await adapter.executor.prepareForAction(
      overrides.allowedApps.map((a) => a.bundleId),
      overrides.selectedDisplayId,
    );
    if (hidden.length > 0) {
      overrides.onAppsHidden?.(hidden);
    }
  }

  const stepSubGates: CuSubGates = {
    ...subGates,
    hideBeforeAction: false,
    pixelValidation: false,
    // Anchors are pre-computed against the display at batch start.
    // A mid-batch resolver switch would break tooltip positioning.
    autoTargetDisplay: false,
  };

  const results: BatchActionResult[] = [];
  for (const [i, act] of step.actions.entries()) {
    // Same abort check as handleComputerBatch — Exit calls stopSession so
    // this IS the exit path, just caught mid-dispatch instead of at the
    // onTeachStep await above. Callers already handle { kind: "exit" }.
    if (overrides.isAborted?.()) {
      await releaseHeldMouse(adapter);
      return { kind: "exit" };
    }
    // Same inter-step settle as handleComputerBatch.
    if (i > 0) await sleep(10);
    const action = act.action as string;

    // Drop mid-step screenshot piggyback — same invariant as computer_batch.
    // Click coords stay anchored to the screenshot the model took BEFORE
    // calling teach_step/teach_batch.
    const { screenshot: _dropped, ...inner } = await dispatchAction(
      action,
      act,
      adapter,
      overrides,
      stepSubGates,
    );

    const text = firstTextContent(inner);
    const result = { action, ok: !inner.isError, output: text };
    results.push(result);

    if (inner.isError) {
      await releaseHeldMouse(adapter);
      return {
        kind: "action_error",
        executed: results.length - 1,
        failed: result,
        remaining: step.actions.length - results.length,
        telemetry: inner.telemetry,
      };
    }
  }

  return { kind: "ok", results };
}

/**
 * Fold a fresh screenshot into the result. Eliminates the separate
 * screenshot tool call the model would otherwise make before the next
 * teach_step (one fewer API round trip per step). handleScreenshot
 * runs its own prepareForAction — that's correct: actions may have
 * opened something outside the allowlist. The .screenshot piggyback
 * flows through to serverDef.ts's stash → lastScreenshot updates →
 * the next teach_step.anchor scales against THIS image, which is what
 * the model is now looking at.
 */
async function appendTeachScreenshot(
  resultJson: unknown,
  adapter: ComputerUseHostAdapter,
  overrides: ComputerUseOverrides,
  subGates: CuSubGates,
): Promise<CuCallToolResult> {
  const shotResult = await handleScreenshot(adapter, overrides, subGates);
  if (shotResult.isError) {
    // Hide+screenshot failed (rare — e.g. SCContentFilter error). Don't
    // tank the step; just omit the image. Model will call screenshot
    // itself and see the real error.
    return okJson(resultJson);
  }
  return {
    content: [
      { type: "text", text: JSON.stringify(resultJson) },
      // handleScreenshot's content is [maybeMonitorNote, maybeHiddenNote,
      // image]. Spread all — both notes are useful context and the model
      // expects them alongside screenshots.
      ...shotResult.content,
    ],
    // For serverDef.ts to stash. Next teach_step.anchor scales against this.
    screenshot: shotResult.screenshot,
  };
}

/**
 * Show one guided-tour tooltip and block until the user clicks Next or Exit.
 * On Next, execute `actions[]` with `computer_batch` semantics.
 */
async function handleTeachStep(
  adapter: ComputerUseHostAdapter,
  args: Record<string, unknown>,
  overrides: ComputerUseOverrides,
  subGates: CuSubGates,
): Promise<CuCallToolResult> {
  if (!overrides.onTeachStep) {
    return errorResult(
      "Teach mode is not active. Call request_teach_access first.",
      "teach_mode_not_active",
    );
  }

  const step = await validateTeachStepArgs(
    args,
    adapter,
    overrides,
    "teach_step",
  );
  if (step instanceof Error) return errorResult(step.message, "bad_args");

  const outcome = await executeTeachStep(step, adapter, overrides, subGates);

  if (outcome.kind === "exit") {
    return okJson({ exited: true });
  }
  if (outcome.kind === "action_error") {
    return okJson(
      {
        executed: outcome.executed,
        failed: outcome.failed,
        remaining: outcome.remaining,
      },
      outcome.telemetry,
    );
  }

  // ok. No screenshot for empty actions — screen didn't change, model's
  // existing screenshot is still accurate.
  if (step.actions.length === 0) {
    return okJson({ executed: 0, results: [] });
  }
  return appendTeachScreenshot(
    { executed: outcome.results.length, results: outcome.results },
    adapter,
    overrides,
    subGates,
  );
}

/**
 * Queue a whole guided tour in one tool call. Parallels `computer_batch`: N
 * steps → one model→API round trip instead of N. Each step still blocks for
 * its own Next click (the user paces the tour), but the model doesn't wait
 * for a round trip between steps.
 *
 * Validates ALL steps upfront so a typo in step 5 doesn't surface after the
 * user has already clicked through steps 1–4.
 *
 * Anchors for every step scale against the pre-call `lastScreenshot` — same
 * PRE-BATCH invariant as computer_batch. Steps 2+ should either omit anchor
 * (centered tooltip) or target elements the model predicts won't have moved.
 *
 * Result shape:
 *   {exited: true, stepsCompleted: N}                   — user clicked Exit
 *   {stepsCompleted, stepFailed, executed, failed, …}   — action error at step N
 *   {stepsCompleted, results: [...]} + screenshot       — all steps ran
 */
async function handleTeachBatch(
  adapter: ComputerUseHostAdapter,
  args: Record<string, unknown>,
  overrides: ComputerUseOverrides,
  subGates: CuSubGates,
): Promise<CuCallToolResult> {
  if (!overrides.onTeachStep) {
    return errorResult(
      "Teach mode is not active. Call request_teach_access first.",
      "teach_mode_not_active",
    );
  }

  const rawSteps = args.steps;
  if (!Array.isArray(rawSteps) || rawSteps.length < 1) {
    return errorResult('"steps" must be a non-empty array.', "bad_args");
  }

  // Validate upfront — fail fast before showing any tooltip.
  const steps: ValidatedTeachStep[] = [];
  for (const [i, raw] of rawSteps.entries()) {
    if (typeof raw !== "object" || raw === null) {
      return errorResult(`steps[${i}] must be an object`, "bad_args");
    }
    const v = await validateTeachStepArgs(
      raw as Record<string, unknown>,
      adapter,
      overrides,
      `steps[${i}]`,
    );
    if (v instanceof Error) return errorResult(v.message, "bad_args");
    steps.push(v);
  }

  const allResults: BatchActionResult[][] = [];
  for (const [i, step] of steps.entries()) {
    const outcome = await executeTeachStep(step, adapter, overrides, subGates);

    if (outcome.kind === "exit") {
      return okJson({ exited: true, stepsCompleted: i });
    }
    if (outcome.kind === "action_error") {
      return okJson(
        {
          stepsCompleted: i,
          stepFailed: i,
          executed: outcome.executed,
          failed: outcome.failed,
          remaining: outcome.remaining,
          results: allResults,
        },
        outcome.telemetry,
      );
    }
    allResults.push(outcome.results);
  }

  // Final screenshot only if any step ran actions (screen changed).
  const screenChanged = steps.some((s) => s.actions.length > 0);
  const resultJson = { stepsCompleted: steps.length, results: allResults };
  if (!screenChanged) {
    return okJson(resultJson);
  }
  return appendTeachScreenshot(resultJson, adapter, overrides, subGates);
}

/**
 * Build the hidden-apps note that accompanies a screenshot. Tells the model
 * which apps got hidden (not in allowlist) and how to add them. Returns
 * undefined when nothing was hidden since the last screenshot.
 */
async function buildHiddenNote(
  adapter: ComputerUseHostAdapter,
  hiddenSinceLastSeen: string[],
): Promise<string | undefined> {
  if (hiddenSinceLastSeen.length === 0) return undefined;
  const running = await adapter.executor.listRunningApps();
  const nameOf = new Map(running.map((a) => [a.bundleId, a.displayName]));
  const names = hiddenSinceLastSeen.map((id) => nameOf.get(id) ?? id);
  const list = names.map((n) => `"${n}"`).join(", ");
  const one = names.length === 1;
  return (
    `${list} ${one ? "was" : "were"} open and got hidden before this screenshot ` +
    `(not in the session allowlist). If a previous action was meant to open ` +
    `${one ? "it" : "one of them"}, that's why you don't see it — call ` +
    `request_access to add ${one ? "it" : "them"} to the allowlist.`
  );
}

/**
 * Assign a human-readable label to each display. Falls back to `display N`
 * when NSScreen.localizedName is undefined; disambiguates identical labels
 * (matched-pair external monitors) with a `(2)` suffix. Used by both
 * buildMonitorNote and handleSwitchDisplay so the name the model sees in a
 * screenshot note is the same name it can pass back to switch_display.
 */
function uniqueDisplayLabels(
  displays: readonly DisplayGeometry[],
): Map<number, string> {
  // Sort by displayId so the (N) suffix is stable regardless of
  // NSScreen.screens iteration order — same label always maps to same
  // physical display across buildMonitorNote → switch_display round-trip,
  // even if display configuration reorders between the two calls.
  const sorted = [...displays].sort((a, b) => a.displayId - b.displayId);
  const counts = new Map<string, number>();
  const out = new Map<number, string>();
  for (const d of sorted) {
    const base = d.label ?? `display ${d.displayId}`;
    const n = (counts.get(base) ?? 0) + 1;
    counts.set(base, n);
    out.set(d.displayId, n === 1 ? base : `${base} (${n})`);
  }
  return out;
}

/**
 * Build the monitor-context text that accompanies a screenshot. Tells the
 * model which monitor it's looking at (by human name), lists other attached
 * monitors, and flags when the monitor changed vs. the previous screenshot.
 *
 * Only emitted when there are 2+ displays AND (first screenshot OR the
 * display changed). Single-monitor setups and steady-state same-monitor
 * screenshots get no text — avoids noise.
 */
async function buildMonitorNote(
  adapter: ComputerUseHostAdapter,
  shotDisplayId: number,
  lastDisplayId: number | undefined,
  canSwitchDisplay: boolean,
): Promise<string | undefined> {
  // listDisplays failure (e.g. Swift returns zero screens during monitor
  // hot-unplug) must not tank the screenshot — this note is optional context.
  let displays;
  try {
    displays = await adapter.executor.listDisplays();
  } catch (e) {
    adapter.logger.warn(`[computer-use] listDisplays failed: ${String(e)}`);
    return undefined;
  }
  if (displays.length < 2) return undefined;

  const labels = uniqueDisplayLabels(displays);
  const nameOf = (id: number): string => labels.get(id) ?? `display ${id}`;

  const current = nameOf(shotDisplayId);
  const others = displays
    .filter((d) => d.displayId !== shotDisplayId)
    .map((d) => nameOf(d.displayId));
  const switchHint = canSwitchDisplay
    ? " Use switch_display to capture a different monitor."
    : "";
  const othersList =
    others.length > 0
      ? ` Other attached monitors: ${others.map((n) => `"${n}"`).join(", ")}.` +
        switchHint
      : "";

  // 0 is kCGNullDirectDisplay (sentinel from old sessions persisted
  // pre-multimon) — treat same as undefined.
  if (lastDisplayId === undefined || lastDisplayId === 0) {
    return `This screenshot was taken on monitor "${current}".` + othersList;
  }
  if (lastDisplayId !== shotDisplayId) {
    const prev = nameOf(lastDisplayId);
    return (
      `This screenshot was taken on monitor "${current}", which is different ` +
      `from your previous screenshot (taken on "${prev}").` +
      othersList
    );
  }
  return undefined;
}

async function handleScreenshot(
  adapter: ComputerUseHostAdapter,
  overrides: ComputerUseOverrides,
  subGates: CuSubGates,
): Promise<CuCallToolResult> {
  // §2 — empty allowlist → tool error, no screenshot.
  if (overrides.allowedApps.length === 0) {
    return errorResult(
      "No applications are granted for this session. Call request_access first.",
      "allowlist_empty",
    );
  }

  // Atomic resolve→prepare→capture (one Swift call, no scheduler gap).
  // Off → fall through to separate-calls path below.
  if (subGates.autoTargetDisplay) {
    // Model's explicit switch_display pin overrides everything — Swift's
    // straight cuDisplayInfo(forDisplayID:) passthrough, no chase chain.
    // Otherwise sticky display: only auto-resolve when the allowed-app
    // set has changed since the display was last resolved. Prevents the
    // resolver yanking the display on every screenshot.
    const allowedBundleIds = overrides.allowedApps.map((a) => a.bundleId);
    const currentAppSetKey = allowedBundleIds.slice().sort().join(",");
    const appSetChanged = currentAppSetKey !== overrides.displayResolvedForApps;
    const autoResolve = !overrides.displayPinnedByModel && appSetChanged;

    const result = await adapter.executor.resolvePrepareCapture({
      allowedBundleIds,
      preferredDisplayId: overrides.selectedDisplayId,
      autoResolve,
      // Keep the hideBeforeAction sub-gate independently rollable —
      // atomic path honors the same toggle the non-atomic path checks
      // at the prepareForAction call site.
      doHide: subGates.hideBeforeAction,
    });

    // Non-atomic path's takeScreenshotWithRetry has a MIN_SCREENSHOT_BYTES
    // check + retry. The atomic call is expensive (resolve+prepare+capture),
    // so no retry here — just a warning when the result is implausibly
    // small (transient display state like sleep wake). Skip when
    // captureError is set (base64 is intentionally empty then).
    if (
      result.captureError === undefined &&
      decodedByteLength(result.base64) < MIN_SCREENSHOT_BYTES
    ) {
      adapter.logger.warn(
        `[computer-use] resolvePrepareCapture result implausibly small (${decodedByteLength(result.base64)} bytes decoded) — possible transient display state`,
      );
    }

    // Resolver picked a different display than the session had selected
    // (host window moved, or allowed app on a different display). Write
    // the pick back to session so teach overlay positioning and subsequent
    // non-resolver calls track the same display. Fire-and-forget.
    if (result.displayId !== overrides.selectedDisplayId) {
      adapter.logger.debug(
        `[computer-use] resolver: preferred=${overrides.selectedDisplayId} resolved=${result.displayId}`,
      );
      overrides.onResolvedDisplayUpdated?.(result.displayId);
    }
    // Record the app set this display was resolved for, so the next
    // screenshot skips auto-resolve until the set changes again. Gated on
    // autoResolve (not just appSetChanged) — when pinned, we didn't
    // actually resolve, so don't update the key.
    if (autoResolve) {
      overrides.onDisplayResolvedForApps?.(currentAppSetKey);
    }

    // Report hidden apps only when the model has already seen the screen.
    let hiddenSinceLastSeen: string[] = [];
    if (overrides.lastScreenshot !== undefined) {
      hiddenSinceLastSeen = result.hidden;
    }
    if (result.hidden.length > 0) {
      overrides.onAppsHidden?.(result.hidden);
    }

    // Partial-success case: hide succeeded, capture failed (SCK perm
    // revoked mid-session). onAppsHidden fired above so auto-unhide will
    // restore hidden apps at turn end. Now surface the error to the model.
    if (result.captureError !== undefined) {
      return errorResult(result.captureError, "capture_failed");
    }

    const hiddenNote = await buildHiddenNote(adapter, hiddenSinceLastSeen);

    // Cherry-pick — don't spread `result` (would leak resolver fields into lastScreenshot).
    const shot: ScreenshotResult = {
      base64: result.base64,
      width: result.width,
      height: result.height,
      displayWidth: result.displayWidth,
      displayHeight: result.displayHeight,
      displayId: result.displayId,
      originX: result.originX,
      originY: result.originY,
    };

    const monitorNote = await buildMonitorNote(
      adapter,
      shot.displayId ?? 0,
      overrides.lastScreenshot?.displayId,
      overrides.onDisplayPinned !== undefined,
    );

    return {
      content: [
        ...(monitorNote ? [{ type: "text" as const, text: monitorNote }] : []),
        ...(hiddenNote ? [{ type: "text" as const, text: hiddenNote }] : []),
        // Accessibility snapshot: structured GUI element tree (Windows bound-window mode)
        ...(shot.accessibilityText ? [{ type: "text" as const, text: `GUI elements in this window:\n${shot.accessibilityText}` }] : []),
        {
          type: "image",
          data: shot.base64,
          mimeType: "image/jpeg",
        },
      ],
      screenshot: shot,
    };
  }

  // Same hide+defocus sequence as input actions. Screenshot needs hide too
  // — if a non-allowlisted app is on top, SCContentFilter would composite it
  // out, but the pixels BELOW it are what the model would see, and those are
  // NOT what's actually there. Hiding first makes the screenshot TRUE.
  let hiddenSinceLastSeen: string[] = [];
  if (subGates.hideBeforeAction) {
    const hidden = await adapter.executor.prepareForAction(
      overrides.allowedApps.map((a) => a.bundleId),
      overrides.selectedDisplayId,
    );
    // "Something appeared since the model last looked." Report whenever:
    //   (a) prepare hid something AND
    //   (b) the model has ALREADY SEEN the screen (lastScreenshot is set).
    //
    // (b) is the discriminator that silences the first screenshot's
    // expected-noise hide. NOT a delta against a cumulative set — that was
    // the earlier bug: cuHiddenDuringTurn only grows, so once Preview is in
    // it (from the first screenshot's hide), subsequent re-hides of Preview
    // delta to zero. The double-click → Preview opens → re-hide → silent
    // loop never breaks.
    //
    // With this check: every re-hide fires. If the model loops "click → file
    // opens in Preview → screenshot → Preview hidden", it gets told EVERY
    // time. Eventually it'll request_access for Preview (or give up).
    //
    // False positive: user alt-tabs mid-turn → Safari re-hidden → reported.
    // Rare, and "Safari appeared" is at worst mild noise — far better than
    // the false-negative of never explaining why the file vanished.
    if (overrides.lastScreenshot !== undefined) {
      hiddenSinceLastSeen = hidden;
    }
    if (hidden.length > 0) {
      overrides.onAppsHidden?.(hidden);
    }
  }

  const allowedBundleIds = overrides.allowedApps.map((g) => g.bundleId);
  const shot = await takeScreenshotWithRetry(
    adapter.executor,
    allowedBundleIds,
    adapter.logger,
    overrides.selectedDisplayId,
  );

  const hiddenNote = await buildHiddenNote(adapter, hiddenSinceLastSeen);

  const monitorNote = await buildMonitorNote(
    adapter,
    shot.displayId ?? 0,
    overrides.lastScreenshot?.displayId,
    overrides.onDisplayPinned !== undefined,
  );

  return {
    content: [
      ...(monitorNote ? [{ type: "text" as const, text: monitorNote }] : []),
      ...(hiddenNote ? [{ type: "text" as const, text: hiddenNote }] : []),
      // Accessibility snapshot: structured GUI element tree (Windows bound-window mode)
      ...(shot.accessibilityText ? [{ type: "text" as const, text: `GUI elements in this window:\n${shot.accessibilityText}` }] : []),
      {
        type: "image",
        data: shot.base64,
        mimeType: "image/jpeg",
      },
    ],
    // Piggybacked for serverDef.ts to stash on InternalServerContext.
    screenshot: shot,
  };
}

/**
 * Region-crop upscaled screenshot. Coord invariant (computer_use_v2.py:1092):
 * click coords ALWAYS refer to the full-screen screenshot, never the zoom.
 * Enforced structurally: this handler's return has NO `.screenshot` field,
 * so serverDef.ts's `if (result.screenshot)` branch cannot fire and
 * `cuLastScreenshot` is never touched. `executor.zoom()`'s return type also
 * lacks displayWidth/displayHeight, so it's not assignable to
 * `ScreenshotResult` even by accident.
 */
async function handleZoom(
  adapter: ComputerUseHostAdapter,
  args: Record<string, unknown>,
  overrides: ComputerUseOverrides,
): Promise<CuCallToolResult> {
  // region: [x0, y0, x1, y1] in IMAGE-PX of lastScreenshot — same space the
  // model reads click coords from.
  const region = args.region;
  if (!Array.isArray(region) || region.length !== 4) {
    return errorResult(
      "region must be an array of length 4: [x0, y0, x1, y1]",
      "bad_args",
    );
  }
  const [x0, y0, x1, y1] = region;
  if (![x0, y0, x1, y1].every((v) => typeof v === "number" && v >= 0)) {
    return errorResult(
      "region values must be non-negative numbers",
      "bad_args",
    );
  }
  if (x1 <= x0)
    return errorResult("region x1 must be greater than x0", "bad_args");
  if (y1 <= y0)
    return errorResult("region y1 must be greater than y0", "bad_args");

  const last = overrides.lastScreenshot;
  if (!last) {
    return errorResult(
      "take a screenshot before zooming (region coords are relative to it)",
      "state_conflict",
    );
  }
  if (x1 > last.width || y1 > last.height) {
    return errorResult(
      `region exceeds screenshot bounds (${last.width}×${last.height})`,
      "bad_args",
    );
  }

  // image-px → logical-pt. Same ratio as scaleCoord (:198-199) —
  // displayWidth / width, not 1/scaleFactor. The ratio is folded.
  const ratioX = last.displayWidth / last.width;
  const ratioY = last.displayHeight / last.height;
  const regionLogical = {
    x: x0 * ratioX,
    y: y0 * ratioY,
    w: (x1 - x0) * ratioX,
    h: (y1 - y0) * ratioY,
  };

  const allowedIds = overrides.allowedApps.map((g) => g.bundleId);
  // Crop from the same display as lastScreenshot so the zoom region
  // matches the image the model is reading coords from.
  const zoomed = await adapter.executor.zoom(
    regionLogical,
    allowedIds,
    last.displayId,
  );

  // Return the image. NO `.screenshot` piggyback — this is the invariant.
  return {
    content: [{ type: "image", data: zoomed.base64, mimeType: "image/jpeg" }],
  };
}

/** Shared handler for all five click variants. */
async function handleClickVariant(
  adapter: ComputerUseHostAdapter,
  args: Record<string, unknown>,
  overrides: ComputerUseOverrides,
  subGates: CuSubGates,
  button: "left" | "right" | "middle",
  count: 1 | 2 | 3,
): Promise<CuCallToolResult> {
  // A prior left_mouse_down may have set mouseButtonHeld without a matching
  // left_mouse_up (e.g. drag rejected by a tier gate, model falls back to
  // left_click). executor.click() does its own mouseDown+mouseUp, releasing
  // the OS button — but without this, the JS flag stays true and all
  // subsequent mouse_move calls take the held-button path ("mouse"/
  // "mouse_full" actionKind + hit-test), causing spurious rejections on
  // click-tier and read-tier windows. Release first so click() gets a clean
  // slate.
  if (mouseButtonHeld) {
    await adapter.executor.mouseUp();
    mouseButtonHeld = false;
    mouseMoved = false;
  }

  const coord = extractCoordinate(args);
  if (coord instanceof Error) return errorResult(coord.message, "bad_args");
  const [rawX, rawY] = coord;

  // left_click(coordinate=[x,y], text="shift") — hold modifiers
  // during the click. Same chord parsing as the key tool.
  let modifiers: string[] | undefined;
  if (args.text !== undefined) {
    if (typeof args.text !== "string") {
      return errorResult("text must be a string", "bad_args");
    }
    // Same gate as handleKey/handleHoldKey. withModifiers presses each name
    // via native.key(m, "press") — a non-modifier like "q" in text="cmd+q"
    // gets pressed while Cmd is held → Cmd+Q fires before the click.
    if (
      isSystemKeyCombo(args.text, adapter.executor.capabilities.platform) &&
      !overrides.grantFlags.systemKeyCombos
    ) {
      return errorResult(
        `The modifier chord "${args.text}" would fire a system shortcut. ` +
          "Request the systemKeyCombos grant flag via request_access, or use " +
          "only modifier keys (shift, ctrl, alt, cmd) in the text parameter.",
        "grant_flag_required",
      );
    }
    modifiers = parseKeyChord(args.text);
  }

  // Right/middle-click and any click with a modifier chord escalate to
  // keyboard-equivalent input at tier "click" (context-menu Paste, chord
  // keystrokes). Compute once, pass to both gates.
  const clickActionKind: CuActionKind =
    button !== "left" || (modifiers !== undefined && modifiers.length > 0)
      ? "mouse_full"
      : "mouse";

  const gate = await runInputActionGates(
    adapter,
    overrides,
    subGates,
    clickActionKind,
  );
  if (gate) return gate;

  const display = await adapter.executor.getDisplaySize(
    overrides.selectedDisplayId,
  );

  // §6 item P — pixel-validation staleness check. Sub-gated.
  // Runs AFTER the gates (no point validating if we're about to refuse
  // anyway) but BEFORE the executor call.
  if (subGates.pixelValidation) {
    const { xPct, yPct } = coordToPercentageForPixelCompare(
      rawX,
      rawY,
      overrides.coordinateMode,
      overrides.lastScreenshot,
    );
    const validation = await validateClickTarget(
      adapter.cropRawPatch,
      overrides.lastScreenshot,
      xPct,
      yPct,
      async () => {
        // The fresh screenshot for validation uses the SAME allow-set as
        // the model's last screenshot did, so we compare like with like.
        const allowedIds = overrides.allowedApps.map((g) => g.bundleId);
        try {
          // Fresh shot must match lastScreenshot's display, not the current
          // selection — pixel-compare is against the model's last image.
          return await adapter.executor.screenshot({
            allowedBundleIds: allowedIds,
            displayId: overrides.lastScreenshot?.displayId,
          });
        } catch {
          return null;
        }
      },
      adapter.logger,
    );
    if (!validation.valid && validation.warning) {
      // Warning result — model told to re-screenshot.
      return okText(validation.warning);
    }
  }

  const { x, y } = scaleCoord(
    rawX,
    rawY,
    overrides.coordinateMode,
    display,
    overrides.lastScreenshot,
    adapter.logger,
  );

  const hitGate = await runHitTestGate(
    adapter,
    overrides,
    subGates,
    x,
    y,
    clickActionKind,
  );
  if (hitGate) return hitGate;

  await adapter.executor.click(x, y, button, count, modifiers);
  return okText("Clicked.");
}

async function handleType(
  adapter: ComputerUseHostAdapter,
  args: Record<string, unknown>,
  overrides: ComputerUseOverrides,
  subGates: CuSubGates,
): Promise<CuCallToolResult> {
  const text = requireString(args, "text");
  if (text instanceof Error) return errorResult(text.message, "bad_args");

  const gate = await runInputActionGates(
    adapter,
    overrides,
    subGates,
    "keyboard",
  );
  if (gate) return gate;

  // §6 item 3 — clipboard-paste fast path for multi-line. Sub-gated AND
  // requires clipboardWrite grant. The save/restore + read-back-verify
  // lives in the EXECUTOR (task #5), not here. Here we just route.
  const viaClipboard =
    text.includes("\n") &&
    overrides.grantFlags.clipboardWrite &&
    subGates.clipboardPasteMultiline;

  if (viaClipboard) {
    await adapter.executor.type(text, { viaClipboard: true });
    return okText("Typed (via clipboard).");
  }

  // §6 item 7 — grapheme-cluster iteration. Prevents ZWJ emoji → �.
  // §6 item 4 — 8ms between graphemes (125 Hz USB polling). Battle-tested:
  // sleep BEFORE each keystroke, not after.
  //
  // \n, \r, \t MUST route through executor.key(), not type(). Two reasons:
  //   1. enigo.text("\n") on macOS posts a stale CGEvent with virtualKey=0
  //      after stripping the newline — virtualKey 0 is the 'a' key, so a
  //      ghost 'a' gets typed. Upstream bug in enigo 0.6.1 fast_text().
  //   2. Unicode text-insertion of '\n' is not a Return key press. URL bars
  //      and terminals ignore it; the model's intent (submit/execute) is lost.
  // CRLF (\r\n) is one grapheme cluster (UAX #29 GB3), so check for it too.
  const graphemes = segmentGraphemes(text);
  for (const [i, g] of graphemes.entries()) {
    // Same abort check as handleComputerBatch. At 8ms/grapheme a 50-char
    // type() runs ~400ms; this is where an in-flight batch actually
    // spends its time.
    if (overrides.isAborted?.()) {
      return errorResult(
        `Typing aborted after ${i} of ${graphemes.length} graphemes (user interrupt).`,
      );
    }
    await sleep(INTER_GRAPHEME_SLEEP_MS);
    if (g === "\n" || g === "\r" || g === "\r\n") {
      await adapter.executor.key("return");
    } else if (g === "\t") {
      await adapter.executor.key("tab");
    } else {
      await adapter.executor.type(g, { viaClipboard: false });
    }
  }
  return okText(`Typed ${graphemes.length} grapheme(s).`);
}

async function handleKey(
  adapter: ComputerUseHostAdapter,
  args: Record<string, unknown>,
  overrides: ComputerUseOverrides,
  subGates: CuSubGates,
): Promise<CuCallToolResult> {
  const keySequence = requireString(args, "text");
  if (keySequence instanceof Error)
    return errorResult("text is required", "bad_args");

  // Cap 100, error strings match.
  let repeat: number | undefined;
  if (args.repeat !== undefined) {
    if (
      typeof args.repeat !== "number" ||
      !Number.isInteger(args.repeat) ||
      args.repeat < 1
    ) {
      return errorResult("repeat must be a positive integer", "bad_args");
    }
    if (args.repeat > 100) {
      return errorResult("repeat exceeds maximum of 100", "bad_args");
    }
    repeat = args.repeat;
  }

  // §2 — blocklist check BEFORE gates. A blocked combo with an ungranted
  // app frontmost should return the blocklist error, not the frontmost
  // error — the model's fix is to request the flag, not change focus.
  if (
    isSystemKeyCombo(keySequence, adapter.executor.capabilities.platform) &&
    !overrides.grantFlags.systemKeyCombos
  ) {
    return errorResult(
      `"${keySequence}" is a system-level shortcut. Request the \`systemKeyCombos\` grant via request_access to use it.`,
      "grant_flag_required",
    );
  }

  const gate = await runInputActionGates(
    adapter,
    overrides,
    subGates,
    "keyboard",
  );
  if (gate) return gate;

  await adapter.executor.key(keySequence, repeat);
  return okText("Key pressed.");
}

async function handleScroll(
  adapter: ComputerUseHostAdapter,
  args: Record<string, unknown>,
  overrides: ComputerUseOverrides,
  subGates: CuSubGates,
): Promise<CuCallToolResult> {
  const coord = extractCoordinate(args);
  if (coord instanceof Error) return errorResult(coord.message, "bad_args");
  const [rawX, rawY] = coord;

  // Uses scroll_direction + scroll_amount.
  // Map to our dx/dy executor interface.
  const dir = args.scroll_direction;
  if (dir !== "up" && dir !== "down" && dir !== "left" && dir !== "right") {
    return errorResult(
      "scroll_direction must be 'up', 'down', 'left', or 'right'",
      "bad_args",
    );
  }
  const amount = args.scroll_amount;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0) {
    return errorResult("scroll_amount must be a non-negative int", "bad_args");
  }
  if (amount > 100) {
    return errorResult("scroll_amount exceeds maximum of 100", "bad_args");
  }
  // up → dy = -amount; down → dy = +amount; left → dx = -amount; right → dx = +amount.
  const dx = dir === "left" ? -amount : dir === "right" ? amount : 0;
  const dy = dir === "up" ? -amount : dir === "down" ? amount : 0;

  const gate = await runInputActionGates(adapter, overrides, subGates, "mouse");
  if (gate) return gate;

  const display = await adapter.executor.getDisplaySize(
    overrides.selectedDisplayId,
  );
  const { x, y } = scaleCoord(
    rawX,
    rawY,
    overrides.coordinateMode,
    display,
    overrides.lastScreenshot,
    adapter.logger,
  );

  // When the button is held, executor.scroll's internal moveMouse generates
  // a leftMouseDragged event (enigo reads NSEvent.pressedMouseButtons) —
  // same mechanism as handleMoveMouse's held-button path. Upgrade the
  // hit-test to "mouse_full" so scroll can't be used to drag-drop text onto
  // a click-tier terminal, and mark mouseMoved so the subsequent
  // left_mouse_up hit-tests as a drop not a click-release.
  const hitGate = await runHitTestGate(
    adapter,
    overrides,
    subGates,
    x,
    y,
    mouseButtonHeld ? "mouse_full" : "mouse",
  );
  if (hitGate) return hitGate;
  if (mouseButtonHeld) mouseMoved = true;

  await adapter.executor.scroll(x, y, dx, dy);
  return okText("Scrolled.");
}

async function handleDrag(
  adapter: ComputerUseHostAdapter,
  args: Record<string, unknown>,
  overrides: ComputerUseOverrides,
  subGates: CuSubGates,
): Promise<CuCallToolResult> {
  // executor.drag() does its own press+release internally. Without this
  // defensive clear, a prior left_mouse_down leaves mouseButtonHeld=true
  // across the drag and desyncs the flag from OS state — same mechanism as
  // the handleClickVariant clear above. Release first so drag() gets a
  // clean slate.
  if (mouseButtonHeld) {
    await adapter.executor.mouseUp();
    mouseButtonHeld = false;
    mouseMoved = false;
  }

  // `coordinate` is the END point
  // (required). `start_coordinate` is OPTIONAL — when omitted, drag from
  // current cursor position.
  const endCoord = extractCoordinate(args, "coordinate");
  if (endCoord instanceof Error)
    return errorResult(endCoord.message, "bad_args");
  const rawTo = endCoord;

  let rawFrom: [number, number] | undefined;
  if (args.start_coordinate !== undefined) {
    const startCoord = extractCoordinate(args, "start_coordinate");
    if (startCoord instanceof Error)
      return errorResult(startCoord.message, "bad_args");
    rawFrom = startCoord;
  }
  // else: rawFrom stays undefined → executor drags from current cursor.

  const gate = await runInputActionGates(adapter, overrides, subGates, "mouse");
  if (gate) return gate;

  const display = await adapter.executor.getDisplaySize(
    overrides.selectedDisplayId,
  );
  const from =
    rawFrom === undefined
      ? undefined
      : scaleCoord(
          rawFrom[0],
          rawFrom[1],
          overrides.coordinateMode,
          display,
          overrides.lastScreenshot,
          adapter.logger,
        );
  const to = scaleCoord(
    rawTo[0],
    rawTo[1],
    overrides.coordinateMode,
    display,
    overrides.lastScreenshot,
    adapter.logger,
  );

  // Check both drag endpoints. `from` is where the mouseDown happens (picks
  // up), `to` is where mouseUp happens (drops). When start_coordinate is
  // omitted the drag begins at the cursor — same bypass as mouse_move →
  // left_mouse_down, so read the cursor and hit-test it (mirrors
  // handleLeftMouseDown).
  //
  // The `to` endpoint uses "mouse_full" (not "mouse"): dropping text onto a
  // terminal inserts it as if typed (macOS text drag-drop). Same threat as
  // right-click→Paste. `from` stays "mouse" — picking up is a read.
  const fromPoint = from ?? (await adapter.executor.getCursorPosition());
  const fromGate = await runHitTestGate(
    adapter,
    overrides,
    subGates,
    fromPoint.x,
    fromPoint.y,
    "mouse",
  );
  if (fromGate) return fromGate;
  const toGate = await runHitTestGate(
    adapter,
    overrides,
    subGates,
    to.x,
    to.y,
    "mouse_full",
  );
  if (toGate) return toGate;

  await adapter.executor.drag(from, to);
  return okText("Dragged.");
}

async function handleMoveMouse(
  adapter: ComputerUseHostAdapter,
  args: Record<string, unknown>,
  overrides: ComputerUseOverrides,
  subGates: CuSubGates,
): Promise<CuCallToolResult> {
  const coord = extractCoordinate(args);
  if (coord instanceof Error) return errorResult(coord.message, "bad_args");
  const [rawX, rawY] = coord;

  // When the button is held, moveMouse generates leftMouseDragged events on
  // the window under the cursor — that's interaction, not positioning.
  // Upgrade to "mouse" and hit-test the destination. When the button is NOT
  // held: pure positioning, passes at any tier, no hit-test (mouseDown/Up
  // hit-test the cursor to close the mouse_move→left_mouse_down decomposition).
  const actionKind: CuActionKind = mouseButtonHeld ? "mouse" : "mouse_position";
  const gate = await runInputActionGates(
    adapter,
    overrides,
    subGates,
    actionKind,
  );
  if (gate) return gate;

  const display = await adapter.executor.getDisplaySize(
    overrides.selectedDisplayId,
  );
  const { x, y } = scaleCoord(
    rawX,
    rawY,
    overrides.coordinateMode,
    display,
    overrides.lastScreenshot,
    adapter.logger,
  );

  if (mouseButtonHeld) {
    // "mouse_full" — same as left_click_drag's to-endpoint. Dragging onto a
    // click-tier terminal is text injection regardless of which primitive
    // (atomic drag vs. decomposed down/move/up) delivers the events.
    const hitGate = await runHitTestGate(
      adapter,
      overrides,
      subGates,
      x,
      y,
      "mouse_full",
    );
    if (hitGate) return hitGate;
  }

  await adapter.executor.moveMouse(x, y);
  if (mouseButtonHeld) mouseMoved = true;
  return okText("Moved.");
}

async function handleOpenApplication(
  adapter: ComputerUseHostAdapter,
  args: Record<string, unknown>,
  overrides: ComputerUseOverrides,
): Promise<CuCallToolResult> {
  const app = requireString(args, "app");
  if (app instanceof Error) return errorResult(app.message, "bad_args");

  // Resolve display-name → bundle ID. Same logic as request_access.
  const allowed = new Set(overrides.allowedApps.map((g) => g.bundleId));
  let targetBundleId: string | undefined;

  if (looksLikeBundleId(app) && allowed.has(app)) {
    targetBundleId = app;
  } else {
    // Try display name → bundle ID, but ONLY against the allowlist itself.
    // Avoids paying the listInstalledApps() cost on the hot path and is
    // arguably more correct: if the user granted "Slack", the model asking
    // to open "Slack" should match THAT grant.
    const match = overrides.allowedApps.find(
      (g) => g.displayName.toLowerCase() === app.toLowerCase(),
    );
    targetBundleId = match?.bundleId;
  }

  if (!targetBundleId || !allowed.has(targetBundleId)) {
    return errorResult(
      `"${app}" is not granted for this session. Call request_access first.`,
      "app_not_granted",
    );
  }

  // open_application works at any tier — bringing an app forward is exactly
  // what tier "read" enables (you need it on screen to screenshot it). The
  // tier gates on click/type catch any follow-up interaction.

  await adapter.executor.openApp(targetBundleId);

  // On multi-monitor setups, macOS may place the opened window on a monitor
  // the resolver won't pick (e.g. Claude + another allowed app are co-located
  // elsewhere). Nudge the model toward switch_display BEFORE it wastes steps
  // clicking on dock icons. Single-monitor → no hint. listDisplays failure is
  // non-fatal — the hint is advisory.
  if (overrides.onDisplayPinned !== undefined) {
    let displayCount = 1;
    try {
      displayCount = (await adapter.executor.listDisplays()).length;
    } catch {
      // hint skipped
    }
    if (displayCount >= 2) {
      return okText(
        `Opened "${app}". If it isn't visible in the next screenshot, it may ` +
          `have opened on a different monitor — use switch_display to check.`,
      );
    }
  }

  return okText(`Opened "${app}".`);
}

async function handleVirtualMouse(
  adapter: ComputerUseHostAdapter,
  args: Record<string, unknown>,
): Promise<CuCallToolResult> {
  if (!adapter.executor.virtualMouse) {
    return errorResult("virtual_mouse is only available on Windows with a bound window.", "feature_unavailable");
  }
  const action = requireString(args, "action");
  if (action instanceof Error) return errorResult(action.message, "bad_args");
  const coord = args.coordinate;
  if (!Array.isArray(coord) || coord.length < 2) {
    return errorResult("coordinate [x, y] is required.", "bad_args");
  }
  const validActions = new Set(["click", "double_click", "right_click", "move", "drag", "down", "up"]);
  if (!validActions.has(action)) {
    return errorResult(`Invalid action "${action}". Valid: ${[...validActions].join(", ")}`, "bad_args");
  }
  const startCoord = Array.isArray(args.start_coordinate) ? args.start_coordinate : undefined;
  const ok = await adapter.executor.virtualMouse({
    action: action as any,
    x: coord[0], y: coord[1],
    startX: startCoord?.[0], startY: startCoord?.[1],
  });
  if (!ok) {
    return errorResult("No window is currently bound.", "bad_args");
  }
  const desc: Record<string, string> = {
    click: `Click at (${coord[0]},${coord[1]})`,
    double_click: `Double-click at (${coord[0]},${coord[1]})`,
    right_click: `Right-click at (${coord[0]},${coord[1]})`,
    move: `Moved to (${coord[0]},${coord[1]})`,
    drag: `Dragged ${startCoord ? `(${startCoord[0]},${startCoord[1]})` : "current"} → (${coord[0]},${coord[1]})`,
    down: `Button down at (${coord[0]},${coord[1]})`,
    up: `Button up at (${coord[0]},${coord[1]})`,
  };
  return okText(desc[action] ?? action);
}

async function handleVirtualKeyboard(
  adapter: ComputerUseHostAdapter,
  args: Record<string, unknown>,
): Promise<CuCallToolResult> {
  if (!adapter.executor.virtualKeyboard) {
    return errorResult("virtual_keyboard is only available on Windows with a bound window.", "feature_unavailable");
  }
  const action = requireString(args, "action");
  if (action instanceof Error) return errorResult(action.message, "bad_args");
  const text = requireString(args, "text");
  if (text instanceof Error) return errorResult(text.message, "bad_args");

  const validActions = new Set(["type", "combo", "press", "release", "hold"]);
  if (!validActions.has(action)) {
    return errorResult(`Invalid action "${action}". Valid: ${[...validActions].join(", ")}`, "bad_args");
  }

  const duration = typeof args.duration === "number" ? args.duration : undefined;
  const repeat = typeof args.repeat === "number" ? args.repeat : undefined;

  const ok = await adapter.executor.virtualKeyboard({
    action: action as any,
    text,
    duration,
    repeat,
  });

  if (!ok) {
    return errorResult("No window is currently bound. Use open_application or bind_window first.", "bad_args");
  }

  const desc: Record<string, string> = {
    type: `Typed "${text.length > 40 ? text.slice(0, 40) + "..." : text}"`,
    combo: `Sent ${text}`,
    press: `Pressed ${text} (holding)`,
    release: `Released ${text}`,
    hold: `Held ${text} for ${duration ?? 1}s`,
  };

  return okText(`${desc[action]}${repeat && repeat > 1 ? ` ×${repeat}` : ""}`);
}

async function handleStatusIndicator(
  adapter: ComputerUseHostAdapter,
  args: Record<string, unknown>,
): Promise<CuCallToolResult> {
  if (!adapter.executor.statusIndicator) {
    return errorResult("status_indicator is only available on Windows.", "feature_unavailable");
  }
  const action = requireString(args, "action");
  if (action instanceof Error) return errorResult(action.message, "bad_args");
  if (!["show", "hide", "status"].includes(action)) {
    return errorResult(`Invalid action "${action}". Valid: show, hide, status.`, "bad_args");
  }
  const message = typeof args.message === "string" ? args.message : undefined;
  if (action === "show" && !message) {
    return errorResult("'show' requires a message parameter.", "bad_args");
  }
  const result = await adapter.executor.statusIndicator(action as any, message);
  if (action === "status") {
    return okText(result.active ? "Indicator is active on the bound window." : "Indicator is not active (no window bound).");
  }
  if (action === "show") {
    return okText(`Indicator showing: "${message}"`);
  }
  return okText("Indicator hidden.");
}

async function handleMouseWheel(
  adapter: ComputerUseHostAdapter,
  args: Record<string, unknown>,
): Promise<CuCallToolResult> {
  if (!adapter.executor.mouseWheel) {
    return errorResult("mouse_wheel is only available on Windows with a bound window.", "feature_unavailable");
  }
  const coord = args.coordinate;
  if (!Array.isArray(coord) || coord.length < 2) {
    return errorResult("coordinate must be [x, y] array.", "bad_args");
  }
  const delta = typeof args.delta === "number" ? args.delta : undefined;
  if (delta === undefined) {
    return errorResult("delta is required (positive=up, negative=down).", "bad_args");
  }
  const horizontal = args.direction === "horizontal";
  const ok = await adapter.executor.mouseWheel(coord[0], coord[1], delta, horizontal);
  if (!ok) {
    return errorResult("No window is currently bound. Use open_application or bind_window first.", "bad_args");
  }
  return okText(
    `Mouse wheel: ${horizontal ? "horizontal" : "vertical"} scroll ${delta > 0 ? "up" : "down"} ${Math.abs(delta)} click(s) at (${coord[0]},${coord[1]}).`,
  );
}

async function handleActivateWindow(
  adapter: ComputerUseHostAdapter,
  args: Record<string, unknown>,
): Promise<CuCallToolResult> {
  if (!adapter.executor.activateWindow) {
    return errorResult("activate_window is only available on Windows with a bound window.", "feature_unavailable");
  }
  const clickX = typeof args.click_x === "number" ? args.click_x : undefined;
  const clickY = typeof args.click_y === "number" ? args.click_y : undefined;
  const ok = await adapter.executor.activateWindow(clickX, clickY);
  if (!ok) {
    return errorResult("No window is currently bound. Use open_application or bind_window first.", "bad_args");
  }
  return okText("Window activated and focused. Ready for input.");
}

async function handlePromptRespond(
  adapter: ComputerUseHostAdapter,
  args: Record<string, unknown>,
): Promise<CuCallToolResult> {
  if (!adapter.executor.respondToPrompt) {
    return errorResult("prompt_respond is only available on Windows with a bound window.", "feature_unavailable");
  }
  const responseType = requireString(args, "response_type");
  if (responseType instanceof Error) return errorResult(responseType.message, "bad_args");

  const validTypes = new Set(["yes", "no", "enter", "escape", "select", "type"]);
  if (!validTypes.has(responseType)) {
    return errorResult(`Invalid response_type "${responseType}". Valid: ${[...validTypes].join(", ")}`, "bad_args");
  }

  if (responseType === "select" && typeof args.arrow_count !== "number") {
    return errorResult("'select' requires arrow_count parameter.", "bad_args");
  }
  if (responseType === "type" && typeof args.text !== "string") {
    return errorResult("'type' requires text parameter.", "bad_args");
  }

  const ok = await adapter.executor.respondToPrompt({
    responseType: responseType as any,
    arrowDirection: typeof args.arrow_direction === "string" ? args.arrow_direction as any : undefined,
    arrowCount: typeof args.arrow_count === "number" ? args.arrow_count : undefined,
    text: typeof args.text === "string" ? args.text : undefined,
  });

  if (!ok) {
    return errorResult("No window is currently bound. Use open_application or bind_window first.", "bad_args");
  }

  const descriptions: Record<string, string> = {
    yes: "Sent 'y' + Enter.",
    no: "Sent 'n' + Enter.",
    enter: "Sent Enter.",
    escape: "Sent Escape.",
    select: `Navigated ${args.arrow_direction ?? "down"} ${args.arrow_count ?? 1} time(s) + Enter.`,
    type: `Typed "${args.text}" + Enter.`,
  };

  return okText(`Prompt responded: ${descriptions[responseType] ?? responseType}. Take a screenshot to verify.`);
}

async function handleOpenTerminal(
  adapter: ComputerUseHostAdapter,
  args: Record<string, unknown>,
): Promise<CuCallToolResult> {
  if (!adapter.executor.openTerminal) {
    return errorResult("open_terminal is only available on Windows.", "feature_unavailable");
  }
  const agent = requireString(args, "agent");
  if (agent instanceof Error) return errorResult(agent.message, "bad_args");

  const validAgents = new Set(["claude", "codex", "gemini", "custom"]);
  if (!validAgents.has(agent)) {
    return errorResult(`Invalid agent "${agent}". Valid: claude, codex, gemini, custom.`, "bad_args");
  }
  if (agent === "custom" && typeof args.command !== "string") {
    return errorResult("agent='custom' requires 'command' parameter.", "bad_args");
  }

  const result = await adapter.executor.openTerminal({
    agent: agent as any,
    command: typeof args.command === "string" ? args.command : undefined,
    terminal: typeof args.terminal === "string" ? args.terminal as any : undefined,
    workingDirectory: typeof args.working_directory === "string" ? args.working_directory : undefined,
  });

  if (!result) {
    return errorResult(
      "Failed to open terminal. Windows Terminal (wt.exe) may not be installed.",
      "launch_failed",
    );
  }

  if (!result.launched) {
    return okText(
      `Terminal opened (hwnd=${result.hwnd}, "${result.title}") but no command was sent. Window is now bound.`,
    );
  }

  const agentNames: Record<string, string> = {
    claude: "Claude Code", codex: "Codex", gemini: "Gemini",
    custom: args.command as string,
  };

  return okText(
    `Terminal opened and ${agentNames[agent] ?? agent} launched.\n` +
    `Window: hwnd=${result.hwnd} "${result.title}"\n` +
    `Command: '${agent === "custom" ? args.command : agent}' + Enter\n` +
    `Status: bound to this terminal. Take a screenshot to verify the agent started.`,
  );
}

async function handleBindWindow(
  adapter: ComputerUseHostAdapter,
  args: Record<string, unknown>,
): Promise<CuCallToolResult> {
  const action = requireString(args, "action");
  if (action instanceof Error) return errorResult(action.message, "bad_args");

  switch (action) {
    case "list": {
      if (!adapter.executor.listVisibleWindows) {
        return errorResult("bind_window is only available on Windows.", "feature_unavailable");
      }
      const windows = await adapter.executor.listVisibleWindows();
      if (windows.length === 0) return okText("No visible windows found.");
      const lines = windows.map(
        (w) => `hwnd=${w.hwnd} pid=${w.pid} "${w.title}"`,
      );
      return okText(`Visible windows (${windows.length}):\n${lines.join("\n")}`);
    }
    case "status": {
      if (!adapter.executor.getBindingStatus) {
        return errorResult("bind_window is only available on Windows.", "feature_unavailable");
      }
      const status = await adapter.executor.getBindingStatus();
      if (!status || !status.bound) {
        return okText("No window is currently bound. Use bind_window(action='list') to see available windows, then bind_window(action='bind', title='...') to bind.");
      }
      let text = `Bound to: hwnd=${status.hwnd}`;
      if (status.title) text += ` "${status.title}"`;
      if (status.pid) text += ` pid=${status.pid}`;
      if (status.rect) text += ` rect=(${status.rect.x},${status.rect.y} ${status.rect.width}x${status.rect.height})`;
      return okText(text);
    }
    case "bind": {
      if (!adapter.executor.bindToWindow) {
        return errorResult("bind_window is only available on Windows.", "feature_unavailable");
      }
      const title = typeof args.title === "string" ? args.title : undefined;
      const hwnd = typeof args.hwnd === "string" ? args.hwnd : undefined;
      const pid = typeof args.pid === "number" ? args.pid : undefined;
      if (!title && !hwnd && !pid) {
        return errorResult("Specify at least one of: title, hwnd, or pid.", "bad_args");
      }
      const result = await adapter.executor.bindToWindow({ hwnd, title, pid });
      if (!result) {
        return errorResult(
          `No window found matching: ${[title && `title="${title}"`, hwnd && `hwnd=${hwnd}`, pid && `pid=${pid}`].filter(Boolean).join(", ")}. Use bind_window(action='list') to see available windows.`,
          "element_not_found",
        );
      }
      return okText(`Bound to window: hwnd=${result.hwnd} pid=${result.pid} "${result.title}". All subsequent screenshot/click/type operations target this window.`);
    }
    case "unbind": {
      if (!adapter.executor.unbindFromWindow) {
        return errorResult("bind_window is only available on Windows.", "feature_unavailable");
      }
      await adapter.executor.unbindFromWindow();
      return okText("Window binding released. Operations now target the full screen.");
    }
    default:
      return errorResult(`Unknown bind_window action "${action}". Valid: list, bind, unbind, status.`, "bad_args");
  }
}

async function handleClickElement(
  adapter: ComputerUseHostAdapter,
  args: Record<string, unknown>,
): Promise<CuCallToolResult> {
  if (!adapter.executor.clickElement) {
    return errorResult(
      "click_element is only available on Windows with a bound window.",
      "feature_unavailable",
    );
  }
  const name = typeof args.name === "string" ? args.name : undefined;
  const role = typeof args.role === "string" ? args.role : undefined;
  const automationId = typeof args.automationId === "string" ? args.automationId : undefined;
  if (!name && !role && !automationId) {
    return errorResult("At least one of name, role, or automationId is required.", "bad_args");
  }
  const ok = await adapter.executor.clickElement({ name, role, automationId });
  if (!ok) {
    return errorResult(
      `Element not found: ${[name && `name="${name}"`, role && `role=${role}`, automationId && `id=${automationId}`].filter(Boolean).join(", ")}. Take a screenshot to see current GUI elements.`,
      "element_not_found",
    );
  }
  return okText(`Clicked element: ${[name && `"${name}"`, role, automationId].filter(Boolean).join(" ")}`);
}

async function handleTypeIntoElement(
  adapter: ComputerUseHostAdapter,
  args: Record<string, unknown>,
): Promise<CuCallToolResult> {
  if (!adapter.executor.typeIntoElement) {
    return errorResult(
      "type_into_element is only available on Windows with a bound window.",
      "feature_unavailable",
    );
  }
  const text = requireString(args, "text");
  if (text instanceof Error) return errorResult(text.message, "bad_args");
  const name = typeof args.name === "string" ? args.name : undefined;
  const role = typeof args.role === "string" ? args.role : undefined;
  const automationId = typeof args.automationId === "string" ? args.automationId : undefined;
  const ok = await adapter.executor.typeIntoElement({ name, role, automationId }, text);
  if (!ok) {
    return errorResult(
      `Could not type into element: ${[name && `name="${name}"`, role && `role=${role}`, automationId && `id=${automationId}`].filter(Boolean).join(", ")}. The element was not found or doesn't support text input.`,
      "element_not_found",
    );
  }
  return okText(`Typed ${text.length} chars into: ${[name && `"${name}"`, role, automationId].filter(Boolean).join(" ")}`);
}

async function handleWindowManagement(
  adapter: ComputerUseHostAdapter,
  args: Record<string, unknown>,
): Promise<CuCallToolResult> {
  const action = requireString(args, "action");
  if (action instanceof Error) return errorResult(action.message, "bad_args");

  const VALID_ACTIONS = new Set([
    "minimize", "maximize", "restore", "close", "focus", "move_offscreen", "move_resize", "get_rect",
  ]);
  if (!VALID_ACTIONS.has(action)) {
    return errorResult(
      `Unknown window_management action "${action}". Valid: ${[...VALID_ACTIONS].join(", ")}`,
      "bad_args",
    );
  }

  if (!adapter.executor.manageWindow) {
    return errorResult(
      "window_management is only available on Windows with a bound window.",
      "feature_unavailable",
    );
  }

  // get_rect: just return the current window position and size
  if (action === "get_rect") {
    if (!adapter.executor.getWindowRect) {
      return errorResult("getWindowRect not available.", "feature_unavailable");
    }
    const rect = await adapter.executor.getWindowRect();
    if (!rect) {
      return errorResult("No window is currently bound. Call open_application first.", "bad_args");
    }
    return okText(
      `Window rect: x=${rect.x}, y=${rect.y}, width=${rect.width}, height=${rect.height}`,
    );
  }

  // move_resize: requires x, y (width/height optional)
  if (action === "move_resize") {
    const x = typeof args.x === "number" ? args.x : undefined;
    const y = typeof args.y === "number" ? args.y : undefined;
    if (x === undefined || y === undefined) {
      return errorResult("move_resize requires x and y parameters.", "bad_args");
    }
    const width = typeof args.width === "number" ? args.width : undefined;
    const height = typeof args.height === "number" ? args.height : undefined;
    const ok = await adapter.executor.manageWindow(action, { x, y, width, height });
    if (!ok) {
      return errorResult("No window is currently bound. Call open_application first.", "bad_args");
    }
    return okText(
      width && height
        ? `Moved window to (${x}, ${y}) and resized to ${width}×${height}.`
        : `Moved window to (${x}, ${y}).`,
    );
  }

  // All other actions: minimize, maximize, restore, close, focus, move_offscreen
  const ok = await adapter.executor.manageWindow(action);
  if (!ok) {
    return errorResult(
      "No window is currently bound. Call open_application first.",
      "bad_args",
    );
  }

  const descriptions: Record<string, string> = {
    minimize: "Window minimized (ShowWindow SW_MINIMIZE).",
    maximize: "Window maximized (ShowWindow SW_MAXIMIZE).",
    restore: "Window restored (ShowWindow SW_RESTORE).",
    close: "Window closed (SendMessage WM_CLOSE). The window binding has been released.",
    focus: "Window brought to front (SetForegroundWindow).",
    move_offscreen: "Window moved offscreen (-32000,-32000). Still usable via SendMessage/PrintWindow.",
  };

  return okText(descriptions[action] ?? `Action "${action}" completed.`);
}

async function handleSwitchDisplay(
  adapter: ComputerUseHostAdapter,
  args: Record<string, unknown>,
  overrides: ComputerUseOverrides,
): Promise<CuCallToolResult> {
  const display = requireString(args, "display");
  if (display instanceof Error) return errorResult(display.message, "bad_args");

  if (!overrides.onDisplayPinned) {
    return errorResult(
      "Display switching is not available in this session.",
      "feature_unavailable",
    );
  }

  if (display.toLowerCase() === "auto") {
    overrides.onDisplayPinned(undefined);
    return okText(
      "Returned to automatic monitor selection. Call screenshot to continue.",
    );
  }

  // Resolve label → displayId fresh. Same source buildMonitorNote reads,
  // so whatever name the model saw in a screenshot note resolves here.
  let displays;
  try {
    displays = await adapter.executor.listDisplays();
  } catch (e) {
    return errorResult(
      `Failed to enumerate displays: ${String(e)}`,
      "display_error",
    );
  }

  if (displays.length < 2) {
    return errorResult(
      "Only one monitor is connected. There is nothing to switch to.",
      "bad_args",
    );
  }

  const labels = uniqueDisplayLabels(displays);
  const wanted = display.toLowerCase();
  const target = displays.find(
    (d) => labels.get(d.displayId)?.toLowerCase() === wanted,
  );
  if (!target) {
    const available = displays
      .map((d) => `"${labels.get(d.displayId)}"`)
      .join(", ");
    return errorResult(
      `No monitor named "${display}" is connected. Available monitors: ${available}.`,
      "bad_args",
    );
  }

  overrides.onDisplayPinned(target.displayId);
  return okText(
    `Switched to monitor "${labels.get(target.displayId)}". Call screenshot to see it.`,
  );
}

function handleListGrantedApplications(
  overrides: ComputerUseOverrides,
): CuCallToolResult {
  return okJson({
    allowedApps: overrides.allowedApps,
    grantFlags: overrides.grantFlags,
  });
}

async function handleReadClipboard(
  adapter: ComputerUseHostAdapter,
  overrides: ComputerUseOverrides,
  subGates: CuSubGates,
): Promise<CuCallToolResult> {
  if (!overrides.grantFlags.clipboardRead) {
    return errorResult(
      "Clipboard read is not granted. Request `clipboardRead` via request_access.",
      "grant_flag_required",
    );
  }

  // read_clipboard doesn't route through runInputActionGates — sync here so
  // reading after clicking into a click-tier app sees the cleared clipboard
  // (same as what the app's own Paste would see).
  if (subGates.clipboardGuard) {
    const frontmost = await adapter.executor.getFrontmostApp();
    const tierByBundleId = new Map(
      overrides.allowedApps.map((a) => [a.bundleId, a.tier] as const),
    );
    const frontmostTier = frontmost
      ? tierByBundleId.get(frontmost.bundleId)
      : undefined;
    await syncClipboardStash(adapter, overrides, frontmostTier === "click");
  }

  // clipboardGuard may have stashed+cleared — read the actual (possibly
  // empty) clipboard. The agent sees what the app would see.
  const text = await adapter.executor.readClipboard();
  return okJson({ text });
}

async function handleWriteClipboard(
  adapter: ComputerUseHostAdapter,
  args: Record<string, unknown>,
  overrides: ComputerUseOverrides,
  subGates: CuSubGates,
): Promise<CuCallToolResult> {
  if (!overrides.grantFlags.clipboardWrite) {
    return errorResult(
      "Clipboard write is not granted. Request `clipboardWrite` via request_access.",
      "grant_flag_required",
    );
  }
  const text = requireString(args, "text");
  if (text instanceof Error) return errorResult(text.message, "bad_args");

  if (subGates.clipboardGuard) {
    const frontmost = await adapter.executor.getFrontmostApp();
    const tierByBundleId = new Map(
      overrides.allowedApps.map((a) => [a.bundleId, a.tier] as const),
    );
    const frontmostTier = frontmost
      ? tierByBundleId.get(frontmost.bundleId)
      : undefined;

    // Defense-in-depth for the clipboardGuard bypass: write_clipboard +
    // left_click on a click-tier app's UI Paste button. The re-clear in
    // syncClipboardStash already defeats it (the next action clobbers the
    // write), but rejecting here gives the agent a clear signal instead of
    // silently voiding its write.
    if (frontmost && frontmostTier === "click") {
      return errorResult(
        `"${frontmost.displayName}" is a tier-"click" app and currently ` +
          `frontmost. write_clipboard is blocked because the next action ` +
          `would clear the clipboard anyway — a UI Paste button in this ` +
          `app cannot be used to inject text. Bring a tier-"full" app ` +
          `forward before writing to the clipboard.` +
          TIER_ANTI_SUBVERSION,
        "tier_insufficient",
      );
    }

    // write_clipboard doesn't route through runInputActionGates — sync here
    // so clicking away from a click-tier app then writing restores the user's
    // stash before the agent's text lands.
    await syncClipboardStash(adapter, overrides, frontmostTier === "click");
  }

  await adapter.executor.writeClipboard(text);
  return okText("Clipboard written.");
}

/**
 * wait(duration=N). Sleeps N seconds, capped at 100.
 * No frontmost gate — no input, nothing to protect. Kill-switch + TCC
 * are checked in handleToolCall before dispatch reaches here.
 */
async function handleWait(
  args: Record<string, unknown>,
): Promise<CuCallToolResult> {
  const duration = args.duration;
  if (typeof duration !== "number" || !Number.isFinite(duration)) {
    return errorResult("duration must be a number", "bad_args");
  }
  if (duration < 0) {
    return errorResult("duration must be non-negative", "bad_args");
  }
  if (duration > 100) {
    return errorResult(
      "duration is too long. Duration is in seconds.",
      "bad_args",
    );
  }
  await sleep(duration * 1000);
  return okText(`Waited ${duration}s.`);
}

/**
 * Returns "X=...,Y=..." plain text. We return richer JSON with
 * coordinateSpace annotation — the model handles both shapes.
 *
 * When lastScreenshot is present: inverse of scaleCoord — logical points →
 * image-pixels via `imageX = logicalX × (screenshotWidth / displayWidth)`.
 * Uses capture-time dims so the returned coords match what the model would
 * read off that screenshot.
 *
 * No frontmost gate — read-only, no input.
 */
async function handleCursorPosition(
  adapter: ComputerUseHostAdapter,
  overrides: ComputerUseOverrides,
): Promise<CuCallToolResult> {
  const logical = await adapter.executor.getCursorPosition();
  const shot = overrides.lastScreenshot;
  if (shot) {
    // Inverse of scaleCoord: subtract capture-time origin to go from
    // virtual-screen to display-relative before the image-px transform.
    const localX = logical.x - shot.originX;
    const localY = logical.y - shot.originY;
    // Cursor off the captured display (multi-monitor): local coords go
    // negative or exceed display dims. Return logical_points + hint rather
    // than garbage image-px.
    if (
      localX < 0 ||
      localX > shot.displayWidth ||
      localY < 0 ||
      localY > shot.displayHeight
    ) {
      return okJson({
        x: logical.x,
        y: logical.y,
        coordinateSpace: "logical_points",
        note: "cursor is on a different monitor than your last screenshot; take a fresh screenshot",
      });
    }
    const x = Math.round(localX * (shot.width / shot.displayWidth));
    const y = Math.round(localY * (shot.height / shot.displayHeight));
    return okJson({ x, y, coordinateSpace: "image_pixels" });
  }
  return okJson({
    x: logical.x,
    y: logical.y,
    coordinateSpace: "logical_points",
    note: "take a screenshot first for image-pixel coordinates",
  });
}

/**
 * Presses each key in the
 * chord, sleeps duration seconds, releases in reverse. Same duration bounds
 * as wait. Keyboard action → frontmost gate applies; same systemKeyCombos
 * blocklist check as key.
 */
async function handleHoldKey(
  adapter: ComputerUseHostAdapter,
  args: Record<string, unknown>,
  overrides: ComputerUseOverrides,
  subGates: CuSubGates,
): Promise<CuCallToolResult> {
  const text = requireString(args, "text");
  if (text instanceof Error) return errorResult(text.message, "bad_args");

  const duration = args.duration;
  if (typeof duration !== "number" || !Number.isFinite(duration)) {
    return errorResult("duration must be a number", "bad_args");
  }
  if (duration < 0) {
    return errorResult("duration must be non-negative", "bad_args");
  }
  if (duration > 100) {
    return errorResult(
      "duration is too long. Duration is in seconds.",
      "bad_args",
    );
  }

  // Blocklist check BEFORE gates — same reasoning as handleKey. Holding
  // cmd+q is just as dangerous as tapping it.
  if (
    isSystemKeyCombo(text, adapter.executor.capabilities.platform) &&
    !overrides.grantFlags.systemKeyCombos
  ) {
    return errorResult(
      `"${text}" is a system-level shortcut. Request the \`systemKeyCombos\` grant via request_access to use it.`,
      "grant_flag_required",
    );
  }

  const gate = await runInputActionGates(
    adapter,
    overrides,
    subGates,
    "keyboard",
  );
  if (gate) return gate;

  const keyNames = parseKeyChord(text);
  await adapter.executor.holdKey(keyNames, duration * 1000);
  return okText("Key held.");
}

/**
 * Raw press at current cursor, no coordinate.
 * Move first with mouse_move. Errors if already held.
 */
async function handleLeftMouseDown(
  adapter: ComputerUseHostAdapter,
  overrides: ComputerUseOverrides,
  subGates: CuSubGates,
): Promise<CuCallToolResult> {
  if (mouseButtonHeld) {
    return errorResult(
      "mouse button already held, call left_mouse_up first",
      "state_conflict",
    );
  }

  const gate = await runInputActionGates(adapter, overrides, subGates, "mouse");
  if (gate) return gate;

  // macOS routes mouseDown to the window under the cursor, not the frontmost
  // app. Without this hit-test, mouse_move (positioning, passes at any tier)
  // + left_mouse_down decomposes a click that lands on a tier-"read" window
  // overlapping a tier-"full" frontmost app — bypassing runHitTestGate's
  // whole purpose. All three are batchable, so the bypass is atomic.
  const cursor = await adapter.executor.getCursorPosition();
  const hitGate = await runHitTestGate(
    adapter,
    overrides,
    subGates,
    cursor.x,
    cursor.y,
    "mouse",
  );
  if (hitGate) return hitGate;

  await adapter.executor.mouseDown();
  mouseButtonHeld = true;
  mouseMoved = false;
  return okText("Mouse button pressed.");
}

/**
 * Raw release at current cursor. Does NOT error
 * if not held (idempotent release).
 */
async function handleLeftMouseUp(
  adapter: ComputerUseHostAdapter,
  overrides: ComputerUseOverrides,
  subGates: CuSubGates,
): Promise<CuCallToolResult> {
  // Any gate rejection here must release the button FIRST — otherwise the
  // OS button stays pressed and mouseButtonHeld stays true. Recovery
  // attempts (mouse_move back to a safe app) would generate leftMouseDragged
  // events into whatever window is under the cursor, including the very
  // read-tier window the gate was protecting. A single mouseUp on a
  // restricted window is one event; a stuck button is cascading damage.
  //
  // This includes the frontmost gate: focus can change between mouseDown and
  // mouseUp (something else grabbed focus), in which case runInputActionGates
  // rejects here even though it passed at mouseDown.
  const releaseFirst = async (
    err: CuCallToolResult,
  ): Promise<CuCallToolResult> => {
    await adapter.executor.mouseUp();
    mouseButtonHeld = false;
    mouseMoved = false;
    return err;
  };

  const gate = await runInputActionGates(adapter, overrides, subGates, "mouse");
  if (gate) return releaseFirst(gate);

  // When the cursor moved since mouseDown, this is a drop (text-injection
  // vector) — hit-test at "mouse_full" same as left_click_drag's `to`. When
  // NO move happened, this is a click-release — same semantics as the atomic
  // left_click, hit-test at "mouse". Without this distinction, a decomposed
  // click on a click-tier app fails here while the atomic left_click works,
  // and releaseFirst fires mouseUp anyway so the OS sees a complete click
  // while the model gets a misleading error.
  const cursor = await adapter.executor.getCursorPosition();
  const hitGate = await runHitTestGate(
    adapter,
    overrides,
    subGates,
    cursor.x,
    cursor.y,
    mouseMoved ? "mouse_full" : "mouse",
  );
  if (hitGate) return releaseFirst(hitGate);

  await adapter.executor.mouseUp();
  mouseButtonHeld = false;
  mouseMoved = false;
  return okText("Mouse button released.");
}

// ---------------------------------------------------------------------------
// Batch dispatch
// ---------------------------------------------------------------------------

/**
 * Actions allowed inside a computer_batch call. Excludes request_access,
 * open_application, clipboard, list_granted (no latency benefit, complicates
 * security model).
 */
const BATCHABLE_ACTIONS: ReadonlySet<string> = new Set([
  "key",
  "type",
  "mouse_move",
  "left_click",
  "left_click_drag",
  "right_click",
  "middle_click",
  "double_click",
  "triple_click",
  "scroll",
  "hold_key",
  "screenshot",
  "cursor_position",
  "left_mouse_down",
  "left_mouse_up",
  "wait",
]);

interface BatchActionResult {
  action: string;
  ok: boolean;
  output: string;
}

/**
 * Executes `actions: [{action, …}, …]`
 * sequentially in ONE model→API round trip — the dominant latency cost
 * (seconds, vs. ~50ms local overhead per action).
 *
 * Gate semantics (the security model):
 *   - Kill-switch + TCC: checked ONCE by handleToolCall before reaching here.
 *   - prepareForAction: run ONCE at the top. The user approved "do this
 *     sequence"; hiding apps per-action is wasted work and fast-pathed anyway.
 *   - Frontmost gate: checked PER ACTION. State can change mid-batch — a
 *     click might open a non-allowed app. This is the safety net: if action
 *     3 of 5 opened Safari (not allowed), action 4's frontmost check fires
 *     and stops the batch there.
 *   - PixelCompare: SKIPPED inside batch. The model committed to the full
 *     sequence without intermediate screenshots; validating mid-batch clicks
 *     against a pre-batch screenshot would false-positive constantly.
 *
 * Both skips are implemented by passing `{...subGates, hideBeforeAction:
 * false, pixelValidation: false}` to each inner dispatch — the handlers'
 * existing gate logic does the right thing, no new code paths.
 *
 * Stop-on-first-error: accumulate results, on
 * first `isError` stop executing, return everything so far + the error. The
 * model sees exactly where the batch broke and what succeeded before it.
 *
 * Mid-batch screenshots are allowed (for inspection) but NEVER piggyback —
 * their `.screenshot` field is dropped. Same invariant as zoom: click coords
 * always refer to the PRE-BATCH `lastScreenshot`. If the model wants to click
 * based on a new screenshot, it ends the batch and screenshots separately.
 */
async function handleComputerBatch(
  adapter: ComputerUseHostAdapter,
  args: Record<string, unknown>,
  overrides: ComputerUseOverrides,
  subGates: CuSubGates,
): Promise<CuCallToolResult> {
  const actions = args.actions;
  if (!Array.isArray(actions) || actions.length === 0) {
    return errorResult("actions must be a non-empty array", "bad_args");
  }

  for (const [i, act] of actions.entries()) {
    if (typeof act !== "object" || act === null) {
      return errorResult(`actions[${i}] must be an object`, "bad_args");
    }
    const action = (act as Record<string, unknown>).action;
    if (typeof action !== "string") {
      return errorResult(`actions[${i}].action must be a string`, "bad_args");
    }
    if (!BATCHABLE_ACTIONS.has(action)) {
      return errorResult(
        `actions[${i}].action="${action}" is not allowed in a batch. ` +
          `Allowed: ${[...BATCHABLE_ACTIONS].join(", ")}.`,
        "bad_args",
      );
    }
  }

  // prepareForAction ONCE. After this, inner dispatches skip it via
  // hideBeforeAction:false.
  if (subGates.hideBeforeAction) {
    const hidden = await adapter.executor.prepareForAction(
      overrides.allowedApps.map((a) => a.bundleId),
      overrides.selectedDisplayId,
    );
    if (hidden.length > 0) {
      overrides.onAppsHidden?.(hidden);
    }
  }

  // Inner actions: skip prepare (already ran), skip pixelCompare (stale by
  // design). Frontmost still checked — runInputActionGates does it
  // unconditionally.
  const batchSubGates: CuSubGates = {
    ...subGates,
    hideBeforeAction: false,
    pixelValidation: false,
    // Batch already took its screenshot (appended at end); a mid-batch
    // resolver switch would make that screenshot inconsistent with
    // earlier clicks' lastScreenshot-based scaleCoord targeting.
    autoTargetDisplay: false,
  };

  const results: BatchActionResult[] = [];
  for (const [i, act] of actions.entries()) {
    // Overlay Stop → host's stopSession → lifecycleState leaves "running"
    // synchronously before query.interrupt(). The SDK abort tears down the
    // host's await but not this loop — without this check the remaining
    // actions fire into a dead session.
    if (overrides.isAborted?.()) {
      await releaseHeldMouse(adapter);
      return errorResult(
        `Batch aborted after ${results.length} of ${actions.length} actions (user interrupt).`,
      );
    }

    // Small inter-step settle. Synthetic CGEvents post instantly; some apps
    // need a tick to process step N's input before step N+1 lands (e.g. a
    // click opening a menu before the next click targets a menu item).
    if (i > 0) await sleep(10);

    const actionArgs = act as Record<string, unknown>;
    const action = actionArgs.action as string;

    // Drop mid-batch screenshot piggyback (strip .screenshot). Click coords
    // stay anchored to the pre-batch lastScreenshot.
    const { screenshot: _dropped, ...inner } = await dispatchAction(
      action,
      actionArgs,
      adapter,
      overrides,
      batchSubGates,
    );

    const text = firstTextContent(inner);
    const result = { action, ok: !inner.isError, output: text };
    results.push(result);

    if (inner.isError) {
      // Stop-on-first-error. Return everything so far + the error.
      // Forward the inner action's telemetry (error_kind) so cu_tool_call
      // reflects the actual failure — without this, batch-internal errors
      // emit error_kind: undefined despite the inner handler tagging it.
      // Release held mouse: the error may be a mid-grapheme abort in
      // handleType, or a frontmost gate, landing between mouse_down and
      // mouse_up.
      await releaseHeldMouse(adapter);
      return okJson(
        {
          completed: results.slice(0, -1),
          failed: result,
          remaining: actions.length - results.length,
        },
        inner.telemetry,
      );
    }
  }

  return okJson({ completed: results });
}

function firstTextContent(r: CuCallToolResult): string {
  const first = r.content[0];
  return first && first.type === "text" ? first.text : "";
}

/**
 * Action dispatch shared by handleToolCall and handleComputerBatch. Called
 * AFTER kill-switch + TCC gates have passed. Never sees request_access — it's
 * special-cased in handleToolCall for the tccState thread-through.
 */
async function dispatchAction(
  name: string,
  a: Record<string, unknown>,
  adapter: ComputerUseHostAdapter,
  overrides: ComputerUseOverrides,
  subGates: CuSubGates,
): Promise<CuCallToolResult> {
  // ── Bound-window auto-routing ──────────────────────────────────────
  // When a window is bound (Win32), route generic input tools to
  // virtual_mouse / virtual_keyboard automatically. The model doesn't
  // need to know which tools to use — binding handles it.
  const hasBoundWindow =
    (await adapter.executor.hasBoundWindow?.()) === true &&
    adapter.executor.virtualMouse &&
    adapter.executor.virtualKeyboard;
  if (hasBoundWindow) {
    const coord = Array.isArray(a.coordinate) ? a.coordinate as number[] : undefined;
    switch (name) {
      case "left_click":
        if (coord) return handleVirtualMouse(adapter, { action: "click", coordinate: coord });
        break;
      case "double_click":
        if (coord) return handleVirtualMouse(adapter, { action: "double_click", coordinate: coord });
        break;
      case "right_click":
        if (coord) return handleVirtualMouse(adapter, { action: "right_click", coordinate: coord });
        break;
      case "mouse_move":
        if (coord) return handleVirtualMouse(adapter, { action: "move", coordinate: coord });
        break;
      case "left_click_drag":
        if (coord) return handleVirtualMouse(adapter, {
          action: "drag", coordinate: coord,
          start_coordinate: Array.isArray(a.start_coordinate) ? a.start_coordinate : undefined,
        });
        break;
      case "left_mouse_down":
        if (coord) return handleVirtualMouse(adapter, { action: "down", coordinate: coord });
        break;
      case "left_mouse_up":
        if (coord) return handleVirtualMouse(adapter, { action: "up", coordinate: coord });
        break;
      case "type":
        if (typeof a.text === "string") return handleVirtualKeyboard(adapter, { action: "type", text: a.text });
        break;
      case "key":
        if (typeof a.text === "string") return handleVirtualKeyboard(adapter, { action: "combo", text: a.text, repeat: a.repeat });
        break;
      case "hold_key":
        if (typeof a.text === "string") return handleVirtualKeyboard(adapter, {
          action: "hold", text: a.text,
          duration: typeof a.duration === "number" ? a.duration : 1,
        });
        break;
      case "scroll":
        if (coord) return handleMouseWheel(adapter, {
          coordinate: coord,
          delta: a.scroll_direction === "up" ? (a.scroll_amount ?? 3) : -(a.scroll_amount ?? 3),
          direction: (a.scroll_direction === "left" || a.scroll_direction === "right") ? "horizontal" : "vertical",
        });
        break;
      // screenshot, zoom, wait, cursor_position — not rerouted, pass through
    }
  }
  // ── Standard dispatch (unbound or tools not rerouted above) ────────
  switch (name) {
    case "screenshot":
      return handleScreenshot(adapter, overrides, subGates);

    case "zoom":
      return handleZoom(adapter, a, overrides);

    case "left_click":
      return handleClickVariant(adapter, a, overrides, subGates, "left", 1);
    case "double_click":
      return handleClickVariant(adapter, a, overrides, subGates, "left", 2);
    case "triple_click":
      return handleClickVariant(adapter, a, overrides, subGates, "left", 3);
    case "right_click":
      return handleClickVariant(adapter, a, overrides, subGates, "right", 1);
    case "middle_click":
      return handleClickVariant(adapter, a, overrides, subGates, "middle", 1);

    case "type":
      return handleType(adapter, a, overrides, subGates);

    case "key":
      return handleKey(adapter, a, overrides, subGates);

    case "scroll":
      return handleScroll(adapter, a, overrides, subGates);

    case "left_click_drag":
      return handleDrag(adapter, a, overrides, subGates);

    case "mouse_move":
      return handleMoveMouse(adapter, a, overrides, subGates);

    case "wait":
      return handleWait(a);

    case "cursor_position":
      return handleCursorPosition(adapter, overrides);

    case "hold_key":
      return handleHoldKey(adapter, a, overrides, subGates);

    case "left_mouse_down":
      return handleLeftMouseDown(adapter, overrides, subGates);

    case "left_mouse_up":
      return handleLeftMouseUp(adapter, overrides, subGates);

    case "open_application":
      return handleOpenApplication(adapter, a, overrides);

    case "window_management":
      return handleWindowManagement(adapter, a);

    case "click_element":
      return handleClickElement(adapter, a);

    case "type_into_element":
      return handleTypeIntoElement(adapter, a);

    case "open_terminal":
      return handleOpenTerminal(adapter, a);

    case "bind_window":
      return handleBindWindow(adapter, a);

    case "virtual_mouse":
      return handleVirtualMouse(adapter, a);

    case "virtual_keyboard":
      return handleVirtualKeyboard(adapter, a);

    case "status_indicator":
      return handleStatusIndicator(adapter, a);

    case "mouse_wheel":
      return handleMouseWheel(adapter, a);

    case "activate_window":
      return handleActivateWindow(adapter, a);

    case "prompt_respond":
      return handlePromptRespond(adapter, a);

    case "switch_display":
      return handleSwitchDisplay(adapter, a, overrides);

    case "list_granted_applications":
      return handleListGrantedApplications(overrides);

    case "read_clipboard":
      return handleReadClipboard(adapter, overrides, subGates);

    case "write_clipboard":
      return handleWriteClipboard(adapter, a, overrides, subGates);

    case "computer_batch":
      return handleComputerBatch(adapter, a, overrides, subGates);

    default:
      return errorResult(`Unknown tool "${name}".`, "bad_args");
  }
}

// ---------------------------------------------------------------------------
// Main dispatch
// ---------------------------------------------------------------------------

export async function handleToolCall(
  adapter: ComputerUseHostAdapter,
  name: string,
  args: unknown,
  rawOverrides: ComputerUseOverrides,
): Promise<CuCallToolResult> {
  const { logger, serverName } = adapter;

  // Normalize the allowlist before any gate runs:
  //
  // (a) Strip user-denied. A grant from a previous session (before the user
  //     added the app to Settings → Desktop app → Computer Use → Denied apps)
  //     must not survive. Without
  //     this, a stale grant bypasses the auto-deny. Stripped silently — the
  //     agent already saw the userDenied guidance at request_access time, and
  //     a live frontmost-gate rejection cites "not in allowed applications".
  //
  // (b) Strip policy-denied. Same story as (a) for a grant that predates a
  //     blocklist addition. buildAccessRequest denies these up front for new
  //     requests; this catches stale persisted grants.
  //
  // (c) Backfill tier. A grant persisted before the tier field existed has
  //     `tier: undefined`, which `tierSatisfies` treats as `"full"` — wrong
  //     for a legacy Chrome grant. Assign the hardcoded tier based on
  //     bundle-ID category. Modern grants already have a tier.
  //
  // `.some()` guard keeps the hot path (empty deny list, no legacy grants)
  // zero-alloc.
  const userDeniedSet = new Set(rawOverrides.userDeniedBundleIds);
  const overrides: ComputerUseOverrides = rawOverrides.allowedApps.some(
    (a) =>
      a.tier === undefined ||
      userDeniedSet.has(a.bundleId) ||
      isPolicyDenied(a.bundleId, a.displayName),
  )
    ? {
        ...rawOverrides,
        allowedApps: rawOverrides.allowedApps
          .filter((a) => !userDeniedSet.has(a.bundleId))
          .filter((a) => !isPolicyDenied(a.bundleId, a.displayName))
          .map((a) =>
            a.tier !== undefined
              ? a
              : { ...a, tier: getDefaultTierForApp(a.bundleId, a.displayName) },
          ),
      }
    : rawOverrides;

  // ─── Gate 1: kill switch ─────────────────────────────────────────────
  if (adapter.isDisabled()) {
    return errorResult(
      "Computer control is disabled in Settings. Enable it and try again.",
      "other",
    );
  }

  // ─── Gate 2: TCC ─────────────────────────────────────────────────────
  // Accessibility + Screen Recording on macOS. Pure check — no dialog,
  // no relaunch. `request_access` is exempted: it threads the ungranted
  // state through to the renderer, which shows a TCC toggle panel instead
  // of the app list. Every other tool short-circuits here.
  const osPerms = await adapter.ensureOsPermissions();
  let tccState:
    | { accessibility: boolean; screenRecording: boolean }
    | undefined;
  if (!osPerms.granted) {
    // Both request_* tools thread tccState through to the renderer's
    // TCC toggle panel. Every other tool short-circuits.
    if (name !== "request_access" && name !== "request_teach_access") {
      return errorResult(
        "Accessibility and Screen Recording permissions are required. " +
          "Call request_access to show the permission panel.",
        "tcc_not_granted",
      );
    }
    tccState = {
      accessibility: (osPerms as { granted: false; accessibility: boolean; screenRecording: boolean }).accessibility,
      screenRecording: (osPerms as { granted: false; accessibility: boolean; screenRecording: boolean }).screenRecording,
    };
  }

  // ─── Gate 3: global CU lock ──────────────────────────────────────────
  // At most one session uses CU at a time. Every tool including
  // request_access hits the CHECK — even showing the approval dialog while
  // another session holds the lock would be confusing ("why approve access
  // that can't be used?").
  //
  // But ACQUIRE is split: request_access and list_granted_applications
  // check-without-acquire (the overlay + notifications are driven by
  // cuLockChanged, and showing "Claude is using your computer" while the
  // agent is only ASKING for access is premature). First action tool
  // acquires and the overlay appears. If the user denies and no action
  // follows, the overlay never shows.
  //
  // request_teach_access is NOT in this set — approving teach mode HIDES
  // the main window (via onTeachModeActivated), and the lock must be held
  // before that happens. Otherwise a concurrent session's request_access
  // would render its dialog in an invisible main window during the gap
  // between hide and the first teach_step (seconds of model inference).
  // The old acquire-always-at-Gate-3 behavior was correct for teach; only
  // the non-teach permission tools benefit from deferral.
  //
  // Host releases on idle/stop/archive; this package never releases. Both
  // Cowork (LAM) and CCD (LSM) wire checkCuLock via the shared cuLock
  // singleton. When undefined (tests/future hosts), no gate — absence of
  // the mechanism ≠ locked out.
  const deferAcquire = defersLockAcquire(name);
  const lock = overrides.checkCuLock?.();
  if (lock) {
    if (lock.holder !== undefined && !lock.isSelf) {
      return errorResult(
        "Another Claude session is currently using the computer. Wait for " +
          "the user to acknowledge it is finished (stop button in the Claude " +
          "window), or find a non-computer-use approach if one is readily " +
          "apparent.",
        "cu_lock_held",
      );
    }
    if (lock.holder === undefined && !deferAcquire) {
      // Acquire. Emits cuLockChanged → overlay shows. Idempotent — if
      // someone else acquired between check and here (won't happen on a
      // single-threaded event loop, but defensive), this is a no-op.
      overrides.acquireCuLock?.();
      // Fresh lock holder → any prior session's mouseButtonHeld is stale
      // (e.g. overlay stop mid-drag). Clear it so this session doesn't get
      // a spurious "already held" error. resetMouseButtonHeld is file-local;
      // this is the one non-test callsite.
      resetMouseButtonHeld();
    }
    // lock.isSelf → already held by us, proceed.
    // lock.holder === undefined && deferAcquire →
    //   checked but not acquired — proceed, first action will acquire.
  }

  // Sub-gates read FRESH every call so a GrowthBook flip takes effect
  // mid-session (plan §3).
  const subGates = adapter.getSubGates();

  // Clipboard guard runs per-action inside runInputActionGates + inline in
  // handleReadClipboard/handleWriteClipboard. NOT here — per-tool-call sync
  // would run once for computer_batch and miss sub-actions 2..N, and would
  // fire during deferAcquire tools / `wait` / teach_step's blocking-dialog
  // phase where no input is happening.

  const a = asRecord(args);

  logger.silly(
    `[${serverName}] tool=${name} args=${JSON.stringify(a).slice(0, 200)}`,
  );

  // ─── Fail-closed dispatch ────────────────────────────────────────────
  // ANY exception below → tool error, executor never left in a half-called
  // state. Explicit inversion of the prior `catch → return true` fail-open.
  try {
    // request_access / request_teach_access: need tccState thread-through;
    // dispatchAction never sees them (not batchable).
    // teach_step: blocking UI tool, also not batchable; needs subGates for
    // its action-execution phase.
    if (name === "request_access") {
      return await handleRequestAccess(adapter, a, overrides, tccState);
    }
    if (name === "request_teach_access") {
      return await handleRequestTeachAccess(adapter, a, overrides, tccState);
    }
    if (name === "teach_step") {
      return await handleTeachStep(adapter, a, overrides, subGates);
    }
    if (name === "teach_batch") {
      return await handleTeachBatch(adapter, a, overrides, subGates);
    }
    return await dispatchAction(name, a, adapter, overrides, subGates);
  } catch (err) {
    // Fail-closed. If the gate machinery itself throws (e.g.
    // getFrontmostApp() rejects), the executor has NOT been called yet for
    // the gated tools — the gates run before the executor in every handler.
    // For ungated tools, the executor may have been mid-call; that's fine —
    // the result is still a tool error, never an implicit success.
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[${serverName}] tool=${name} threw: ${msg}`, err);
    return errorResult(`Tool "${name}" failed: ${msg}`, "executor_threw");
  }
}

export const _test = {
  scaleCoord,
  coordToPercentageForPixelCompare,
  segmentGraphemes,
  decodedByteLength,
  resolveRequestedApps,
  buildAccessRequest,
  buildTierGuidanceMessage,
  buildUserDeniedGuidance,
  tierSatisfies,
  looksLikeBundleId,
  extractCoordinate,
  parseKeyChord,
  buildMonitorNote,
  handleSwitchDisplay,
  uniqueDisplayLabels,
};
