import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { formatBriefTimestamp } from "../formatBriefTimestamp";

let savedLcAll: string | undefined;
beforeAll(() => {
  savedLcAll = process.env.LC_ALL;
  process.env.LC_ALL = "en_US.UTF-8";
});
afterAll(() => {
  if (savedLcAll === undefined) delete process.env.LC_ALL;
  else process.env.LC_ALL = savedLcAll;
});

describe("formatBriefTimestamp", () => {
  // Fixed "now" for deterministic tests: 2026-04-02T14:00:00Z (Thursday)
  const now = new Date("2026-04-02T14:00:00Z");

  test("same day timestamp returns time only (contains colon)", () => {
    const result = formatBriefTimestamp("2026-04-02T10:30:00Z", now);
    expect(result).toContain(":");
    // Should NOT contain a weekday name since it's the same day
    expect(result).not.toMatch(
      /Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/
    );
  });

  test("yesterday returns weekday and time", () => {
    // 2026-04-01 is Wednesday
    const result = formatBriefTimestamp("2026-04-01T16:15:00Z", now);
    expect(result).toContain("Wednesday");
    expect(result).toContain(":");
  });

  test("3 days ago returns weekday and time", () => {
    // 2026-03-30 is Monday
    const result = formatBriefTimestamp("2026-03-30T09:00:00Z", now);
    expect(result).toContain("Monday");
    expect(result).toContain(":");
  });

  test("6 days ago returns weekday and time (still within 6-day window)", () => {
    // 2026-03-27 is Friday
    const result = formatBriefTimestamp("2026-03-27T12:00:00Z", now);
    expect(result).toContain("Friday");
    expect(result).toContain(":");
  });

  test("7+ days ago returns weekday, month, day, and time", () => {
    // 2026-03-20 is Friday, 13 days ago
    const result = formatBriefTimestamp("2026-03-20T14:30:00Z", now);
    expect(result).toContain("Friday");
    expect(result).toContain(":");
    // Should contain month abbreviation (Mar)
    expect(result).toMatch(/Mar/);
  });

  test("much older date returns full format with month", () => {
    const result = formatBriefTimestamp("2025-12-25T08:00:00Z", now);
    expect(result).toContain(":");
    expect(result).toMatch(/Dec/);
  });

  test("invalid ISO string returns empty string", () => {
    expect(formatBriefTimestamp("not-a-date", now)).toBe("");
  });

  test("empty string returns empty string", () => {
    expect(formatBriefTimestamp("", now)).toBe("");
  });

  test("same day early morning returns time format", () => {
    const result = formatBriefTimestamp("2026-04-02T01:05:00Z", now);
    expect(result).toContain(":");
    // Should be time-only format
    expect(result.length).toBeLessThan(20);
  });

  test("uses current time as default when now is not provided", () => {
    // Just verify it returns a non-empty string for a recent timestamp
    const recent = new Date();
    recent.setMinutes(recent.getMinutes() - 5);
    const result = formatBriefTimestamp(recent.toISOString());
    expect(result).not.toBe("");
    expect(result).toContain(":");
  });
});
