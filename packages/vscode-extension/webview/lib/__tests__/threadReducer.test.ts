import { describe, expect, test } from "bun:test";
import { applySessionUpdate } from "../threadReducer";
import type { ThreadEntry } from "../types";

describe("thread reducer tool calls", () => {
  test("moves a tool card from pending to complete and appends output", () => {
    let entries: ThreadEntry[] = [];

    entries = applySessionUpdate(entries, {
      sessionUpdate: "tool_call",
      toolCallId: "tool-1",
      title: "Terminal",
      status: "pending",
      content: [],
    });

    entries = applySessionUpdate(entries, {
      sessionUpdate: "tool_call_update",
      toolCallId: "tool-1",
      status: "completed",
      content: [
        {
          type: "content",
          content: { type: "text", text: "hello from tool" },
        },
      ],
      rawOutput: [{ type: "text", text: "hello from tool" }],
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("tool_call");
    if (entries[0].type !== "tool_call") return;
    expect(entries[0].toolCall.status).toBe("complete");
    expect(entries[0].toolCall.content).toEqual([
      {
        type: "content",
        content: { type: "text", text: "hello from tool" },
      },
    ]);
    expect(entries[0].toolCall.rawOutput).toEqual([
      { type: "text", text: "hello from tool" },
    ]);
  });

  test("surfaces orphan tool updates as an error card", () => {
    const entries = applySessionUpdate([], {
      sessionUpdate: "tool_call_update",
      toolCallId: "missing-tool",
      status: "completed",
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("tool_call");
    if (entries[0].type !== "tool_call") return;
    expect(entries[0].toolCall.status).toBe("error");
    expect(entries[0].toolCall.title).toContain("orphan");
  });
});
