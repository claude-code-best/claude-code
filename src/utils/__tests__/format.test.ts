import { describe, expect, test } from "bun:test";
import {
  formatFileSize,
  formatSecondsShort,
  formatDuration,
  formatNumber,
  formatTokens,
  formatRelativeTime,
} from "../format";

describe("formatFileSize", () => {
  test("formats bytes", () => {
    expect(formatFileSize(500)).toBe("500 bytes");
  });

  test("formats kilobytes", () => {
    expect(formatFileSize(1536)).toBe("1.5KB");
  });

  test("formats megabytes", () => {
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe("1.5MB");
  });

  test("formats gigabytes", () => {
    expect(formatFileSize(2 * 1024 * 1024 * 1024)).toBe("2GB");
  });

  test("removes trailing .0", () => {
    expect(formatFileSize(1024)).toBe("1KB");
  });
});

describe("formatSecondsShort", () => {
  test("formats milliseconds to seconds", () => {
    expect(formatSecondsShort(1234)).toBe("1.2s");
  });

  test("formats zero", () => {
    expect(formatSecondsShort(0)).toBe("0.0s");
  });

  test("formats sub-second", () => {
    expect(formatSecondsShort(500)).toBe("0.5s");
  });
});

describe("formatDuration", () => {
  test("formats 0 as 0s", () => {
    expect(formatDuration(0)).toBe("0s");
  });

  test("formats seconds", () => {
    expect(formatDuration(5000)).toBe("5s");
  });

  test("formats minutes and seconds", () => {
    expect(formatDuration(125000)).toBe("2m 5s");
  });

  test("formats hours", () => {
    expect(formatDuration(3661000)).toBe("1h 1m 1s");
  });

  test("formats days", () => {
    expect(formatDuration(90000000)).toBe("1d 1h 0m");
  });

  test("hideTrailingZeros removes zero components", () => {
    expect(formatDuration(3600000, { hideTrailingZeros: true })).toBe("1h");
    expect(formatDuration(60000, { hideTrailingZeros: true })).toBe("1m");
  });

  test("mostSignificantOnly returns largest unit", () => {
    expect(formatDuration(90000000, { mostSignificantOnly: true })).toBe("1d");
    expect(formatDuration(3661000, { mostSignificantOnly: true })).toBe("1h");
  });
});

describe("formatNumber", () => {
  test("formats small numbers as-is", () => {
    expect(formatNumber(900)).toBe("900");
  });

  test("formats thousands with k suffix", () => {
    expect(formatNumber(1321)).toBe("1.3k");
  });

  test("formats millions", () => {
    expect(formatNumber(1500000)).toBe("1.5m");
  });
});

describe("formatTokens", () => {
  test("removes .0 from formatted number", () => {
    expect(formatTokens(1000)).toBe("1k");
  });

  test("formats small numbers", () => {
    expect(formatTokens(500)).toBe("500");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-01-15T12:00:00Z");

  test("formats seconds ago", () => {
    const date = new Date("2026-01-15T11:59:30Z");
    expect(formatRelativeTime(date, { now })).toBe("30s ago");
  });

  test("formats minutes ago", () => {
    const date = new Date("2026-01-15T11:55:00Z");
    expect(formatRelativeTime(date, { now })).toBe("5m ago");
  });

  test("formats future time", () => {
    const date = new Date("2026-01-15T13:00:00Z");
    expect(formatRelativeTime(date, { now })).toBe("in 1h");
  });

  test("handles zero difference", () => {
    expect(formatRelativeTime(now, { now })).toBe("0s ago");
  });
});
