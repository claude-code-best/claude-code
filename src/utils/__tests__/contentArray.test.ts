import { describe, expect, test } from "bun:test";
import { insertBlockAfterToolResults } from "../contentArray";

describe("insertBlockAfterToolResults", () => {
  test("inserts after last tool_result", () => {
    const content: any[] = [
      { type: "tool_result", content: "r1" },
      { type: "text", text: "hello" },
    ];
    insertBlockAfterToolResults(content, { type: "text", text: "inserted" });
    expect(content[1]).toEqual({ type: "text", text: "inserted" });
    expect(content).toHaveLength(3);
  });

  test("inserts after last of multiple tool_results", () => {
    const content: any[] = [
      { type: "tool_result", content: "r1" },
      { type: "tool_result", content: "r2" },
      { type: "text", text: "end" },
    ];
    insertBlockAfterToolResults(content, { type: "text", text: "new" });
    expect(content[2]).toEqual({ type: "text", text: "new" });
  });

  test("appends continuation when inserted block would be last", () => {
    const content: any[] = [{ type: "tool_result", content: "r1" }];
    insertBlockAfterToolResults(content, { type: "text", text: "new" });
    expect(content).toHaveLength(3); // original + inserted + continuation
    expect(content[2]).toEqual({ type: "text", text: "." });
  });

  test("inserts before last block when no tool_results", () => {
    const content: any[] = [
      { type: "text", text: "a" },
      { type: "text", text: "b" },
    ];
    insertBlockAfterToolResults(content, { type: "text", text: "new" });
    expect(content[1]).toEqual({ type: "text", text: "new" });
    expect(content).toHaveLength(3);
  });

  test("handles empty array", () => {
    const content: any[] = [];
    insertBlockAfterToolResults(content, { type: "text", text: "new" });
    expect(content).toHaveLength(1);
    expect(content[0]).toEqual({ type: "text", text: "new" });
  });

  test("handles single element array with no tool_result", () => {
    const content: any[] = [{ type: "text", text: "only" }];
    insertBlockAfterToolResults(content, { type: "text", text: "new" });
    expect(content[0]).toEqual({ type: "text", text: "new" });
    expect(content[1]).toEqual({ type: "text", text: "only" });
  });

  test("inserts after last tool_result with mixed interleaving", () => {
    const content: any[] = [
      { type: "tool_result", content: "r1" },
      { type: "text", text: "mid1" },
      { type: "tool_result", content: "r2" },
      { type: "text", text: "mid2" },
      { type: "tool_result", content: "r3" },
      { type: "text", text: "end" },
    ];
    insertBlockAfterToolResults(content, { type: "text", text: "inserted" });
    // Inserted after r3 (index 4), so at index 5
    expect(content[5]).toEqual({ type: "text", text: "inserted" });
    // Original end text should shift to index 6
    expect(content[6]).toEqual({ type: "text", text: "end" });
    expect(content).toHaveLength(7);
  });
});
