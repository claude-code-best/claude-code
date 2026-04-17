import { describe, expect, test } from "bun:test";

import { isConversationClearedStatus } from "./render.js";

describe("status helpers", () => {
  test("detects direct conversation reset markers", () => {
    expect(isConversationClearedStatus({ status: "conversation_cleared" })).toBe(true);
  });

  test("detects nested raw conversation reset markers", () => {
    expect(
      isConversationClearedStatus({
        status: "",
        raw: { status: "conversation_cleared" },
      }),
    ).toBe(true);
  });

  test("ignores unrelated status payloads", () => {
    expect(isConversationClearedStatus({ status: "running" })).toBe(false);
    expect(isConversationClearedStatus({})).toBe(false);
    expect(isConversationClearedStatus(null)).toBe(false);
  });
});
