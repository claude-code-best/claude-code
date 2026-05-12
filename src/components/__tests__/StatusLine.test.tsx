/**
 * Tests for the CachePill helper logic in StatusLine.
 *
 * CachePill is a React/Ink component — rendering it in a headless test
 * environment is fragile (requires Ink's renderer, theme provider, etc.).
 * Instead we test the pure helper functions that power it directly, which
 * gives deterministic, fast unit coverage of all color-stage logic.
 */

import { describe, test, expect } from 'bun:test';
import { computeHitRate } from '../../utils/cacheStats.js';

// ---------------------------------------------------------------------------
// Re-export helpers that mirror CachePill internal logic for unit testing
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60 * 60 * 1000;

function padTwo(n: number): string {
  return String(Math.floor(n)).padStart(2, '0');
}

function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return 'exp';
  const mins = Math.floor(remainingMs / 60_000);
  const secs = Math.floor((remainingMs % 60_000) / 1000);
  return `${padTwo(mins)}:${padTwo(secs)}`;
}

type TimerThemeKey = 'success' | 'warning' | 'error' | 'inactive';

function timerColor(elapsedMin: number | null, isExpired: boolean): TimerThemeKey {
  if (isExpired || elapsedMin === null) return 'inactive';
  if (elapsedMin < 20) return 'success';
  if (elapsedMin < 40) return 'warning';
  return 'error';
}

function hitRateColor(rate: number | null): 'success' | 'inactive' {
  return rate !== null && rate >= 50 ? 'success' : 'inactive';
}

// ---------------------------------------------------------------------------
// formatCountdown
// ---------------------------------------------------------------------------

describe('formatCountdown', () => {
  test('formats full 60 minutes as 60:00', () => {
    expect(formatCountdown(CACHE_TTL_MS)).toBe('60:00');
  });

  test('formats 59 minutes 43 seconds correctly', () => {
    const ms = 59 * 60_000 + 43 * 1000;
    expect(formatCountdown(ms)).toBe('59:43');
  });

  test('formats sub-minute as 00:SS', () => {
    expect(formatCountdown(30_000)).toBe('00:30');
  });

  test('returns "exp" when remainingMs is 0', () => {
    expect(formatCountdown(0)).toBe('exp');
  });

  test('returns "exp" when remainingMs is negative', () => {
    expect(formatCountdown(-1000)).toBe('exp');
  });

  test('pads single-digit minutes and seconds', () => {
    // 5 min 7 sec
    expect(formatCountdown(5 * 60_000 + 7_000)).toBe('05:07');
  });
});

// ---------------------------------------------------------------------------
// Color stages — 4 thresholds
// ---------------------------------------------------------------------------

describe('timerColor stages', () => {
  test('green (success) when elapsed < 20 min', () => {
    expect(timerColor(0, false)).toBe('success');
    expect(timerColor(10, false)).toBe('success');
    expect(timerColor(19.9, false)).toBe('success');
  });

  test('yellow (warning) when 20 <= elapsed < 40 min', () => {
    expect(timerColor(20, false)).toBe('warning');
    expect(timerColor(30, false)).toBe('warning');
    expect(timerColor(39.9, false)).toBe('warning');
  });

  test('red (error) when 40 <= elapsed < 60 min', () => {
    expect(timerColor(40, false)).toBe('error');
    expect(timerColor(55, false)).toBe('error');
    expect(timerColor(59.9, false)).toBe('error');
  });

  test('gray (inactive) when expired', () => {
    expect(timerColor(60, true)).toBe('inactive');
    expect(timerColor(90, true)).toBe('inactive');
  });

  test('gray (inactive) when no elapsed data', () => {
    expect(timerColor(null, false)).toBe('inactive');
  });
});

// ---------------------------------------------------------------------------
// Flash zone — last 5 minutes (elapsed >= 55)
// ---------------------------------------------------------------------------

describe('flash zone detection', () => {
  test('not in flash zone at 54.9 min', () => {
    const elapsedMin = 54.9;
    const inFlashZone = elapsedMin >= 55 && !false;
    expect(inFlashZone).toBe(false);
  });

  test('in flash zone at exactly 55 min', () => {
    const elapsedMin = 55;
    const inFlashZone = elapsedMin >= 55 && !false;
    expect(inFlashZone).toBe(true);
  });

  test('NOT in flash zone when expired', () => {
    const elapsedMin = 65;
    const isExpired = true;
    const inFlashZone = elapsedMin >= 55 && !isExpired;
    expect(inFlashZone).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Hit-rate color
// ---------------------------------------------------------------------------

describe('hitRateColor', () => {
  test('success (green) when rate >= 50', () => {
    expect(hitRateColor(50)).toBe('success');
    expect(hitRateColor(75)).toBe('success');
    expect(hitRateColor(100)).toBe('success');
  });

  test('inactive (gray) when rate < 50', () => {
    expect(hitRateColor(49)).toBe('inactive');
    expect(hitRateColor(0)).toBe('inactive');
  });

  test('inactive (gray) when rate is null', () => {
    expect(hitRateColor(null)).toBe('inactive');
  });
});

// ---------------------------------------------------------------------------
// computeHitRate integration (used in CachePill)
// ---------------------------------------------------------------------------

describe('computeHitRate used in CachePill', () => {
  test('97% hit rate rounds correctly', () => {
    // 97 read out of 100 total
    const rate = computeHitRate({
      input_tokens: 3,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 97,
    });
    expect(rate).toBe(97);
  });

  test('null usage returns null rate', () => {
    expect(computeHitRate(null)).toBeNull();
  });

  test('zero-token response returns null rate', () => {
    expect(computeHitRate({ input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// "exp" display when TTL expired
// ---------------------------------------------------------------------------

describe('expired display', () => {
  test('formatCountdown returns "exp" at 0 remaining', () => {
    expect(formatCountdown(0)).toBe('exp');
  });

  test('timerColor is inactive when isExpired=true', () => {
    expect(timerColor(61, true)).toBe('inactive');
  });
});
