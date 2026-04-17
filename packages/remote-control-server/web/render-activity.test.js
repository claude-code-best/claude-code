import { describe, expect, test } from "bun:test";

import {
  formatCountdownRemaining,
  resolveActivityMode,
  shouldRenderTranscriptActivity,
} from "./render.js";

describe("render activity helpers", () => {
  test("authoritative standby and sleeping states override stale working spinners", () => {
    expect(resolveActivityMode(true, { mode: "standby" })).toBe("standby");
    expect(resolveActivityMode(true, { mode: "sleeping" })).toBe("sleeping");
    expect(resolveActivityMode(true, null)).toBe("working");
    expect(resolveActivityMode(false, null)).toBe("idle");
  });

  test("formats countdowns compactly", () => {
    expect(formatCountdownRemaining(35_000, 0)).toBe("35s");
    expect(formatCountdownRemaining(185_000, 0)).toBe("3m 5s");
    expect(formatCountdownRemaining(3_900_000, 0)).toBe("1h 5m");
    expect(formatCountdownRemaining(null, 0)).toBe("");
  });

  test("renders transcript activity only for active work", () => {
    expect(shouldRenderTranscriptActivity("working")).toBe(true);
    expect(shouldRenderTranscriptActivity("standby")).toBe(false);
    expect(shouldRenderTranscriptActivity("sleeping")).toBe(false);
    expect(shouldRenderTranscriptActivity("idle")).toBe(false);
  });
});
